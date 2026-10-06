"""Acha e baixa do Overture Maps (base/water) os lagos que o mapa recorta da terra, com o contorno do OSM.

Uso: python scripts/map-hd/fetch-lakes.py   → build/map-hd/lakes.parquet (uma linha por polígono do Overture)

Quais lagos: todos os do Natural Earth 10m (domínio público, só como índice: nome, área, Wikidata e pontos dentro do lago)
com pelo menos LAKE_MIN_KM2 (padrão 500 km²), mais os de scripts/map-hd/lakes.json (os de fronteira e os famosos menores;
o lago manual que é o mesmo do Natural Earth herda o Wikidata e os pontos dele). Ficam de fora os de "exclude" no lakes.json
(represa esvaziada, salares) e todo polígono do Overture marcado intermitente.

Como escolhe o polígono de cada lago (o Overture tem milhares de lagos e às vezes divide um lago grande em pedaços):
1. pelos rodapés dos Parquet, os grupos de linhas cuja caixa contém algum ponto do lago;
2. nas colunas leves desses grupos (cache em build/map-hd/water-light/, ~0,4 MB por grupo), os candidatos: lago, represa,
   água genérica ou lagoa grande ("pond" com caixa de 0,01 grau² ou mais) cuja caixa contém um ponto; todos os de mesmo Wikidata entram juntos (os pedaços de Kuibyshev);
3. cada ponto ainda sem polígono fica com o maior candidato que de fato o CONTÉM (o ponto pode cair numa ilha do lago);
   antes o critério era só a maior caixa, e o ponto do Manitoba pegou o Winnipeg. A geometria só desce para os grupos com
   candidato (cache por id em build/map-hd/water-geom.parquet, semeado pelo lakes.parquet anterior).
"""
import json
import math
import os
import struct
import sys
import time
import urllib.request
import zipfile

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.fs as pafs
import pyarrow.parquet as pq
import shapely

from shp import read_polygons

RELEASE = "2026-09-23.1"
BASE = f"overturemaps-us-west-2/release/{RELEASE}/theme=base/type=water"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "build", "map-hd")
NE_URL = "https://naciscdn.org/naturalearth/10m/physical/ne_10m_lakes.zip"
NE_DIR = os.path.join(ROOT, "ne-lakes")
LIGHT_DIR = os.path.join(ROOT, "water-light")
GEOM_CACHE = os.path.join(ROOT, "water-geom.parquet")
ALLOWED = {"lake", "reservoir", "water"}
POND_MIN_BOX = 0.01  # graus²: "pond" grande também vale (o OSM marca assim a Lagoa de Araruama e a Lagoa Feia)
LIGHT_COLUMNS = ["id", "subtype", "class", "bbox", "wikidata", "is_intermittent", "is_salt"]
MIN_KM2 = float(os.environ.get("LAKE_MIN_KM2", "500"))
R_KM = 6371.0088


def area_km2(geom):
    """Área em km² de uma geometria em lon/lat (projeção cilíndrica de áreas iguais)."""
    projected = shapely.transform(geom, lambda c: np.column_stack((np.radians(c[:, 0]) * R_KM, np.sin(np.radians(c[:, 1])) * R_KM)))
    return float(shapely.area(projected))


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


def sample_points(geom):
    """Um ponto dentro do lago e, nos grandes, mais um por quadrante com bastante água (os pedaços de um lago dividido)."""
    points = [shapely.point_on_surface(geom)]
    xmin, ymin, xmax, ymax = geom.bounds
    if max(xmax - xmin, ymax - ymin) > 0.5:
        xm, ym = (xmin + xmax) / 2, (ymin + ymax) / 2
        total = shapely.area(geom)
        for box in ((xmin, ymin, xm, ym), (xm, ymin, xmax, ym), (xmin, ym, xm, ymax), (xm, ym, xmax, ymax)):
            part = shapely.intersection(geom, shapely.box(*box))
            if shapely.area(part) > 0.1 * total:
                points.append(shapely.point_on_surface(part))
    return [(round(p.x, 4), round(p.y, 4)) for p in points]


def natural_earth_lakes():
    """Lagos do Natural Earth: [{name, wikidata, km2, geom, points}] (baixa o zip de 2,3 MB se faltar)."""
    base = os.path.join(NE_DIR, "ne_10m_lakes")
    if not os.path.exists(base + ".shp"):
        os.makedirs(NE_DIR, exist_ok=True)
        target = os.path.join(NE_DIR, "ne_10m_lakes.zip")
        urllib.request.urlretrieve(NE_URL, target)
        with zipfile.ZipFile(target) as archive:
            archive.extractall(NE_DIR)
    attrs = read_dbf(base + ".dbf")
    polygons, records = read_polygons(base + ".shp", base + ".shx")
    parts = {}
    for polygon, record in zip(polygons, records):
        parts.setdefault(int(record), []).append(polygon)
    out = []
    for index, row in enumerate(attrs):
        if index not in parts:
            continue
        geom = shapely.make_valid(shapely.union_all(parts[index]))
        out.append({"name": row["name_pt"] or row["name"] or f"ne {row['ne_id']}", "ne": row["name"], "wikidata": row["wikidataid"] or None,
                    "km2": area_km2(geom), "geom": geom})
    return out


