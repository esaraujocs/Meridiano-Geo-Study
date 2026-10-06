"""Distribui a terra do OpenStreetMap entre as entidades do mapa do Meridiano.

Uso: python scripts/map-hd/build-pieces.py
Entradas (em build/map-hd/):
  land-polygons-split-3857/land_polygons.shp  costa do OSM em detalhe total (osmdata.openstreetmap.de, EPSG:3857, grade de 128×128)
  overture-selected.parquet                   países, dependências e regiões do Overture recortados na terra (fronteiras finas, costa generalizada)
  overture-maritime.parquet                   os mesmos com o mar territorial (a fronteira marítima continua a terrestre)
  lakes.parquet                               lagos grandes com contorno do OSM (Overture base/water)
Saída: build/map-hd/pieces/<linha>.parquet — uma linha por (entidade, célula da grade): carta_id, cx, cy e a geometria em WKB (EPSG:3857),
já sem sobreposição entre células e sem os lagos. As células da grade são os tiles do zoom 7.

Quem é dono de cada pedaço de terra: a ZONA da entidade = a terra dela no Overture + o mar territorial dela menos a terra dos outros.
Unidade sem mar territorial no Overture (Bósnia em Neum, Macau, Gaza, ilhotas disputadas) ganha uma faixa de 8 km em volta da própria
terra, que vale antes do mar dos vizinhos. O que sobra fora de toda zona (ilhota além do mar territorial) vai para a zona mais perto
(até 60 km); o resto é descartado e listado no relatório.
"""
import json
import math
import os
import sys
import time

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import shapely

sys.path.insert(0, os.path.dirname(__file__))
from shp import read_polygons, record_offsets  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
BUILD = os.path.join(ROOT, "build", "map-hd")
R = 6378137.0
ORIGIN = math.pi * R
CELLS = 128
CELL = 2 * ORIGIN / CELLS
LAT_MAX = 85.0511287798
SYNTHETIC_BUFFER = 8000.0   # m de Mercator em volta da terra de quem não tem mar territorial
NEAREST_MAX = 60000.0       # alcance para dar dono a uma ilhota fora de toda zona
CHUNK = 60000               # registros do shapefile por vez


def lon_to_x(lon):
    return np.radians(lon) * R


def to_merc(geom):
    def project(coords):
        lat = np.clip(coords[:, 1], -LAT_MAX, LAT_MAX)
        return np.column_stack([lon_to_x(coords[:, 0]), R * np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))])
    return shapely.transform(geom, project)


def cell_rect(cx, cy):
    x0 = -ORIGIN + cx * CELL
    y1 = ORIGIN - cy * CELL
    return x0, y1 - CELL, x0 + CELL, y1


def polygonal(geom):
    """Só as partes poligonais (a interseção pode devolver linhas e pontos soltos)."""
    if geom is None or shapely.is_empty(geom):
        return None
    kind = shapely.get_type_id(geom)
    if kind in (3, 6):
        return geom
    if kind == 7:
        parts = [part for part in shapely.get_parts(geom) if shapely.get_type_id(part) in (3, 6)]
        if not parts:
            return None
        return shapely.multipolygons(list(shapely.get_parts(np.array(parts)))) if len(parts) > 1 else parts[0]
    return None


