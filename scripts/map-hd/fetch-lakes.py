"""Acha e baixa do Overture Maps (base/water) os lagos de scripts/map-hd/lakes.json, com o contorno do OSM.

Uso: python scripts/map-hd/fetch-lakes.py
1. Lê os rodapés dos Parquet (build/map-hd/water-footers.json; refeito se faltar) e, para cada lago, pega os grupos de
   linhas cuja caixa (estatística do grupo) contém o ponto do lago.
2. Lê só as colunas leves desses grupos e escolhe, entre os lagos/represas cuja caixa contém o ponto, o de maior caixa.
3. Baixa a geometria das linhas escolhidas, confere que o ponto cai dentro e grava build/map-hd/lakes.parquet.
"""
import json
import os
import sys
import time

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.fs as pafs
import pyarrow.parquet as pq
import shapely

RELEASE = "2026-09-23.1"
BASE = f"overturemaps-us-west-2/release/{RELEASE}/theme=base/type=water"
HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, "..", "..", "build", "map-hd")
LAKE_SUBTYPES = {"lake", "reservoir"}


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


def main():
    lakes = json.load(open(os.path.join(HERE, "lakes.json"), encoding="utf8"))["lakes"]
    fs = pafs.S3FileSystem(anonymous=True, region="us-west-2")
    files = sorted(info.path for info in fs.get_file_info(pafs.FileSelector(BASE)))
    groups = footers(fs, files)
    wanted = {}
    for name, lon, lat in lakes:
        hits = [(g["f"], g["rg"]) for g in groups if g["x"][0] is not None and g["x"][0] <= lon <= g["x"][1] and g["y"][0] <= lat <= g["y"][1]]
        wanted[name] = hits
    unique = sorted({hit for hits in wanted.values() for hit in hits})
    print(f"{len(lakes)} lagos, {len(unique)} grupos candidatos", flush=True)
    started = time.time()
    light = {}
    for count, (file_index, group) in enumerate(unique):
        parquet = pq.ParquetFile(files[file_index], filesystem=fs)
        table = parquet.read_row_group(group, columns=["id", "subtype", "class", "bbox", "is_salt"])
        light[(file_index, group)] = table.to_pylist()
        if (count + 1) % 10 == 0:
            print(f"  metadados {count + 1}/{len(unique)} · {time.time() - started:.0f} s", flush=True)
    chosen = {}
    for name, lon, lat in lakes:
        best = None
        for key in wanted[name]:
            for row in light[key]:
                box = row["bbox"]
                if row["subtype"] not in LAKE_SUBTYPES:
                    continue
                if not (box["xmin"] <= lon <= box["xmax"] and box["ymin"] <= lat <= box["ymax"]):
                    continue
                area = (box["xmax"] - box["xmin"]) * (box["ymax"] - box["ymin"])
                if best is None or area > best[0]:
                    best = (area, row["id"], key, row)
        chosen[name] = best
    # orçamento combinado com o Enzo (400 MB e depois mais 350 MB de geometria): os lagos entram na ordem da lista (os maiores primeiro)
    sizes = {(g["f"], g["rg"]): g["geom"] for g in groups}
    budget = float(os.environ.get("LAKE_BUDGET_MB", "750")) * 1e6
    by_group = {}
    planned = 0
    skipped = []
    for name, lon, lat in lakes:
        best = chosen[name]
        if not best:
            continue
        cost = 0 if best[2] in by_group else sizes[best[2]]
        if planned + cost > budget:
            skipped.append(name)
            chosen[name] = None
            continue
        planned += cost
        by_group.setdefault(best[2], set()).add(best[1])
    print(f"geometria a baixar: {len(by_group)} grupos, {planned / 1e6:.0f} MB; fora do orçamento: {skipped}", flush=True)
    rows = []
    geometry_bytes = 0
    for count, (key, ids) in enumerate(sorted(by_group.items())):
        parquet = pq.ParquetFile(files[key[0]], filesystem=fs)
        table = parquet.read_row_group(key[1], columns=["id", "geometry"])
        table = table.filter(pc.is_in(table.column("id"), value_set=pa.array(sorted(ids))))
        for row in table.to_pylist():
            rows.append(row)
            geometry_bytes += len(row["geometry"])
        print(f"  geometria {count + 1}/{len(by_group)}", flush=True)
    geometry_by_id = {row["id"]: row["geometry"] for row in rows}
    out = []
    report = []
    for name, lon, lat in lakes:
        best = chosen[name]
        if not best:
            report.append(f"SEM CANDIDATO OU FORA DO ORÇAMENTO: {name}")
            continue
        geometry = shapely.from_wkb(geometry_by_id[best[1]])
        inside = geometry.contains(shapely.Point(lon, lat))
        meta = best[3]
        out.append({"lake": name, "id": best[1], "subtype": meta["subtype"], "class": meta["class"],
                    "is_salt": meta["is_salt"], "inside": bool(inside), "vertices": int(shapely.get_num_coordinates(geometry)),
                    "geometry": geometry_by_id[best[1]]})
        report.append(f"{'ok ' if inside else 'FORA'} {name:24} -> [{meta['subtype']}/{meta['class']}] {shapely.get_num_coordinates(geometry)} vértices")
    pq.write_table(pa.Table.from_pylist(out), os.path.join(ROOT, "lakes.parquet"))
    print("\n".join(report))
    print(f"ok: {len(out)} lagos, {geometry_bytes / 1e6:.0f} MB de geometria, {time.time() - started:.0f} s")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
