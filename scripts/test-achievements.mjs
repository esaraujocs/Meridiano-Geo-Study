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
  "primeira", "seq10", "seq25", "perfeita", "perfeitaGrande", "certeiro", "travel20", "escrita100",
  "todosModos", "todosRecortes", "voltaAoMundo", "pacifico", "capitalRodada",
  "dom50", "dom150", "band100", "cap50", "cadaContinente", "continenteInteiro", "micro",
  "silhueta50", "silhueta150", "historicas50", "historicas150", "idiomas40",
  "gExplorador", "gNavegador", "gGeografo", "forma", "evoluiu",
  "vexilologo", "cartografo", "diplomata", "cosmografo",
  "mapaRecorte1", "mapaZonas3", "mapaSemFalhas",
  "capitaisRecorte1", "capitaisZonas3", "capitaisSemFalhas",
  "bandeirasRecorte1", "bandeirasZonas3", "bandeirasSemFalhas",
  "idiomasRecorte1", "idiomasSemFalhas", "tresPilaresSemFalhas",
  "pescador", "relampago", "confins",
];

assert.equal(ACHIEVEMENT_DEFINITIONS.length, 49);
assert.deepEqual(ACHIEVEMENT_DEFINITIONS.map((item) => item.id), expectedIds);
assert.equal(new Set(expectedIds).size, 49);
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
  perfectRegionsMapa: new Set(["caribe", "pacifico", "europa", "africa", "asia", "america-do-sul", "america-do-norte-central"]),
  perfectRegionsCapitais: new Set(["caribe", "pacifico", "europa", "africa", "asia", "america-do-sul", "america-do-norte-central"]),
  perfectRegionsBandeiras: new Set(["caribe", "pacifico", "europa", "africa", "asia", "america-do-sul", "america-do-norte-central"]),
  perfectRegionsIdiomas: new Set(["caribe", "pacifico", "europa", "africa", "asia", "america-do-sul", "america-do-norte-central"]),
  zonesMapa: new Set(["americas", "africa", "asia", "europa", "oceania"]),
  zonesCapitais: new Set(["americas", "africa", "asia", "europa", "oceania"]),
  zonesBandeiras: new Set(["americas", "africa", "asia", "europa", "oceania"]),
  silhouettes: new Set(Array.from({ length: 150 }, (_, i) => "s" + i)),
  historicalEntities: new Set(Array.from({ length: 150 }, (_, i) => "h" + i)),
  languagesKnown: new Set(Array.from({ length: 40 }, (_, i) => "l" + i)),
  travelRoutes: 20,
  writtenCorrect: 100,
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
  perfectRegionsMapa: new Set(),
  perfectRegionsCapitais: new Set(),
  perfectRegionsBandeiras: new Set(),
  perfectRegionsIdiomas: new Set(),
  zonesMapa: new Set(),
  zonesCapitais: new Set(),
  zonesBandeiras: new Set(),
  silhouettes: new Set(),
  historicalEntities: new Set(),
  languagesKnown: new Set(),
  travelRoutes: 0,
  writtenCorrect: 0,
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
assert.equal(allUnlocked.find((item) => item.id === "mapaSemFalhas")?.unlocked, true);
assert.equal(allUnlocked.find((item) => item.id === "capitaisSemFalhas")?.unlocked, true);
assert.equal(allUnlocked.find((item) => item.id === "bandeirasSemFalhas")?.unlocked, true);
assert.equal(allUnlocked.find((item) => item.id === "idiomasSemFalhas")?.unlocked, true);
assert.equal(allUnlocked.find((item) => item.id === "idiomasRecorte1")?.unlocked, true);
assert.equal(allUnlocked.find((item) => item.id === "tresPilaresSemFalhas")?.unlocked, true);
assert.equal(allUnlocked.find((item) => item.id === "silhueta50")?.unlocked, true);
assert.equal(allUnlocked.find((item) => item.id === "silhueta150")?.unlocked, true);
assert.equal(allUnlocked.find((item) => item.id === "historicas50")?.unlocked, true);
assert.equal(allUnlocked.find((item) => item.id === "historicas150")?.unlocked, true);
assert.equal(allUnlocked.find((item) => item.id === "idiomas40")?.unlocked, true);
assert.equal(allUnlocked.find((item) => item.id === "travel20")?.unlocked, true);
assert.equal(allUnlocked.find((item) => item.id === "escrita100")?.unlocked, true);
for (const mode of ["mapa", "capitais", "bandeiras"]) {
  assert.equal(allUnlocked.find((item) => item.id === `${mode}Recorte1`)?.unlocked, true, `${mode}Recorte1 deveria estar desbloqueada`);
  assert.equal(allUnlocked.find((item) => item.id === `${mode}Zonas3`)?.unlocked, true, `${mode}Zonas3 deveria estar desbloqueada`);
}

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

