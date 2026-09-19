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
await rm(out, { recursive: true, force: true });
console.log("geometry rules: ok");