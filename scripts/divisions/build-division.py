"""Monta o pacote de um país do modo "Estados e províncias" a partir do mapa HD e das divisas de primeiro nível.

Uso: python scripts/divisions/build-division.py <país>   (depois do build:map-hd e do fetch do país; config em countries/<país>.json)
1. Lê as divisas da fonte do país ("ibge": a malha estadual do IBGE, só o Brasil; "overture": as divisões "region" do Overture Maps, serve para
   qualquer país) e confere contra a lista curada (código, nome, região): diferença para o script.
2. Divide entre as unidades os pedaços de terra que o mapa HD deu ao país (o carta_id da config, build/map-hd/pieces): a costa e a fronteira
   com os vizinhos ficam idênticas às do mapa-múndi; só as divisas vêm da fonte. Terra fora de qualquer divisa (a costa da fonte e a do OSM não
   coincidem ao metro; ilhas) fica com a unidade mais perto, até `leftoverKm` (sem limite: sempre); mais longe, e as unidades de `exclude`, viram
   terra neutra (desenhada, nunca alvo).
   → build/divisions/<país>/pieces/NNN.parquet (o formato de build/map-hd/pieces), que build-tiles.py transforma em tiles.
3. Grava public/data/divisions/<país>/units.json (o catálogo: nome nos 3 idiomas, código, capital, região, área, ponto do rótulo dentro da
   unidade, caixa sem as ilhas distantes, vizinhos pelas divisas) e shapes.json (as silhuetas).
REUSE_PIECES=1 reaproveita a divisão já feita.
"""
import glob
import json
import math
import os
import struct
import sys
import time

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
import shapely

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "map-hd"))
from shp import read_polygons  # noqa: E402

ROOT = os.path.join(HERE, "..", "..")
WORLD = os.path.join(ROOT, "build", "map-hd")
R = 6378137.0
ORIGIN = math.pi * R
CELL = 2 * ORIGIN / 128
LOCALES = ("pt", "en", "es")


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


def km2_many(geoms_lonlat):
    """Área em km² de vários polígonos de uma vez (vetorizado: a costa traz dezenas de milhares de ilhotas por unidade no mundo de 1914)."""
    projected = shapely.transform(np.array(geoms_lonlat, dtype=object), lambda c: np.column_stack((np.radians(c[:, 0]) * 6371.0088, np.sin(np.radians(c[:, 1])) * 6371.0088)))
    return shapely.area(projected)


def unit_id(country, code):
    return f"{country}-{code.lower()}"


# ---- 1. as divisas, por fonte: {código: {"geom": terra em lon/lat (vizinhos), "zone": zona em lon/lat (divisão da terra), "area": km² ou None}}
def zones_ibge(country, config, build):
    units = {unit["code"]: unit for unit in config["units"]}
    base = os.path.join(build, "BR_UF_2024", "BR_UF_2024")
    rows = read_dbf(base + ".dbf")
    polygons, records = read_polygons(base + ".shp", base + ".shx")
    region_names = {key: value["pt"] for key, value in config["regions"].items()}
    problems, zones = [], {}
    for index, row in enumerate(rows):
        code = row["SIGLA_UF"]
        unit = units.get(code)
        if unit is None:
            problems.append(f"{code} está no IBGE e não na config")
            continue
        if row["NM_UF"] != unit["name"]:
            problems.append(f"{code}: nome {row['NM_UF']!r} no IBGE, {unit['name']!r} na config")
        if row["NM_REGIA"].casefold() != region_names[unit["region"]].casefold():  # o arquivo grafa "Centro-oeste"
            problems.append(f"{code}: região {row['NM_REGIA']!r} no IBGE, {region_names[unit['region']]!r} na config")
        parts = [polygons[i] for i in np.flatnonzero(records == index)]
        geom = shapely.make_valid(shapely.union_all(np.array(parts, dtype=object)))
        zones[code] = {"geom": geom, "zone": geom, "area": float(row["AREA_KM2"]), "ref": row["CD_UF"]}
    missing = sorted(set(units) - set(zones))
    if missing:
        problems.append(f"sem geometria no IBGE: {missing}")
    if problems:
        sys.exit("a config não confere com o IBGE:\n" + "\n".join(problems))
    return zones


