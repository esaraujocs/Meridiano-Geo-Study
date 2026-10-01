// Economia persistente e simulação diária dos bots do ranking. Lógica pura.
import { BOTS, hashSeed, mulberry32, type Bot } from "./bots.js";
import { LEAGUES, leagueFloor } from "./league.js";
import { LADDERS, type Ladder } from "./duel-modes.js";
import {
  SURPRISE_WINDOW,
  SIGMA_MAX,
  SIGMA_MIN,
  SIGMA_START,
  expectedScore,
  leadOf,
  mmrChange,
  outcomeScore,
  sigmaNext,
  trophyChange,
  type SurpriseSample,
} from "./mmr.js";

export const BOT_RANKING_ID = "bot-ranking:v1";
/** Dez anos por atualização: falhar explicitamente em vez de travar por uma data corrompida. */
export const MAX_SIMULATION_DAYS = 3650;

export type BotStanding = {
  trophies: number;
  mmr: number;
  sigma: number;
  streak: number;
  samples: SurpriseSample[];
  matches: number;
};

export type BotRankingState = {
  id: typeof BOT_RANKING_ID;
  version: 1;
  revision: number;
  lastDay: number;
  bots: Record<Ladder, Record<string, BotStanding>>;
};

export type BotMatchInput = {
  ladder: Ladder;
  botId: string;
  opponentMmr: number;
  outcome: "win" | "loss" | "draw";
  margin: number;
};

const BOT_IDS = BOTS.map((bot) => bot.id);
const BOT_ID_SET = new Set(BOT_IDS);
const LADDER_SET = new Set<string>(LADDERS);
const OFFSETS = [70, 170, 260, 350, 440] as const;
const MASTER_OFFSETS = [100, 350, 600, 850, 1100] as const;
const DAILY_SWING = 30;

/**
 * Keep the exact initial seed calculation from leaderboard.botTrophies here
 * rather than importing leaderboard: leaderboard can consume this module
 * without introducing a runtime cycle.
 */
function initialBotTrophies(bot: Bot, ladder: Ladder, day: number) {
  const index = LEAGUES.indexOf(bot.league);
  const slot = Math.max(0, Number(bot.id.split("-").pop()) || 0);
  const offset = (bot.league === "mestre" ? MASTER_OFFSETS : OFFSETS)[Math.min(slot, OFFSETS.length - 1)];
  const swing = (mulberry32(hashSeed(`rank:${bot.id}:${ladder}:${day}`))() - 0.5) * 2 * DAILY_SWING;
  return Math.max(leagueFloor(index) + 5, Math.round(leagueFloor(index) + offset + swing));
}

function validDay(day: number): boolean {
  return Number.isSafeInteger(day) && day >= 0;
}

function assertDay(day: number) {
  if (!validDay(day)) throw new TypeError("Bot ranking day must be a safe integer");
}

function copyStanding(standing: BotStanding): BotStanding {
  return { ...standing, samples: standing.samples.map((sample) => ({ ...sample })) };
}

