import assert from "node:assert/strict";
import {
  BOT_RANKING_CALIBRATION,
  BOT_RANKING_ID,
  MAX_SIMULATION_DAYS,
  PAIR_JITTER,
  advanceBotRanking,
  botVersusBot,
  calibrateBotRanking,
  createBotRanking,
  needsCalibration,
  parseBotRanking,
  settleBotMatch,
} from "../.tmp-bot-ranking/bot-ranking.js";
import { BOTS, hashSeed, mulberry32 } from "../.tmp-bot-ranking/bots.js";
import { LADDERS } from "../.tmp-bot-ranking/duel-modes.js";
import { expectedScore, mmrChange, SIGMA_MIN, trophyChange } from "../.tmp-bot-ranking/mmr.js";
import { botTrophies, globalLeaderboard, leaderboard } from "../.tmp-bot-ranking/leaderboard.js";

const clone = (value) => structuredClone(value);
const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};
const withStanding = (state, ladder, botId, patch) => {
  const next = clone(state);
  next.bots[ladder][botId] = { ...next.bots[ladder][botId], ...patch };
  return next;
};

// Fresh data is seeded only on its creation day, using the leaderboard's exact bot bases.
const initial = createBotRanking(20_000);
assert.equal(BOT_RANKING_ID, "bot-ranking:v1");
assert.equal(initial.version, 1);
assert.equal(initial.revision, 0);
assert.equal(initial.lastDay, 20_000);
assert.throws(() => createBotRanking(-1), /day.*integer/i);
for (const ladder of LADDERS) {
  assert.deepEqual(Object.keys(initial.bots[ladder]).sort(), BOTS.map((bot) => bot.id).sort(), "every ladder has the unchanged complete bot roster");
  for (const bot of BOTS) {
    const standing = initial.bots[ladder][bot.id];
    assert.equal(standing.trophies, botTrophies(bot, ladder, initial.lastDay), "initial trophies match leaderboard seed");
    assert.equal(standing.mmr, standing.trophies);
    assert.equal(standing.matches, 0, "creation never invents past matches");
  }
}
assert.deepEqual(createBotRanking(20_000), initial, "same seed day is deterministic");

// A real settlement only changes its own bot and ladder, uses a win's positive margin, and is non-zero-sum.
const botId = "bot-bronze-0";
const before = initial.bots.mapas[botId];
const immutableInput = deepFreeze(clone(initial));
const immutableSnapshot = JSON.stringify(immutableInput);
const won = settleBotMatch(immutableInput, {
  ladder: "mapas", botId, opponentMmr: before.mmr, outcome: "win", margin: 8,
});
const winDelta = trophyChange({
  trophies: before.trophies, mmr: before.mmr, streak: before.streak,
  outcome: "win", margin: 8, lead: 0,
}).delta;
const opponentLossDelta = trophyChange({
  trophies: before.trophies, mmr: before.mmr, streak: before.streak,
  outcome: "loss", margin: -8, lead: 0,
}).delta;
assert.equal(won.bots.mapas[botId].trophies, before.trophies + winDelta);
assert.notEqual(winDelta, -opponentLossDelta, "bot economy uses its own result delta, not an inverse player delta");
assert.equal(won.bots.mapas[botId].streak, 1);
assert.ok(won.bots.mapas[botId].sigma < before.sigma, "sigma settles after a match");
assert.equal(won.bots.mapas[botId].samples.length, 1);
assert.deepEqual(won.bots.bandeiras, immutableInput.bots.bandeiras, "other ladder stays independent");
assert.deepEqual(won.bots.mapas["bot-bronze-1"], immutableInput.bots.mapas["bot-bronze-1"], "other bot stays independent");
assert.equal(won.revision, 1, "one real settlement is one revision");
assert.equal(JSON.stringify(immutableInput), immutableSnapshot, "settlement does not mutate input");
const wonAgain = settleBotMatch(won, { ladder: "mapas", botId, opponentMmr: 500, outcome: "win", margin: 2 });
assert.equal(wonAgain.bots.mapas[botId].streak, 2);
const drew = settleBotMatch(wonAgain, { ladder: "mapas", botId, opponentMmr: 500, outcome: "draw", margin: -2 });
assert.equal(drew.bots.mapas[botId].streak, 0, "draw resets the win streak");
assert.equal(drew.revision, 3);

