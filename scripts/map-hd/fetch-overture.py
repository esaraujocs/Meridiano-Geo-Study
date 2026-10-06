"""Baixa do Overture Maps (divisions/division_area) só a geometria das linhas que o mapa usa.

Uso: python scripts/map-hd/fetch-overture.py [selecao] [saida]
Lê build/map-hd/<selecao>.json (ids e grupos de linhas, montado a partir de overture-meta.parquet; padrão "selection") e grava
build/map-hd/<saida>.parquet (padrão "overture-selected") com id, subtype, country, region, name, is_land e geometry (WKB).
Retoma de onde parou: cada grupo de linhas baixado vira um arquivo em build/map-hd/rg-<selecao>/.
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
ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "build", "map-hd")


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "selection"
    output = sys.argv[2] if len(sys.argv) > 2 else "overture-selected"
    selection = json.load(open(os.path.join(ROOT, f"{name}.json")))
    wanted = pa.array(selection["ids"])
    groups = [tuple(item) for item in selection["rgs"]]
    fs = pafs.S3FileSystem(anonymous=True, region="us-west-2")
    files = sorted(info.path for info in fs.get_file_info(pafs.FileSelector(BASE)))
    out_dir = os.path.join(ROOT, "rg" if name == "selection" else f"rg-{name}")
    os.makedirs(out_dir, exist_ok=True)
    started = time.time()
    fetched = 0
    for index, (file_index, group) in enumerate(groups):
        target = os.path.join(out_dir, f"{file_index}-{group}.parquet")
        if os.path.exists(target):
            continue
        parquet = pq.ParquetFile(files[file_index], filesystem=fs)
        table = parquet.read_row_group(group, columns=["id", "subtype", "country", "region", "names", "is_land", "geometry"])
        table = table.filter(pc.is_in(table.column("id"), value_set=wanted))
        names = pc.struct_field(table.column("names"), "primary")
        table = table.drop(["names"]).append_column("name", names)
        pq.write_table(table, target + ".part")
        os.replace(target + ".part", target)
        fetched += sum(len(value.as_py() or b"") for value in table.column("geometry"))
        elapsed = time.time() - started
        print(f"{index + 1}/{len(groups)} grupos · {fetched / 1e6:.0f} MB de geometria · {elapsed:.0f} s", flush=True)
    parts = [pq.read_table(os.path.join(out_dir, name)) for name in sorted(os.listdir(out_dir)) if name.endswith(".parquet")]
    merged = pa.concat_tables(parts)
    pq.write_table(merged, os.path.join(ROOT, f"{output}.parquet"))
    print(f"ok: {merged.num_rows} linhas em {output}.parquet", flush=True)
    missing = set(selection["ids"]) - set(merged.column("id").to_pylist())
    if missing:
        print("faltando:", sorted(missing), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