// ---- "recorte sem falhas" (mapaSemFalhas/capitaisSemFalhas/bandeirasSemFalhas/idiomasSemFalhas):
// baralho inteiro (roundLimit: null) + 100% de acerto: vale para cada recorte que a partida cobriu (o Mundo cobre os 7).
const perfectDeck = (overrides = {}) => ({
  id: "perfect-" + Math.random(),
  family: "mapa",
  variant: "mapa",
  mode: "mapa",
  region: "caribe",
  complete: true,
  roundLimit: null,
  rounds: Array.from({ length: 5 }, (_, index) => ({ targetId: "c" + index, correct: true, responseTimeMs: 900 })),
  correct: 5,
  ...overrides,
});
const onlyMapaCaribe = achievementContext(realisticProgress, [perfectDeck()], {});
assert.equal(onlyMapaCaribe.perfectRegionsMapa.size, 1, "baralho inteiro, 100%, recorte único: conta");
assert.ok(onlyMapaCaribe.perfectRegionsMapa.has("caribe"));
assert.equal(onlyMapaCaribe.perfectRegionsCapitais.size, 0, "não vaza pra outro modo");
assert.equal(achievementContext(realisticProgress, [perfectDeck({ roundLimit: 20 })], {}).perfectRegionsMapa.size, 0, "corte de rodadas (não \"Todas\") não conta");
assert.equal(achievementContext(realisticProgress, [perfectDeck({ roundLimit: undefined })], {}).perfectRegionsMapa.size, 0, "partida sem o campo roundLimit (migrada) não conta");
const missedOne = perfectDeck({ correct: 4, rounds: [...Array.from({ length: 4 }, (_, i) => ({ targetId: "c" + i, correct: true, responseTimeMs: 900 })), { targetId: "c4", correct: false, responseTimeMs: 900 }] });
assert.equal(achievementContext(realisticProgress, [missedOne], {}).perfectRegionsMapa.size, 0, "menos de 100% não conta");
const worldPerfect = achievementContext(realisticProgress, [perfectDeck({ region: "mundo", regions: ["mundo"] })], {});
assert.equal(worldPerfect.perfectRegionsMapa.size, 7, "100% no baralho inteiro do Mundo fecha os 7 recortes");
assert.equal(worldPerfect.zonesMapa.size, 5, "e as 5 zonas");
assert.equal(evaluateAchievementDefinitions(worldPerfect).find((item) => item.id === "mapaSemFalhas")?.unlocked, true, "Mapa sem falhas numa partida só de Mundo");
assert.deepEqual([...achievementContext(realisticProgress, [perfectDeck({ region: "caribe", regions: ["caribe", "europa"] })], {}).perfectRegionsMapa].sort(), ["caribe", "europa"], "seleção combinada conta para cada recorte dela");
assert.equal(achievementContext(realisticProgress, [perfectDeck({ region: "mundo", regions: ["mundo"], roundLimit: 100 })], {}).perfectRegionsMapa.size, 0, "Mundo com corte de 100 rodadas não é o baralho inteiro");
assert.equal(achievementContext(realisticProgress, [perfectDeck({ complete: false })], {}).perfectRegionsMapa.size, 0, "partida abandonada não conta");
const sevenRegions = ["caribe", "pacifico", "europa", "africa", "asia", "america-do-sul", "america-do-norte-central"]
  .map((region) => perfectDeck({ region }));