// A tie must behave identically with the margin reversed; non-tie sides get opposite margins.
const tieForward = settleBotMatch(initial, { ladder: "mapas", botId, opponentMmr: 700, outcome: "draw", margin: 5 });
const tieReversed = settleBotMatch(initial, { ladder: "mapas", botId, opponentMmr: 700, outcome: "draw", margin: -5 });
assert.deepEqual(tieForward.bots.mapas[botId], tieReversed.bots.mapas[botId]);
const pairA = "bot-bronze-0";
const pairB = "bot-bronze-1";
let pairStart = withStanding(initial, "mapas", pairA, { mmr: 800, trophies: 800, sigma: 240 });
pairStart = withStanding(pairStart, "mapas", pairB, { mmr: 1_200, trophies: 1_200, sigma: 230 });
const pairAStart = pairStart.bots.mapas[pairA];
const pairBStart = pairStart.bots.mapas[pairB];
const pairAfterA = settleBotMatch(pairStart, { ladder: "mapas", botId: pairA, opponentMmr: pairBStart.mmr, outcome: "win", margin: 4 });
const pairAfterBoth = settleBotMatch(pairAfterA, { ladder: "mapas", botId: pairB, opponentMmr: pairAStart.mmr, outcome: "loss", margin: -4 });
assert.equal(pairAfterBoth.bots.mapas[pairA].mmr, Math.max(0, pairAStart.mmr + mmrChange(pairAStart.mmr, pairBStart.mmr, "win", 4, pairAStart.sigma)));
assert.equal(pairAfterBoth.bots.mapas[pairB].mmr, Math.max(0, pairBStart.mmr + mmrChange(pairBStart.mmr, pairAStart.mmr, "loss", -4, pairBStart.sigma)));
assert.equal(pairAfterBoth.bots.mapas[pairA].samples[0].expected, expectedScore(pairAStart.mmr, pairBStart.mmr));
assert.equal(pairAfterBoth.bots.mapas[pairB].samples[0].expected, expectedScore(pairBStart.mmr, pairAStart.mmr), "both sides use pre-match MMR snapshots");

// Losses cannot cross either currency floor; surprise can raise sigma and losses/draws reset streak.
let floorState = withStanding(initial, "mapas", botId, {
  trophies: 0, mmr: 0, sigma: SIGMA_MIN, streak: 0, samples: [], matches: 0,
});
floorState = settleBotMatch(floorState, { ladder: "mapas", botId, opponentMmr: 3_000, outcome: "loss", margin: -10 });
assert.equal(floorState.bots.mapas[botId].trophies, 0);
assert.equal(floorState.bots.mapas[botId].mmr, 0);
let surpriseState = withStanding(initial, "mapas", botId, {
  trophies: 0, mmr: 0, sigma: 250, streak: 0, samples: [], matches: 0,
});
for (let index = 0; index < 3; index += 1) {
  surpriseState = settleBotMatch(surpriseState, { ladder: "mapas", botId, opponentMmr: 3_000, outcome: "win", margin: 8 });
}
assert.ok(surpriseState.bots.mapas[botId].sigma > 250 * 0.93 ** 2, "surprising results push sigma back up");
assert.equal(surpriseState.bots.mapas[botId].streak, 3);

// O dia de ranking (desde 19/10/2026): pares de vizinhos de força (MMR com um pouco de sorte) e o resultado de um duelo de verdade bot × bot.
const dailyBase = createBotRanking(30_000);
let varied = clone(dailyBase);
for (const [index, bot] of BOTS.entries()) {
  varied.bots.mapas[bot.id].mmr = 700 + index * 22;
  varied.bots.mapas[bot.id].trophies = 700 + index * 22;
}
const day = 30_001;
const pairRandom = mulberry32(hashSeed(`bot-ranking:pairs:mapas:${day}`));
const ordered = BOTS.map((bot) => ({ id: bot.id, key: varied.bots.mapas[bot.id].mmr + (pairRandom() - 0.5) * PAIR_JITTER }))
  .sort((a, b) => a.key - b.key || a.id.localeCompare(b.id));
