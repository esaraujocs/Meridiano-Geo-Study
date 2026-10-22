"""Silhuetas do mapa-múndi tiradas do mapa HD (21/10/2026, pedido do Enzo: "revisitar as silhuetas", as do legacy-map.json eram de baixa
resolução, herdadas do HTML clássico). Mesma costa (OSM) e mesmas fronteiras (Overture) do mapa da partida.

Para cada território do mapa da partida (os 250 de mapEntityIds; as quatro nações do Reino Unido separadas, como no mapa): os pedaços de build/map-hd/pieces levados a uma
grade proporcional ao tamanho do país (snap rounding, sempre válido; as bordas das células caem iguais dos dois lados), unidos, em graus; as
ilhas distantes saem como nas silhuetas de Estados e províncias (island_group: saltos de até 2,3°), mas as partes com ao menos 20% da maior
ficam (as duas metades da Malásia; o Alasca, com 18% dos EUA contíguos, e Svalbard, com 19% da Noruega, saem); furos pequenos saem e o contorno é simplificado a 1/700 do lado maior.
Grava public/data/silhouettes.json ({id: geometria GeoJSON}). Precisa do build/map-hd/pieces do build:map-hd.

    python scripts/map-hd/build-silhouettes.py
"""
import glob
import math
import importlib.util
import json
import os
import sys
import time

import numpy as np
import pyarrow.parquet as pq
import shapely

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
spec = importlib.util.spec_from_file_location("build_division", os.path.join(ROOT, "scripts", "divisions", "build-division.py"))
division = importlib.util.module_from_spec(spec)
spec.loader.exec_module(division)

FAR_KEEP = 0.2       # parte longe da principal que fica mesmo assim (fração da área da principal)
SIMPLIFY = 450       # tolerância = lado maior / SIMPLIFY (~0,7 px no quadro da silhueta; com 700 o arquivo passava de 5 MB)
GRID_DIV = 1500      # grade da união, em m: raiz da área (km → m) / GRID_DIV
WORLD = 20037508.342789244


def rounded(geom, step):
    """GeoJSON com as coordenadas em decimais de verdade (o set_precision deixa 0.30000000000000004, que dobrava o arquivo)."""
    digits = max(0, math.ceil(-math.log10(step)))
    def walk(value):
        return [walk(item) for item in value] if isinstance(value, list) else round(value, digits)
    data = json.loads(shapely.to_geojson(geom))
    data["coordinates"] = walk(data["coordinates"])
    return data


def resimplify():
    """ONLY_SIMPLIFY=1: só simplifica de novo o silhouettes.json já gerado (sem reler o mapa HD), com o SIMPLIFY atual."""
    out = os.path.join(ROOT, "public", "data", "silhouettes.json")
    shapes = json.load(open(out, encoding="utf8"))
    for key, geometry in shapes.items():
        geom = shapely.from_geojson(json.dumps(geometry))
        minx, miny, maxx, maxy = shapely.bounds(geom)
        tolerance = max(maxx - minx, maxy - miny) / SIMPLIFY
        geom = shapely.simplify(geom, tolerance, preserve_topology=True)
        step = max(0.0001, tolerance / 4)
        shapes[key] = rounded(shapely.set_precision(division.polygonal(shapely.make_valid(geom)), step), step)
    json.dump(shapes, open(out, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    vertices = sum(len(shapely.get_coordinates(shapely.from_geojson(json.dumps(geom)))) for geom in shapes.values())
    print(f"ok: {len(shapes)} silhuetas · {vertices} vértices · {os.path.getsize(out) // 1000} kB", flush=True)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if os.environ.get("ONLY_SIMPLIFY"):
        return resimplify()
    started = time.time()
    catalog = json.load(open(os.path.join(ROOT, "public", "data", "legacy", "catalog.json"), encoding="utf8"))
    meta = catalog["meta"]
    # todo território do mapa da partida (os 250, como no Clicar no mapa; os absorvidos estão dentro do soberano no mapa HD)
    wanted = [key for key in catalog["mapEntityIds"] if not meta.get(key, {}).get("absorvido")]
    target = {key: key for key in wanted}
    grid = {key: max(1.0, (meta.get(key, {}).get("area") or 1000) ** 0.5 * 1000 / GRID_DIV) for key in wanted}
    pieces = {key: [] for key in wanted}
    for path in sorted(glob.glob(os.path.join(ROOT, "build", "map-hd", "pieces", "*.parquet"))):
        table = pq.read_table(path, columns=["carta_id", "geometry"])
        cartas = table.column("carta_id").to_pylist()
        rows = [index for index, carta in enumerate(cartas) if carta in target]
        if not rows:
            continue
        geoms = shapely.from_wkb(np.array(table.column("geometry").take(rows).to_pylist(), dtype=object))
        for index, geom in zip(rows, geoms):
            key = target[cartas[index]]
            pieces[key].append(shapely.set_precision(geom, grid[key]))
        print(f"  {os.path.basename(path)} · {time.time() - started:.0f} s", flush=True)
    missing = [key for key, value in pieces.items() if not value]
    if missing:
        sys.exit(f"sem pedaços no mapa HD: {missing}")
    shapes = {}
    for key in wanted:
        merged = division.polygonal(shapely.union_all(np.array(pieces[key], dtype=object)))
        parts = list(shapely.get_parts(merged))
        # quem atravessa o antimeridiano (Rússia, Fiji, as Aleutas): as partes do outro lado vêm para o lado da maior antes de converter
        biggest = max(parts, key=shapely.area)
        side = 1 if shapely.centroid(biggest).x > 0 else -1
        def wrap(part):
            x0, _, x1, _ = shapely.bounds(part)
            if side > 0 and x1 < -WORLD * 0.75:
                return shapely.transform(part, lambda c: c + np.array([2 * WORLD, 0]))
            if side < 0 and x0 > WORLD * 0.75:
                return shapely.transform(part, lambda c: c - np.array([2 * WORLD, 0]))
            return part
        # as metades trazidas para o mesmo lado se encostam na linha: unidas de novo (senão o MultiPolygon fica inválido)
        if any(wrap(part) is not part for part in parts):
            parts = list(shapely.get_parts(division.polygonal(shapely.union_all(np.array([wrap(part) for part in parts], dtype=object)))))
        parts = [division.to_lonlat(part) for part in parts]
        areas = division.km2_many(parts)
        ranking = np.argsort(-areas)
        parts, areas = [parts[index] for index in ranking], areas[ranking]
        keep = division.island_group(parts, parts[0], areas=areas)
        kept = {id(part) for part in keep}
        keep += [part for part, area in zip(parts, areas) if id(part) not in kept and area >= FAR_KEEP * areas[0]]
        minx, miny, maxx, maxy = shapely.bounds(shapely.multipolygons(keep))
        tolerance = max(maxx - minx, maxy - miny) / SIMPLIFY
        silhouette = shapely.simplify(division.without_small_holes(shapely.multipolygons(keep), (3 * tolerance) ** 2), tolerance, preserve_topology=True)
        step = max(0.0001, tolerance / 4)
        shapes[key] = rounded(shapely.set_precision(division.polygonal(shapely.make_valid(silhouette)), step), step)
    out = os.path.join(ROOT, "public", "data", "silhouettes.json")
    json.dump(shapes, open(out, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    vertices = sum(len(shapely.get_coordinates(shapely.from_geojson(json.dumps(geom)))) for geom in shapes.values())
    print(f"ok: {len(shapes)} silhuetas · {vertices} vértices · {os.path.getsize(out) // 1000} kB · {time.time() - started:.0f} s", flush=True)


if __name__ == "__main__":
    main()
