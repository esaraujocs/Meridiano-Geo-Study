"""Baixa o que cada país do modo "Estados e províncias" precisa, conforme a config (countries/<país>.json). Não baixa de novo o que já tem.

Uso: python scripts/divisions/fetch.py [países...]   (sem argumento: todos de build.py)
- fonte "ibge" (Brasil): build/divisions/br/BR_UF_2024/ ← BR_UF_2024.zip do IBGE (geoftp.ibge.gov.br, 14,7 MB): as divisas dos 27 estados, com
  código, sigla, nome, região e área. Dados públicos do IBGE (citar "Fonte: IBGE").
- fonte "overture": as divisões de primeiro nível do Overture Maps (fetch-overture-regions.py; os EUA leem ~234 MB do S3 público).
- bandeiras: build/divisions/<país>/flags/<CÓDIGO>.svg ← os arquivos do Wikimedia Commons listados em "flagFile"; só entram os de domínio
  público (a licença de cada um é conferida na hora e gravada em flags/licenses.json).
"""
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
IBGE = "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2024/Brasil/BR_UF_2024.zip"
COMMONS = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "MeridianoGeoStudy/1.0 (jogo pessoal; pratesbaliza@gmail.com)"}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()


def fetch_ibge(build):
    target = os.path.join(build, "BR_UF_2024.zip")
    if not os.path.exists(target):
        open(target + ".part", "wb").write(get(IBGE))
        os.replace(target + ".part", target)
    with zipfile.ZipFile(target) as archive:
        archive.extractall(os.path.join(build, "BR_UF_2024"))
    print("ok: malha do IBGE", os.path.getsize(target) // 1000, "kB")


def fetch_flags(build, units):
    flags_dir = os.path.join(build, "flags")
    os.makedirs(flags_dir, exist_ok=True)
    titles = {unit["code"]: "File:" + unit["flagFile"] for unit in units if unit.get("flagFile")}
    licenses = {}
    names = list(titles.items())
    for start in range(0, len(names), 40):  # a API aceita até 50 títulos por pedido
        batch = dict(names[start:start + 40])
        query = urllib.parse.urlencode({"action": "query", "titles": "|".join(batch.values()), "prop": "imageinfo", "iiprop": "url|size|extmetadata",
                                        "iiextmetadatafilter": "LicenseShortName|Artist", "format": "json", "redirects": 1})
        pages = json.loads(get(f"{COMMONS}?{query}"))["query"]["pages"]
        info = {page["title"]: page["imageinfo"][0] for page in pages.values() if "imageinfo" in page}
        for code, title in batch.items():
            meta = info.get(title.replace("_", " "))
            if meta is None:
                sys.exit(f"bandeira não encontrada no Commons: {title}")
            license_name = meta.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
            if "public domain" not in license_name.lower():
                sys.exit(f"{title}: licença {license_name!r}, esperado domínio público")
            licenses[code] = {"file": title, "url": meta["descriptionurl"], "license": license_name}
            path = os.path.join(flags_dir, f"{code}.svg")
            if not os.path.exists(path):
                open(path, "wb").write(get(meta["url"]))
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
        if config["source"] == "ibge":
            fetch_ibge(build)
        else:
            subprocess.run([sys.executable, os.path.join(HERE, "fetch-overture-regions.py"), country], cwd=ROOT, check=True)
        if any(unit.get("flagFile") for unit in config["units"]):
            fetch_flags(build, config["units"])


if __name__ == "__main__":
    main()