const expectedPairs = [];
for (let index = Math.floor(pairRandom() * 2); index + 1 < ordered.length; index += 2) expectedPairs.push([ordered[index].id, ordered[index + 1].id]);
assert.equal(expectedPairs.length, Math.floor(BOTS.length / 2));
for (const [first, second] of expectedPairs) {
  assert.ok(Math.abs(varied.bots.mapas[first].mmr - varied.bots.mapas[second].mmr) <= PAIR_JITTER + 22 * 2, "os pares são vizinhos de força");
}
const expectedOpponent = new Map();
const expectedResult = new Map();
for (const [first, second] of expectedPairs) {
  expectedOpponent.set(first, second);
  expectedOpponent.set(second, first);
  const result = botVersusBot(BOTS.find((bot) => bot.id === first), BOTS.find((bot) => bot.id === second), "mapas", `bot-ranking:mapas:${day}:${first}:${second}`);
  expectedResult.set(first, result);
  expectedResult.set(second, { outcome: result.outcome === "win" ? "loss" : result.outcome === "loss" ? "win" : "draw", margin: -result.margin });
}
const daily = advanceBotRanking(deepFreeze(clone(varied)), day);
assert.equal(daily.revision, varied.revision + 1, "a whole simulated day advances the snapshot once, not once per side");
// com um número ímpar de bots (35, desde o Grão-Mestre) um deles descansa no dia; o sorteio muda quem
const resting = BOTS.filter((bot) => !expectedOpponent.has(bot.id));
assert.equal(resting.length, BOTS.length % 2, "só sobra quem não tem par: nenhum com número par de bots, um com ímpar");
for (const bot of resting) assert.deepEqual(daily.bots.mapas[bot.id], varied.bots.mapas[bot.id], "quem descansa fica como estava");
for (const bot of BOTS) {
  const original = varied.bots.mapas[bot.id];
  const opponentId = expectedOpponent.get(bot.id);
  if (!opponentId) continue;
  const opponent = varied.bots.mapas[opponentId];
  const { outcome, margin } = expectedResult.get(bot.id);
  assert.equal(daily.bots.mapas[bot.id].matches, 1, "each bot plays exactly once on each day");
  assert.equal(daily.bots.mapas[bot.id].samples[0].expected, expectedScore(original.mmr, opponent.mmr));
  assert.equal(
    daily.bots.mapas[bot.id].mmr,
    Math.max(0, original.mmr + mmrChange(original.mmr, opponent.mmr, outcome, margin, original.sigma)),
    "each side settles against the opponent's pre-match MMR snapshot",
  );
}

// O duelo bot × bot usa as estatísticas: o Grão-Mestre bate o Bronze quase sempre; a Lúcia (precisa e lenta) fica parelha com o Ptolomeu
const byId = (id) => BOTS.find((bot) => bot.id === id);
let gmWins = 0, luciaWins = 0, luciaLosses = 0;
for (let index = 0; index < 400; index += 1) {
  if (botVersusBot(byId("bot-grao-mestre-0"), byId("bot-bronze-0"), "bandeiras", `teste:${index}`).outcome === "win") gmWins += 1;
  const result = botVersusBot(byId("bot-mestre-1"), byId("bot-mestre-0"), "mapas", `teste:${index}`);
  if (result.outcome === "win") luciaWins += 1; else if (result.outcome === "loss") luciaLosses += 1;
}
assert.ok(gmWins >= 390, `o Grão-Mestre vence o Bronze quase sempre (${gmWins}/400)`);
assert.ok(luciaWins >= 0.4 * (luciaWins + luciaLosses), `ser precisa e lenta não deixa a Lúcia para trás do Ptolomeu (${luciaWins} × ${luciaLosses}): ela ganha no acerto, ele no relógio`);
assert.deepEqual(botVersusBot(byId("bot-ouro-1"), byId("bot-ouro-2"), "mapas", "x"), botVersusBot(byId("bot-ouro-1"), byId("bot-ouro-2"), "mapas", "x"), "mesma semente, mesmo duelo");

