"""Monta os dados da família Brasil a partir do mapa HD e da malha estadual do IBGE.

Uso: python scripts/brasil/build-brasil.py   (depois de fetch-brasil.py e do build:map-hd)
1. Confere scripts/brasil/states.json contra a malha do IBGE (sigla, nome, região): diferença para o script.
2. Divide entre os estados os pedaços de terra que o mapa HD deu ao Brasil (carta_id 76, build/map-hd/pieces): a costa e a
   fronteira com os vizinhos ficam idênticas às do mapa-múndi; só as divisas vêm do IBGE. Terra fora de qualquer divisa
   (a costa do OSM e a do IBGE não coincidem ao metro; ilhas) fica com o estado mais perto.
   → build/brasil/pieces/NNN.parquet (o mesmo formato de build/map-hd/pieces), que build-tiles.py transforma em tiles.
3. Grava public/data/brasil/states.json (o catálogo do jogo: nome, sigla, capital, região, área, ponto do rótulo dentro do
   estado, vizinhos pelas divisas) e public/data/brasil/shapes.json (silhuetas simplificadas, sem as ilhas oceânicas).
"""
import glob
import json
import math
import os
import struct
import sys

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import shapely

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "map-hd"))
from shp import read_polygons  # noqa: E402

ROOT = os.path.join(HERE, "..", "..")
WORLD = os.path.join(ROOT, "build", "map-hd")
BUILD = os.path.join(ROOT, "build", "brasil")
PUBLIC = os.path.join(ROOT, "public", "data", "brasil")
R = 6378137.0
ORIGIN = math.pi * R
CELL = 2 * ORIGIN / 128
BRAZIL = "76"


def read_dbf(path):
    with open(path, "rb") as handle:
        head = handle.read(32)
        count, header_len, record_len = struct.unpack("<IHH", head[4:12])
        fields = []
        while True:
            desc = handle.read(32)
            if desc[0] == 0x0D:
                break
            fields.append((desc[:11].split(b"\0")[0].decode(), desc[16]))
        handle.seek(header_len)
        rows = []
        for _ in range(count):
            record = handle.read(record_len)
            pos, row = 1, {}
            for name, size in fields:
                row[name] = record[pos:pos + size].decode("utf8", "replace").strip()
                pos += size
            rows.append(row)
    return rows


def to_merc(geom):
    def project(coords):
        x = np.radians(coords[:, 0]) * R
        lat = np.clip(coords[:, 1], -85.05112878, 85.05112878)
        y = np.log(np.tan(np.pi / 4 + np.radians(lat) / 2)) * R
        return np.column_stack((x, y))
    return shapely.transform(geom, project)


def to_lonlat(geom):
    def project(coords):
        lon = np.degrees(coords[:, 0] / R)
        lat = np.degrees(2 * np.arctan(np.exp(coords[:, 1] / R)) - np.pi / 2)
        return np.column_stack((lon, lat))
    return shapely.transform(geom, project)


def polygonal(geom):
    if geom is None or shapely.is_empty(geom):
        return None
    parts = [part for part in shapely.get_parts(geom) if shapely.get_type_id(part) in (3, 6)]
    if not parts:
        return None
    polys = list(shapely.get_parts(np.array(parts, dtype=object)))
    return shapely.multipolygons(polys) if len(polys) > 1 else polys[0]


def cell_rect(cx, cy):
    return (-ORIGIN + cx * CELL, ORIGIN - (cy + 1) * CELL, -ORIGIN + (cx + 1) * CELL, ORIGIN - cy * CELL)


