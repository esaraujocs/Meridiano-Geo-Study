// Duelo contra bots: a pessoa joga a partida de sempre; o bot "joga" o mesmo número de rodadas (ver bots.ts) e o placar decide.
// Quem acertar mais vence; empatou nos acertos, o menor tempo total desempata. Os troféus seguem uma conta tipo Elo.
import { LEAGUES, LEAGUE_SPAN, leagueFloor, type LeagueKey } from "./league.js";
import { simulateBot, type Bot, type BotContext, type BotStyle, type BotFamily } from "./bots.js";
import type { Milestone } from "./duel-rewards.js";

/** Duelo tem formato único: 20 rodadas (o corte de 20 já existe na Loja e é exigido para duelar). */
export const DUEL_ROUNDS = 20;

/** Nota do bot na conta de troféus: o meio da faixa da liga dele. */
export const botRating = (bot: Pick<Bot, "league">) => leagueFloor(LEAGUES.indexOf(bot.league)) + LEAGUE_SPAN / 2;

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
  /** Divisão e família jogada: mudam a força do bot (ver `botProfile`). */
  context?: BotContext;
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

export function resolveDuel({ trophies, bot, playerCorrect, playerTotal, playerMs, seed, context }: DuelInput): DuelResult {
  const { correct: botCorrect, totalMs: botMs } = simulateBot(bot, playerTotal, seed, context);
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
  botName: string;
  botLeague: LeagueKey;
  botStyle: BotStyle;
  botSpecialty: BotFamily | null;
  outcome: DuelOutcome;
  tiebreak: boolean;
  playerCorrect: number;
  botCorrect: number;
  total: number;
  delta: number;
  trophiesBefore: number;
  trophiesAfter: number;
  /** Marcos que este duelo abriu (moedas já creditadas). */
  milestones: readonly Milestone[];
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
