"""Gera o PMTiles do mapa do Meridiano a partir dos pedaços por célula (build/map-hd/pieces/, de build-pieces.py).

Uso: python scripts/map-hd/build-tiles.py [saida.pmtiles]   (padrão: build/map-hd/meridiano-hd.pmtiles)
Camada "countries" com uma propriedade, carta_id (vazio = terra sem entidade, nunca alvo). Tiles MVT com gzip, de 4096 unidades
(8192 no zoom máximo, ver EXTENT_MAX).

Zoom 7 a ZMAX: cada célula da grade é um tile do zoom 7; a geometria da célula é unida à faixa das vizinhas (para a margem do tile),
simplificada para o zoom e cortada em quadtree até os tiles do zoom. Zoom 6 a 0: cada ENTIDADE é montada inteira a partir das
suas células do zoom 7, simplificada para o zoom e só então cortada em tiles (simplificar tile por tile criava emendas entre
vizinhos). Com LOW_ONLY=1 refaz só os zooms 0 a 6, reaproveitando tiles-tmp/. A simplificação é Douglas-Peucker com a topologia
preservada, numa fração de pixel (TOLERANCE, em unidades do tile: 8 unidades = 1 px num tile de 512 px, 16 no zoom máximo), e
anéis menores que MIN_AREA saem do zoom.
"""
import gzip
import json
import math
import os
import pickle
import sys
import time
from multiprocessing import Pool

import numpy as np
import pyarrow.parquet as pq
import shapely

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.environ.get("MAP_BUILD") or os.path.join(HERE, "..", "..", "build", "map-hd")
# outro mapa com o mesmo pipeline (o dos estados do Brasil): a pasta traz um map-profile.json com nome, atribuição e fontes
PROFILE = json.load(open(os.path.join(BUILD, "map-profile.json"), encoding="utf8")) if os.path.exists(os.path.join(BUILD, "map-profile.json")) else {}
R = 6378137.0
ORIGIN = math.pi * R
WORLD = 2 * ORIGIN
CELLS = 128
CELL_ZOOM = 7
ZMAX = int(os.environ.get("ZMAX", "9"))
# O zoom máximo usa tiles de 8192 unidades (a escala interna do MapLibre): a mesma precisão de ~10 m que um zoom 10 de 4096
# teria, sem o nível duplicado (o arquivo inteiro precisa caber abaixo dos 100 MiB que o GitHub aceita). Os outros, 4096.
EXTENT_MAX = int(os.environ.get("EXTENT_MAX", "8192"))
BUFFER_PX = 8  # margem do tile, em pixels de um tile de 512 px
WORKERS = int(os.environ.get("WORKERS", "10"))
# tolerância de simplificação e área mínima de anel, em unidades do tile do próprio zoom
TOLERANCE = {z: (2.0 if z <= 5 else 1.5 if z <= 8 else 1.0) for z in range(0, 16)}
MIN_AREA = {z: (64 if z <= 5 else 32 if z <= 8 else 16) for z in range(0, 16)}
MIN_AREA[ZMAX] = 4  # no último zoom fica quase tudo (anel de ~20 m de lado já é ilha de verdade)


def extent(z):
    return EXTENT_MAX if z == ZMAX else 4096


def unit(z):
    """Tamanho de uma unidade do tile do zoom z, em metros de Mercator."""
    return WORLD / (2 ** z) / extent(z)


def buffer_m(z):
    """Margem do tile do zoom z em metros de Mercator (a mesma em pixels, qualquer que seja a extensão)."""
    return BUFFER_PX * WORLD / (2 ** z) / 512


def edge_x(z, i):
    """Borda vertical i dos tiles do zoom z. Sempre pela mesma conta (índice inteiro × mundo ÷ 2^z): os dois vizinhos de uma
    borda e os zooms vizinhos chegam ao MESMO número, e a união funde os pedaços sem deixar fresta (a fresta de 1e-9 m de
    'x0 + tamanho' contra 'x1 do vizinho' virava uma linha de grade desenhada no mapa)."""
    return -ORIGIN + (i * WORLD) / (2 ** z)


