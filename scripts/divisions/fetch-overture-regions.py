"""Baixa do Overture Maps (divisions/division_area, a mesma release do mapa HD) a geometria das divisões de primeiro nível de um país
(subtype "region": estados, províncias…), nas duas versões que o Overture tem: a terra (is_land) e a com o mar territorial.

Uso: python scripts/divisions/fetch-overture-regions.py <país, ISO alfa-2: us>
Escolhe as linhas pelo índice local build/map-hd/overture-meta.parquet (feito pelo fetch:map-hd) e lê do S3 público só os grupos de
linhas que as contêm (as colunas necessárias). Retoma de onde parou: cada grupo baixado vira um arquivo em build/divisions/<país>/rg/.
Grava build/divisions/<país>/overture-regions.parquet (id, region, class, is_land, is_territorial, name, geometry WKB).
"""
import os
import sys
import time

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.fs as pafs
import pyarrow.parquet as pq

RELEASE = "2026-09-23.1"
BASE = f"overturemaps-us-west-2/release/{RELEASE}/theme=divisions/type=division_area"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "build")
COLUMNS = ["id", "subtype", "country", "region", "names", "class", "is_land", "is_territorial", "geometry"]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 2:
        sys.exit("uso: fetch-overture-regions.py <país>")
    country = sys.argv[1].lower()
    meta = pq.read_table(os.path.join(ROOT, "map-hd", "overture-meta.parquet"))
    rows = meta.filter(pc.and_(pc.equal(meta["country"], country.upper()), pc.equal(meta["subtype"], "region"))).to_pylist()
    if not rows:
        sys.exit(f"nenhuma divisão de primeiro nível de {country.upper()} no índice do Overture")
    wanted = pa.array([row["id"] for row in rows])
    groups = sorted({(int(row["file"]), int(row["rg"])) for row in rows})
    out = os.path.join(ROOT, "divisions", country)
    cache = os.path.join(out, "rg")
    os.makedirs(cache, exist_ok=True)
    fs = pafs.S3FileSystem(anonymous=True, region="us-west-2")
    files = sorted(info.path for info in fs.get_file_info(pafs.FileSelector(BASE)))
    started = time.time()
    for index, (file_index, group) in enumerate(groups):
        target = os.path.join(cache, f"{file_index}-{group}.parquet")
        if os.path.exists(target):
            continue
        table = pq.ParquetFile(files[file_index], filesystem=fs).read_row_group(group, columns=COLUMNS)
        table = table.filter(pc.is_in(table.column("id"), value_set=wanted))
        table = table.drop(["names"]).append_column("name", pc.struct_field(table.column("names"), "primary"))
        pq.write_table(table, target + ".part")
        os.replace(target + ".part", target)
        print(f"{index + 1}/{len(groups)} grupos · {time.time() - started:.0f} s", flush=True)
    merged = pa.concat_tables([pq.read_table(os.path.join(cache, name)) for name in sorted(os.listdir(cache)) if name.endswith(".parquet")])
    pq.write_table(merged, os.path.join(out, "overture-regions.parquet"))
    missing = {row["id"] for row in rows} - set(merged.column("id").to_pylist())
    if missing:
        sys.exit(f"faltando {len(missing)} linhas: {sorted(missing)[:5]}")
    print(f"ok: {merged.num_rows} linhas ({len({row['region'] for row in rows})} divisões) em build/divisions/{country}/overture-regions.parquet", flush=True)


if __name__ == "__main__":
    main()
