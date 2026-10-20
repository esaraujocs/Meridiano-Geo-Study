// Explorar (domain/explore.ts): quem vira rótulo, a ordem e o tamanho, os rótulos sem se atropelar, a busca sem acento e o zoom para ir a um lugar;
// e as coordenadas das capitais (public/data/explore-capitals.json) batem com os lugares do jogo.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const out = ".tmp-explore";
rmSync(out, { recursive: true, force: true });
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--ignoreConfig", "src/domain/explore.ts", "--outDir", out, "--module", "ESNext", "--moduleResolution", "Bundler", "--target", "ES2022", "--skipLibCheck"], { stdio: "inherit" });
const E = await import(pathToFileURL(join(out, "explore.js")).href);

const catalog = JSON.parse(readFileSync("public/data/legacy/catalog.json", "utf8"));
const { capitals } = JSON.parse(readFileSync("public/data/explore-capitals.json", "utf8"));
const data = { meta: catalog.meta, mapEntityIds: catalog.mapEntityIds };
const units = E.exploreUnits(data, catalog.mapEntityIds, capitals);

// quem entra: os lugares do mapa com nome e ponto, sem os absorvidos; do maior para o menor; o primeiro décimo grande, o terço médio
assert.ok(units.length >= 240, `lugares com rótulo: ${units.length}`);
assert.ok(units.every((unit) => !catalog.meta[unit.id].absorvido && catalog.meta[unit.id].mapa !== false));
assert.equal(units[0].name, "Rússia");
assert.ok(units.every((unit, index) => index === 0 || units[index - 1].area >= unit.area), "do maior para o menor");
assert.equal(units.filter((unit) => unit.tier === "big").length, Math.ceil(units.length * 0.1));
assert.deepEqual(units.find((unit) => unit.name === "Brasil").at, [-55, -10], "o ponto do rótulo é [lng, lat]");
// capitais: todo lugar com capital no mapa tem coordenada, e ela fica perto do lugar
const withCapital = units.filter((unit) => unit.capital);
const missing = withCapital.filter((unit) => !unit.capitalAt).map((unit) => unit.name);
assert.ok(missing.length <= 3, `capitais sem coordenada: ${missing.join(", ")}`);
const km = ([lo1, la1], [lo2, la2]) => { const r = Math.PI / 180; const d = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(d)); };
const far = withCapital.filter((unit) => unit.capitalAt && km(unit.capitalAt, unit.at) > Math.max(1300, Math.sqrt(unit.area) * 1.3)).map((unit) => unit.name);
assert.deepEqual(far, [], "capital longe demais do lugar");
assert.deepEqual(units.find((unit) => unit.name === "França").capitalAt.map(Math.round), [2, 49], "Paris");
// 1914 e os estados também têm as capitais
for (const country of ["br", "us", "cn", "1914"]) {
  const file = JSON.parse(readFileSync(`public/data/divisions/${country}/units.json`, "utf8"));
  const ids = Object.entries(file.units).filter(([, unit]) => unit.capital).map(([id]) => id);
  const without = ids.filter((id) => !capitals[id]);
  assert.deepEqual(without, [], `${country}: capitais sem coordenada`);
}

// rótulos sem se atropelar: o escolhido primeiro, depois do maior para o menor; quem sai da tela fica de fora
const grid = [
  { id: "a", name: "A", at: [0, 0], area: 300, tier: "big", keys: ["a"] },
  { id: "b", name: "B", at: [1, 0], area: 200, tier: "mid", keys: ["b"], capital: "Bê", capitalAt: [22, 0] },
  { id: "c", name: "C", at: [100, 0], area: 100, tier: "small", keys: ["c"] },
  { id: "d", name: "D", at: [990, 0], area: 50, tier: "small", keys: ["d"] },
  { id: "e", name: "E", at: [Number.NaN, 0], area: 40, tier: "small", keys: ["e"] },
];
const project = ([x, y]) => ({ x: x + 60, y: y + 50 });
const size = () => ({ w: 40, h: 14 });
const ids = (placed) => placed.map((item) => `${item.kind === "capital" ? "cap:" : ""}${item.id}`);
assert.deepEqual(ids(E.placeLabels({ units: grid, project, size, width: 1000, height: 200 })), ["a", "c"], "B encosta em A; D sai da tela; E (NaN) fica de fora");
assert.deepEqual(ids(E.placeLabels({ units: grid, project, size, width: 1000, height: 200, selected: "b" })), ["b", "c"], "o escolhido vem primeiro");
assert.deepEqual(ids(E.placeLabels({ units: grid, project, size, width: 1000, height: 200, names: false, capitals: true })), ["cap:b"], "só as capitais");
assert.deepEqual(ids(E.placeLabels({ units: grid, project, size, width: 1000, height: 200, capitals: true })), ["a", "c"], "a capital de B encostaria em A");

// busca: começo do nome primeiro, sem acento, pela capital e por outra grafia
assert.equal(E.searchUnits(units, "japao")[0].name, "Japão");
assert.equal(E.searchUnits(units, "  BRASÍLIA ")[0].name, "Brasil", "pela capital");
assert.equal(E.searchUnits(units, "guine")[0].name.startsWith("Guiné"), true);
assert.ok(E.searchUnits(units, "guine").length <= 6, "no máximo 6");
assert.deepEqual(E.searchUnits(units, ""), []);
assert.deepEqual(E.searchUnits(units, "zzzz"), []);

// zoom pela área e a longitude perto da câmera
assert.ok(E.zoomForArea(17_098_242) < 1.8 && E.zoomForArea(1e9) === 1.5, "a Rússia de longe; nada abaixo de 1,5");
assert.equal(E.zoomForArea(2), 7.5);
const belgium = E.zoomForArea(30_528);
assert.ok(belgium > 4.5 && belgium < 5.2);
assert.equal(E.wrapNear(178, -175), -182);
assert.equal(E.wrapNear(10, 5), 10);

rmSync(out, { recursive: true, force: true });
console.log("explorar: rótulos, capitais, busca e zoom ok");