def edge_y(z, j):
    return ORIGIN - (j * WORLD) / (2 ** z)


def tile_rect(z, x, y, margin=0.0):
    return edge_x(z, x) - margin, edge_y(z, y + 1) - margin, edge_x(z, x + 1) + margin, edge_y(z, y) + margin


SNAP = 1e-3  # m de Mercator: o que está a menos disso de uma borda de célula é colado nela
# Na borda do mundo os land polygons do OSM param em ±20037508,34, 2,8 mm antes de ±ORIGIN: as duas metades de Chukotka e da
# Antártida ficavam a 5,6 mm uma da outra depois de deslocar o mundo, a união não fundia e o contorno desenhava o antimeridiano
SNAP_WORLD = 1e-2


def snap_to_cell(geom, vx, vy):
    """Cola nas bordas canônicas da célula (vx, vy) do zoom 7 os vértices que o corte de build-pieces.py deixou rente a elas."""
    xs = (edge_x(CELL_ZOOM, vx), edge_x(CELL_ZOOM, vx + 1))
    ys = (edge_y(CELL_ZOOM, vy + 1), edge_y(CELL_ZOOM, vy))

    def tolerance(value):
        return SNAP_WORLD if abs(abs(value) - ORIGIN) < 1 else SNAP

    def fix(coords):
        out = coords.copy()
        for value in xs:
            out[np.abs(out[:, 0] - value) < tolerance(value), 0] = value
        for value in ys:
            out[np.abs(out[:, 1] - value) < tolerance(value), 1] = value
        return out
    return shapely.transform(geom, fix)


def polygonal(geom):
    if geom is None or shapely.is_empty(geom):
        return None
    kind = shapely.get_type_id(geom)
    if kind in (3, 6):
        return geom
    if kind == 7:
        parts = [part for part in shapely.get_parts(geom) if shapely.get_type_id(part) in (3, 6)]
        if not parts:
            return None
        polys = shapely.get_parts(np.array(parts, dtype=object))
        return shapely.multipolygons(list(polys)) if len(polys) > 1 else polys[0]
    return None


def ring_area(coords):
    x = coords[:, 0]
    y = coords[:, 1]
    return 0.5 * float(np.dot(x[:-1], y[1:]) - np.dot(x[1:], y[:-1]))


def clip(geom, rect):
    """Corte rápido no retângulo; se o GEOS reclamar de um anel degenerado, conserta e corta por interseção."""
    try:
        return polygonal(shapely.clip_by_rect(geom, *rect))
    except shapely.errors.GEOSException:
        return polygonal(shapely.intersection(shapely.make_valid(geom), shapely.box(*rect)))


def union(parts):
    """União das partes; se o GEOS reclamar de geometria degenerada, conserta cada parte e tenta de novo."""
    if len(parts) == 1:
        return polygonal(parts[0])
    try:
        return polygonal(shapely.union_all(np.array(parts, dtype=object)))
    except shapely.errors.GEOSException:
        return polygonal(shapely.union_all(shapely.make_valid(np.array(parts, dtype=object))))


def simplify(geom, z):
    """Simplifica para o zoom e tira os anéis pequenos demais (com buracos e tudo)."""
    if geom is None:
        return None
    try:
        out = shapely.simplify(geom, TOLERANCE[z] * unit(z), preserve_topology=True)
    except shapely.errors.GEOSException:
        out = shapely.simplify(shapely.make_valid(geom), TOLERANCE[z] * unit(z), preserve_topology=True)
    out = polygonal(out)
    if out is None:
        return None
    min_area = MIN_AREA[z] * unit(z) ** 2
    polys = shapely.get_parts(out)
    keep = []
    for poly in polys:
        if shapely.area(poly) < min_area:
            continue
        holes = [ring for ring in poly.interiors if len(ring.coords) >= 4 and abs(ring_area(np.asarray(ring.coords))) >= min_area]
        keep.append(shapely.Polygon(poly.exterior, holes) if len(holes) != len(poly.interiors) else poly)
    if not keep:
        return None
    return keep[0] if len(keep) == 1 else shapely.MultiPolygon(keep)


# ───────── codificação MVT ─────────