// Recalibração: um estado de antes (sem `calibration`) passa um ano de duelos bot × bot, uma vez, sem mudar o dia
const raw = createBotRanking(50_000);
assert.ok(needsCalibration(raw), "estado novo ou de antes pede calibração");
const calibrated = calibrateBotRanking(raw);
assert.equal(calibrated.calibration, BOT_RANKING_CALIBRATION);
assert.ok(!needsCalibration(calibrated));
assert.equal(calibrated.lastDay, raw.lastDay, "o dia do estado não muda");
assert.equal(calibrated.revision, raw.revision + 1, "a revisão sobe uma vez");
assert.deepEqual(calibrateBotRanking(raw), calibrated, "determinística");
assert.deepEqual(parseBotRanking(clone(calibrated)), calibrated, "a calibração sobrevive à leitura");
const mean = (ids) => ids.reduce((sum, id) => sum + calibrated.bots.bandeiras[id].trophies, 0) / ids.length;
const leagueIds = (league) => BOTS.filter((bot) => bot.league === league).map((bot) => bot.id);
assert.ok(mean(leagueIds("grao-mestre")) > mean(leagueIds("mestre")) && mean(leagueIds("mestre")) > mean(leagueIds("diamante")) && mean(leagueIds("ouro")) > mean(leagueIds("bronze")), "depois de calibrar, a média de cada liga segue a ordem das ligas");
assert.ok(BOTS.every((bot) => calibrated.bots.mapas[bot.id].trophies > 0 || bot.league === "bronze"), "ninguém acima do Bronze afunda a zero (as faixas de 6 faziam isso)");

// Daily simulation is deterministic; catch-up is the same chronological sequence as one-day advances.
const deterministicDaily = advanceBotRanking(varied, day);
assert.deepEqual(deterministicDaily, daily);
const startCatchup = createBotRanking(40_000);
const caughtUp = advanceBotRanking(startCatchup, 40_004);
let stepped = startCatchup;
for (let current = 40_001; current <= 40_004; current += 1) stepped = advanceBotRanking(stepped, current);
assert.deepEqual(caughtUp, stepped, "catch-up equals advancing one UTC day at a time");
assert.equal(caughtUp.revision, 4);
assert.equal(caughtUp.lastDay, 40_004);
assert.equal(advanceBotRanking(caughtUp, caughtUp.lastDay), caughtUp, "replaying the current day is a no-op");
assert.equal(advanceBotRanking(caughtUp, caughtUp.lastDay - 1), caughtUp, "backwards clock does not destroy or rewrite state");
assert.throws(() => advanceBotRanking(caughtUp, -1), /day.*integer/i);
assert.throws(() => parseBotRanking({ ...initial, lastDay: -1 }), /lastDay/);

// Excessive catch-up fails before doing any work; it never silently skips required history.
const tooFarInput = deepFreeze(clone(caughtUp));
const tooFarSnapshot = JSON.stringify(tooFarInput);
assert.throws(
  () => advanceBotRanking(tooFarInput, tooFarInput.lastDay + MAX_SIMULATION_DAYS + 1),
  /catch-up exceeds/i,
);
assert.equal(JSON.stringify(tooFarInput), tooFarSnapshot);
assert.equal(tooFarInput.lastDay, caughtUp.lastDay, "a rejected catch-up leaves the original day untouched");
assert.equal(tooFarInput.revision, caughtUp.revision, "a rejected catch-up does not skip or record history");

// The two ladders evolve independently even when one ladder starts with very different data.
const baseLadders = createBotRanking(50_000);
const changedMaps = withStanding(baseLadders, "mapas", botId, { mmr: 2_500, trophies: 2_500 });
const normalAdvance = advanceBotRanking(baseLadders, 50_001);
const isolatedAdvance = advanceBotRanking(changedMaps, 50_001);
assert.deepEqual(isolatedAdvance.bots.bandeiras, normalAdvance.bots.bandeiras);
assert.notDeepEqual(isolatedAdvance.bots.mapas, normalAdvance.bots.mapas);