def km2(geom_lonlat):
    """Área em km² (projeção cilíndrica de áreas iguais)."""
    projected = shapely.transform(geom_lonlat, lambda c: np.column_stack((np.radians(c[:, 0]) * 6371.0088, np.sin(np.radians(c[:, 1])) * 6371.0088)))
    return float(shapely.area(projected))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    config = json.load(open(os.path.join(HERE, "states.json"), encoding="utf8"))
    states = {state["sigla"]: state for state in config["states"]}

    # 1. IBGE: atributos e geometria, conferidos contra a lista curada
    base = os.path.join(BUILD, "BR_UF_2024", "BR_UF_2024")
    rows = read_dbf(base + ".dbf")
    polygons, records = read_polygons(base + ".shp", base + ".shx")
    region_names = {key: value["pt"] for key, value in config["regions"].items()}
    problems = []
    ibge = {}
    for index, row in enumerate(rows):
        sigla = row["SIGLA_UF"]
        state = states.get(sigla)
        if state is None:
            problems.append(f"{sigla} está no IBGE e não em states.json")
            continue
        if row["NM_UF"] != state["name"]:
            problems.append(f"{sigla}: nome {row['NM_UF']!r} no IBGE, {state['name']!r} em states.json")
        if row["NM_REGIA"].casefold() != region_names[state["region"]].casefold():  # o arquivo grafa "Centro-oeste"
            problems.append(f"{sigla}: região {row['NM_REGIA']!r} no IBGE, {region_names[state['region']]!r} em states.json")
        parts = [polygons[i] for i in np.flatnonzero(records == index)]
        geom = shapely.make_valid(shapely.union_all(np.array(parts, dtype=object)))
        ibge[sigla] = {"code": row["CD_UF"], "area": float(row["AREA_KM2"]), "geom": geom}
    missing = sorted(set(states) - set(ibge))
    if missing:
        problems.append(f"sem geometria no IBGE: {missing}")
    if problems:
        sys.exit("states.json não confere com o IBGE:\n" + "\n".join(problems))
    print(f"IBGE confere: {len(ibge)} unidades", flush=True)

    # 2. as zonas (divisas do IBGE) em Mercator, e os pedaços do Brasil no mapa HD divididos entre elas
    zones = {sigla: to_merc(item["geom"]) for sigla, item in ibge.items()}
    order = sorted(zones)
    tree = shapely.STRtree([zones[sigla] for sigla in order])
    for sigla in order:
        shapely.prepare(zones[sigla])
    out_dir = os.path.join(BUILD, "pieces")
    os.makedirs(out_dir, exist_ok=True)
    land_by_state = {sigla: [] for sigla in order}
    if os.environ.get("REUSE_PIECES") and glob.glob(os.path.join(out_dir, "*.parquet")):
        for path in sorted(glob.glob(os.path.join(out_dir, "*.parquet"))):
            for state_id, blob in zip(pq.read_table(path).column("carta_id").to_pylist(), pq.read_table(path).column("geometry").to_pylist()):
                land_by_state[state_id[3:].upper()].append(shapely.from_wkb(blob))
        print("pedaços reaproveitados de", out_dir, flush=True)
    else:
        split_land(order, zones, tree, out_dir, land_by_state)
    write_outputs(config, states, ibge, order, land_by_state)


def split_land(order, zones, tree, out_dir, land_by_state):
    for old in glob.glob(os.path.join(out_dir, "*.parquet")):
        os.remove(old)
    total_pieces = 0
    leftovers = 0
    for path in sorted(glob.glob(os.path.join(WORLD, "pieces", "*.parquet"))):
        table = pq.read_table(path)
        mask = pa.compute.equal(table.column("carta_id"), BRAZIL)
        table = table.filter(mask)
        if table.num_rows == 0:
            continue
        cy = int(os.path.basename(path)[:3])
        out = {"carta_id": [], "cx": [], "cy": [], "geometry": []}
        for cx, blob in zip(table.column("cx").to_pylist(), table.column("geometry").to_pylist()):
            piece = shapely.from_wkb(blob)
            x0, y0, x1, y1 = cell_rect(cx, cy)
            margin = 60000.0  # as divisas recortadas com folga: as sobras da célula quase sempre encostam numa delas
            near = [order[i] for i in tree.query(shapely.box(x0 - margin, y0 - margin, x1 + margin, y1 + margin))]
            clipped = {sigla: shapely.clip_by_rect(zones[sigla], x0 - margin, y0 - margin, x1 + margin, y1 + margin) for sigla in near}
            clipped = {sigla: zone for sigla, zone in clipped.items() if not shapely.is_empty(zone)}
            parts = {}
            rest = piece
            for sigla, zone in clipped.items():
                inside = shapely.clip_by_rect(zone, x0, y0, x1, y1)
                if shapely.is_empty(inside):
                    continue
                inter = polygonal(shapely.intersection(piece, inside))
                if inter is not None:
                    parts.setdefault(sigla, []).append(inter)
                    rest = polygonal(shapely.difference(rest, inside)) if rest is not None else None
            # sobras: cada pedaço de terra sem divisa vai para o estado mais perto (diferença de costa, ilhas oceânicas)
            if rest is not None:
                for bit in shapely.get_parts(rest):
                    if shapely.area(bit) < 1.0:
                        continue
                    if clipped:
                        best = min(clipped, key=lambda sigla: shapely.distance(bit, clipped[sigla]))
                    else:  # ilha oceânica: o vizinho mais próximo no índice espacial
                        best = order[int(tree.query_nearest(bit)[0])]
                    parts.setdefault(best, []).append(bit)
                    leftovers += 1
            for sigla, geoms in parts.items():
                merged = polygonal(shapely.union_all(np.array(geoms, dtype=object)))
                if merged is None:
                    continue
                state_id = f"br-{sigla.lower()}"
                out["carta_id"].append(state_id); out["cx"].append(cx); out["cy"].append(cy); out["geometry"].append(shapely.to_wkb(merged))
                land_by_state[sigla].append(merged)
                total_pieces += 1
        print(f"  linha {cy}: {len(out['geometry'])} pedaços", flush=True)
        if out["geometry"]:
            pq.write_table(pa.table({"carta_id": pa.array(out["carta_id"], pa.string()), "cx": pa.array(out["cx"], pa.int16()),
                                     "cy": pa.array(out["cy"], pa.int16()), "geometry": pa.array(out["geometry"], pa.binary())}),
                           os.path.join(out_dir, f"{cy:03d}.parquet"))
    empty = [sigla for sigla in order if not land_by_state[sigla]]
    if empty:
        sys.exit(f"estados sem terra no mapa: {empty}")
    print(f"pedaços: {total_pieces} (sobras atribuídas ao mais perto: {leftovers})", flush=True)