def load_units(config):
    """Unidades: código → {land, sea} em EPSG:3857 (sea = None quando o Overture não tem o mar territorial)."""
    land_rows = pq.read_table(os.path.join(BUILD, "overture-selected.parquet")).to_pylist()
    sea_rows = pq.read_table(os.path.join(BUILD, "overture-maritime.parquet")).to_pylist()
    regions = config["regions"]

    def key_of(row):
        if row["subtype"] in ("country", "dependency"):
            return row["country"]
        for code, spec in regions.items():
            if row["subtype"] == "region" and row["country"] == spec["country"] and row["region"] == spec["region"]:
                return code
        return None

    units = {}
    for rows, kind in ((land_rows, "land"), (sea_rows, "sea")):
        for row in rows:
            key = key_of(row)
            if key is None:
                continue
            if row["subtype"] == "county":
                continue
            unit = units.setdefault(key, {"land": None, "sea": None, "name": row["name"]})
            if unit[kind] is not None:
                raise ValueError(f"{key}: duas linhas de {kind}")
            unit[kind] = shapely.make_valid(to_merc(shapely.from_wkb(row["geometry"])))
    for code, unit in units.items():
        if unit["land"] is None:
            raise ValueError(f"{code}: sem a linha de terra")
    # unidades derivadas: o Marrocos sem o Saara Ocidental, o Chile sem a Ilha de Páscoa e a Ilha de Páscoa
    west_x = lon_to_x(-100.0)
    for code, spec in config["derived"].items():
        base = units[spec["base"]]
        out = {"name": f"{base['name']} ({code})"}
        for kind in ("land", "sea"):
            geom = base[kind]
            if geom is None:
                out[kind] = None
                continue
            if "minus" in spec:
                minus = units[spec["minus"]][kind] or units[spec["minus"]]["land"]
                geom = polygonal(shapely.difference(geom, minus))
            if "eastOf" in spec:
                geom = polygonal(shapely.clip_by_rect(geom, lon_to_x(spec["eastOf"]), -ORIGIN, ORIGIN, ORIGIN))
            if "westOf" in spec:
                geom = polygonal(shapely.clip_by_rect(geom, -ORIGIN, -ORIGIN, lon_to_x(spec["westOf"]), ORIGIN))
            out[kind] = geom
        units[code] = out
    return units


def entity_units(config, catalog):
    """carta_id → lista de unidades; e o conjunto de unidades usadas."""
    meta = catalog["meta"]
    playable = [str(item) for item in catalog["mapEntityIds"]]
    out = {}
    for cid in playable:
        if cid in config["entities"]:
            out[cid] = list(config["entities"][cid])
        else:
            cca2 = (meta[cid].get("cca2") or "").upper()
            if len(cca2) != 2:
                raise ValueError(f"{cid}: sem cca2 e sem regra em entities.json")
            out[cid] = [cca2]
    for code in config["neutral"]:
        out.setdefault("", []).append(code)
    return out


def build_zones(units, owners):
    """Zona de cada unidade = terra + franja (mar territorial ou faixa sintética, menos a terra dos outros), sem sobreposição."""
    codes = sorted(owners)
    lands = [units[code]["land"] for code in codes]
    land_tree = shapely.STRtree(lands)

    def others_land(code, geom):
        hits = land_tree.query(geom)
        near = [lands[i] for i in hits if codes[i] != code]
        return shapely.union_all(near) if near else None

    fringes = {}
    synthetic = []
    regular = []
    for code in codes:
        unit = units[code]
        if unit["sea"] is not None:
            fringe = shapely.difference(unit["sea"], unit["land"])
            regular.append(code)
        else:
            fringe = shapely.difference(shapely.buffer(unit["land"], SYNTHETIC_BUFFER, quad_segs=4), unit["land"])
            synthetic.append(code)
        other = others_land(code, fringe)
        if other is not None:
            fringe = shapely.difference(fringe, other)
        fringes[code] = polygonal(fringe)
    # sem sobreposição: a faixa sintética vale antes do mar dos vizinhos; entre mares, quem vem antes na ordem
    taken = []
    final = {}
    for code in synthetic + regular:
        fringe = fringes[code]
        if fringe is None:
            final[code] = None
            continue
        if taken:
            tree = shapely.STRtree(taken)
            hits = tree.query(fringe)
            if len(hits):
                fringe = polygonal(shapely.difference(fringe, shapely.union_all([taken[i] for i in hits])))
        final[code] = fringe
        if fringe is not None:
            taken.append(fringe)
    zones = []
    for code in codes:
        zones.append((owners[code], code, "land", units[code]["land"]))
        if final[code] is not None:
            zones.append((owners[code], code, "fringe", final[code]))
    return zones


