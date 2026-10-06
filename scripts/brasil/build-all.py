"""Gera tudo da família Brasil depois de fetch-brasil.py e do build:map-hd (precisa de build/map-hd/pieces):

1. build-brasil.py: confere a malha do IBGE, divide a terra do Brasil entre os estados e grava public/data/brasil/states.json e shapes.json;
2. build-tiles.py (o mesmo do mapa HD) com MAP_BUILD=build/brasil e o perfil scripts/brasil/map-profile.json → build/brasil/brasil-hd.pmtiles;
3. mvt_check.py: nenhum polígono inválido;
4. copia o mapa e o manifesto para public/maps/ e acerta BRASIL_MAP_BYTES/BRASIL_MAP_VERSION em src/domain/offline-map.ts e public/sw.js.
As bandeiras saem à parte (node scripts/brasil/flags.mjs, precisa do Chrome). REUSE_PIECES=1 reaproveita a divisão já feita.
"""
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
BUILD = os.path.join(ROOT, "build", "brasil")


def run(*args, env=None):
    print("→", " ".join(args), flush=True)
    subprocess.run([sys.executable, *args], cwd=ROOT, check=True, env=env)


def replace(path, pattern, value):
    text = open(path, encoding="utf8").read()
    updated, count = re.subn(pattern, value, text)
    if count != 1:
        sys.exit(f"{path}: não achei {pattern!r}")
    open(path, "w", encoding="utf8", newline="").write(updated)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    run(os.path.join(HERE, "build-brasil.py"))
    shutil.copy(os.path.join(HERE, "map-profile.json"), os.path.join(BUILD, "map-profile.json"))
    target = os.path.join(BUILD, "brasil-hd.pmtiles")
    run(os.path.join(ROOT, "scripts", "map-hd", "build-tiles.py"), target, env={**os.environ, "MAP_BUILD": BUILD})
    run(os.path.join(ROOT, "scripts", "map-hd", "mvt_check.py"), target)
    for name in ("brasil-hd.pmtiles", "brasil-hd.manifest.json"):
        shutil.copy(os.path.join(BUILD, name), os.path.join(ROOT, "public", "maps", name))
    manifest = json.load(open(os.path.join(BUILD, "brasil-hd.manifest.json"), encoding="utf8"))
    size, digest = manifest["bytes"], manifest["sha256"]
    offline = os.path.join(ROOT, "src", "domain", "offline-map.ts")
    replace(offline, r"export const BRASIL_MAP_BYTES = [\d_]+;", f"export const BRASIL_MAP_BYTES = {size:_};")
    replace(offline, r'(export const BRASIL_MAP_VERSION =\s*)"[0-9a-f]+";', rf'\g<1>"{digest}";')
    replace(os.path.join(ROOT, "public", "sw.js"), r'const BRASIL_MAP_VERSION = "[0-9a-f]+";', f'const BRASIL_MAP_VERSION = "{digest}";')
    print(f"ok: public/maps/brasil-hd.pmtiles · {size / 1e6:.1f} MB · {digest[:12]}… (offline-map.ts e sw.js atualizados)")


if __name__ == "__main__":
    main()
