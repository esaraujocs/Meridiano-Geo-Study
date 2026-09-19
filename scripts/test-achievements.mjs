import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "carta-cega-achievements-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", [
  "src/domain/achievements.ts",
  "--outDir", out,
  "--target", "ES2022",
  "--module", "ES2022",
  "--moduleResolution", "Bundler",
  "--skipLibCheck",
  "--lib", "ES2022,DOM",
  "--ignoreConfig",
], { stdio: "ignore" });

const achievements = await import(`file://${out}/achievements.js`);
const {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_CATEGORIES,
  achievementContext,
  evaluateAchievementDefinitions,
} = achievements;

const expectedIds = [
  "primeira", "seq10", "seq25", "perfeita", "perfeitaGrande", "certeiro",
  "todosModos", "todosRecortes", "voltaAoMundo", "pacifico", "capitalRodada",
  "dom50", "dom150", "band100", "cap50", "cadaContinente", "continenteInteiro", "micro",
  "gExplorador", "gNavegador", "gGeografo", "forma", "evoluiu",
  "vexilologo", "cartografo", "diplomata", "cosmografo",
  "pescador", "relampago", "confins",
];

assert.equal(ACHIEVEMENT_DEFINITIONS.length, 30);
assert.deepEqual(ACHIEVEMENT_DEFINITIONS.map((item) => item.id), expectedIds);
assert.equal(new Set(expectedIds).size, 30);
assert.equal(ACHIEVEMENT_CATEGORIES.length, 6);
assert.equal(ACHIEVEMENT_DEFINITIONS.filter((item) => item.hidden).length, 3);
assert.deepEqual(new Set(ACHIEVEMENT_DEFINITIONS.map((item) => item.rarity)), new Set([1, 2, 3, 4, 5]));

const saturated = {
  progress: {
    total: 250,
    discovered: 250,
    distribution: [0, 0, 0, 0, 0, 250],
    pillars: {},
    records: [],
  },
  sessions: [{ rounds: Array.from({ length: 150 }), complete: true }],
  completed: [{ rounds: Array.from({ length: 150 }), complete: true }],
  modes: new Set(["mapa", "bandeiras", "capitais", "escrita"]),
  regions: new Set(["mundo", "caribe", "america-norte", "america-sul", "europa", "africa", "asia", "pacifico"]),
  capitalRegions: new Set(["caribe", "europa", "asia"]),
  bestStreak: 25,
  perfect20: true,
  perfect40: true,
  precise: true,
  worldComplete: true,
  dominated: 150,
  flags: 100,
  capitals: 50,
  micro: 10,
  continents: 5,
  wholeContinent: true,
  masteryIndex: 4,
  fit: true,
  evolved: true,
  titles: new Set(["Vexilólogo", "Cartógrafo", "Diplomata"]),
  cosmo: true,
  byWater: 5,
  lightning: 10,
  confines: true,
};

const allUnlocked = evaluateAchievementDefinitions(saturated);
for (const item of allUnlocked) {
  assert.equal(item.unlocked, true, `${item.id} must be attainable`);
  assert.ok(item.current >= item.target, `${item.id} must reach its deterministic target`);
  assert.equal("amount" in item, false, `${item.id} must not create a coin reward`);
  assert.equal("ledger" in item, false, `${item.id} must not write economic state`);
}

const empty = {
  ...saturated,
  sessions: [],
  completed: [],
  modes: new Set(),
  regions: new Set(),
  capitalRegions: new Set(),
  bestStreak: 0,
  perfect20: false,
  perfect40: false,
  precise: false,
  worldComplete: false,
  dominated: 0,
  flags: 0,
  capitals: 0,
  micro: 0,
  continents: 0,
  wholeContinent: false,
  masteryIndex: 0,
  fit: false,
  evolved: false,
  titles: new Set(),
  cosmo: false,
  byWater: 0,
  lightning: 0,
  confines: false,
};
assert.equal(evaluateAchievementDefinitions(empty).some((item) => item.unlocked), false);

const unlockedAt = 1700000000000;
const first = evaluateAchievementDefinitions(saturated, [{ achievementId: "primeira", unlockedAt }])
  .find((item) => item.id === "primeira");
assert.equal(first?.unlockedAt, unlockedAt);
assert.equal(first?.unlocked, true);

assert.equal(allUnlocked.find((item) => item.id === "pacifico")?.unlocked, true);
assert.equal(allUnlocked.find((item) => item.id === "certeiro")?.unlocked, true);
assert.equal(allUnlocked.find((item) => item.id === "pescador")?.unlocked, true);
assert.equal(allUnlocked.find((item) => item.id === "confins")?.unlocked, true);
assert.equal(allUnlocked.find((item) => item.id === "cosmografo")?.unlocked, true);

const realisticProgress = {
  total: 3,
  discovered: 0,
  distribution: [3, 0, 0, 0, 0, 0],
  pillars: {
    mapa: { seen: 3, correct: 0, accuracy: 0, bayesianScore: 0, status: "" },
    bandeiras: { seen: 0, correct: 0, accuracy: null, bayesianScore: 0, status: "" },
    capitais: { seen: 0, correct: 0, accuracy: null, bayesianScore: 0, status: "" },
    escrita: { seen: 0, correct: 0, accuracy: null, bayesianScore: 0, status: "" },
  },
  records: [],
};
const realisticMapSession = {
  id: "map-realistic",
  family: "mapa",
  variant: "mapa",
  mode: "mapa",
  region: "pacifico",
  complete: true,
  correct: 0,
  accuracy: 0,
  rounds: [
    { targetId: "tv", correct: false, responseTimeMs: 800, distanceKm: 120, byWater: true },
    { targetId: "nr", correct: false, responseTimeMs: 900, distanceKm: 180, byWater: true },
    { targetId: "pw", correct: false, responseTimeMs: 1000, distanceKm: 240, byWater: true },
    { targetId: "fj", correct: false, responseTimeMs: 1100, distanceKm: 300, byWater: true },
    { targetId: "ws", correct: false, responseTimeMs: 1200, distanceKm: 360, byWater: true },
  ],
};
const realisticContext = achievementContext(realisticProgress, [realisticMapSession], {});
assert.equal(realisticContext.byWater, 5, "water interactions must progress pescador");
assert.equal(realisticContext.precise, true, "map miss distances must make certeiro attainable");
const realisticState = evaluateAchievementDefinitions(realisticContext);
assert.equal(realisticState.find((item) => item.id === "pescador")?.unlocked, true);
assert.equal(realisticState.find((item) => item.id === "certeiro")?.unlocked, true);

console.log("achievements: 30 canonical rules pass");