/** Create a fresh roster seeded on this day; no earlier simulated history is invented. */
export function createBotRanking(day: number): BotRankingState {
  assertDay(day);
  const bots = {} as Record<Ladder, Record<string, BotStanding>>;
  for (const ladder of LADDERS) {
    bots[ladder] = Object.fromEntries(BOTS.map((bot) => {
      const trophies = initialBotTrophies(bot, ladder, day);
      return [bot.id, {
        trophies,
        mmr: trophies,
        sigma: SIGMA_START,
        streak: 0,
        samples: [],
        matches: 0,
      } satisfies BotStanding];
    }));
  }
  return { id: BOT_RANKING_ID, version: 1, revision: 0, lastDay: day, bots };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertStanding(value: unknown, label: string): asserts value is BotStanding {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  const { trophies, mmr, sigma, streak, samples, matches } = value;
  if (!Number.isSafeInteger(trophies) || (trophies as number) < 0) throw new TypeError(`${label}.trophies must be a nonnegative integer`);
  if (!Number.isSafeInteger(mmr) || (mmr as number) < 0) throw new TypeError(`${label}.mmr must be a nonnegative integer`);
  if (typeof sigma !== "number" || !Number.isFinite(sigma) || sigma < SIGMA_MIN || sigma > SIGMA_MAX) {
    throw new TypeError(`${label}.sigma must be between ${SIGMA_MIN} and ${SIGMA_MAX}`);
  }
  if (!Number.isSafeInteger(matches) || (matches as number) < 0) throw new TypeError(`${label}.matches must be a nonnegative integer`);
  if (!Number.isSafeInteger(streak) || (streak as number) < 0 || (streak as number) > (matches as number)) {
    throw new TypeError(`${label}.streak must be a nonnegative integer no greater than matches`);
  }
  if (!Array.isArray(samples) || samples.length > SURPRISE_WINDOW || samples.length > (matches as number)) {
    throw new TypeError(`${label}.samples must be an array of at most ${SURPRISE_WINDOW} recent samples`);
  }
  for (const [index, sample] of samples.entries()) {
    if (!isRecord(sample)
      || typeof sample.score !== "number" || !Number.isFinite(sample.score) || sample.score < 0 || sample.score > 1
      || typeof sample.expected !== "number" || !Number.isFinite(sample.expected) || sample.expected < 0 || sample.expected > 1) {
      throw new TypeError(`${label}.samples[${index}] must have score and expected values between 0 and 1`);
    }
  }
}

/** Strict persistence parser: malformed or roster-incompatible data is an explicit error, never a silent reset. */
export function parseBotRanking(value: unknown): BotRankingState {
  if (!isRecord(value)) throw new TypeError("Bot ranking state must be an object");
  if (value.id !== BOT_RANKING_ID) throw new TypeError(`Bot ranking state id must be ${BOT_RANKING_ID}`);
  if (value.version !== 1) throw new TypeError("Bot ranking state version must be 1");
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) {
    throw new TypeError("Bot ranking revision must be a nonnegative safe integer");
  }
  if (!validDay(value.lastDay as number)) throw new TypeError("Bot ranking lastDay must be a safe integer");
  if (!isRecord(value.bots)) throw new TypeError("Bot ranking bots must be an object");

  const ladderKeys = Object.keys(value.bots);
  if (ladderKeys.length !== LADDERS.length || ladderKeys.some((ladder) => !LADDER_SET.has(ladder))) {
    throw new TypeError("Bot ranking must contain exactly the supported ladders");
  }
  const bots = {} as Record<Ladder, Record<string, BotStanding>>;
  for (const ladder of LADDERS) {
    const ladderBots = value.bots[ladder];
    if (!isRecord(ladderBots)) throw new TypeError(`Bot ranking ${ladder} roster must be an object`);
    const ids = Object.keys(ladderBots);
    if (ids.length !== BOT_IDS.length || ids.some((id) => !BOT_ID_SET.has(id))) {
      throw new TypeError(`Bot ranking ${ladder} roster does not match the current bot roster`);
    }
    const parsed: Record<string, BotStanding> = {};
    for (const botId of BOT_IDS) {
      const standing = ladderBots[botId];
      assertStanding(standing, `bots.${ladder}.${botId}`);
      parsed[botId] = copyStanding(standing);
    }
    bots[ladder] = parsed;
  }
  return {
    id: BOT_RANKING_ID,
    version: 1,
    revision: value.revision as number,
    lastDay: value.lastDay as number,
    bots,
  };
}

/** Settle one side only; opponent values are snapshots supplied by the caller. */
function settleBotMatchCore(state: BotRankingState, input: BotMatchInput): BotRankingState {
  const { ladder, botId, opponentMmr, outcome, margin } = input;
  if (!LADDER_SET.has(ladder)) throw new TypeError("Unknown bot ranking ladder");
  if (!BOT_ID_SET.has(botId) || !state.bots[ladder]?.[botId]) throw new TypeError(`Unknown bot ranking bot: ${botId}`);
  if (!Number.isFinite(opponentMmr) || opponentMmr < 0) throw new TypeError("opponentMmr must be a nonnegative finite number");
  if (outcome !== "win" && outcome !== "loss" && outcome !== "draw") throw new TypeError("Unknown bot match outcome");
  if (!Number.isFinite(margin)) throw new TypeError("margin must be finite");

  const current = state.bots[ladder][botId];
  const beforeMmr = current.mmr;
  const expected = expectedScore(beforeMmr, opponentMmr);
  const sample: SurpriseSample = { score: outcomeScore(outcome), expected };
  const samples = [...current.samples, sample].slice(-SURPRISE_WINDOW);
  const change = trophyChange({
    trophies: current.trophies,
    mmr: beforeMmr,
    streak: current.streak,
    outcome,
    margin,
    lead: leadOf(opponentMmr, current.trophies),
  });
  const next: BotStanding = {
    trophies: Math.max(0, current.trophies + change.delta),
    mmr: Math.max(0, beforeMmr + mmrChange(beforeMmr, opponentMmr, outcome, margin, current.sigma)),
    sigma: sigmaNext(current.sigma, samples),
    streak: outcome === "win" ? current.streak + 1 : 0,
    samples,
    matches: current.matches + 1,
  };
  return {
    ...state,
    bots: {
      ...state.bots,
      [ladder]: { ...state.bots[ladder], [botId]: next },
    },
  };
}

