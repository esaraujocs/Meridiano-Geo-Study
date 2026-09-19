import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "carta-cega-regions-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", ["src/domain/regions.ts", "src/domain/quiz.ts", "src/domain/special-data.ts", "src/domain/legacy-geometry.ts", "--outDir", out, "--target", "ES2022", "--module", "ES2022", "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM", "--ignoreConfig"], { stdio: "ignore" });
for (const module of ["regions", "special-data", "legacy-geometry"]) {
  await symlink(`${module}.js`, join(out, module));
}
await symlink(join(process.cwd(), "node_modules"), join(out, "node_modules"), "junction");
const { inRegion, normalizeRegionSelection } = await import(`file://${out}/regions.js`);
const { quizPool } = await import(`file://${out}/quiz.js`);
const { historicalPool, languagePool } = await import(`file://${out}/special-data.js`);
const { travelDestinationIds } = await import(`file://${out}/legacy-geometry.js`);
const meta = {
  caribe: { reg: "Caribbean", fl: "flag-caribe", cap: "Capital Caribe" },
  europe: { reg: "Europe", fl: "flag-europe", cap: "Capital Europe" },
  overlap: { reg: "Europe", sub: "Caribbean", fl: "flag-overlap", cap: "Capital Overlap" },
  asia: { reg: "Asia", fl: "flag-asia", cap: "Capital Asia" },
};
const data = { meta };
const ids = Object.keys(meta);
assert.deepEqual(normalizeRegionSelection(["caribe", "europa"]), ["caribe", "europa"]);
assert.deepEqual(normalizeRegionSelection(["caribe", "pacifico", "europa", "africa", "asia", "america-do-sul", "america-do-norte-central"]), ["mundo"]);
assert.deepEqual(normalizeRegionSelection(["mundo", "europa"]), ["mundo"]);
const flags = { "flag-caribe": "x", "flag-europe": "x", "flag-overlap": "x", "flag-asia": "x" };
for (const mode of ["mapa", "bandeiras", "capitais", "escrita"]) {
  const union = mode === "bandeiras"
    ? quizPool({ meta }, "bandeiras", ["caribe", "europa"], flags)
    : quizPool({ meta }, "capitais", ["caribe", "europa"]);
  assert.equal(new Set(union).size, union.length, `${mode} union must deduplicate`);
  assert.deepEqual(union.sort(), ["caribe", "europe", "overlap"].sort(), `${mode} union`);
}
assert.deepEqual(historicalPool(ids.map((id) => ({ id, pt: id, reg: meta[id].reg, sub: meta[id].sub })), ["caribe", "europa"]).map((item) => item.id).sort(), ["caribe", "europe", "overlap"].sort());
assert.deepEqual(languagePool(ids.map((id) => ({ id, idioma: id, script: id, paises: id, reg: meta[id].reg })), ["caribe", "europa"]).map((item) => item.id).sort(), ["caribe", "europe", "overlap"].sort());
const travelMeta = {
  a: { reg: "Europe", borders: ["b"] },
  b: { reg: "Europe", borders: ["a", "c"] },
  c: { reg: "Europe", borders: ["b"] },
  island: { reg: "Europe" },
};
const travelUnion = ["a", "b", "c", "island"];
assert.deepEqual(travelDestinationIds(travelMeta, travelUnion).sort(), ["a", "c"].sort(), "Travel must prune over union once, not sum regional counts");
assert.deepEqual(ids.filter((id) => inRegion(id, ["mundo"], data)).sort(), ids.sort());
console.log("regions: unions, canonicalization and deduplication pass");