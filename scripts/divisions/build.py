"""Gera os pacotes do modo "Estados e províncias" e o índice dos países que o app lê.

Uso: python scripts/divisions/build.py [países...]   (sem argumento: todos de COUNTRIES; precisa de build/map-hd/pieces e do fetch de cada país)
Para cada país: build-division.py (catálogo, silhuetas e a terra dividida), os tiles (o mesmo build-tiles.py do mapa HD, com
MAP_BUILD=build/divisions/<país> e um perfil montado da config), mvt_check.py, a cópia de divisions-<país>.pmtiles e do manifesto para
public/maps/ e as bandeiras (flags.mjs, se a config lista arquivos do Commons; precisa do Chrome). No fim refaz src/domain/divisions-index.ts com
todos os países já gerados: nome, palavra da unidade, regiões com as contagens (de unidades e de capitais), se há bandeiras, quantas unidades têm
capital, enquadramento e o mapa (tamanho e hash).
REUSE_PIECES=1 reaproveita a divisão já feita (o catálogo e as silhuetas são refeitos); TILES_ONLY=1 pula o build-division.py (o catálogo, as silhuetas e
os pedaços já gerados valem); INDEX_ONLY=1 só refaz o índice. Tempo: o Brasil leva ~2 min; os EUA ~40 min só no build-division.py (o Alasca pesa).
Para um país novo: countries/<país>.json (lista curada) + fetch.py + este script + incluir o país em COUNTRIES (a ordem é a da Mesa).
As épocas dos Mapas históricos (kind "era", fonte "ohm": 1914) entram na mesma lista; a config da época sai de eras/make-<época>.py.
"""
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
COUNTRIES = ["br", "us", "cn", "1914"]
INDEX = os.path.join(ROOT, "src", "domain", "divisions-index.ts")


def run(*args, env=None):
    print("→", " ".join(os.path.relpath(arg, ROOT) if os.path.isabs(arg) else arg for arg in args), flush=True)
    subprocess.run(list(args), cwd=ROOT, check=True, env=env)


def config_of(country):
    return json.load(open(os.path.join(HERE, "countries", f"{country}.json"), encoding="utf8"))


