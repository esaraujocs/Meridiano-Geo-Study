import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "carta-cega-profile-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", ["src/domain/progress-surfaces.ts", "--outDir", out, "--target", "ES2022", "--module", "ES2022", "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM", "--ignoreConfig"], { stdio: "ignore" });
const profile = await import(`file://${out}/progress-surfaces.js`);

const current = profile.normalizeSession({ id: "c", family: "mapa", mode: "mapa", rounds: [{ targetId: "a", correct: true, responseTimeMs: 100 }, { targetId: "b", correct: false }] });
assert.equal(current.correct, 1);
assert.equal(current.accuracy, 0.5);
const raw = profile.normalizeSession({ id: "l", modo: "capital-pais", r: [["a", 1, 80], ["b", 0]], ini: 10, fim: 20 });
assert.equal(raw.rounds.length, 2);
const aggregate = profile.normalizeSession({ id: "p", modo: "mapa", ag: { ac: 7, rod: 10 } });
assert.equal(aggregate.correct, 7);
assert.equal(aggregate.accuracy, 0.7);

const records = [
  { entityId: "a", mastery: 2, seen: 10, columns: { mapa: 8 } },
  { entityId: "b", mastery: 0, seen: 0, columns: {} },
];
const progress = profile.deriveProgress(records, ["a", "b", "c"]);
assert.equal(progress.total, 3);
assert.equal(progress.discovered, 1);
assert.deepEqual(progress.distribution, [2, 0, 1, 0, 0, 0]);
assert.equal(progress.pillars.mapa.correct, 8);
assert.equal(progress.pillars.mapa.bayesianScore, (8 + 12 * 0.45) / 22);
assert.equal(progress.pillars.mapa.status, "em desenvolvimento");

const meta = { a: { pt: "Alfa", mapa: true }, b: { pt: "Beta", absorvido: true }, c: { pt: "Gama", cap: "Capital" } };
assert.deepEqual(profile.canonicalCurrentIds(meta), ["a", "c"]);
assert.equal(profile.collectionCard("a", meta.a, 0).fields.length, 0);
assert.equal(profile.collectionCard("a", meta.a, 2).fields.length, 2);
assert.equal(profile.collectionCard("a", meta.a, 5).fields.length, 5);

const achievements = profile.evaluateAchievements(progress, [current], []);
assert.equal(achievements.find((item) => item.id === "first-session").unlocked, true);
assert.equal(achievements.find((item) => item.id === "coverage-10").unlocked, false);
console.log("profile surface tests passed");