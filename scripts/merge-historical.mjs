// Junta as bandeiras históricas de scripts/data/historical-*.json ao acervo do jogo (public/data/legacy/historical.json e historical-flags.json),
// sem duplicar por id: a entrada com o mesmo id é substituída no lugar. Rode de novo depois de editar um arquivo em scripts/data (e depois do
// extract-legacy-game-data.mjs, que regrava os dois arquivos só com as 200 do HTML clássico); depois, python scripts/i18n/_gen-historical.py e
// node scripts/i18n/build-i18n.mjs para o inglês e o espanhol.
// A bandeira vem de um pacote de Mapas históricos já montado ("flag": {"pack": "1914", "unit": "MLT"} → public/data/divisions/1914/flags.json),
// com o arquivo, a licença e o autor do Commons gravados lá. Os campos "en", "es", "flag" e "ref" (a fonte conferida) não vão para o acervo.
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";

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

let added = 0, replaced = 0;
for (const name of files) {
  for (const entry of JSON.parse(await readFile(new URL(name, dataDir), "utf8"))) {
    const missing = REQUIRED.filter((key) => entry[key] === undefined || entry[key] === "");
    if (missing.length) throw new Error(`${name}: ${entry.id ?? "?"} sem ${missing.join(", ")}`);
    const source = await pack(entry.flag.pack);
    const unit = `${entry.flag.pack}-${entry.flag.unit.toLowerCase()}`;
    const flag = source.flags[unit];
    const info = source.sources[unit];
    if (!flag || !info) throw new Error(`${entry.id}: sem a bandeira ${unit} no pacote ${entry.flag.pack}`);
    const fl = `hist-${entry.id}`;
    const { en, es, flag: _flag, ref: _ref, ...fields } = entry;
    const entity = {
      ...fields,
      fl,
      // proporção largura/altura, como nas 200 do clássico (o pacote guarda altura/largura)
      ratio: Math.round((1 / source.ratio[unit]) * 100) / 100,
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
console.log(`historical.json: ${historical.entities.length} históricas (${added} novas, ${replaced} substituídas); historical-flags.json: ${Object.keys(flagsDoc.flags).length} bandeiras`);
