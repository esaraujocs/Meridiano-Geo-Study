"""Baixa e extrai os land polygons do OpenStreetMap (osmdata.openstreetmap.de), a costa em detalhe total.

Uso: python scripts/map-hd/fetch-land.py   → build/map-hd/land-polygons-split-3857/land_polygons.shp (~1,3 GB; o zip tem ~950 MB)
Versão dividida numa grade de 128×128 (os tiles do zoom 7) e já em Web Mercator (EPSG:3857). Licença ODbL, © OpenStreetMap contributors.
Retoma o download se cair no meio.
"""
import os
import sys
import urllib.request
import zipfile

URL = "https://osmdata.openstreetmap.de/download/land-polygons-split-3857.zip"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "build", "map-hd")


def main():
    os.makedirs(ROOT, exist_ok=True)
    target = os.path.join(ROOT, "land-polygons-split-3857.zip")
    request = urllib.request.Request(URL, method="HEAD")
    total = int(urllib.request.urlopen(request).headers["Content-Length"])
    have = os.path.getsize(target) if os.path.exists(target) else 0
    if have < total:
        request = urllib.request.Request(URL, headers={"Range": f"bytes={have}-"})
        with urllib.request.urlopen(request) as response, open(target, "ab") as handle:
            while True:
                chunk = response.read(1 << 20)
                if not chunk:
                    break
                handle.write(chunk)
                have += len(chunk)
                print(f"\r{have / 1e6:.0f}/{total / 1e6:.0f} MB", end="", flush=True)
        print()
    if os.path.getsize(target) != total:
        sys.exit(f"download incompleto: {os.path.getsize(target)} de {total} bytes")
    with zipfile.ZipFile(target) as archive:
        archive.extractall(ROOT)
    print("ok:", os.path.join(ROOT, "land-polygons-split-3857", "land_polygons.shp"))


if __name__ == "__main__":
    main()