def zones_overture(country, config, build):
    """As divisões "region" do Overture: a terra de cada uma e a com o mar territorial, que vale depois da terra de todas (zonas sem sobreposição)."""
    table = pq.read_table(os.path.join(build, "overture-regions.parquet"))
    land, sea, names = {}, {}, {}
    for row in table.to_pylist():
        # linha sem código de região (na China, Aksai Chin, área disputada): fica fora das zonas; se o mapa HD deu essa terra ao país, ela vai
        # para a unidade mais perto, como as outras sobras
        if not row["region"]:
            print(f"aviso: linha do Overture sem região ({row['name']}), fora das zonas", flush=True)
            continue
        code = row["region"].split("-", 1)[1]
        geom = shapely.make_valid(shapely.from_wkb(row["geometry"]))
        target = land if row["class"] == "land" or row["is_land"] else sea
        target.setdefault(code, []).append(geom)
        names[code] = row["name"]
    land = {code: shapely.union_all(np.array(parts, dtype=object)) for code, parts in land.items()}
    sea = {code: shapely.union_all(np.array(parts, dtype=object)) for code, parts in sea.items()}
    units = {unit["code"]: unit for unit in config["units"]}
    excluded = set(config.get("exclude", []))
    problems = [f"{code} está no Overture e não na config" for code in sorted(set(land) - set(units) - excluded)]
    problems += [f"{code} está na config e não no Overture" for code in sorted(set(units) - set(land))]
    # o nome confere com o `sourceName` da unidade, quando o Overture usa outra língua (na China, o chinês), ou com o `name`
    problems += [f"{code}: nome {names[code]!r} no Overture, {units[code].get('sourceName', units[code]['name'])!r} na config"
                 for code in units if code in names and names[code] != units[code].get("sourceName", units[code]["name"])]
    if problems:
        sys.exit("a config não confere com o Overture:\n" + "\n".join(problems))
    taken = shapely.union_all(np.array(list(land.values()), dtype=object))
    zones = {}
    for code in sorted(land):
        zone = land[code]
        if code in sea:
            extra = shapely.difference(sea[code], taken)
            zone = shapely.union(zone, extra)
            taken = shapely.union(taken, extra)
        zones[code] = {"geom": land[code], "zone": shapely.make_valid(zone), "area": None, "ref": f"{country.upper()}-{code}", "neutral": code in excluded}
    return zones


def zones_ohm(country, config, build):
    """Mapas históricos: as relações de país do OpenHistoricalMap na data da época (fetch-ohm.py), unidas por unidade da config (`ohm`). Na ordem da
    config, cada unidade fica com a sua terra menos a de quem veio antes (as colônias antes das metrópoles que as englobam no OHM); `carveBox`
    leva para a unidade o que a mãe tem dentro de uma caixa. A terra neutra vem primeiro: as relações de `neutral.relations` (miudezas) e a
    sobreposição entre os pares de `neutral.overlaps` (as disputas da época)."""
    table = pq.read_table(os.path.join(build, "ohm.parquet")).to_pylist()
    geoms = {row["id"]: shapely.make_valid(shapely.from_wkb(row["wkb"])) for row in table}
    neutral_cfg = config.get("neutral", {})
    units = config["units"]
    missing = [rel for unit in units for rel in unit.get("ohm", []) if rel not in geoms]
    unused = sorted(set(geoms) - {rel for unit in units for rel in unit.get("ohm", [])} - set(neutral_cfg.get("relations", [])) - set(neutral_cfg.get("drop", [])))
    if missing or unused:
        sys.exit(f"a config não confere com o OHM: relações que faltam {missing}; relações sem destino {unused}")

    # simplificadas a ~100 m: a divisão da terra usa a costa do mapa HD, e o detalhe das fronteiras do OHM passa muito do que o mapa mostra. As
    # operações correm numa grade de 1e-6 grau (< 10 cm): sem ela o GEOS desiste de algumas sobreposições ("Unable to determine overlay result")
    grid = 1e-6

    def clean(geom):
        return polygonal(shapely.make_valid(geom)) or shapely.Polygon()

    def raw(ids):
        parts = [clean(shapely.set_precision(shapely.simplify(geoms[rel], 0.001, preserve_topology=True), grid)) for rel in ids]
        return clean(shapely.union_all(np.array(parts, dtype=object), grid_size=grid)) if parts else shapely.Polygon()
    raws = {unit["code"]: raw(unit.get("ohm", [])) for unit in units}
    for unit in units:
        for rule in unit.get("carveBox", []):
            raws[unit["code"]] = clean(shapely.union(raws[unit["code"]], clean(shapely.intersection(raws[rule["from"]], shapely.box(*rule["box"]), grid_size=grid)), grid_size=grid))
    neutral = raw(neutral_cfg.get("relations", []))
    for a, b in neutral_cfg.get("overlaps", []):
        neutral = clean(shapely.union(neutral, clean(shapely.intersection(raws[a], raws[b], grid_size=grid)), grid_size=grid))
    taken = neutral
    zones = {}
    for unit in units:
        zone = clean(shapely.difference(raws[unit["code"]], taken, grid_size=grid))
        taken = clean(shapely.union(taken, zone, grid_size=grid))
        zones[unit["code"]] = {"geom": zone, "zone": zone, "area": None, "ref": unit["code"], "neutral": False}
    zones["_NEUTRAL"] = {"geom": neutral, "zone": shapely.make_valid(neutral), "area": None, "ref": "", "neutral": True}
    return zones