def split_by_cells(geom, out, cx0=0, cy0=0, cx1=CELLS, cy1=CELLS):
    """Corta a geometria na grade (recursivo, metade de cada vez) e acrescenta (cx, cy, pedaço) em out."""
    if geom is None or shapely.is_empty(geom):
        return
    minx, miny, maxx, maxy = shapely.bounds(geom)
    cxa = max(cx0, int(math.floor((minx + ORIGIN) / CELL)))
    cxb = min(cx1, int(math.floor((maxx + ORIGIN) / CELL)) + 1)
    cya = max(cy0, int(math.floor((ORIGIN - maxy) / CELL)))
    cyb = min(cy1, int(math.floor((ORIGIN - miny) / CELL)) + 1)
    if cxb - cxa <= 0 or cyb - cya <= 0:
        return
    if cxb - cxa == 1 and cyb - cya == 1:
        piece = polygonal(shapely.clip_by_rect(geom, *cell_rect(cxa, cya)))
        if piece is not None:
            out.append((cxa, cya, piece))
        return
    if cxb - cxa >= cyb - cya:
        mid = (cxa + cxb) // 2
        for a, b in ((cxa, mid), (mid, cxb)):
            x0 = -ORIGIN + a * CELL
            x1 = -ORIGIN + b * CELL
            split_by_cells(polygonal(shapely.clip_by_rect(geom, x0, -ORIGIN, x1, ORIGIN)), out, a, cya, b, cyb)
    else:
        mid = (cya + cyb) // 2
        for a, b in ((cya, mid), (mid, cyb)):
            y1 = ORIGIN - a * CELL
            y0 = ORIGIN - b * CELL
            split_by_cells(polygonal(shapely.clip_by_rect(geom, -ORIGIN, y0, ORIGIN, y1)), out, cxa, a, cxb, b)