def varints(values):
    """Codifica um vetor de inteiros sem sinal (< 2^32) como varints do protobuf."""
    v = np.asarray(values, dtype=np.uint64)
    if v.size == 0:
        return b""
    nbytes = np.ones(v.shape, dtype=np.int64)
    for k in range(1, 5):
        nbytes += v >= (1 << (7 * k))
    out = np.empty(int(nbytes.sum()), dtype=np.uint8)
    pos = np.cumsum(nbytes) - nbytes
    for k in range(5):
        mask = nbytes > k
        if not mask.any():
            break
        byte = (v[mask] >> np.uint64(7 * k)) & np.uint64(0x7F)
        more = (nbytes[mask] > k + 1).astype(np.uint64) << np.uint64(7)
        out[pos[mask] + k] = (byte | more).astype(np.uint8)
    return out.tobytes()


def varint(value):
    return varints([value])


def field(number, wire, payload):
    """Campo de protobuf: wire 0 = varint (payload int), wire 2 = bytes."""
    key = varint((number << 3) | wire)
    if wire == 0:
        return key + varint(payload)
    return key + varint(len(payload)) + payload


def ring_commands(points, cursor):
    """Comandos MVT de um anel (pontos inteiros, sem repetir o primeiro no fim); devolve (comandos, novo cursor)."""
    deltas = np.diff(np.vstack([cursor, points]), axis=0)
    zig = ((deltas << 1) ^ (deltas >> 63)).astype(np.uint64)
    n = len(points)
    cmds = np.empty(3 + 2 * (n - 1) + 1 + 1, dtype=np.uint64)
    cmds[0] = 9  # MoveTo, 1 ponto
    cmds[1:3] = zig[0]
    cmds[3] = 2 | ((n - 1) << 3)  # LineTo, n-1 pontos
    cmds[4:4 + 2 * (n - 1)] = zig[1:].ravel()
    cmds[-1] = 15  # ClosePath
    return cmds[:4 + 2 * (n - 1)].tolist() + [15], points[-1]


def to_grid(geom):
    """Leva a geometria (já nas unidades do tile) para a grade inteira por snap rounding, sempre com resultado válido.
    Arredondar vértice por vértice cruzava anéis em estreitos, baías e fiordes (polígono inválido em metade dos tiles dos zooms
    baixos); o MapLibre triangula o polígono assim e pinta uma faixa duas vezes, uma linha clara atravessando a terra quando
    ela é semitransparente (o tema padrão usa 0,82)."""
    try:
        return polygonal(shapely.set_precision(geom, 1.0))
    except shapely.errors.GEOSException:
        return polygonal(shapely.set_precision(shapely.make_valid(geom), 1.0))


def geometry_commands(geom, z, x, y, min_area_units):
    """Comandos MVT de um (multi)polígono em metros de Mercator, no tile (z, x, y)."""
    scale = (2 ** z) * extent(z) / WORLD
    ox = x * extent(z)
    oy = y * extent(z)
    local = shapely.transform(geom, lambda c: np.column_stack(((c[:, 0] + ORIGIN) * scale - ox, (ORIGIN - c[:, 1]) * scale - oy)))
    local = to_grid(local)
    if local is None:
        return []
    cmds = []
    cursor = np.zeros(2, dtype=np.int64)
    for poly in shapely.get_parts(local):
        rings = [poly.exterior, *poly.interiors]
        for index, ring in enumerate(rings):
            pts = np.rint(shapely.get_coordinates(ring)[:-1]).astype(np.int64)
            if len(pts) >= 2:
                keep = np.any(pts != np.roll(pts, 1, axis=0), axis=1)
                pts = pts[keep]
            if len(pts) < 3:
                if index == 0:
                    break
                continue
            nxt = np.roll(pts, -1, axis=0)
            area2 = int(np.sum(pts[:, 0] * nxt[:, 1] - nxt[:, 0] * pts[:, 1]))
            if abs(area2) < 2 * min_area_units:
                if index == 0:
                    break
                continue
            # MVT: anel externo com área positiva (horário com y para baixo), buracos com área negativa
            if (index == 0 and area2 < 0) or (index > 0 and area2 > 0):
                pts = pts[::-1]
            ring_cmds, cursor = ring_commands(pts, cursor)
            cmds.extend(ring_cmds)
    return cmds