def build(country):
    config = config_of(country)
    build_dir = os.path.join(ROOT, "build", "divisions", country)
    if os.environ.get("FLAGS_ONLY"):
        # só as bandeiras (o catálogo e o mapa já gerados valem)
        run("node", os.path.join(HERE, "flags.mjs"), country)
        return
    if not os.environ.get("TILES_ONLY"):
        run(sys.executable, os.path.join(HERE, "build-division.py"), country)
    profile = {"name": f"divisions-{country}", "title": f"Meridiano · {config['name']['pt']}", "attribution": config["attribution"], "sources": config["sources"]}
    json.dump(profile, open(os.path.join(build_dir, "map-profile.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    target = os.path.join(build_dir, f"divisions-{country}.pmtiles")
    # zmax da config: os Mapas históricos (o mundo inteiro) param no zoom 7, ~1 km de precisão (o MapLibre amplia daí)
    env = {**os.environ, "MAP_BUILD": build_dir, **({"ZMAX": str(config["zmax"])} if config.get("zmax") else {}),
           **({"LOW_DROP_SPECKS": "1"} if config.get("kind") == "era" else {}),
           **({"CELL_SNAP": str(0.6 * config["landGrid"])} if config.get("landGrid") else {})}
    run(sys.executable, os.path.join(ROOT, "scripts", "map-hd", "build-tiles.py"), target, env=env)
    run(sys.executable, os.path.join(ROOT, "scripts", "map-hd", "mvt_check.py"), target)
    for suffix in (".pmtiles", ".manifest.json"):
        shutil.copy(os.path.join(build_dir, f"divisions-{country}{suffix}"), os.path.join(ROOT, "public", "maps", f"divisions-{country}{suffix}"))
    if any(unit.get("flagFile") for unit in config["units"]):
        run("node", os.path.join(HERE, "flags.mjs"), country)


def entry(country):
    config = config_of(country)
    public = os.path.join(ROOT, "public", "data", "divisions", country)
    units = json.load(open(os.path.join(public, "units.json"), encoding="utf8"))["units"]
    manifest = json.load(open(os.path.join(ROOT, "public", "maps", f"divisions-{country}.manifest.json"), encoding="utf8"))
    counts = {key: sum(1 for unit in units.values() if unit["region"] == key) for key in config["regions"]}
    # as unidades com capital (na China, as 4 municipalidades não têm: ficam fora dos modos de capital)
    capitals = {key: sum(1 for unit in units.values() if unit["region"] == key and unit.get("capital")) for key in config["regions"]}
    # as unidades com bandeira (em 1914 nem todas; nos pacotes antigos, sem o campo, todas se há flags.json)
    flags_path = os.path.join(public, "flags.json")
    has_flags = os.path.exists(flags_path)
    flagged = {key: sum(1 for unit in units.values() if unit["region"] == key and has_flags and unit.get("flag", True)) for key in config["regions"]}
    # os créditos das bandeiras que pedem atribuição (CC BY, CC BY-SA): aparecem nas Opções
    sources = json.load(open(flags_path, encoding="utf8"))["sources"] if has_flags else {}
    credits = sorted(({"file": item["file"].removeprefix("File:"), "url": item["url"], "license": item["license"], "artist": item["artist"]}
                      for item in sources.values() if item.get("artist")), key=lambda item: item["file"])
    boxes = [unit["bbox"] for unit in units.values()]
    frame = config.get("frame") or [min(box[0] for box in boxes), min(box[1] for box in boxes), max(box[2] for box in boxes), max(box[3] for box in boxes)]
    era = config.get("kind") == "era"
    return {
        "id": country, **({"kind": "era", "subtitle": config["subtitle"]} if era else {}),
        # a época cobre o mundo inteiro: não esconde nenhuma entidade do mapa-múndi (nem há mapa-múndi de fundo)
        "carta": "" if config["carta"] == "*" else config["carta"], "name": config["name"], "unit": config["unit"],
        "regions": [{"key": key, "name": names, "count": counts[key], "capitals": capitals[key], "flags": flagged[key]} for key, names in config["regions"].items()],
        "count": len(units), "flags": has_flags, "flagCount": sum(flagged.values()), **({"flagCredits": credits} if credits else {}), "capitals": sum(capitals.values()),
        "frame": frame, "attribution": config["attribution"],
        "map": {"url": f"/maps/divisions-{country}.pmtiles", "bytes": manifest["bytes"], "sha256": manifest["sha256"]},
    }


def write_index():
    present = [country for country in COUNTRIES if os.path.exists(os.path.join(ROOT, "public", "data", "divisions", country, "units.json"))]
    body = json.dumps([entry(country) for country in present], ensure_ascii=False, indent=2)
    text = ("// Gerado por scripts/divisions/build.py a partir de scripts/divisions/countries/*.json e dos arquivos que ele grava: não editar à mão.\n"
            "import type { DivisionCountry } from \"./divisions.js\";\n\n"
            f"export const DIVISION_INDEX: readonly DivisionCountry[] = {body};\n")
    open(INDEX, "w", encoding="utf8", newline="\n").write(text)
    print(f"ok: índice com {len(present)} países ({', '.join(present)}) em src/domain/divisions-index.ts", flush=True)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    countries = [arg.lower() for arg in sys.argv[1:]] or COUNTRIES
    unknown = [country for country in countries if country not in COUNTRIES]
    if unknown:
        sys.exit(f"países fora de COUNTRIES: {unknown}")
    if not os.environ.get("INDEX_ONLY"):
        for country in countries:
            build(country)
    write_index()


if __name__ == "__main__":
    main()
