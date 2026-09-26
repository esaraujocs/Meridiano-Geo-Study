// Duelo contra bots: cada bot acerta uma fração fixa das perguntas (por liga), sorteada com semente para ser reproduzível.
// A pessoa joga a partida de sempre; o bot "joga" o mesmo número de rodadas e o placar decide vitória, empate ou derrota.
// Quem acertar mais vence; empatou nos acertos, o menor tempo total desempata. Os troféus seguem uma conta tipo Elo.
import { LEAGUES, LEAGUE_SPAN, leagueFloor, type LeagueKey } from "./league.js";

export type Bot = {
  id: string;
  league: LeagueKey;
  /** Chance de acerto em cada pergunta (0 a 1). */
  accuracy: number;
  /** Tempo médio por pergunta, em ms. */
  avgMs: number;
};

const BOT_STATS: Record<LeagueKey, { accuracy: number; avgMs: number }> = {
  bronze: { accuracy: 0.6, avgMs: 9000 },
  prata: { accuracy: 0.68, avgMs: 7800 },
  ouro: { accuracy: 0.76, avgMs: 6600 },
  platina: { accuracy: 0.84, avgMs: 5600 },
  diamante: { accuracy: 0.91, avgMs: 4600 },
  mestre: { accuracy: 0.96, avgMs: 3800 },
};

export const BOTS: readonly Bot[] = LEAGUES.map((league) => ({ id: `bot-${league}`, league, ...BOT_STATS[league] }));
export const botForLeague = (league: LeagueKey): Bot => BOTS[LEAGUES.indexOf(league)];

/** Nota do bot na conta de troféus: o meio da faixa da liga dele. */
export const botRating = (bot: Bot) => leagueFloor(LEAGUES.indexOf(bot.league)) + LEAGUE_SPAN / 2;

export function hashSeed(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateBot(bot: Bot, rounds: number, seed: string) {
  const random = mulberry32(hashSeed(`${bot.id}:${seed}`));
  let correct = 0;
  let totalMs = 0;
  for (let round = 0; round < rounds; round += 1) {
    if (random() < bot.accuracy) correct += 1;
    totalMs += Math.round(bot.avgMs * (0.7 + random() * 0.6));
  }
  return { correct, totalMs };
}

export type DuelOutcome = "win" | "loss" | "draw";
export const TROPHY_K = 32;
/** Vitória sempre rende ao menos isto, e derrota tira ao menos isto (sem chegar a zero de tanto contar). */
export const MIN_SWING = 4;

export const expectedScore = (rating: number, opponent: number) => 1 / (1 + Math.pow(10, (opponent - rating) / 400));

export type DuelInput = {
  trophies: number;
  bot: Bot;
  playerCorrect: number;
  playerTotal: number;
  /** Tempo total das respostas da pessoa; null se não der para saber (aí o empate fica empate). */
  playerMs: number | null;
  seed: string;
};
export type DuelResult = {
  botId: string;
  botCorrect: number;
  botMs: number;
  outcome: DuelOutcome;
  /** O empate foi resolvido pelo tempo. */
  tiebreak: boolean;
  delta: number;
  trophiesAfter: number;
};

export function resolveDuel({ trophies, bot, playerCorrect, playerTotal, playerMs, seed }: DuelInput): DuelResult {
  const { correct: botCorrect, totalMs: botMs } = simulateBot(bot, playerTotal, seed);
  let outcome: DuelOutcome = playerCorrect > botCorrect ? "win" : playerCorrect < botCorrect ? "loss" : "draw";
  let tiebreak = false;
  if (outcome === "draw" && playerMs !== null && playerMs !== botMs) {
    outcome = playerMs < botMs ? "win" : "loss";
    tiebreak = true;
  }
  const score = outcome === "win" ? 1 : outcome === "loss" ? 0 : 0.5;
  let delta = Math.round(TROPHY_K * (score - expectedScore(trophies, botRating(bot))));
  if (outcome === "win") delta = Math.max(MIN_SWING, delta);
  if (outcome === "loss") delta = Math.min(-MIN_SWING, delta);
  const trophiesAfter = Math.max(0, trophies + delta);
  return { botId: bot.id, botCorrect, botMs, outcome, tiebreak, delta: trophiesAfter - Math.max(0, trophies), trophiesAfter };
}

// ---- Registro dos duelos (um por partida, guardado na loja `preferences`) ----
export const DUEL_ID_PREFIX = "duel:";
export const DUEL_SOURCE = "duel-v1";

export type DuelRecord = {
  id: string;
  sessionId: string;
  at: number;
  botId: string;
  family: string;
  variant: string;
  playerCorrect: number;
  total: number;
  botCorrect: number;
  outcome: DuelOutcome;
  tiebreak: boolean;
  delta: number;
};

export const duelRecordId = (sessionId: string) => `${DUEL_ID_PREFIX}${sessionId}`;

export function parseDuel(row: unknown): DuelRecord | null {
  const item = row as Partial<DuelRecord> | null;
  if (!item || typeof item.id !== "string" || !item.id.startsWith(DUEL_ID_PREFIX)) return null;
  if (typeof item.sessionId !== "string" || typeof item.at !== "number" || typeof item.botId !== "string") return null;
  if (item.outcome !== "win" && item.outcome !== "loss" && item.outcome !== "draw") return null;
  const numbers = [item.playerCorrect, item.total, item.botCorrect, item.delta];
  if (numbers.some((value) => typeof value !== "number" || !Number.isFinite(value))) return null;
  return {
    id: item.id,
    sessionId: item.sessionId,
    at: item.at,
    botId: item.botId,
    family: String(item.family ?? ""),
    variant: String(item.variant ?? ""),
    playerCorrect: item.playerCorrect as number,
    total: item.total as number,
    botCorrect: item.botCorrect as number,
    outcome: item.outcome,
    tiebreak: Boolean(item.tiebreak),
    delta: item.delta as number,
  };
}

/** Os troféus são derivados do histórico (como XP e maestria): refaz a conta na ordem dos duelos, sem passar de zero. */
export function trophiesFromDuels(duels: readonly Pick<DuelRecord, "at" | "delta" | "id">[]) {
  return [...duels]
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1))
    .reduce((total, duel) => Math.max(0, total + duel.delta), 0);
}

/** O que a tela de resultado mostra de um duelo recém-jogado. */
export type DuelView = {
  botLeague: LeagueKey;
  outcome: DuelOutcome;
  tiebreak: boolean;
  playerCorrect: number;
  botCorrect: number;
  total: number;
  delta: number;
  trophiesBefore: number;
  trophiesAfter: number;
};

/** Soma o tempo das respostas; resposta que estourou o tempo sem registro vale o cronômetro inteiro. Sem dado suficiente, null. */
export function playerTotalMs(rounds: readonly { responseTimeMs: number | null; timedOut?: boolean }[], timerSeconds: number | null | undefined) {
  let total = 0;
  for (const round of rounds) {
    if (typeof round.responseTimeMs === "number" && Number.isFinite(round.responseTimeMs)) total += round.responseTimeMs;
    else if (round.timedOut && timerSeconds) total += timerSeconds * 1000;
    else return null;
  }
  return total;
}
