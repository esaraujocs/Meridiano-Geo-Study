"""Contornos dos territórios absorvidos (nunca alvo; o clique vale pelo soberano), só para posicionar os marcadores.

Uso: python scripts/map-hd/build-absorbed.py   → scripts/map-hd/absorbed.geojson
No mapa em alta definição essas ilhas fazem parte do polígono do soberano (Guadalupe, Martinica e Reunião na França, Svalbard,
Jan Mayen e Bouvet na Noruega, Heard e McDonald na Austrália, as Ilhas Menores nos Estados Unidos); o gerador de marcadores
(scripts/generate-small-entity-report.mjs) usa este arquivo para pôr o marcador de cada uma no lugar certo e com o switchZoom certo.
Fonte: Overture Maps (divisions/division_area, release 2026-09-23.1, ODbL), contorno simplificado em ~100 m.
"""
import json
import os
import sys

import pyarrow.parquet as pq
import shapely

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
UNITS = {"312": ["GP"], "474": ["MQ"], "638": ["RE"], "744": ["SJ", "XJ"], "74": ["BV"], "334": ["HM"], "581": ["UM"]}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    catalog = json.load(open(os.path.join(ROOT, "public", "data", "legacy", "catalog.json"), encoding="utf8"))
    rows = pq.read_table(os.path.join(ROOT, "build", "map-hd", "overture-selected.parquet")).to_pylist()
    land = {row["country"]: shapely.from_wkb(row["geometry"]) for row in rows if row["subtype"] in ("country", "dependency")}
    absorbed = {cid for cid, meta in catalog["meta"].items() if meta.get("absorvido")}
    if absorbed != set(UNITS):
        raise ValueError(f"absorvidos do catálogo diferentes da lista: {sorted(absorbed ^ set(UNITS))}")
    features = []
    for cid, codes in sorted(UNITS.items()):
        geom = shapely.union_all([land[code] for code in codes])
        geom = shapely.simplify(geom, 0.001, preserve_topology=True)
        rounded = shapely.set_precision(geom, 1e-5)
        features.append({"type": "Feature", "properties": {"carta_id": cid, "answer_id": str(catalog["meta"][cid]["mapaPara"]), "name": catalog["meta"][cid]["pt"]},
                         "geometry": json.loads(shapely.to_geojson(rounded))})
    out = os.path.join(HERE, "absorbed.geojson")
    with open(out, "w", encoding="utf8") as handle:
        json.dump({"type": "FeatureCollection", "features": features}, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    print(f"ok: {len(features)} territórios absorvidos em {out} ({os.path.getsize(out) / 1e3:.0f} kB)")


if __name__ == "__main__":
    main()
