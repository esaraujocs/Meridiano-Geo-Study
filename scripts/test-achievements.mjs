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

// Registro como o app grava (id "current:xxx" + achievementId) e como o perfil clássico migrado (id cru):
// vale mesmo sem o progresso atual, com a data preservada.
for (const record of [{ id: "current:primeira", achievementId: "primeira", unlockedAt }, { id: "primeira", unlockedAt }]) {
  const kept = evaluateAchievementDefinitions(empty, [record]);
  assert.equal(kept.find((item) => item.id === "primeira")?.unlocked, true, "conquista salva continua desbloqueada");
  assert.equal(kept.find((item) => item.id === "primeira")?.unlockedAt, unlockedAt, "mantém a data do desbloqueio");
  assert.equal(kept.filter((item) => item.unlocked).length, 1, "só a conquista salva");
}

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
  // 5 acertos tocando no mar, 3 acertos em terra (0 km) e 2 erros: erro médio = (0 + 800 + 1200) / 10 = 200 km
  rounds: [
    { targetId: "tv", correct: true, responseTimeMs: 800, distanceKm: 40, byWater: true },
    { targetId: "nr", correct: true, responseTimeMs: 900, distanceKm: 55, byWater: true },
    { targetId: "pw", correct: true, responseTimeMs: 1000, distanceKm: 90, byWater: true },
    { targetId: "fj", correct: true, responseTimeMs: 1100, distanceKm: 30, byWater: true },
    { targetId: "ws", correct: true, responseTimeMs: 1200, distanceKm: 70, byWater: true },
    { targetId: "ki", correct: true, responseTimeMs: 1200, distanceKm: 0, byWater: false },
    { targetId: "to", correct: true, responseTimeMs: 1200, distanceKm: 0, byWater: false },
    { targetId: "vu", correct: true, responseTimeMs: 1200, distanceKm: 0, byWater: false },
    { targetId: "mh", correct: false, responseTimeMs: 1200, distanceKm: 800, byWater: false },
    { targetId: "sb", correct: false, responseTimeMs: 1200, distanceKm: 1200, byWater: false },
  ],
};
const realisticContext = achievementContext(realisticProgress, [realisticMapSession], {});
assert.equal(realisticContext.byWater, 5, "toques no mar que acertaram levam ao pescador");
assert.equal(realisticContext.precise, true, "erro médio de 200 km (acerto = 0) conquista a mão firme");
// toque no mar que ERROU não conta para o pescador (bug: a conquista saía numa rodada de erro)
const wrongWater = { ...realisticMapSession, id: "wrong-water", rounds: Array.from({ length: 10 }, (_, index) => ({ targetId: "w" + index, correct: false, responseTimeMs: 900, distanceKm: 900, byWater: true })) };
const wrongContext = achievementContext(realisticProgress, [wrongWater], {});
assert.equal(wrongContext.byWater, 0, "toque no mar que errou não conta");
assert.equal(wrongContext.precise, false, "erro médio de 900 km não conquista");
assert.equal(evaluateAchievementDefinitions(wrongContext).find((item) => item.id === "pescador")?.unlocked, false);
// meta de 500 km e mínimo de 10 rodadas
const fewRounds = { ...realisticMapSession, id: "few", rounds: realisticMapSession.rounds.slice(0, 5) };
assert.equal(achievementContext(realisticProgress, [fewRounds], {}).precise, false, "menos de 10 rodadas não vale");
const borderline = { ...realisticMapSession, id: "borderline", rounds: realisticMapSession.rounds.map((round, index) => index >= 8 ? { ...round, distanceKm: 2400 } : round) };
assert.equal(achievementContext(realisticProgress, [borderline], {}).precise, true, "480 km de média: (2400×2) ÷ 10 fica abaixo da meta");
const loose = { ...realisticMapSession, id: "loose", rounds: realisticMapSession.rounds.map((round, index) => index >= 8 ? { ...round, distanceKm: 3000 } : round) };
assert.equal(achievementContext(realisticProgress, [loose], {}).precise, false, "600 km de média (3000×2 ÷ 10) não chega à meta de 500 km");
const looser = { ...realisticMapSession, id: "looser", rounds: realisticMapSession.rounds.map((round, index) => index >= 7 ? { ...round, correct: false, distanceKm: 3000 } : round) };
assert.equal(achievementContext(realisticProgress, [looser], {}).precise, false, "900 km de média: 0×7 + 3000×3 = 900");
// partida incompleta ou de outro modo não conta
assert.equal(achievementContext(realisticProgress, [{ ...realisticMapSession, id: "open", complete: false }], {}).precise, false);
assert.equal(achievementContext(realisticProgress, [{ ...realisticMapSession, id: "cap", mode: "capital-pais", variant: "capital-pais" }], {}).precise, false, "Mão firme é do modo Clicar no mapa (país)");
const realisticState = evaluateAchievementDefinitions(realisticContext);
assert.equal(realisticState.find((item) => item.id === "pescador")?.unlocked, true);
assert.equal(realisticState.find((item) => item.id === "certeiro")?.unlocked, true);
const regionalCapital = {
  ...realisticMapSession,
  family: "capitais",
  mode: "capital-pais",
  variant: "capital-pais",
  regions: ["caribe", "europa", "asia"],
};
const worldUnion = {
  ...realisticMapSession,
  regions: ["caribe", "pacifico", "europa", "africa", "asia", "america-do-sul", "america-do-norte-central"],
  rounds: Array.from({ length: 150 }, (_, index) => ({ targetId: String(index), correct: true, responseTimeMs: 100 })),
  correct: 150,
};
const regionalContext = achievementContext(realisticProgress, [regionalCapital, worldUnion], {});
assert.equal(regionalContext.capitalRegions.size, 3, "capital achievements must consume all selected regions");
assert.equal(regionalContext.worldComplete, true, "all-region union must count as Mundo");

console.log("achievements: 30 canonical rules pass");