import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixture = JSON.parse(
  await readFile(
    new URL("./fixtures/legacy-migration.json", import.meta.url),
    "utf8",
  ),
);
const outputDir = join(tmpdir(), "carta-cega-migration-test");
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
execFileSync("node_modules/.bin/tsc", [
  "src/domain/legacy-migration.ts",
    "src/domain/storage-schema.ts",
  "--outDir",
  outputDir,
  "--target",
  "ES2022",
  "--module",
    "ESNext",
    "--moduleResolution",
    "Bundler",
  "--skipLibCheck",
  "--lib",
  "ES2022,DOM",
  "--ignoreConfig",
], { stdio: "ignore" });
const module = await import(`file://${outputDir}/legacy-migration.js`);

const result = module.transformLegacy(fixture);
assert.equal(result.sessions.length, 7);
assert.equal(result.sessions.at(-1).aggregate.rod, 10);
assert.equal(result.progress.length, 2);
const brazil = result.progress.find((item) => item.id === "76");
assert.deepEqual(brazil.columns, {
  bandeiras: 1,
  mapa: 1,
  capitais: 2,
  escrita: 2,
});
assert.equal(brazil.seen, 7);
assert.equal(brazil.correct, 6);
assert.equal(brazil.latest, 600);
assert.equal(brazil.mastery, 5);
assert.deepEqual(result.historicalCollection, [
  { id: "ottoman", value: { bn: true, nb: true } },
]);
assert.deepEqual(result.achievements, [
  { id: "primeira", unlockedAt: 1700000000000 },
]);
console.log("legacy migration fixture: ok");