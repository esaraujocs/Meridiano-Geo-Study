"""Baixa o que cada país do modo "Estados e províncias" precisa, conforme a config (countries/<país>.json). Não baixa de novo o que já tem.

Uso: python scripts/divisions/fetch.py [países...]   (sem argumento: todos de build.py)
- fonte "ibge" (Brasil): build/divisions/br/BR_UF_2024/ ← BR_UF_2024.zip do IBGE (geoftp.ibge.gov.br, 14,7 MB): as divisas dos 27 estados, com
  código, sigla, nome, região e área. Dados públicos do IBGE (citar "Fonte: IBGE").
- fonte "overture": as divisões de primeiro nível do Overture Maps (fetch-overture-regions.py; os EUA leem ~234 MB do S3 público).
- fonte "ohm" (Mapas históricos): as fronteiras de país do OpenHistoricalMap na data da época (fetch-ohm.py; 1914: ~165 MB do Overpass).
- bandeiras: build/divisions/<país>/flags/<CÓDIGO>.svg ← os arquivos do Wikimedia Commons listados em "flagFile"; só entram os de domínio
  público ou CC0 e, com "flagCredit" na config (as épocas), os CC BY e CC BY-SA, com o autor guardado para os créditos das Opções (a licença
  de cada um é conferida na hora e gravada em flags/licenses.json). FLAGS_ONLY=1 baixa só as bandeiras (sem as fronteiras).
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
IBGE = "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2024/Brasil/BR_UF_2024.zip"
COMMONS = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "MeridianoGeoStudy/1.0 (jogo pessoal; pratesbaliza@gmail.com)"}


def get(url):
    # o Commons limita a frequência (HTTP 429): espera o que ele pedir e tenta de novo
    for attempt in range(6):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 5:
                raise
            time.sleep(int(error.headers.get("Retry-After") or 0) or 10 * (attempt + 1))


def fetch_ibge(build):
    target = os.path.join(build, "BR_UF_2024.zip")
    if not os.path.exists(target):
        open(target + ".part", "wb").write(get(IBGE))
        os.replace(target + ".part", target)
    with zipfile.ZipFile(target) as archive:
        archive.extractall(os.path.join(build, "BR_UF_2024"))
    print("ok: malha do IBGE", os.path.getsize(target) // 1000, "kB")


def fetch_flags(build, units, credit=False):
    flags_dir = os.path.join(build, "flags")
    os.makedirs(flags_dir, exist_ok=True)
    titles = {unit["code"]: "File:" + unit["flagFile"] for unit in units if unit.get("flagFile")}
    licenses = {}
    names = list(titles.items())
    for start in range(0, len(names), 40):  # a API aceita até 50 títulos por pedido
        batch = dict(names[start:start + 40])
        query = urllib.parse.urlencode({"action": "query", "titles": "|".join(batch.values()), "prop": "imageinfo", "iiprop": "url|size|extmetadata",
                                        "iiextmetadatafilter": "LicenseShortName|Artist", "format": "json", "redirects": 1})
        result = json.loads(get(f"{COMMONS}?{query}"))["query"]
        pages = result["pages"]
        info = {page["title"]: page["imageinfo"][0] for page in pages.values() if "imageinfo" in page}
        renamed = {item["from"]: item["to"] for item in result.get("normalized", []) + result.get("redirects", [])}
        for code, title in batch.items():
            title = title.replace("_", " ")
            meta = info.get(title) or info.get(renamed.get(title, "")) or info.get(renamed.get(renamed.get(title, ""), ""))
            if meta is None:
                sys.exit(f"bandeira não encontrada no Commons: {title}")
            ext = meta.get("extmetadata", {})
            license_name = ext.get("LicenseShortName", {}).get("value", "")
            free = "public domain" in license_name.lower() or license_name.lower().startswith("cc0")
            if not free and not (credit and re.match(r"cc by(-sa)? \d", license_name.lower())):
                sys.exit(f"{title}: licença {license_name!r}, esperado domínio público ou CC0" + (" (ou CC BY/CC BY-SA)" if credit else ""))
            licenses[code] = {"file": title, "url": meta["descriptionurl"], "license": license_name}
            if not free:
                # CC BY e CC BY-SA pedem o crédito: o autor como o Commons o mostra, sem o HTML
                artist = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", ext.get("Artist", {}).get("value", ""))).strip()
                licenses[code]["artist"] = artist or "Wikimedia Commons"
            path = os.path.join(flags_dir, f"{code}.svg")
            if not os.path.exists(path) or os.path.getsize(path) == 0:
                body = get(meta["url"])  # baixa antes de abrir o arquivo: um download que falha não deixa arquivo vazio para trás
                open(path, "wb").write(body)
                time.sleep(1.5)
    json.dump(licenses, open(os.path.join(flags_dir, "licenses.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(f"ok: {len(licenses)} bandeiras em {flags_dir}")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.path.insert(0, HERE)
    countries = [arg.lower() for arg in sys.argv[1:]] or __import__("build").COUNTRIES
    for country in countries:
        config = json.load(open(os.path.join(HERE, "countries", f"{country}.json"), encoding="utf8"))
        build = os.path.join(ROOT, "build", "divisions", country)
        os.makedirs(build, exist_ok=True)
        if os.environ.get("FLAGS_ONLY"):
            pass
        elif config["source"] == "ibge":
            fetch_ibge(build)
        elif config["source"] == "ohm":
            # Mapas históricos: as fronteiras do OpenHistoricalMap na data da época
            subprocess.run([sys.executable, os.path.join(HERE, "fetch-ohm.py"), country], cwd=ROOT, check=True)
        else:
            subprocess.run([sys.executable, os.path.join(HERE, "fetch-overture-regions.py"), country], cwd=ROOT, check=True)
        if any(unit.get("flagFile") for unit in config["units"]):
            fetch_flags(build, config["units"], credit=bool(config.get("flagCredit")))


if __name__ == "__main__":
    main()