def encode_tile(z, x, y, features):
    """features: lista de (carta_id, geometria em metros de Mercator, já cortada na margem do tile). Devolve o tile MVT com gzip."""
    values = []
    value_index = {}
    feature_bytes = []
    min_area_units = MIN_AREA[z] / 4
    for carta_id, geom in features:
        cmds = geometry_commands(geom, z, x, y, min_area_units)
        if not cmds:
            continue
        if carta_id not in value_index:
            value_index[carta_id] = len(values)
            values.append(carta_id)
        body = field(2, 2, varints([0, value_index[carta_id]])) + field(3, 0, 3) + field(4, 2, varints(cmds))
        feature_bytes.append(field(2, 2, body))
    if not feature_bytes:
        return None
    layer = field(15, 0, 2) + field(1, 2, b"countries") + b"".join(feature_bytes) + field(3, 2, b"carta_id")
    for value in values:
        layer += field(4, 2, field(1, 2, value.encode("utf8")))
    layer += field(5, 0, extent(z))
    return gzip.compress(field(3, 2, layer), compresslevel=9, mtime=0)


# ───────── leitura dos pedaços ─────────

CELL_DIR = os.path.join(BUILD, "cells")


def split_cells(stats):
    """Separa os pedaços de cada linha da grade num arquivo por célula (cada processo lê só as 9 células de que precisa).
    Em stats acumula os vértices de cada entidade (para o manifesto)."""
    os.makedirs(CELL_DIR, exist_ok=True)
    cells = []
    for cy in range(CELLS):
        path = os.path.join(BUILD, "pieces", f"{cy:03d}.parquet")
        if not os.path.exists(path):
            continue
        table = pq.read_table(path)
        if table.num_rows == 0:
            continue
        ids = table.column("carta_id").to_pylist()
        cxs = table.column("cx").to_pylist()
        blobs = table.column("geometry").to_pylist()
        groups = {}
        counts = shapely.get_num_coordinates(shapely.from_wkb(np.array(blobs, dtype=object)))
        for cid, cx, blob, count in zip(ids, cxs, blobs, counts):
            groups.setdefault(cx, []).append((cid, blob))
            stats[cid] = stats.get(cid, 0) + int(count)
        for cx, items in groups.items():
            with open(os.path.join(CELL_DIR, f"{cx}-{cy}.bin"), "wb") as handle:
                for cid, blob in items:
                    key = cid.encode("utf8")
                    handle.write(np.array([len(key), len(blob)], dtype="<u4").tobytes())
                    handle.write(key)
                    handle.write(blob)
            cells.append((cx, cy))
    return cells


def cell_pieces(cx, cy):
    """Pedaços da célula (carta_id, geometria). Fora do mapa no eixo x, a célula do outro lado do antimeridiano, deslocada."""
    if not (0 <= cy < CELLS):
        return []
    virtual = cx  # posição da célula na vista (fora de 0..127 quando vem do outro lado do antimeridiano)
    shift = 0.0
    if cx < 0:
        cx, shift = cx + CELLS, -WORLD
    elif cx >= CELLS:
        cx, shift = cx - CELLS, WORLD
    path = os.path.join(CELL_DIR, f"{cx}-{cy}.bin")
    if not os.path.exists(path):
        return []
    with open(path, "rb") as handle:
        blob = handle.read()
    out = []
    offset = 0
    while offset < len(blob):
        klen, glen = np.frombuffer(blob, dtype="<u4", count=2, offset=offset)
        offset += 8
        cid = blob[offset:offset + klen].decode("utf8")
        offset += int(klen)
        geom = shapely.from_wkb(blob[offset:offset + glen])
        offset += int(glen)
        if shift:
            geom = shapely.transform(geom, lambda coords: coords + np.array([shift, 0.0]))
        out.append((cid, snap_to_cell(geom, virtual, cy)))
    return out


# ───────── zoom 7 a ZMAX, por célula ─────────

