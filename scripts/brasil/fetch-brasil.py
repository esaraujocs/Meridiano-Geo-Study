"""Baixa os dados da família Brasil: a malha estadual oficial do IBGE e as bandeiras dos estados (Wikimedia Commons).

Uso: python scripts/brasil/fetch-brasil.py
- build/brasil/BR_UF_2024/  ← BR_UF_2024.zip do IBGE (geoftp.ibge.gov.br, 14,7 MB): as divisas dos 27 estados, com código,
  sigla, nome, região e área. Dados públicos do IBGE (citar "Fonte: IBGE").
- build/brasil/flags/<SIGLA>.svg ← as bandeiras listadas em scripts/brasil/states.json (campo "flagFile"), todas em domínio
  público no Commons; a licença de cada uma é conferida na hora e gravada em build/brasil/flags/licenses.json.
Não baixa de novo o que já está no disco.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "build", "brasil")
IBGE = "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2024/Brasil/BR_UF_2024.zip"
COMMONS = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "MeridianoGeoStudy/1.0 (jogo pessoal; pratesbaliza@gmail.com)"}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(ROOT, exist_ok=True)
    target = os.path.join(ROOT, "BR_UF_2024.zip")
    if not os.path.exists(target):
        open(target + ".part", "wb").write(get(IBGE))
        os.replace(target + ".part", target)
    with zipfile.ZipFile(target) as archive:
        archive.extractall(os.path.join(ROOT, "BR_UF_2024"))
    print("ok: malha do IBGE", os.path.getsize(target) // 1000, "kB")

    states = json.load(open(os.path.join(HERE, "states.json"), encoding="utf8"))["states"]
    flags_dir = os.path.join(ROOT, "flags")
    os.makedirs(flags_dir, exist_ok=True)
    titles = {state["sigla"]: "File:" + state["flagFile"] for state in states}
    query = urllib.parse.urlencode({"action": "query", "titles": "|".join(titles.values()), "prop": "imageinfo", "iiprop": "url|size|extmetadata",
                                    "iiextmetadatafilter": "LicenseShortName|Artist", "format": "json", "redirects": 1})
    pages = json.loads(get(f"{COMMONS}?{query}"))["query"]["pages"]
    info = {page["title"]: page["imageinfo"][0] for page in pages.values() if "imageinfo" in page}
    licenses = {}
    for sigla, title in titles.items():
        meta = info.get(title.replace("_", " "))
        if meta is None:
            sys.exit(f"bandeira não encontrada no Commons: {title}")
        license_name = meta.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
        if "public domain" not in license_name.lower():
            sys.exit(f"{title}: licença {license_name!r}, esperado domínio público")
        licenses[sigla] = {"file": title, "url": meta["descriptionurl"], "license": license_name}
        path = os.path.join(flags_dir, f"{sigla}.svg")
        if not os.path.exists(path):
            open(path, "wb").write(get(meta["url"]))
    json.dump(licenses, open(os.path.join(flags_dir, "licenses.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(f"ok: {len(licenses)} bandeiras em {flags_dir}")


if __name__ == "__main__":
    main()