# ---- 2. a terra do país dividida entre as zonas
def split_land(country, config, zones, out_dir, land_by_unit):
    order = sorted(code for code in zones if not shapely.is_empty(zones[code]["zone"]))
    merc = {code: to_merc(zones[code]["zone"]) for code in order}
    # Mapas históricos: a terra de hoje decide onde a fonte falha (pelo carta_id do pedaço no mapa HD). `override`: o país de hoje inteiro vai para a
    # unidade; `carve`: só o que caiu na unidade-mãe; `fill`: o que nenhuma zona cobriu vai para a unidade mais perto da lista
    override = {carta: unit["code"] for unit in config["units"] for carta in unit.get("override", [])}
    carve = {(rule["from"], rule["carta"]): unit["code"] for unit in config["units"] for rule in unit.get("carve", [])}
    # cada `fill` é um carta_id ou {"carta", "box": [oeste, sul, leste, norte]} (só a terra dentro da caixa: as ilhas russas de 1914 sem a
    # Terra de Francisco José e a Wrangel, terra de ninguém na época)
    fill = {}
    for unit in config["units"]:
        for rule in unit.get("fill", []):
            rule = rule if isinstance(rule, dict) else {"carta": rule}
            fill.setdefault(rule["carta"], []).append((unit["code"], rule.get("box")))
    tolerance = config.get("landTolerance")
    tree = shapely.STRtree([merc[code] for code in order])
    for old in glob.glob(os.path.join(out_dir, "*.parquet")):
        os.remove(old)
    limit = config.get("leftoverKm")
    total_pieces = leftovers = neutral = 0
    for path in sorted(glob.glob(os.path.join(WORLD, "pieces", "*.parquet"))):
        table = pq.read_table(path)
        if config["carta"] != "*":  # "*": o mundo inteiro (Mapas históricos)
            table = table.filter(pc.equal(table.column("carta_id"), config["carta"]))
        if table.num_rows == 0:
            continue
        cy = int(os.path.basename(path)[:3])
        out = {"carta_id": [], "cx": [], "cy": [], "geometry": []}
        for cx, carta, blob in zip(table.column("cx").to_pylist(), table.column("carta_id").to_pylist(), table.column("geometry").to_pylist()):
            piece = shapely.from_wkb(blob)
            if tolerance:
                piece = polygonal(shapely.make_valid(shapely.simplify(piece, tolerance, preserve_topology=True)))
                if piece is None:
                    continue
            x0, y0, x1, y1 = cell_rect(cx, cy)
            if carta in override:
                code = override[carta]
                out["carta_id"].append(unit_id(country, code)); out["cx"].append(cx); out["cy"].append(cy); out["geometry"].append(shapely.to_wkb(piece))
                land_by_unit[code].append(piece)
                total_pieces += 1
                continue
            margin = 60000.0  # as divisas recortadas com folga: as sobras da célula quase sempre encostam numa delas
            near = [order[i] for i in tree.query(shapely.box(x0 - margin, y0 - margin, x1 + margin, y1 + margin))]
            clipped = {code: shapely.clip_by_rect(merc[code], x0 - margin, y0 - margin, x1 + margin, y1 + margin) for code in near}
            clipped = {code: zone for code, zone in clipped.items() if not shapely.is_empty(zone)}
            parts = {}
            rest = piece
            for code, zone in clipped.items():
                inside = shapely.clip_by_rect(zone, x0, y0, x1, y1)
                if shapely.is_empty(inside):
                    continue
                inter = polygonal(shapely.intersection(piece, inside))
                if inter is not None:
                    parts.setdefault(code, []).append(inter)
                    rest = polygonal(shapely.difference(rest, inside)) if rest is not None else None
            for code in [code for code in parts if (code, carta) in carve]:
                parts.setdefault(carve[(code, carta)], []).extend(parts.pop(code))
            # sobras: a terra sem divisa vai para a unidade mais perto (diferença de costa, ilhas), até o limite da config; com `fill`, para a unidade
            # mais perto da lista do país de hoje, sem limite
            if rest is not None and carta in fill:
                kept = []
                for bit in shapely.get_parts(rest):
                    if shapely.area(bit) < 1.0:
                        continue
                    point = to_lonlat(shapely.point_on_surface(bit))
                    targets = [code for code, box in fill[carta] if box is None or (box[0] <= point.x <= box[2] and box[1] <= point.y <= box[3])]
                    if not targets:
                        kept.append(bit)
                        continue
                    best = min(targets, key=lambda code: shapely.distance(bit, merc[code]) if code in merc else math.inf)
                    parts.setdefault(best, []).append(bit)
                    leftovers += 1
                rest = polygonal(shapely.union_all(kept)) if kept else None
            # sobras: a terra sem divisa vai para a unidade mais perto (diferença de costa, ilhas), até o limite da config
            if rest is not None:
                lat = math.degrees(2 * math.atan(math.exp(((y0 + y1) / 2) / R)) - math.pi / 2)
                scale = math.cos(math.radians(lat))  # metros de Mercator → metros de verdade
                for bit in shapely.get_parts(rest):
                    if shapely.area(bit) < 1.0:
                        continue
                    best = min(clipped, key=lambda code: shapely.distance(bit, clipped[code])) if clipped else order[int(tree.query_nearest(bit)[0])]
                    far = limit is not None and shapely.distance(bit, merc[best]) * scale > limit * 1000
                    parts.setdefault(None if far else best, []).append(bit)
                    leftovers += 1
            for code, geoms in parts.items():
                merged = polygonal(shapely.union_all(np.array(geoms, dtype=object)))
                if merged is None:
                    continue
                is_neutral = code is None or zones.get(code, {}).get("neutral")
                out["carta_id"].append("" if is_neutral else unit_id(country, code))
                out["cx"].append(cx); out["cy"].append(cy); out["geometry"].append(shapely.to_wkb(merged))
                if is_neutral:
                    neutral += 1
                else:
                    land_by_unit[code].append(merged)
                total_pieces += 1
        print(f"  linha {cy}: {len(out['geometry'])} pedaços", flush=True)
        if out["geometry"]:
            pq.write_table(pa.table({"carta_id": pa.array(out["carta_id"], pa.string()), "cx": pa.array(out["cx"], pa.int16()),
                                     "cy": pa.array(out["cy"], pa.int16()), "geometry": pa.array(out["geometry"], pa.binary())}),
                           os.path.join(out_dir, f"{cy:03d}.parquet"))
    empty = [code for code in land_by_unit if not land_by_unit[code]]
    if empty:
        sys.exit(f"unidades sem terra no mapa: {empty}")
    print(f"pedaços: {total_pieces} (sobras atribuídas ao mais perto: {leftovers}; terra neutra: {neutral})", flush=True)