def process_cell(task):
    cx, cy = task
    margin = buffer_m(CELL_ZOOM)
    rect = tile_rect(CELL_ZOOM, cx, cy, margin)
    by_entity = {}
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for cid, geom in cell_pieces(cx + dx, cy + dy):
                if dx or dy:
                    geom = clip(geom, rect)
                    if geom is None:
                        continue
                by_entity.setdefault(cid, []).append(geom)
    extended = {}
    for cid, parts in by_entity.items():
        merged = union(parts)
        if merged is not None:
            extended[cid] = merged
    tiles = []
    exact7 = {}
    for z in range(CELL_ZOOM, ZMAX + 1):
        simplified = {cid: simplify(geom, z) for cid, geom in extended.items()}
        simplified = {cid: geom for cid, geom in simplified.items() if geom is not None}
        if z == CELL_ZOOM:
            exact = tile_rect(z, cx, cy)
            for cid, geom in simplified.items():
                piece = clip(geom, exact)
                if piece is not None:
                    exact7[cid] = shapely.to_wkb(piece)
        margin = buffer_m(z)
        # quadtree dentro da célula: do zoom 7 até z, cortando com a margem do zoom z
        level = [((cx, cy), simplified)]
        for depth in range(CELL_ZOOM, z):
            nxt = []
            for (tx, ty), geoms in level:
                for ix in (0, 1):
                    for iy in (0, 1):
                        child = (tx * 2 + ix, ty * 2 + iy)
                        crect = tile_rect(depth + 1, child[0], child[1], margin)
                        cgeoms = {}
                        for cid, geom in geoms.items():
                            piece = clip(geom, crect)
                            if piece is not None:
                                cgeoms[cid] = piece
                        if cgeoms:
                            nxt.append((child, cgeoms))
            level = nxt
        for (tx, ty), geoms in level:
            frect = tile_rect(z, tx, ty, margin)
            features = []
            for cid in sorted(geoms):
                piece = clip(geoms[cid], frect)
                if piece is not None:
                    features.append((cid, piece))
            data = encode_tile(z, tx, ty, features)
            if data:
                tiles.append((z, tx, ty, data))
    return (cx, cy), tiles, exact7


# ───────── zoom 6 a 0: pirâmide ─────────

def tile_geometry(geom, z):
    """Corta a geometria de uma entidade nos tiles do zoom z (com a margem do zoom), em quadtree a partir do zoom 0."""
    margin = buffer_m(z)
    level = [((0, 0), geom)]
    for depth in range(0, z):
        nxt = []
        for (tx, ty), g in level:
            for ix in (0, 1):
                for iy in (0, 1):
                    child = (tx * 2 + ix, ty * 2 + iy)
                    piece = clip(g, tile_rect(depth + 1, child[0], child[1], margin))
                    if piece is not None:
                        nxt.append((child, piece))
        level = nxt
    out = {}
    for (tx, ty), g in level:
        piece = clip(g, tile_rect(z, tx, ty, margin))
        if piece is not None:
            out[(tx, ty)] = piece
    return out


def with_wrap(geom, margin):
    """A geometria mais a faixa do outro lado do antimeridiano (deslocada), para a margem dos tiles na borda do mundo."""
    parts = [geom]
    east = clip(geom, (ORIGIN - margin, -ORIGIN, ORIGIN, ORIGIN))
    west = clip(geom, (-ORIGIN, -ORIGIN, -ORIGIN + margin, ORIGIN))
    if east is not None:
        parts.append(shapely.transform(east, lambda coords: coords - np.array([WORLD, 0.0])))
    if west is not None:
        parts.append(shapely.transform(west, lambda coords: coords + np.array([WORLD, 0.0])))
    return union(parts) if len(parts) > 1 else geom


