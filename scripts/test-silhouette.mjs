import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(tmpdir(), "carta-cega-silhouette-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node", ["node_modules/typescript/bin/tsc", "src/domain/silhouette.ts", "--outDir", out, "--target", "ES2022", "--module", "ES2022", "--moduleResolution", "Bundler", "--skipLibCheck", "--ignoreConfig"], { stdio: "inherit" });
const S = await import(pathToFileURL(join(out, "silhouette.js")).href);
const { feature } = createRequire(import.meta.url)("topojson-client");

assert.equal(S.SMALL_ISLAND_KM2, 5000);
// regra: ilha (sem fronteira terrestre) com menos de 5.000 km² sai; o resto fica
assert.equal(S.isSmallIsland({ borders: [], area: 26 }), true);
assert.equal(S.isSmallIsland({ borders: [], area: 4999 }), true);
assert.equal(S.isSmallIsland({ borders: [], area: 5000 }), false);
assert.equal(S.isSmallIsland({ borders: ["FRA"], area: 2 }), false, "país pequeno com fronteira não é ilha (Mônaco, Vaticano)");
assert.equal(S.isSmallIsland({ borders: [], area: undefined }), false, "sem área conhecida, fica");
assert.equal(S.isSmallIsland({ area: 300 }), true, "sem lista de fronteiras conta como sem fronteira");
assert.equal(S.isSmallIsland(undefined), false);
assert.equal(S.inSilhouetteDeck({ area: 26, borders: [] }), false);
assert.equal(S.inSilhouetteDeck({ area: 300000, borders: [] }), true);
assert.equal(S.inSilhouetteDeck({ absorvido: true, area: 300000, borders: [] }), false);
assert.equal(S.inSilhouetteDeck({ mapa: false, area: 300000, borders: ["X"] }), false);
assert.equal(S.inSilhouetteDeck(undefined), false);

// com os dados de verdade
const meta = JSON.parse(readFileSync("public/data/legacy/catalog.json", "utf8")).meta;
const topo = JSON.parse(readFileSync("public/data/legacy-map.json", "utf8")).topo;
const geo = new Set(feature(topo, topo.objects.countries).features.filter((item) => item.geometry).map((item) => String(item.id)));
const idOf = (name) => Object.keys(meta).find((id) => meta[id].pt === name);
const pool = [...geo].filter((id) => S.inSilhouetteDeck(meta[id]));
for (const name of ["Tuvalu", "Nauru", "Malta", "Maldivas", "Cabo Verde", "Kiribati", "Seychelles", "Ilhas Marshall", "Barbados", "Singapura"]) {
  const id = idOf(name);
  assert.ok(id, name + " existe no catálogo");
  assert.equal(pool.includes(id), false, name + " sai do baralho");
}
for (const name of ["Cuba", "Islândia", "Chipre", "Jamaica", "Trinidad e Tobago", "Madagascar", "Japão", "Nova Zelândia", "Filipinas", "Austrália", "Mônaco", "Bahamas"]) {
  const id = idOf(name);
  if (!id || !geo.has(id)) continue;
  assert.equal(pool.includes(id), true, name + " fica no baralho");
}
assert.ok(pool.every((id) => !S.isSmallIsland(meta[id])));
assert.ok(pool.length >= 165 && pool.length <= 180, "o baralho ficou com " + pool.length + " silhuetas (eram 191)");
console.log("silhueta: ilhas pequenas fora do baralho (" + pool.length + " silhuetas) ok");
