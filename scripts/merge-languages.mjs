// Junta os idiomas de scripts/data/*.json ao acervo do jogo (public/data/legacy/languages.json), sem duplicar por id.
// Rode de novo depois de editar um arquivo em scripts/data: as entradas com o mesmo id são substituídas no lugar.
// (O extract-legacy-game-data.mjs regrava languages.json só com os 36 idiomas do HTML clássico; rode este script depois dele.)
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const languagesPath = new URL("public/data/legacy/languages.json", root);
const manifestPath = new URL("public/data/legacy/manifest.json", root);
const dataDir = new URL("scripts/data/", root);

// falantes e ranking são opcionais: o cartão só mostra o que existe (melhor faltar do que inventar).
const REQUIRED = ["id", "idioma", "script", "significado", "reg", "sub", "fonte", "paises"];
const document = JSON.parse(await readFile(languagesPath, "utf8"));
const byId = new Map(document.entries.map((entry, index) => [entry.id, index]));

const files = (await readdir(dataDir)).filter((name) => name.startsWith("languages-") && name.endsWith(".json")).sort();
let added = 0, replaced = 0;
for (const name of files) {
  const entries = JSON.parse(await readFile(new URL(name, dataDir), "utf8"));
  for (const entry of entries) {
    const missing = REQUIRED.filter((key) => !entry[key]);
    if (missing.length) throw new Error(`${name}: ${entry.id ?? "?"} sem ${missing.join(", ")}`);
    if (byId.has(entry.id)) { document.entries[byId.get(entry.id)] = entry; replaced += 1; }
    else { byId.set(entry.id, document.entries.length); document.entries.push(entry); added += 1; }
  }
}

// o nome do idioma e o texto não podem se repetir (a resposta certa precisa ser única entre as 4 opções)
for (const key of ["id", "idioma", "script"]) {
  const seen = new Map();
  for (const entry of document.entries) {
    if (seen.has(entry[key])) throw new Error(`${key} repetido: ${entry[key]} (${seen.get(entry[key])} e ${entry.id})`);
    seen.set(entry[key], entry.id);
  }
}

const text = JSON.stringify(document);
await writeFile(languagesPath, text);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.files["languages.json"] = {
  bytes: Buffer.byteLength(text),
  sha256: createHash("sha256").update(text).digest("hex"),
  entries: document.entries.length,
  additions: files.map((name) => `scripts/data/${name}`),
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`languages.json: ${document.entries.length} idiomas (${added} novos, ${replaced} substituídos), ${Buffer.byteLength(text)} bytes`);