def process_entity(task):
    """Zoom 6 a 0 de uma entidade: une as células do zoom 7, simplifica a ENTIDADE inteira para cada zoom e só depois corta em
    tiles. Simplificar tile por tile mexia na borda de um lado e não do outro, e as duas metades de uma ilha deixavam de se
    encaixar (uma emenda desenhada no mapa, como em Vanua Levu, Fiji)."""
    cid, blobs = task
    # a faixa do outro lado do antimeridiano entra ANTES de simplificar (com a margem do zoom 0, a maior): simplificada depois,
    # a borda em ±180° mudava de um lado e não do outro e deixava uma emenda (Chukotka)
    geom = with_wrap(union([shapely.from_wkb(blob) for blob in blobs]), buffer_m(0))
    out = []
    for z in range(CELL_ZOOM - 1, -1, -1):
        geom = simplify(geom, z)
        if geom is None:
            break
        for (x, y), piece in tile_geometry(geom, z).items():
            out.append((z, x, y, shapely.to_wkb(piece)))
    return cid, out


def encode_low(task):
    """Codifica um tile dos zooms 0 a 6 (as entidades já cortadas por process_entity)."""
    (z, x, y), items = task
    data = encode_tile(z, x, y, [(cid, shapely.from_wkb(blob)) for cid, blob in sorted(items)])
    return (z, x, y, data) if data else None


def write_pmtiles(path, tile_files):
    from pmtiles.tile import Compression, TileType, zxy_to_tileid
    from pmtiles.writer import Writer
    index = []
    for name in tile_files:
        with open(name, "rb") as handle:
            blob = handle.read()
        offset = 0
        while offset < len(blob):
            z, x, y, length = np.frombuffer(blob, dtype="<u4", count=4, offset=offset)
            offset += 16
            index.append((zxy_to_tileid(int(z), int(x), int(y)), name, offset, int(length)))
            offset += int(length)
    index.sort()
    handles = {}
    with open(path, "wb") as out:
        writer = Writer(out)
        for tile_id, name, offset, length in index:
            handle = handles.get(name) or handles.setdefault(name, open(name, "rb"))
            handle.seek(offset)
            writer.write_tile(tile_id, handle.read(length))
        writer.finalize(
            {"tile_type": TileType.MVT, "tile_compression": Compression.GZIP, "min_lon_e7": -1800000000, "min_lat_e7": -850511287,
             "max_lon_e7": 1800000000, "max_lat_e7": 850511287, "center_zoom": 2, "center_lon_e7": 0, "center_lat_e7": 0},
            {"name": PROFILE.get("title", "Meridiano"), "format": "pbf", "type": "overlay", "generator": "scripts/map-hd/build-tiles.py",
             "attribution": PROFILE.get("attribution", "© OpenStreetMap contributors · Overture Maps Foundation · geoBoundaries"),
             "vector_layers": [{"id": "countries", "fields": {"carta_id": "String"}, "minzoom": 0, "maxzoom": ZMAX}]},
        )
    for handle in handles.values():
        handle.close()
    return len(index)