const sevenContext = achievementContext(realisticProgress, sevenRegions, {});
assert.equal(sevenContext.perfectRegionsMapa.size, 7, "os 7 recortes regionais, cada um com sua própria partida");
const sevenState = evaluateAchievementDefinitions(sevenContext);
assert.equal(sevenState.find((item) => item.id === "mapaSemFalhas")?.unlocked, true, "os 7 recortes fecham a conquista");
assert.equal(sevenState.find((item) => item.id === "capitaisSemFalhas")?.unlocked, false, "só o modo jogado desbloqueia, não os outros três");
assert.equal(sevenState.find((item) => item.id === "bandeirasSemFalhas")?.unlocked, false);
assert.equal(sevenState.find((item) => item.id === "idiomasSemFalhas")?.unlocked, false);
assert.equal(sevenState.find((item) => item.id === "tresPilaresSemFalhas")?.unlocked, false, "grand slam exige os três modos, não só um");
const idiomasSeven = achievementContext(realisticProgress, sevenRegions.map((s) => ({ ...s, family: "idiomas", variant: "idioma-nome", mode: "idioma-nome" })), {});
assert.equal(evaluateAchievementDefinitions(idiomasSeven).find((item) => item.id === "idiomasSemFalhas")?.unlocked, true, "o mesmo critério vale para idiomas");

// ---- zonas: as 4 zonas de recorte único fecham com 1 partida; Américas exige os 3 recortes americanos.
assert.equal(onlyMapaCaribe.zonesMapa.size, 0, "Caribe sozinho não fecha a zona Américas (falta América do Sul e do Norte e Central)");
const africaOnly = achievementContext(realisticProgress, [perfectDeck({ region: "africa" })], {});
assert.deepEqual([...africaOnly.zonesMapa], ["africa"], "zona de recorte único fecha com 1 partida só");
const americasTwoOfThree = achievementContext(realisticProgress, [perfectDeck({ region: "caribe" }), perfectDeck({ region: "america-do-sul" })], {});
assert.equal(americasTwoOfThree.zonesMapa.has("americas"), false, "2 dos 3 recortes americanos ainda não fecha a zona");
const americasComplete = achievementContext(realisticProgress, [perfectDeck({ region: "caribe" }), perfectDeck({ region: "america-do-sul" }), perfectDeck({ region: "america-do-norte-central" })], {});
assert.equal(americasComplete.zonesMapa.has("americas"), true, "os 3 recortes americanos fecham a zona Américas");
const americasCompleteState = evaluateAchievementDefinitions(americasComplete);
assert.equal(americasCompleteState.find((item) => item.id === "mapaRecorte1")?.unlocked, true, "1 recorte perfeito (Caribe) já basta pro 1º degrau");
assert.equal(americasCompleteState.find((item) => item.id === "mapaZonas3")?.unlocked, false, "só 1 zona (Américas) fechada, o 2º degrau pede 3");
assert.equal(americasCompleteState.find((item) => item.id === "capitaisRecorte1")?.unlocked, false, "zona isolada por modo, igual perfectRegions");
assert.equal(sevenContext.zonesMapa.size, 5, "as 7 regiões perfeitas fecham as 5 zonas (3 delas viram só 1 zona: Américas)");
assert.equal(evaluateAchievementDefinitions(sevenContext).find((item) => item.id === "mapaZonas3")?.unlocked, true, "5 zonas passa fácil do piso de 3");
const exactlyThreeZones = achievementContext(realisticProgress, [perfectDeck({ region: "africa" }), perfectDeck({ region: "asia" }), perfectDeck({ region: "europa" })], {});
assert.equal(exactlyThreeZones.zonesMapa.size, 3, "3 recortes de zona única = 3 zonas");
assert.equal(evaluateAchievementDefinitions(exactlyThreeZones).find((item) => item.id === "mapaZonas3")?.unlocked, true, "bate exatamente o piso do 2º degrau");
const onlyTwoZones = achievementContext(realisticProgress, [perfectDeck({ region: "africa" }), perfectDeck({ region: "asia" })], {});
assert.equal(evaluateAchievementDefinitions(onlyTwoZones).find((item) => item.id === "mapaZonas3")?.unlocked, false, "2 zonas ainda não bate o piso de 3");