/** A persisted single-match settlement is one atomic ranking revision. */
export function settleBotMatch(state: BotRankingState, input: BotMatchInput): BotRankingState {
  const settled = settleBotMatchCore(state, input);
  return { ...settled, revision: state.revision + 1 };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

/** A balanced local band, shuffled from a seed fixed by ladder and UTC day. */
function dailyPairs(state: BotRankingState, ladder: Ladder, day: number) {
  const ordered = BOT_IDS.map((id) => ({ id, mmr: state.bots[ladder][id].mmr }))
    .sort((a, b) => a.mmr - b.mmr || a.id.localeCompare(b.id));
  const random = mulberry32(hashSeed(`bot-ranking:pairs:${ladder}:${day}`));
  const pairs: [string, string][] = [];
  const bandSize = 6;
  for (let start = 0; start < ordered.length; start += bandSize) {
    const band = shuffle(ordered.slice(start, start + bandSize), random);
    for (let index = 0; index + 1 < band.length; index += 2) pairs.push([band[index].id, band[index + 1].id]);
  }
  return pairs;
}

function dailyPerformanceScore(standing: BotStanding, ladder: Ladder, botId: string, day: number) {
  const random = mulberry32(hashSeed(`bot-ranking:score:${ladder}:${day}:${botId}`));
  // Abstract score, not a generated quiz: current MMR plus deterministic day-specific form.
  return standing.mmr + (random() - 0.5) * 360;
}

function simulateDay(state: BotRankingState, day: number): BotRankingState {
  let next = state;
  for (const ladder of LADDERS) {
    const scores = Object.fromEntries(BOT_IDS.map((botId) => [
      botId,
      dailyPerformanceScore(state.bots[ladder][botId], ladder, botId, day),
    ])) as Record<string, number>;
    for (const [firstId, secondId] of dailyPairs(state, ladder, day)) {
      // Both opponents are rated from the same pre-match snapshot.
      const first = next.bots[ladder][firstId];
      const second = next.bots[ladder][secondId];
      const scoreMargin = scores[firstId] - scores[secondId];
      const margin = scoreMargin === 0 ? 0 : Math.max(1, Math.min(10, Math.round(Math.abs(scoreMargin) / 36))) * Math.sign(scoreMargin);
      const firstOutcome = scoreMargin > 0 ? "win" : scoreMargin < 0 ? "loss" : "draw";
      const secondOutcome = firstOutcome === "win" ? "loss" : firstOutcome === "loss" ? "win" : "draw";
      next = settleBotMatchCore(next, {
        ladder, botId: firstId, opponentMmr: second.mmr, outcome: firstOutcome, margin,
      });
      next = settleBotMatchCore(next, {
        ladder, botId: secondId, opponentMmr: first.mmr, outcome: secondOutcome, margin: -margin,
      });
    }
  }
  return { ...next, revision: state.revision + 1, lastDay: day };
}

/** Advance lazily, simulating every missed UTC day once in chronological order. */
export function advanceBotRanking(state: BotRankingState, day: number): BotRankingState {
  assertDay(day);
  if (day <= state.lastDay) return state;
  if (day - state.lastDay > MAX_SIMULATION_DAYS) {
    throw new RangeError("Bot ranking catch-up exceeds ten years; check the saved date or device clock.");
  }
  let next = state;
  for (let currentDay = state.lastDay + 1; currentDay <= day; currentDay += 1) {
    next = simulateDay(next, currentDay);
  }
  return next;
}