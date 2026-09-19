import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "carta-cega-economy-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", [
  "src/domain/economy-rules.ts",
  "src/domain/economy-store.ts",
  "src/domain/legacy-migration.ts",
  "src/domain/types.ts",
  "--outDir", out, "--target", "ES2022", "--module", "ESNext",
  "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM",
  "--ignoreConfig",
], { env: { ...process.env, NODE_OPTIONS: "--experimental-specifier-resolution=node" } });
const economyPath = join(out, "economy-store.js");
await writeFile(economyPath, (await readFile(economyPath, "utf8")).replace('"./economy-rules"', '"./economy-rules.js"'));
const migrationPath = join(out, "legacy-migration.js");
await writeFile(migrationPath, (await readFile(migrationPath, "utf8")).replaceAll('"./learning-rules"', '"./learning-rules.js"').replaceAll('"./storage-schema"', '"./storage-schema.js"'));
const rules = await import(`file://${out}/economy-rules.js`);
const economy = await import(`file://${out}/economy-store.js`);
const migration = await import(`file://${out}/legacy-migration.js`);
assert.equal(rules.firstCorrectReward("a", "mapa", true, 0).amount, 2);
assert.equal(rules.firstCorrectReward("a", "mapa", true, 1), null);
assert.equal(rules.firstCorrectReward("a", "mapa", false, 0), null);
const world = rules.policyFor("mapa", "mapa", "mundo");
assert.equal(rules.canUnlock(world, 0, 0, 0), true);
const travel = rules.policyFor("travel", "travel", "mundo");
assert.equal(rules.canUnlock(travel, 5, 0, 20), false);
assert.equal(rules.canUnlock(travel, 6, 0, 19), false);
assert.equal(rules.canUnlock(travel, 6, 0, 20), true);
const completed = (rounds) => ({ complete: true, family: "mapa", variant: "mapa", rounds });
const abandoned = (rounds) => ({ complete: false, family: "mapa", variant: "mapa", rounds });
const answer = (targetId, correct, column) => ({ targetId, correct, column });
assert.equal(economy.dominatedFromSessions([
  completed([answer("a", true, "mapa"), answer("a", true, "bandeiras"), answer("a", true, "capitais")]),
  abandoned([answer("b", true, "mapa"), answer("b", true, "bandeiras"), answer("b", true, "capitais")]),
]), 1);
assert.equal(economy.dominatedFromSessions([
  completed([answer("a", true, "mapa"), answer("a", true, "mapa"), answer("a", true, "mapa")]),
]), 0);
assert.equal(economy.dominatedFromSessions([
  completed([answer("a", true, "mapa"), answer("a", false, "bandeiras"), answer("a", true, "capitais"), answer("a", true, "bandeiras")]),
]), 0);
assert.equal(economy.dominatedFromSessions([], [{ entityId: "legacy", last3: [
  { correct: true, column: "mapa" }, { correct: true, column: "bandeiras" }, { correct: true, column: "mapa" },
] }]), 1);
const migrated = {
  complete: true,
  column: "bandeiras",
  r: [["legacy-country", true, 1000, 0], ["legacy-country", true, 2000, 0]],
};
const migratedOtherMode = {
  complete: true,
  column: "mapa",
  r: [["legacy-country", true, 3000, 0]],
};
assert.equal(economy.dominatedFromSessions([migrated, migratedOtherMode]), 1);
assert.equal(economy.roundsFromCompletedSessions([migrated, migratedOtherMode, abandoned([])]), 3);
const transformed = migration.transformLegacy({ history: { sessoes: [
  { ini: 100, modo: "mapa", completa: true, r: [["chronology", true, 9000], ["chronology", true, 1]] },
  { ini: 200, modo: "bn", completa: true, r: [["chronology", false, 1], ["chronology", true, 8000]] },
  { ini: 300, modo: "escr", completa: true, r: [["chronology", true, 2]] },
] } });
assert.equal(economy.roundsFromCompletedSessions(transformed.sessions), 5);
assert.equal(economy.dominatedFromSessions(transformed.sessions), 0);
const transformedPositive = migration.transformLegacy({ history: { sessoes: [
  { ini: 100, modo: "mapa", completa: true, r: [["positive", true, 9000]] },
  { ini: 200, modo: "bn", completa: true, r: [["positive", true, 1]] },
  { ini: 300, modo: "bn", completa: true, r: [["positive", true, 8000]] },
] } });
assert.equal(economy.dominatedFromSessions(transformedPositive.sessions), 1);
for (const [xp, level, base, next] of [[0, 1, 0, 100], [99, 1, 0, 100], [100, 2, 100, 300], [299, 2, 100, 300], [300, 3, 300, 600]]) {
  let actual = 1;
  while (50 * actual * (actual + 1) <= xp) actual += 1;
  assert.equal(actual, level);
  assert.equal(50 * (actual - 1) * actual, base);
  assert.equal(50 * actual * (actual + 1), next);
}
console.log("economy rules: ok");