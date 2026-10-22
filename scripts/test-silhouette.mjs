import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(tmpdir(), "carta-cega-silhouette-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node", ["node_modules/typescript/bin/tsc", "src/domain/silhouette.ts", "--outDir", out, "--target", "ES2022", "--module", "ES2022", "--moduleResolution", "Bundler", "--skipLibCheck", "--ignoreConfig"], { stdio: "inherit" });
const S = await import(pathToFileURL(join(out, "silhouette.js")).href);

// regra: entra todo território jogável no mapa que não é absorvido (as ilhas pequenas voltaram em 21/10/2026)
assert.equal(S.inSilhouetteDeck({ borders: [], area: 26 }), true, "Tuvalu volta");
assert.equal(S.inSilhouetteDeck({ absorvido: true, area: 300000, borders: [] }), false);
assert.equal(S.inSilhouetteDeck({ mapa: false, area: 300000, borders: ["X"] }), false);
assert.equal(S.inSilhouetteDeck(undefined), false);

// as silhuetas do mapa HD (scripts/map-hd/build-silhouettes.py): os 250 territórios do mapa da partida
const catalog = JSON.parse(readFileSync("public/data/legacy/catalog.json", "utf8"));
const meta = catalog.meta;
const idOf = (name) => Object.keys(meta).find((id) => meta[id].pt === name);
const hd = JSON.parse(readFileSync("public/data/silhouettes.json", "utf8"));
assert.deepEqual(Object.keys(hd).sort(), catalog.mapEntityIds.filter((id) => !meta[id]?.absorvido).sort(), "uma silhueta por território do mapa");
const pool = Object.keys(hd).filter((id) => S.inSilhouetteDeck(meta[id]));
const un = pool.filter((id) => meta[id].un || id === "336");
assert.ok(un.length >= 190, `países da ONU no baralho: ${un.length}`);
for (const name of ["Tuvalu", "Nauru", "Malta", "Maldivas", "Cabo Verde", "Kiribati", "Singapura", "Mônaco", "Vaticano"]) assert.ok(pool.includes(idOf(name)), name + " no baralho");
const ringsOf = (geometry) => geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
const points = (geometry) => ringsOf(geometry).flat().reduce((sum, ring) => sum + ring.length, 0);
for (const id of pool) assert.ok(["Polygon", "MultiPolygon"].includes(hd[id].type) && points(hd[id]) >= 4, `${meta[id].pt}: ${hd[id].type} com ${points(hd[id])} pontos`);
// a França sem a Guiana, a Noruega sem Svalbard, os EUA só com os 48 contíguos (o Alasca, com 18% da área, encolhia o desenho), a Malásia com as duas metades, a Rússia inteira do lado leste do antimeridiano
const coords = (id) => ringsOf(hd[id]).flat(3);
const lons = (id) => coords(id).filter((_, i) => i % 2 === 0);
const lats = (id) => coords(id).filter((_, i) => i % 2 === 1);
assert.ok(Math.min(...lons(idOf("França"))) > -10, "França sem ultramar");
assert.ok(Math.max(...lats(idOf("Noruega"))) < 72, "Noruega sem Svalbard");
assert.ok(Math.max(...lats(idOf("Estados Unidos"))) < 50, "EUA sem o Alasca");
assert.ok(Math.min(...lons(idOf("Malásia"))) < 101 && Math.max(...lons(idOf("Malásia"))) > 118, "Malásia peninsular e Bornéu");
assert.ok(Math.min(...lons(idOf("Rússia"))) > 0 && Math.max(...lons(idOf("Rússia"))) > 180, "Rússia contínua passando do 180");
console.log(`silhueta: ${pool.length} silhuetas do mapa HD (${un.length} países) ok`);