// ---- grand slam: só fecha com os três modos (mapa+capitais+bandeiras) no 7 de 7 ao mesmo tempo.
const threeModesSeven = sevenRegions
  .concat(sevenRegions.map((s) => ({ ...s, family: "capitais", variant: "capital-pais", mode: "capital-pais" })))
  .concat(sevenRegions.map((s) => ({ ...s, family: "bandeiras", variant: "bandeira-nome", mode: "bandeira-nome" })));
const slamContext = achievementContext(realisticProgress, threeModesSeven, {});
assert.equal(slamContext.perfectRegionsMapa.size, 7);
assert.equal(slamContext.perfectRegionsCapitais.size, 7);
assert.equal(slamContext.perfectRegionsBandeiras.size, 7);
assert.equal(evaluateAchievementDefinitions(slamContext).find((item) => item.id === "tresPilaresSemFalhas")?.unlocked, true, "os três modos fechados ao mesmo tempo desbloqueiam o grand slam");

// ---- cobertura nova: Silhueta, Históricas, Idiomas (distintos), Travel e Escrita nunca tinham conquista própria.
const coverageSession = (family, correctIds) => ({
  id: "cov-" + family, family, variant: family, mode: family, region: "mundo", complete: true,
  rounds: correctIds.map((id) => ({ targetId: id, correct: true, responseTimeMs: 900 })),
  correct: correctIds.length,
});
const coverageContext = achievementContext(realisticProgress, [
  coverageSession("silhueta", ["p1", "p2", "p3"]),
  coverageSession("historicas", ["h1", "h2"]),
  coverageSession("idiomas", ["l1"]),
  coverageSession("travel", ["r1", "r2"]),
  coverageSession("escrita", ["e1", "e2", "e3", "e4"]),
], {});
assert.equal(coverageContext.silhouettes.size, 3, "silhuetas distintas acertadas");
assert.equal(coverageContext.historicalEntities.size, 2, "entidades históricas distintas acertadas");
assert.equal(coverageContext.languagesKnown.size, 1, "idiomas distintos reconhecidos");
assert.equal(coverageContext.travelRoutes, 2, "rotas de Travel fechadas (cada rodada correta = 1 rota)");
assert.equal(coverageContext.writtenCorrect, 4, "respostas digitadas certas (país + capital juntos)");
// um erro no meio não conta, e família errada não vaza pro contador de outra
const withMissAndWrongFamily = achievementContext(realisticProgress, [
  { ...coverageSession("silhueta", ["p1"]), rounds: [{ targetId: "p1", correct: true, responseTimeMs: 900 }, { targetId: "p2", correct: false, responseTimeMs: 900 }] },
  coverageSession("mapa", ["m1", "m2"]),
], {});
assert.equal(withMissAndWrongFamily.silhouettes.size, 1, "só o acerto conta, o erro não");
assert.equal(withMissAndWrongFamily.historicalEntities.size, 0, "sessão de outro modo não vaza pro contador de históricas");

console.log("achievements: 49 canonical rules pass");