def lake_list():
    """Lista final: [{name, points, wikidata}], já sem os excluídos."""
    config = json.load(open(os.path.join(HERE, "lakes.json"), encoding="utf8"))
    excluded = set(config.get("exclude", []))
    ne = natural_earth_lakes()
    shapely.prepare(np.array([lake["geom"] for lake in ne], dtype=object))
    lakes = []
    used = set()
    for item in config["lakes"]:
        # [nome, lon, lat] ou [nome, lon, lat, lon2, lat2, …] (laguna comprida: um ponto em cada parte)
        name, coords = item[0], item[1:]
        points = [(coords[i], coords[i + 1]) for i in range(0, len(coords), 2)]
        point = shapely.Point(*points[0])
        match = next((i for i, lake in enumerate(ne) if lake["geom"].distance(point) < 0.02), None)
        entry = {"name": name, "points": points, "wikidata": None}
        if match is not None:
            used.add(match)
            entry["wikidata"] = ne[match]["wikidata"]
            entry["points"] += [p for p in sample_points(ne[match]["geom"]) if p not in points]
        lakes.append(entry)
    for index, lake in enumerate(ne):
        if index in used or lake["km2"] < MIN_KM2:
            continue
        lakes.append({"name": lake["name"], "points": sample_points(lake["geom"]), "wikidata": lake["wikidata"], "ne": lake["ne"]})
    kept = [lake for lake in lakes if lake["name"] not in excluded and lake.get("ne") not in excluded and lake["wikidata"] not in excluded]
    print(f"{len(lakes)} lagos ({len(config['lakes'])} da lista manual, {len(lakes) - len(config['lakes'])} do Natural Earth com "
          f"≥ {MIN_KM2:.0f} km²), {len(lakes) - len(kept)} excluídos", flush=True)
    return kept


def footers(fs, files):
    path = os.path.join(ROOT, "water-footers.json")
    if os.path.exists(path):
        return json.load(open(path))
    out = []
    for file_index, name in enumerate(files):
        meta = pq.ParquetFile(name, filesystem=fs).metadata
        columns = [meta.schema.column(i).path for i in range(meta.num_columns)]
        index = {key: columns.index(key) for key in ("bbox.xmin", "bbox.xmax", "bbox.ymin", "bbox.ymax", "geometry")}
        for group in range(meta.num_row_groups):
            row_group = meta.row_group(group)
            stat = lambda key: row_group.column(index[key]).statistics
            out.append({"f": file_index, "rg": group, "x": (stat("bbox.xmin").min, stat("bbox.xmax").max),
                        "y": (stat("bbox.ymin").min, stat("bbox.ymax").max), "geom": row_group.column(index["geometry"]).total_compressed_size})
    json.dump(out, open(path, "w"))
    return out


class Downloads:
    def __init__(self):
        self.bytes = 0


