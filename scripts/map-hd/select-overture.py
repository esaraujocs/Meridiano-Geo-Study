"""Escolhe as linhas do Overture Maps (divisions/division_area) que o mapa usa, sem baixar geometria.

Uso: python scripts/map-hd/select-overture.py
1. Lê só as colunas leves de todos os grupos de linhas (id, subtipo, país, região, nome, terra/territorial, caixa) e grava
   build/map-hd/overture-meta.parquet (uns 7 minutos: é latência de rede, não volume).
2. Grava build/map-hd/selection.json (países e dependências recortados na terra + as regiões de entities.json) e
   build/map-hd/selection-maritime.json (os mesmos com o mar territorial). Depois: fetch-overture.py baixa a geometria.
"""
import json
import os
import sys
import time

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.fs as pafs
import pyarrow.parquet as pq

RELEASE = "2026-09-23.1"
BASE = f"overturemaps-us-west-2/release/{RELEASE}/theme=divisions/type=division_area"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "build", "map-hd")


def read_meta():
    path = os.path.join(ROOT, "overture-meta.parquet")
    if os.path.exists(path):
        return pq.read_table(path).to_pylist()
    fs = pafs.S3FileSystem(anonymous=True, region="us-west-2")
    files = sorted(info.path for info in fs.get_file_info(pafs.FileSelector(BASE)))
    started = time.time()
    tables = []
    for file_index, name in enumerate(files):
        parquet = pq.ParquetFile(name, filesystem=fs)
        for group in range(parquet.metadata.num_row_groups):
            table = parquet.read_row_group(group, columns=["id", "subtype", "country", "region", "names", "is_land", "is_territorial", "admin_level", "class", "division_id", "bbox"])
            names = pc.struct_field(table.column("names"), "primary")
            table = table.drop(["names"]).append_column("name", names)
            table = table.append_column("file", pa.array([file_index] * table.num_rows, pa.int16()))
            table = table.append_column("rg", pa.array([group] * table.num_rows, pa.int16()))
            tables.append(table)
        print(f"arquivo {file_index + 1}/{len(files)} · {time.time() - started:.0f} s", flush=True)
    meta = pa.concat_tables(tables)
    pq.write_table(meta, path)
    return meta.to_pylist()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(ROOT, exist_ok=True)
    config = json.load(open(os.path.join(HERE, "entities.json"), encoding="utf8"))
    rows = read_meta()
    regions = list(config["regions"].values())

    def is_region(row):
        return row["subtype"] == "region" and any(row["country"] == spec["country"] and row["region"] == spec["region"] for spec in regions)

    for name, land in (("selection", True), ("selection-maritime", False)):
        chosen = [row for row in rows if bool(row["is_land"]) == land and (row["subtype"] in ("country", "dependency") or is_region(row))]
        selection = {"ids": sorted(row["id"] for row in chosen), "rgs": sorted({(row["file"], row["rg"]) for row in chosen})}
        json.dump(selection, open(os.path.join(ROOT, f"{name}.json"), "w"))
        print(f"{name}.json: {len(selection['ids'])} linhas em {len(selection['rgs'])} grupos")


if __name__ == "__main__":
    main()