def island_group(parts, main_part, hop=2.3, areas=None):
    """A silhueta: o pedaço principal e as ilhas ligadas a ele por saltos de até `hop` graus (um arquipélago inteiro, como o Havaí, entra; uma ilha
    oceânica isolada, como Trindade ou Noronha, não), sem os pedaços minúsculos."""
    areas = km2_many(parts) if areas is None else areas
    candidates = [part for part, area in zip(parts, areas) if area >= 0.0015 * km2(main_part)]
    # as distâncias medidas nas partes simplificadas (~5 km): o salto é de graus, e as ilhas do Ártico canadense têm centenas de milhares de
    # vértices (com a geometria inteira, o Canadá de 1914 levava mais de 10 minutos)
    rough = [shapely.simplify(part, 0.05) for part in candidates]
    main_rough = shapely.simplify(main_part, 0.05)
    kept = [main_rough]
    chosen = [main_part]
    pending = [index for index, part in enumerate(candidates) if part is not main_part]
    grown = True
    while grown and pending:
        grown = False
        for index in list(pending):
            if any(shapely.distance(rough[index], other) < hop for other in kept):
                kept.append(rough[index])
                chosen.append(candidates[index])
                pending.remove(index)
                grown = True
    return chosen


# ---- 3. catálogo e silhuetas
def write_outputs(country, config, zones, land_by_unit, public):
    os.makedirs(public, exist_ok=True)
    units = {unit["code"]: unit for unit in config["units"]}
    order = sorted(units)
    # os pedaços vêm cortados pela grade do mapa HD e as bordas de células vizinhas diferem em ~1e-9 m (a armadilha 1 do CLAUDE.md, 3.7):
    # sem levar à grade de 1 m antes da união, eles não se fundem e a silhueta mostra a emenda como uma linha por dentro da unidade
    started = time.time()
    # a terra unida de cada unidade fica em cache (build/divisions/<país>/full.parquet): REUSE_FULL=1 a reaproveita ao refazer só o catálogo
    cache = os.path.join(ROOT, "build", "divisions", country, "full.parquet")
    if os.environ.get("REUSE_FULL") and os.path.exists(cache):
        full = {row["code"]: shapely.from_wkb(row["wkb"]) for row in pq.read_table(cache).to_pylist()}
    else:
        full = {code: to_lonlat(polygonal(shapely.union_all(shapely.set_precision(np.array(land_by_unit[code], dtype=object), 1.0)))) for code in order}
        pq.write_table(pa.table({"code": list(full), "wkb": [shapely.to_wkb(geom) for geom in full.values()]}), cache)
    print(f"  terra unida por unidade · {time.time() - started:.0f} s", flush=True)
    # vizinhos pelas divisas da fonte, simplificadas (~100 m) e com a folga calculada uma vez por unidade; nos Mapas históricos, pela terra (as zonas
    # do OHM avançam sobre o mar e algumas unidades não têm zona, só a terra de hoje), simplificada a ~2 km e com os pares achados por um índice
    # espacial (o retângulo da Rússia, que cruza o antimeridiano, cobre o hemisfério norte inteiro: o teste de todos os pares levava horas)
    era = config.get("kind") == "era"
    if era:
        # só as partes com mais de ~0,05 grau² (~600 km² no equador): as ilhotas não têm divisa e deixavam o buffer caríssimo (o arquipélago
        # ártico do Canadá, as Índias Orientais); as ilhas divididas de 1914 (Bornéu, Timor, Nova Guiné, Hispaniola, Terra do Fogo) são grandes
        def big_parts(geom):
            parts = [part for part in shapely.get_parts(geom) if shapely.area(part) > 0.05]
            return shapely.multipolygons(parts) if parts else geom
        simple = {code: shapely.simplify(big_parts(full[code]), 0.02, preserve_topology=True) for code in order}
    else:
        simple = {code: shapely.simplify(zones[code]["geom"], 0.001, preserve_topology=True) for code in order}
    # cada unidade é simplificada sozinha, então a divisa de duas pode se abrir até o dobro da tolerância: nas épocas, folga de 0,045°
    grown = {code: shapely.buffer(simple[code], 0.045 if era else 0.002) for code in order}
    edges = {code: shapely.boundary(simple[code]) for code in order}
    neighbors_of = {code: [] for code in order}
    tree = shapely.STRtree([grown[code] for code in order]) if era else None
    for i, a in enumerate(order):
        candidates = [order[j] for j in tree.query(simple[a], predicate="intersects") if j > i] if era else order[i + 1:]
        for b in candidates:
            if not era and not shapely.intersects(shapely.envelope(grown[a]), shapely.envelope(grown[b])):
                continue
            # encostar num ponto só (quatro unidades num canto) dá ~0; a divisa real mais curta do Brasil é a do DF com Minas, ~2,6 km (0,024°)
            if shapely.length(shapely.intersection(edges[a], grown[b])) > (0.05 if era else 0.01):
                neighbors_of[a].append(unit_id(country, b))
                neighbors_of[b].append(unit_id(country, a))
    print(f"  vizinhos · {time.time() - started:.0f} s", flush=True)
    catalog, shapes = {}, {}
    for code in order:
        unit = units[code]
        parts = list(shapely.get_parts(full[code]))
        areas = km2_many(parts)
        ranking = np.argsort(-areas)
        parts, areas = [parts[index] for index in ranking], areas[ranking]
        main_part = parts[0]
        # ponto do rótulo: o centro do maior círculo dentro do pedaço principal
        bx0, by0, bx1, by1 = shapely.bounds(main_part)
        center = shapely.get_point(shapely.maximum_inscribed_circle(shapely.simplify(main_part, max(bx1 - bx0, by1 - by0) / 400), max(bx1 - bx0, by1 - by0) / 300), 0)
        keep = island_group(parts, main_part, areas=areas)
        minx, miny, maxx, maxy = shapely.bounds(shapely.multipolygons(keep))
        silhouette = shapely.simplify(shapely.multipolygons(keep), max(maxx - minx, maxy - miny) / 700, preserve_topology=True)
        uid = unit_id(country, code)
        shapes[uid] = json.loads(shapely.to_geojson(shapely.set_precision(silhouette, 0.0001)))
        base = config.get("nameLocale", "pt")
        names = {locale: unit.get("names", {}).get(locale, unit["name"]) for locale in LOCALES}
        names[base] = unit.get("names", {}).get(base, unit["name"])
        area = zones[code]["area"] if zones[code]["area"] is not None else km2(full[code])
        entry = {"code": code, "ref": zones[code]["ref"], "name": names}
        if unit.get("alias"):
            entry["alias"] = unit["alias"]
        if unit.get("capital"):
            entry["capital"] = unit["capital"]
        if unit.get("capAl"):
            entry["capAl"] = unit["capAl"]
        entry.update({
            "region": unit["region"], "area": round(area), "ll": [round(center.y, 4), round(center.x, 4)],
            # caixa da unidade sem as ilhas distantes, [oeste, sul, leste, norte]: o enquadramento da câmera do mapa por região
            "bbox": [round(minx, 3), round(miny, 3), round(maxx, 3), round(maxy, 3)],
            "borders": sorted(neighbors_of[code]),
        })
        catalog[uid] = entry
    document = {"source": config["comment"], "country": country, "regions": config["regions"], "units": catalog}
    json.dump(document, open(os.path.join(public, "units.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    json.dump(shapes, open(os.path.join(public, "shapes.json"), "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    pairs = sum(len(value) for value in neighbors_of.values()) // 2
    print(f"ok: {len(catalog)} unidades · {pairs} pares de vizinhos · units.json {os.path.getsize(os.path.join(public, 'units.json')) // 1000} kB · "
          f"shapes.json {os.path.getsize(os.path.join(public, 'shapes.json')) // 1000} kB", flush=True)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 2:
        sys.exit("uso: build-division.py <país>")
    country = sys.argv[1].lower()
    config = json.load(open(os.path.join(HERE, "countries", f"{country}.json"), encoding="utf8"))
    build = os.path.join(ROOT, "build", "divisions", country)
    public = os.path.join(ROOT, "public", "data", "divisions", country)
    source = {"ibge": zones_ibge, "overture": zones_overture, "ohm": zones_ohm}[config["source"]]
    zones = source(country, config, build)
    print(f"{config['source']} confere: {len(config['units'])} unidades", flush=True)
    out_dir = os.path.join(build, "pieces")
    os.makedirs(out_dir, exist_ok=True)
    land_by_unit = {unit["code"]: [] for unit in config["units"]}
    if os.environ.get("REUSE_PIECES") and glob.glob(os.path.join(out_dir, "*.parquet")):
        for path in sorted(glob.glob(os.path.join(out_dir, "*.parquet"))):
            table = pq.read_table(path)
            for carta, blob in zip(table.column("carta_id").to_pylist(), table.column("geometry").to_pylist()):
                if carta:
                    land_by_unit[carta[len(country) + 1:].upper()].append(shapely.from_wkb(blob))
        print("pedaços reaproveitados de", out_dir, flush=True)
    else:
        split_land(country, config, zones, out_dir, land_by_unit)
    write_outputs(country, config, zones, land_by_unit, public)


if __name__ == "__main__":
    main()
