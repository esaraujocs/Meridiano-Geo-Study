import assert from "node:assert/strict";
import {
  BOT_RANKING_ID,
  MAX_SIMULATION_DAYS,
  advanceBotRanking,
  createBotRanking,
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

// Independently derive the daily local-band pairs to verify exactly one match per bot and both pre-match snapshots.
const dailyBase = createBotRanking(30_000);
let varied = clone(dailyBase);
for (const [index, bot] of BOTS.entries()) {
  varied.bots.mapas[bot.id].mmr = 700 + index * 22;
  varied.bots.mapas[bot.id].trophies = 700 + index * 22;
}
const day = 30_001;
const ordered = BOTS.map((bot) => ({ id: bot.id, mmr: varied.bots.mapas[bot.id].mmr }))
  .sort((a, b) => a.mmr - b.mmr || a.id.localeCompare(b.id));
const pairRandom = mulberry32(hashSeed(`bot-ranking:pairs:mapas:${day}`));
const expectedPairs = [];
for (let start = 0; start < ordered.length; start += 6) {
  const band = ordered.slice(start, start + 6);
  for (let index = band.length - 1; index > 0; index -= 1) {
    const other = Math.floor(pairRandom() * (index + 1));
    [band[index], band[other]] = [band[other], band[index]];
  }
  for (let index = 0; index + 1 < band.length; index += 2) expectedPairs.push([band[index].id, band[index + 1].id]);
}
const expectedOpponent = new Map();
for (const [first, second] of expectedPairs) {
  expectedOpponent.set(first, second);
  expectedOpponent.set(second, first);
}
const expectedScores = Object.fromEntries(BOTS.map((bot) => [
  bot.id,
  varied.bots.mapas[bot.id].mmr + (mulberry32(hashSeed(`bot-ranking:score:mapas:${day}:${bot.id}`))() - 0.5) * 360,
]));
const daily = advanceBotRanking(deepFreeze(clone(varied)), day);
assert.equal(daily.revision, varied.revision + 1, "a whole simulated day advances the snapshot once, not once per side");
for (const bot of BOTS) {
  const original = varied.bots.mapas[bot.id];
  const opponentId = expectedOpponent.get(bot.id);
  assert.ok(opponentId);
  const opponent = varied.bots.mapas[opponentId];
  const scoreMargin = expectedScores[bot.id] - expectedScores[opponentId];
  const margin = scoreMargin === 0 ? 0 : Math.max(1, Math.min(10, Math.round(Math.abs(scoreMargin) / 36))) * Math.sign(scoreMargin);
  const outcome = scoreMargin > 0 ? "win" : scoreMargin < 0 ? "loss" : "draw";
  assert.equal(daily.bots.mapas[bot.id].matches, 1, "each bot plays exactly once on each day");
  assert.equal(daily.bots.mapas[bot.id].samples[0].expected, expectedScore(original.mmr, opponent.mmr));
  assert.equal(
    daily.bots.mapas[bot.id].mmr,
    Math.max(0, original.mmr + mmrChange(original.mmr, opponent.mmr, outcome, margin, original.sigma)),
    "each side settles against the opponent's pre-match MMR snapshot",
  );
}

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
const missingBot = clone(initial);
delete missingBot.bots.mapas[botId];
assert.throws(() => parseBotRanking(missingBot), /roster/);
const extraBot = clone(initial);
extraBot.bots.bandeiras["bot-added"] = clone(extraBot.bots.bandeiras[botId]);
assert.throws(() => parseBotRanking(extraBot), /roster/);
const invalidStanding = clone(initial);
invalidStanding.bots.mapas[botId].samples = [{ score: 2, expected: 0.5 }];
assert.throws(() => parseBotRanking(invalidStanding), /samples/);

console.log("bot ranking: persistence, independent economy, deterministic daily simulation and revisions verified");