def append_tiles(handle, tiles):
    for z, x, y, data in tiles:
        handle.write(np.array([z, x, y, len(data)], dtype="<u4").tobytes())
        handle.write(data)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    started = time.time()
    output = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BUILD, "meridiano-hd.pmtiles")
    tmp = os.path.join(BUILD, "tiles-tmp")
    os.makedirs(tmp, exist_ok=True)
    stats = {}
    cells = split_cells(stats)
    print(f"pedaços separados por célula · {time.time() - started:.0f} s", flush=True)
    only = os.environ.get("ONLY_CELLS")
    if only:
        wanted = {tuple(int(v) for v in item.split(",")) for item in only.split(";")}
        cells = [cell for cell in cells if cell in wanted]
    print(f"{len(cells)} células com terra · zoom 0–{ZMAX} · {WORKERS} processos", flush=True)
    high_path = os.path.join(tmp, "high.bin")
    exact_path = os.path.join(tmp, "exact7.pkl")
    if os.environ.get("LOW_ONLY") and os.path.exists(high_path) and os.path.exists(exact_path):
        # só refaz os zooms 0 a 6 (os de cima e as geometrias do zoom 7 já estão em tiles-tmp)
        exact7 = pickle.load(open(exact_path, "rb"))
        print(f"zoom 7–{ZMAX} reaproveitados de {tmp}", flush=True)
    else:
        exact7 = {}
        done = 0
        with open(high_path, "wb") as handle, Pool(WORKERS) as pool:
            for (cx, cy), tiles, exact in pool.imap_unordered(process_cell, sorted(cells, key=lambda c: (c[1], c[0])), chunksize=4):
                append_tiles(handle, tiles)
                if exact:
                    exact7[(cx, cy)] = exact
                done += 1
                if done % 200 == 0:
                    print(f"  células {done}/{len(cells)} · {time.time() - started:.0f} s", flush=True)
        pickle.dump(exact7, open(exact_path, "wb"))
        print(f"zoom 7–{ZMAX} prontos · {time.time() - started:.0f} s", flush=True)
    by_entity = {}
    for geoms in exact7.values():
        for cid, blob in geoms.items():
            by_entity.setdefault(cid, []).append(blob)
    low = {}
    with Pool(WORKERS) as pool:
        tasks = sorted(by_entity.items(), key=lambda item: -sum(len(blob) for blob in item[1]))
        for count_done, (cid, out) in enumerate(pool.imap_unordered(process_entity, tasks), start=1):
            for z, x, y, blob in out:
                low.setdefault((z, x, y), []).append((cid, blob))
            if count_done % 50 == 0:
                print(f"  entidades {count_done}/{len(tasks)} (zoom 0–6) · {time.time() - started:.0f} s", flush=True)
    low_path = os.path.join(tmp, "low.bin")
    with open(low_path, "wb") as handle, Pool(WORKERS) as pool:
        tiles = [tile for tile in pool.imap_unordered(encode_low, sorted(low.items()), chunksize=8) if tile]
        append_tiles(handle, tiles)
    print(f"zoom 0–6 prontos: {len(tiles)} tiles · {time.time() - started:.0f} s", flush=True)
    count = write_pmtiles(output, [low_path, high_path])
    write_manifest(output, stats, count)
    print(f"ok: {output} · {count} tiles · {os.path.getsize(output) / 1e6:.1f} MB · {time.time() - started:.0f} s", flush=True)


def write_manifest(output, stats, count):
    import hashlib
    import json
    data = open(output, "rb").read()
    entities = sorted(cid for cid in stats if cid)
    manifest = {
        "name": PROFILE.get("name", "meridiano-hd"),
        "generator": "scripts/map-hd (fetch-overture.py, fetch-lakes.py, build-pieces.py, build-tiles.py)",
        "zoom": {"min": 0, "max": ZMAX},
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "tiles": count,
        "layer": "countries",
        "tolerance": {str(z): TOLERANCE[z] for z in range(ZMAX + 1)},
        "minArea": {str(z): MIN_AREA[z] for z in range(ZMAX + 1)},
        "entities": entities,
        "neutralVertices": stats.get("", 0),
        "vertices": {cid: stats[cid] for cid in entities},
        "sources": PROFILE.get("sources") or [
            {"name": "OpenStreetMap land polygons (split, EPSG:3857)", "url": "https://osmdata.openstreetmap.de/data/land-polygons.html",
             "date": "2026-10-05", "license": "ODbL 1.0", "attribution": "© OpenStreetMap contributors", "use": "costa e ilhas em detalhe total"},
            {"name": "Overture Maps divisions/division_area", "release": "2026-09-23.1", "url": "https://docs.overturemaps.org/guides/divisions/",
             "license": "ODbL 1.0", "attribution": "© OpenStreetMap contributors, Overture Maps Foundation, geoBoundaries",
             "use": "fronteiras terrestres e marítimas (quem é dono de cada pedaço de terra)"},
            {"name": "Overture Maps base/water", "release": "2026-09-23.1", "url": "https://docs.overturemaps.org/guides/base/",
             "license": "ODbL 1.0", "attribution": "© OpenStreetMap contributors, Overture Maps Foundation", "use": "lagos recortados da terra"},
            {"name": "Natural Earth 10m lakes", "version": "5.0.0", "url": "https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-lakes/",
             "license": "domínio público", "use": "só o índice de quais lagos entram (nome, área, Wikidata, pontos); o contorno é do OSM"},
        ],
    }
    with open(output[: -len(".pmtiles")] + ".manifest.json", "w", encoding="utf8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write(chr(10))


if __name__ == "__main__":
    main()