def build_zone_cells(config, units, owners, started):
    """Resolve as sobreposições de terra, monta as zonas e corta na grade: {(cx, cy): [(dono, unidade, tipo, zona)]}."""
    # sobreposição entre as terras (áreas disputadas contadas duas vezes): fica com o vencedor de entities.json
    winners = {key: value for key, value in config["overlapWinners"].items() if key != "comment"}
    codes = sorted(owners)
    lands = [units[code]["land"] for code in codes]
    tree = shapely.STRtree(lands)
    pairs = tree.query(lands, predicate="intersects")
    unresolved = []
    for i, j in zip(*pairs):
        if i >= j:
            continue
        area = shapely.area(shapely.intersection(lands[i], lands[j]))
        if area <= 1e6:
            continue
        pair = f"{codes[i]}|{codes[j]}"
        if pair not in winners:
            unresolved.append((pair, round(area / 1e6, 1)))
            continue
        loser = codes[j] if winners[pair] == codes[i] else codes[i]
        winner_land = units[winners[pair]]["land"]
        for kind in ("land", "sea"):
            if units[loser][kind] is not None:
                units[loser][kind] = polygonal(shapely.difference(units[loser][kind], winner_land))
        print(f"sobreposição {pair}: {area / 1e6:.1f} km² ficam com {winners[pair]}", flush=True)
    if unresolved:
        raise ValueError(f"sobreposição de terra sem dono definido em entities.json (overlapWinners): {unresolved}")

    zones = build_zones(units, owners)
    print(f"zonas: {len(zones)} · {time.time() - started:.0f} s", flush=True)
    zone_cells = {}
    for owner, code, kind, geom in zones:
        out = []
        split_by_cells(geom, out)
        for cx, cy, piece in out:
            zone_cells.setdefault((cx, cy), []).append((owner, code, kind, piece))
    print(f"zonas na grade: {sum(len(v) for v in zone_cells.values())} pedaços em {len(zone_cells)} células · {time.time() - started:.0f} s", flush=True)

    return zone_cells


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    started = time.time()
    config = json.load(open(os.path.join(HERE, "entities.json"), encoding="utf8"))
    catalog = json.load(open(os.path.join(ROOT, "public", "data", "legacy", "catalog.json"), encoding="utf8"))
    shp_path = os.path.join(BUILD, "land-polygons-split-3857", "land_polygons.shp")
    shx_path = shp_path[:-4] + ".shx"
    total = len(record_offsets(shx_path)[0])
    out_dir = os.path.join(BUILD, "raw-pieces")
    os.makedirs(out_dir, exist_ok=True)
    pending = [start for start in range(0, total, CHUNK) if not os.path.exists(os.path.join(out_dir, f"{start:07d}.done"))]
    units = load_units(config) if pending else None
    by_entity = entity_units(config, catalog)
    owners = {}
    for cid, codes in by_entity.items():
        for code in codes:
            if units is not None and code not in units:
                raise ValueError(f"{cid or 'neutro'}: unidade {code} não existe no Overture")
            if code in owners:
                raise ValueError(f"unidade {code} em duas entidades ({owners[code]!r} e {cid!r})")
            owners[code] = cid
    if units is not None:
        leftover = sorted(set(units) - set(owners) - set(config["unused"]) - {spec["base"] for spec in config["derived"].values()})
        if leftover:
            raise ValueError(f"unidades do Overture sem dono: {leftover}")
    print(f"{len(by_entity)} entidades, {len(owners)} unidades · {len(pending)} blocos de terra a fazer · {time.time() - started:.0f} s", flush=True)
    zone_cells = {}
    if pending:
        zone_cells = build_zone_cells(config, units, owners, started)

    # lagos, também na grade
    lake_cells = {}
    lakes_path = os.path.join(BUILD, "lakes.parquet")
    if os.path.exists(lakes_path):
        for row in pq.read_table(lakes_path).to_pylist():
            out = []
            split_by_cells(shapely.make_valid(to_merc(shapely.from_wkb(row["geometry"]))), out)
            for cx, cy, piece in out:
                lake_cells.setdefault((cx, cy), []).append(piece)
        print(f"lagos na grade: {sum(len(v) for v in lake_cells.values())} pedaços · {time.time() - started:.0f} s", flush=True)

    dropped = []
    zone_trees = {}
    for start in range(0, total, CHUNK):
        marker = os.path.join(out_dir, f"{start:07d}.done")
        if os.path.exists(marker):
            continue
        polygons, _ = read_polygons(shp_path, shx_path, start, start + CHUNK)
        bounds = shapely.bounds(polygons)
        cxs = np.floor(((bounds[:, 0] + bounds[:, 2]) / 2 + ORIGIN) / CELL).astype(int).clip(0, CELLS - 1)
        cys = np.floor((ORIGIN - (bounds[:, 1] + bounds[:, 3]) / 2) / CELL).astype(int).clip(0, CELLS - 1)
        rows = {"carta_id": [], "cx": [], "cy": [], "zone": [], "geometry": []}
        order = np.lexsort((cxs, cys))
        polygons, cxs, cys = polygons[order], cxs[order], cys[order]
        keys = cys * CELLS + cxs
        edges = np.flatnonzero(np.diff(keys)) + 1
        for block in np.split(np.arange(len(polygons)), edges):
            cx, cy = int(cxs[block[0]]), int(cys[block[0]])
            pieces = shapely.clip_by_rect(polygons[block], *cell_rect(cx, cy))
            pieces = pieces[~shapely.is_empty(pieces)]
            if not len(pieces):
                continue
            candidates = zone_cells.get((cx, cy), [])
            remaining = pieces
            for owner, code, kind, zone in candidates:
                if not len(remaining):
                    break
                shapely.prepare(zone)
                inside = shapely.contains_properly(zone, remaining)
                for piece in remaining[inside]:
                    rows["carta_id"].append(owner); rows["cx"].append(cx); rows["cy"].append(cy); rows["zone"].append(code); rows["geometry"].append(piece)
                rest = remaining[~inside]
                touching = rest[shapely.intersects(zone, rest)]
                if len(touching):
                    cut = shapely.intersection(touching, zone)
                    for piece in cut:
                        piece = polygonal(piece)
                        if piece is not None:
                            rows["carta_id"].append(owner); rows["cx"].append(cx); rows["cy"].append(cy); rows["zone"].append(code); rows["geometry"].append(piece)
                    leftover_parts = shapely.difference(touching, zone)
                    rest = np.concatenate([rest[~shapely.intersects(zone, rest)], np.array([g for g in (polygonal(x) for x in leftover_parts) if g is not None], dtype=object)])
                remaining = rest
                shapely.destroy_prepared(zone)
            # sobras fora de toda zona: a zona mais perto (nesta célula e nas vizinhas), até NEAREST_MAX
            for piece in remaining:
                if shapely.area(piece) < 1.0:
                    continue
                best = None
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        for owner, code, kind, zone in zone_cells.get((cx + dx, cy + dy), []):
                            distance = shapely.distance(piece, zone)
                            if distance <= NEAREST_MAX and (best is None or distance < best[0]):
                                best = (distance, owner, code)
                if best is None:
                    dropped.append((cx, cy, round(shapely.area(piece) / 1e6, 4), shapely.get_coordinates(shapely.centroid(piece)).tolist()[0]))
                    continue
                rows["carta_id"].append(best[1]); rows["cx"].append(cx); rows["cy"].append(cy); rows["zone"].append(best[2] + "~"); rows["geometry"].append(piece)
        if rows["geometry"]:
            table = pa.table({"carta_id": rows["carta_id"], "cx": pa.array(rows["cx"], pa.int16()), "cy": pa.array(rows["cy"], pa.int16()),
                              "zone": rows["zone"], "geometry": shapely.to_wkb(np.array(rows["geometry"], dtype=object))})
            cy_col = np.asarray(rows["cy"])
            for row in np.unique(cy_col):
                row_dir = os.path.join(out_dir, f"cy{row:03d}")
                os.makedirs(row_dir, exist_ok=True)
                pq.write_table(table.filter(pa.array(cy_col == row)), os.path.join(row_dir, f"{start:07d}.parquet"))
        open(marker, "w").close()
        print(f"terra {min(start + CHUNK, total)}/{total} registros · {len(rows['geometry'])} pedaços · {time.time() - started:.0f} s", flush=True)
    if pending:
        json.dump({"dropped": dropped}, open(os.path.join(BUILD, "dropped.json"), "w"))
    print(f"descartados fora de zona: {len(dropped)} pedaços, {sum(d[2] for d in dropped):.2f} km² de Mercator", flush=True)

    # por célula: une os pedaços de cada entidade e tira os lagos (uma linha da grade por vez)
    final_dir = os.path.join(BUILD, "pieces")
    os.makedirs(final_dir, exist_ok=True)
    for row in range(CELLS):
        target = os.path.join(final_dir, f"{row:03d}.parquet")
        if os.path.exists(target):
            continue
        row_dir = os.path.join(out_dir, f"cy{row:03d}")
        out = {"carta_id": [], "cx": [], "cy": [], "geometry": []}
        if os.path.isdir(row_dir) and os.listdir(row_dir):
            raw = pq.read_table(row_dir)
            cx_all = raw.column("cx").to_numpy()
            owner_all = raw.column("carta_id").to_pylist()
            geom_all = shapely.from_wkb(raw.column("geometry").to_numpy(zero_copy_only=False))
            groups = {}
            for index in range(len(geom_all)):
                groups.setdefault((int(cx_all[index]), owner_all[index]), []).append(geom_all[index])
            for (cx, owner), parts in sorted(groups.items()):
                merged = parts[0] if len(parts) == 1 else shapely.union_all(np.array(parts, dtype=object))
                lakes = lake_cells.get((cx, row))
                if lakes:
                    merged = shapely.difference(merged, shapely.union_all(np.array(lakes, dtype=object)))
                merged = polygonal(merged)
                if merged is None:
                    continue
                out["carta_id"].append(owner); out["cx"].append(cx); out["cy"].append(row); out["geometry"].append(merged)
        table = pa.table({"carta_id": pa.array(out["carta_id"], pa.string()), "cx": pa.array(out["cx"], pa.int16()), "cy": pa.array(out["cy"], pa.int16()),
                          "geometry": pa.array(list(shapely.to_wkb(np.array(out["geometry"], dtype=object))) if out["geometry"] else [], pa.binary())})
        pq.write_table(table, target + ".part")
        os.replace(target + ".part", target)
        if row % 8 == 7:
            print(f"células: linha {row + 1}/{CELLS} · {time.time() - started:.0f} s", flush=True)
    print(f"ok · {time.time() - started:.0f} s")


if __name__ == "__main__":
    main()
