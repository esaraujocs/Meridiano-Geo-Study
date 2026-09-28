import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(process.cwd(), ".tmp-geometry-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", [
  "src/domain/legacy-geometry.ts", "src/domain/types.ts",
  "--outDir", out, "--target", "ES2022", "--module", "ESNext",
  "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM",
  "--ignoreConfig",
], { stdio: "ignore" });
const geometry = await import(`file://${out}/legacy-geometry.js`);

const meta = {
  a: { pt: "A", cca3: "AAA", borders: ["BBB"] },
  b: { pt: "B", cca3: "BBB", borders: ["AAA", "CCC"] },
  c: { pt: "C", cca3: "CCC", borders: ["BBB", "DDD"] },
  d: { pt: "D", cca3: "DDD", borders: ["CCC"] },
};
const route = geometry.solveTravelRoute(meta, ["a", "b", "c", "d"], 0);
assert.deepEqual(route, ["a", "b", "c"]);
assert.ok(route.length >= 3 && route.length <= 5);
assert.notEqual(meta[route[0]].borders.includes(meta[route.at(-1)]?.cca3), true);

const intermediates = ["b", "c"];
const earlyLaterCountry = geometry.evaluateTravelGuess(
  meta,
  intermediates,
  [],
  "C",
);
assert.equal(earlyLaterCountry.kind, "wrong");
const firstAccepted = geometry.evaluateTravelGuess(
  meta,
  intermediates,
  [],
  "B",
);
assert.equal(firstAccepted.kind, "correct");
const laterCountryRetried = geometry.evaluateTravelGuess(
  meta,
  intermediates,
  ["b"],
  "C",
);
assert.equal(laterCountryRetried.kind, "correct");
const duplicateAccepted = geometry.evaluateTravelGuess(
  meta,
  intermediates,
  ["b"],
  "B",
);
assert.equal(duplicateAccepted.kind, "duplicate");

const path = geometry.pathForFeatures([{
  type: "Feature",
  properties: {},
  geometry: { type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 1], [0, 0]]] },
}]);
assert.ok(path.d.length > 20);
assert.match(path.d, /^M/);
assert.ok([...path.d].every((character) => character !== "N"));

// Antimeridiano (28/09, Rússia/Fiji): um anel que naivamente vai de -179 a 179 é, na verdade, uma faixa estreita de 2° cruzando o 180°, não uma
// faixa de quase 360°. `boundsOf` desenrola o anel antes de medir.
const dateline = [{
  type: "Feature", properties: {}, id: "999",
  geometry: { type: "Polygon", coordinates: [[[179, -1], [-179, -1], [-179, 1], [179, 1], [179, -1]]] },
}];
const [minLon, , maxLon] = geometry.boundsOf(dateline);
assert.ok(maxLon - minLon < 5, `esperava uma faixa estreita cruzando o antimeridiano, veio ${maxLon - minLon}`);

// Correção de latitude (28/09, "achatadas": Canadá, Suécia...): o mesmo quadrado em graus fica bem mais estreito perto do polo que no equador,
// porque um grau de longitude cobre menos distância real fora do equador.
const bboxOfPath = (d) => {
  const points = [...d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};
const squareAt = (lat) => [{
  type: "Feature", properties: {},
  geometry: { type: "Polygon", coordinates: [[[-5, lat - 5], [5, lat - 5], [5, lat + 5], [-5, lat + 5], [-5, lat - 5]]] },
}];
const equatorBox = bboxOfPath(geometry.pathForFeatures(squareAt(0)).d);
const highLatBox = bboxOfPath(geometry.pathForFeatures(squareAt(70)).d);
assert.ok(Math.abs(equatorBox.w / equatorBox.h - 1) < 0.05, "quadrado no equador deveria continuar quadrado");
assert.ok(highLatBox.w / highLatBox.h < 0.6, `quadrado a 70° deveria sair bem mais estreito que alto, veio w/h=${highLatBox.w / highLatBox.h}`);

// Território ultramarino (28/09, França/Holanda/Estados Unidos "totalmente bugados"): id na lista revisada à mão perde a peça pequena e distante;
// um id fora da lista mantém as duas (não é uma regra automática por tamanho/distância).
const nearBig = [[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]];
const farSmall = [[54, -2], [55, -2], [55, -1], [54, -1], [54, -2]];
const twoPieces = (id) => ({ type: "Feature", properties: {}, id, geometry: { type: "MultiPolygon", coordinates: [[nearBig], [farSmall]] } });
const franceLike = geometry.featurePath(twoPieces("250"));
const francePoints = [...franceLike.d.matchAll(/M/g)].length;
assert.equal(francePoints, 1, "id 250 (frança) deveria descartar a peça pequena e distante, sobrando só 1 anel");
const otherCountry = geometry.featurePath(twoPieces("1"));
const otherPoints = [...otherCountry.d.matchAll(/M/g)].length;
assert.equal(otherPoints, 2, "um id fora da lista revisada deveria manter as duas peças");

await rm(out, { recursive: true, force: true });
console.log("geometry rules: ok");