// A persisted leaderboard snapshot wins over seed-day bases, regardless of the current day.
const persistedTrophies = 1_234;
const persistedBotRanking = withStanding(createBotRanking(60_000), "mapas", botId, {
  trophies: persistedTrophies, mmr: 2_145, sigma: 87,
});
const persistedSnapshotBefore = JSON.stringify(persistedBotRanking);
const rankAtEarlierDay = leaderboard("mapas", 950, 60_000, persistedBotRanking);
const rankAtLaterDay = leaderboard("mapas", 950, 80_000, persistedBotRanking);
const savedBotRow = rankAtEarlierDay.find((row) => row.id === botId);
assert.equal(savedBotRow.trophies, persistedTrophies);
assert.deepEqual(
  rankAtEarlierDay.filter((row) => row.bot).map(({ id, trophies, league }) => ({ id, trophies, league })),
  rankAtLaterDay.filter((row) => row.bot).map(({ id, trophies, league }) => ({ id, trophies, league })),
  "changing the display day does not recalculate persisted bot trophies or league",
);
assert.deepEqual(rankAtLaterDay.find((row) => row.you), rankAtEarlierDay.find((row) => row.you));
const humans = [{ name: "Remote rival", trophies: 1_800, you: false, code: "RIVAL42" }];
const globalAtEarlierDay = globalLeaderboard("mapas", humans, 950, 60_000, persistedBotRanking);
const globalAtLaterDay = globalLeaderboard("mapas", humans, 950, 80_000, persistedBotRanking);
const humanRows = (rows) => rows.filter((row) => !row.bot).map(({ id, name, trophies, you, code }) => ({ id, name, trophies, you, code }));
assert.deepEqual(humanRows(globalAtEarlierDay), humanRows(globalAtLaterDay), "global leaderboard preserves human rows across day changes");
assert.deepEqual(humanRows(globalAtEarlierDay), [
  { id: "player:RIVAL42", name: "Remote rival", trophies: 1_800, you: false, code: "RIVAL42" },
  { id: "you", name: "", trophies: 950, you: true, code: undefined },
]);
assert.equal(JSON.stringify(persistedBotRanking), persistedSnapshotBefore, "leaderboard reads but never mutates the stored economy, including MMR/sigma");

// Persistence parsing is strict and preserves a complete validated snapshot.
assert.deepEqual(parseBotRanking(initial), initial);
assert.throws(() => parseBotRanking(null), /object/);
assert.throws(() => parseBotRanking({ ...initial, id: "wrong" }), /id/);
assert.throws(() => parseBotRanking({ ...initial, revision: -1 }), /revision/);
assert.throws(() => parseBotRanking({ ...initial, lastDay: 1.5 }), /lastDay/);
const missingLadder = clone(initial);
delete missingLadder.bots.mapas;
assert.throws(() => parseBotRanking(missingLadder), /ladders/);
// bot que chegou depois no elenco (os do Grão-Mestre) entra semeado ao ler um estado antigo; bot desconhecido continua sendo erro
const missingBot = clone(initial);
delete missingBot.bots.mapas[botId];
const seeded = parseBotRanking(missingBot);
assert.deepEqual(Object.keys(seeded.bots.mapas).sort(), BOTS.map((bot) => bot.id).sort(), "o bot que faltava volta ao elenco");
assert.equal(seeded.bots.mapas[botId].matches, 0, "sem histórico inventado");
assert.equal(seeded.bots.mapas[botId].trophies, initial.bots.mapas[botId].trophies, "com os troféus iniciais do dia do estado");
const extraBot = clone(initial);
extraBot.bots.bandeiras["bot-added"] = clone(extraBot.bots.bandeiras[botId]);
assert.throws(() => parseBotRanking(extraBot), /roster/);
const invalidStanding = clone(initial);
invalidStanding.bots.mapas[botId].samples = [{ score: 2, expected: 0.5 }];
assert.throws(() => parseBotRanking(invalidStanding), /samples/);

console.log("bot ranking: persistence, independent economy, deterministic daily simulation and revisions verified");