def light_rows(fs, files, key, downloads):
    os.makedirs(LIGHT_DIR, exist_ok=True)
    path = os.path.join(LIGHT_DIR, f"{key[0]}-{key[1]}.parquet")
    if not os.path.exists(path):
        table = pq.ParquetFile(files[key[0]], filesystem=fs).read_row_group(key[1], columns=LIGHT_COLUMNS)
        downloads.bytes += table.nbytes
        pq.write_table(table, path + ".part")
        os.replace(path + ".part", path)
    return pq.read_table(path).to_pylist()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    started = time.time()
    lakes = lake_list()
    fs = pafs.S3FileSystem(anonymous=True, region="us-west-2")
    files = sorted(info.path for info in fs.get_file_info(pafs.FileSelector(BASE)))
    groups = footers(fs, files)
    sizes = {(g["f"], g["rg"]): g["geom"] for g in groups}
    downloads = Downloads()

    def groups_at(lon, lat):
        return [(g["f"], g["rg"]) for g in groups if g["x"][0] is not None and g["x"][0] <= lon <= g["x"][1] and g["y"][0] <= lat <= g["y"][1]]

    # candidatos de cada lago (colunas leves)
    light = {}
    for count, lake in enumerate(lakes):
        keys = sorted({key for lon, lat in lake["points"] for key in groups_at(lon, lat)})
        candidates = {}
        for key in keys:
            if key not in light:
                light[key] = light_rows(fs, files, key, downloads)
            for row in light[key]:
                box = row["bbox"]
                big_pond = row["subtype"] == "pond" and (box["xmax"] - box["xmin"]) * (box["ymax"] - box["ymin"]) >= POND_MIN_BOX
                if (row["subtype"] not in ALLOWED and not big_pond) or row["is_intermittent"]:
                    continue
                inside_box = any(box["xmin"] <= lon <= box["xmax"] and box["ymin"] <= lat <= box["ymax"] for lon, lat in lake["points"])
                same = lake["wikidata"] and row["wikidata"] == lake["wikidata"]
                if inside_box or same:
                    candidates[row["id"]] = (key, row, (box["xmax"] - box["xmin"]) * (box["ymax"] - box["ymin"]), bool(same))
        lake["candidates"] = candidates
        if (count + 1) % 25 == 0:
            print(f"  candidatos {count + 1}/{len(lakes)} · {downloads.bytes / 1e6:.0f} MB · {time.time() - started:.0f} s", flush=True)

    # geometria: cache por id (semeado pelo lakes.parquet anterior)
    cache = {}
    if os.path.exists(GEOM_CACHE):
        cache.update({row["id"]: row["geometry"] for row in pq.read_table(GEOM_CACHE).to_pylist()})
    previous = os.path.join(ROOT, "lakes.parquet")
    if os.path.exists(previous):
        for row in pq.read_table(previous, columns=["id", "geometry"]).to_pylist():
            cache.setdefault(row["id"], row["geometry"])
    fetched_groups = set()

    def geometry_of(candidate_id, key):
        if candidate_id not in cache and key not in fetched_groups:
            wanted = {cid for lake in lakes for cid, (k, *_rest) in lake["candidates"].items() if k == key}
            table = pq.ParquetFile(files[key[0]], filesystem=fs).read_row_group(key[1], columns=["id", "geometry"])
            downloads.bytes += sizes.get(key, 0)
            table = table.filter(pc.is_in(table.column("id"), value_set=pa.array(sorted(wanted))))
            for row in table.to_pylist():
                cache[row["id"]] = row["geometry"]
            fetched_groups.add(key)
            pq.write_table(pa.Table.from_pylist([{"id": k, "geometry": v} for k, v in cache.items()]), GEOM_CACHE)
        blob = cache.get(candidate_id)
        return shapely.from_wkb(blob) if blob else None

    def shells(geom):
        return [shapely.Polygon(part.exterior) for part in shapely.get_parts(geom) if part.geom_type == "Polygon"]

    out = []
    report = []
    emitted = set()
    for count, lake in enumerate(lakes):
        chosen = {}
        for cid, (key, row, _, same) in lake["candidates"].items():
            if same:
                geom = geometry_of(cid, key)
                if geom is not None:
                    chosen[cid] = (row, geom)
        for lon, lat in lake["points"]:
            point = shapely.Point(lon, lat)
            if any(shell.contains(point) for _, geom in chosen.values() for shell in shells(geom)):
                continue
            ranked = sorted(((area, cid, key, row) for cid, (key, row, area, _) in lake["candidates"].items()
                             if row["bbox"]["xmin"] <= lon <= row["bbox"]["xmax"] and row["bbox"]["ymin"] <= lat <= row["bbox"]["ymax"]), reverse=True)
            for _, cid, key, row in ranked:
                geom = geometry_of(cid, key)
                if geom is not None and any(shell.contains(point) for shell in shells(geom)):
                    chosen[cid] = (row, geom)
                    break
        if not chosen:
            report.append(f"SEM POLÍGONO  {lake['name']}")
            continue
        km2 = 0.0
        for cid, (row, geom) in chosen.items():
            if cid in emitted:  # duas entradas chegaram ao mesmo polígono
                continue
            emitted.add(cid)
            km2 += area_km2(geom)
            out.append({"lake": lake["name"], "id": cid, "subtype": row["subtype"], "class": row["class"], "is_salt": row["is_salt"],
                        "wikidata": row["wikidata"], "vertices": int(shapely.get_num_coordinates(geom)), "geometry": cache[cid]})
        report.append(f"ok {lake['name']:32} {len(chosen)} polígono(s), {km2:8.0f} km²")
        if (count + 1) % 25 == 0:
            print(f"  geometria {count + 1}/{len(lakes)} · {downloads.bytes / 1e6:.0f} MB · {time.time() - started:.0f} s", flush=True)
    pq.write_table(pa.Table.from_pylist(out), os.path.join(ROOT, "lakes.parquet"))
    print("\n".join(report))
    print(f"ok: {sum(1 for line in report if line.startswith('ok'))} lagos, {len(out)} polígonos · baixados {downloads.bytes / 1e6:.0f} MB · "
          f"{time.time() - started:.0f} s")


if __name__ == "__main__":
    main()
