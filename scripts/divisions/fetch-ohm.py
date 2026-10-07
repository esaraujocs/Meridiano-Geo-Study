"""Baixa do OpenHistoricalMap (CC0) as fronteiras de país (boundary=administrative, admin_level=2) válidas na data de uma época do modo
"Mapas históricos" (o `date` da config: 1914-07-01) e monta os multipolígonos.

Uso: python scripts/divisions/fetch-ohm.py <época>   (ex.: 1914; config em countries/<época>.json)
1. Pede ao Overpass do OHM as tags de todas as relações de país (~10 MB) e escolhe as válidas na data (start_date <= data < end_date).
2. Pede a geometria só dessas (`out geom`; em 1914 são 189 relações, ~155 MB de JSON).
3. Monta cada multipolígono (as vias outer/inner fechadas por polygonize) e grava build/divisions/<época>/ohm.parquet (id, nome, tags em JSON, WKB),
   que build-division.py lê. Não baixa de novo o que já tem (apague build/divisions/<época>/ohm-*.json para atualizar).
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

import pyarrow as pa
import pyarrow.parquet as pq
import shapely

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OVERPASS = "https://overpass-api.openhistoricalmap.org/api/interpreter"
UA = {"User-Agent": "MeridianoGeoStudy/1.0 (jogo pessoal; pratesbaliza@gmail.com)"}


def overpass(query, target):
    if not os.path.exists(target):
        request = urllib.request.Request(OVERPASS, data=urllib.parse.urlencode({"data": query}).encode(), headers=UA)
        data = urllib.request.urlopen(request, timeout=900).read()
        open(target + ".part", "wb").write(data)
        os.replace(target + ".part", target)
        print(f"  {os.path.basename(target)}: {len(data) / 1e6:.1f} MB", flush=True)
    return json.load(open(target, encoding="utf8"))["elements"]


def as_date(value):
    match = re.match(r"^(-?\d{1,4})(?:-(\d\d))?(?:-(\d\d))?", (value or "").strip())
    return (int(match.group(1)), int(match.group(2) or 1), int(match.group(3) or 1)) if match else None


def multipolygon(relation):
    outer, inner = [], []
    for member in relation.get("members", []):
        if member.get("type") != "way" or not member.get("geometry"):
            continue
        line = shapely.LineString([(point["lon"], point["lat"]) for point in member["geometry"] if point])
        (inner if member.get("role") == "inner" else outer).append(line)

    def polygons(lines):
        if not lines:
            return shapely.Polygon()
        merged = shapely.line_merge(shapely.union_all(lines))
        return shapely.union_all(list(shapely.get_parts(shapely.polygonize([merged]))))
    geom = polygons(outer)
    if inner:
        geom = shapely.difference(geom, polygons(inner))
    return shapely.make_valid(geom)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    era = sys.argv[1]
    config = json.load(open(os.path.join(HERE, "countries", f"{era}.json"), encoding="utf8"))
    build = os.path.join(ROOT, "build", "divisions", era)
    os.makedirs(build, exist_ok=True)
    date = as_date(config["date"])
    tags = overpass('[out:json][timeout:300];relation["boundary"="administrative"]["admin_level"="2"];out tags;', os.path.join(build, "ohm-tags.json"))
    ids = [element["id"] for element in tags
           if as_date(element["tags"].get("start_date")) and as_date(element["tags"]["start_date"]) <= date
           and (as_date(element["tags"].get("end_date")) is None or as_date(element["tags"]["end_date"]) > date)]
    print(f"OHM: {len(tags)} relações de país; {len(ids)} válidas em {config['date']}", flush=True)
    relations = overpass(f"[out:json][timeout:900];relation(id:{','.join(map(str, ids))});out geom;", os.path.join(build, "ohm-geom.json"))
    out = {"id": [], "name": [], "tags": [], "wkb": []}
    for relation in relations:
        rel_tags = relation.get("tags", {})
        out["id"].append(relation["id"])
        out["name"].append(rel_tags.get("name:en") or rel_tags.get("name"))
        out["tags"].append(json.dumps(rel_tags, ensure_ascii=False))
        out["wkb"].append(shapely.to_wkb(multipolygon(relation)))
    pq.write_table(pa.table(out), os.path.join(build, "ohm.parquet"))
    print(f"ok: {len(out['id'])} territórios em build/divisions/{era}/ohm.parquet", flush=True)


if __name__ == "__main__":
    main()