def write_outputs(config, states, ibge, order, land_by_state):
    # 3. catálogo e silhuetas
    os.makedirs(PUBLIC, exist_ok=True)
    # vizinhos pelas divisas do IBGE, simplificadas (~100 m) e com a folga calculada uma vez por estado
    simple = {sigla: shapely.simplify(ibge[sigla]["geom"], 0.001, preserve_topology=True) for sigla in order}
    grown = {sigla: shapely.buffer(simple[sigla], 0.002) for sigla in order}
    edges = {sigla: shapely.boundary(simple[sigla]) for sigla in order}
    neighbors_of = {sigla: [] for sigla in order}
    for i, a in enumerate(order):
        for b in order[i + 1:]:
            if not shapely.intersects(shapely.envelope(grown[a]), shapely.envelope(grown[b])):
                continue
            # encostar num ponto só (quatro estados num canto) dá ~0; a divisa real mais curta é a do DF com Minas, ~2,6 km (0,024°)
            if shapely.length(shapely.intersection(edges[a], grown[b])) > 0.01:
                neighbors_of[a].append(f"br-{b.lower()}")
                neighbors_of[b].append(f"br-{a.lower()}")
    # os pedaços vêm cortados pela grade do mapa HD e as bordas de células vizinhas diferem em ~1e-9 m (a armadilha 1 do CLAUDE.md, 3.7):
    # sem levar à grade de 1 m antes da união, eles não se fundem e a silhueta mostra a emenda como uma linha por dentro do estado
    full = {sigla: to_lonlat(polygonal(shapely.union_all(shapely.set_precision(np.array(land_by_state[sigla], dtype=object), 1.0)))) for sigla in order}
    seams = {sigla: len(shapely.get_parts(full[sigla])) for sigla in order}
    print("pedaços por estado depois da união:", " ".join(f"{sigla}={count}" for sigla, count in seams.items()), flush=True)
    catalog = {}
    shapes = {}
    for sigla in order:
        state = states[sigla]
        geom = full[sigla]
        parts = sorted(shapely.get_parts(geom), key=lambda part: -km2(part))
        main_part = parts[0]
        # ponto do rótulo: o centro do maior círculo dentro do pedaço principal
        bx0, by0, bx1, by1 = shapely.bounds(main_part)
        center = shapely.get_point(shapely.maximum_inscribed_circle(shapely.simplify(main_part, max(bx1 - bx0, by1 - by0) / 400), max(bx1 - bx0, by1 - by0) / 300), 0)
        neighbors = sorted(neighbors_of[sigla])
        # silhueta: sem ilhas oceânicas (pedaços a mais de 250 km do principal) e sem os minúsculos, simplificada para a moldura
        keep = [part for part in parts if km2(part) >= 0.0015 * km2(main_part) and shapely.distance(part, main_part) < 2.3]
        minx, miny, maxx, maxy = shapely.bounds(shapely.multipolygons(keep))
        tolerance = max(maxx - minx, maxy - miny) / 700
        silhouette = shapely.simplify(shapely.multipolygons(keep), tolerance, preserve_topology=True)
        shapes[f"br-{sigla.lower()}"] = json.loads(shapely.to_geojson(shapely.set_precision(silhouette, 0.0001)))
        names = {"pt": state["name"], "en": state.get("names", {}).get("en", state["name"]), "es": state.get("names", {}).get("es", state["name"])}
        catalog[f"br-{sigla.lower()}"] = {
            "sigla": sigla, "code": ibge[sigla]["code"], "name": names, "capital": state["capital"],
            **({"capAl": state["capAl"]} if state.get("capAl") else {}),
            "region": state["region"], "area": round(ibge[sigla]["area"]), "ll": [round(center.y, 4), round(center.x, 4)],
            # caixa do estado sem as ilhas oceânicas, [oeste, sul, leste, norte]: o enquadramento da câmera do mapa por região
            "bbox": [round(minx, 3), round(miny, 3), round(maxx, 3), round(maxy, 3)],
            "borders": neighbors,
        }
    document = {"source": "IBGE, malha estadual 2024 (BR_UF_2024); capitais conferidas em 06/10/2026", "regions": config["regions"], "states": catalog}
    json.dump(document, open(os.path.join(PUBLIC, "states.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    json.dump(shapes, open(os.path.join(PUBLIC, "shapes.json"), "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    vertices = sum(len(json.dumps(shape["coordinates"])) for shape in shapes.values())
    print(f"ok: {len(catalog)} estados · states.json {os.path.getsize(os.path.join(PUBLIC, 'states.json')) // 1000} kB · "
          f"shapes.json {os.path.getsize(os.path.join(PUBLIC, 'shapes.json')) // 1000} kB", flush=True)


if __name__ == "__main__":
    main()
