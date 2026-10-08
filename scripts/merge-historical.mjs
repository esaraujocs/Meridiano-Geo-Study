// Junta as bandeiras históricas de scripts/data/historical-*.json ao acervo do jogo (public/data/legacy/historical.json e historical-flags.json),
// sem duplicar por id: a entrada com o mesmo id é substituída no lugar. Rode de novo depois de editar um arquivo em scripts/data (e depois do
// extract-legacy-game-data.mjs, que regrava os dois arquivos só com as 200 do HTML clássico); depois, python scripts/i18n/_gen-historical.py e
// node scripts/i18n/build-i18n.mjs para o inglês e o espanhol.
// A bandeira vem de um pacote de Mapas históricos já montado ("flag": {"pack": "1914", "unit": "MLT"} → public/data/divisions/1914/flags.json),
// com o arquivo, a licença e o autor do Commons gravados lá, ou direto do Commons ("flag": {"file": "Flag of ….svg"}: baixada uma vez para
// build/historical/flags/, licença conferida na hora, domínio público ou CC0 e, com crédito, CC BY/CC BY-SA). Os campos "en", "es", "flag" e
// "ref" (a fonte conferida) não vão para o acervo.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { rasterizer } from "./flag-tools.mjs";

const root = new URL("../", import.meta.url);
const legacy = new URL("public/data/legacy/", root);
const dataDir = new URL("scripts/data/", root);
const REQUIRED = ["id", "pt", "tipo", "reg", "sub", "ini", "fim", "flag", "en", "es", "ref"];

const historical = JSON.parse(await readFile(new URL("historical.json", legacy), "utf8"));
const flagsDoc = JSON.parse(await readFile(new URL("historical-flags.json", legacy), "utf8"));
const byId = new Map(historical.entities.map((entity, index) => [entity.id, index]));
const files = (await readdir(dataDir)).filter((name) => /^historical-.+\.json$/.test(name)).sort();
const packs = new Map();
const pack = async (id) => {
  if (!packs.has(id)) packs.set(id, JSON.parse(await readFile(new URL(`public/data/divisions/${id}/flags.json`, root), "utf8")));
  return packs.get(id);
};
const LICENSE_PT = (license) => (/public domain/i.test(license) ? "domínio público" : license);
const UA = { "User-Agent": "MeridianoGeoStudy/1.0 (jogo pessoal; pratesbaliza@gmail.com)" };
const cacheDir = new URL("build/historical/flags/", root);
const tools = rasterizer();
const get = async (url) => {
  // o Commons limita a frequência (HTTP 429): espera e tenta de novo
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, { headers: UA });
    if (response.ok) return response;
    if (response.status !== 429 || attempt === 5) throw new Error(`${response.status} em ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 10_000 * (attempt + 1)));
  }
};
/** Uma bandeira direto do Commons: o arquivo (guardado em build/historical/flags/), a licença e o autor. */
async function commonsFlag(id, file) {
  const query = new URLSearchParams({ action: "query", titles: `File:${file}`, prop: "imageinfo", iiprop: "url|extmetadata", iiextmetadatafilter: "LicenseShortName|Artist", format: "json", redirects: "1" });
  const page = Object.values((await (await get(`https://commons.wikimedia.org/w/api.php?${query}`)).json()).query.pages)[0];
  const meta = page.imageinfo?.[0];
  if (!meta) throw new Error(`${id}: ${file} não está no Commons`);
  const license = meta.extmetadata?.LicenseShortName?.value ?? "";
  const free = /public domain|^cc0/i.test(license);
  if (!free && !/^cc by(-sa)? \d/i.test(license)) throw new Error(`${id}: ${file} com licença ${license}`);
  const artist = free ? null : (meta.extmetadata?.Artist?.value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "Wikimedia Commons";
  await mkdir(cacheDir, { recursive: true });
  const path = new URL(`${id}.svg`, cacheDir);
  if (!existsSync(path)) await writeFile(path, Buffer.from(await (await get(meta.url)).arrayBuffer()));
  const { value, ratio } = await tools.flagValue(await readFile(path, "utf8"));
  return { flag: value, ratio, info: { file, license, ...(artist ? { artist } : {}) } };
}

let added = 0, replaced = 0;
for (const name of files) {
  for (const entry of JSON.parse(await readFile(new URL(name, dataDir), "utf8"))) {
    const missing = REQUIRED.filter((key) => entry[key] === undefined || entry[key] === "");
    if (missing.length) throw new Error(`${name}: ${entry.id ?? "?"} sem ${missing.join(", ")}`);
    let flag, info, ratio;
    if (entry.flag.file) ({ flag, info, ratio } = await commonsFlag(entry.id, entry.flag.file));
    else {
      const source = await pack(entry.flag.pack);
      const unit = `${entry.flag.pack}-${entry.flag.unit.toLowerCase()}`;
      [flag, info, ratio] = [source.flags[unit], source.sources[unit], source.ratio[unit]];
      if (!flag || !info) throw new Error(`${entry.id}: sem a bandeira ${unit} no pacote ${entry.flag.pack}`);
    }
    const fl = `hist-${entry.id}`;
    const { en, es, flag: _flag, ref: _ref, ...fields } = entry;
    const entity = {
      ...fields,
      fl,
      // proporção largura/altura, como nas 200 do clássico (o pacote guarda altura/largura)
      ratio: Math.round((1 / ratio) * 100) / 100,
      fonte: [info.file.replace(/^File:/, ""), "Wikimedia Commons", LICENSE_PT(info.license), ...(info.artist ? [`aut. ${info.artist}`] : [])].join(" · "),
    };
    if (byId.has(entity.id)) { historical.entities[byId.get(entity.id)] = entity; replaced += 1; }
    else { byId.set(entity.id, historical.entities.length); historical.entities.push(entity); added += 1; }
    flagsDoc.flags[fl] = flag;
  }
}

// o nome e a bandeira não podem se repetir (a resposta certa precisa ser única entre as 4 opções)
for (const key of ["id", "pt", "fl"]) {
  const seen = new Map();
  for (const entity of historical.entities) {
    if (seen.has(entity[key])) throw new Error(`${key} repetido: ${entity[key]} (${seen.get(entity[key])} e ${entity.id})`);
    seen.set(entity[key], entity.id);
  }
}
// nem duas históricas com a mesma bandeira, nem uma histórica igual a uma bandeira de hoje (public/data/legacy/flags.json)
const current = JSON.parse(await readFile(new URL("flags.json", legacy), "utf8")).flags;
const same = new Map(Object.entries(current).map(([key, value]) => [value, `atual ${key}`]));
for (const [key, value] of Object.entries(flagsDoc.flags)) {
  if (same.has(value)) throw new Error(`bandeira idêntica: ${key} e ${same.get(value)}`);
  same.set(value, key);
}

const manifestPath = new URL("manifest.json", legacy);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
for (const [file, document, count] of [["historical.json", historical, historical.entities.length], ["historical-flags.json", flagsDoc, Object.keys(flagsDoc.flags).length]]) {
  const text = JSON.stringify(document);
  await writeFile(new URL(file, legacy), text);
  manifest.files[file] = { ...manifest.files[file], bytes: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex"), entries: count,
    additions: files.map((name) => `scripts/data/${name}`) };
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
await tools.close();
console.log(`historical.json: ${historical.entities.length} históricas (${added} novas, ${replaced} substituídas); historical-flags.json: ${Object.keys(flagsDoc.flags).length} bandeiras`);
