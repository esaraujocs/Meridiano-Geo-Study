// Duelo contra bots: a pessoa joga a partida de sempre; o bot "joga" o mesmo número de rodadas (ver bots.ts) e o placar decide.
// Quem acertar mais vence; empatou nos acertos, o menor tempo total desempata. Os troféus seguem uma conta tipo Elo.
// O duelo v2 tem 2 tempos de 10 rodadas (ver duel-modes.ts) e troféus por escada (Mapas e Bandeiras).
import { LEAGUES, LEAGUE_SPAN, leagueFloor, type LeagueKey } from "./league.js";
import { simulateBot, type Bot, type BotContext, type BotStyle, type BotFamily } from "./bots.js";
import type { Milestone } from "./duel-rewards.js";
import { LADDERS, groupDef, isLadder, ladderForFamily, type Ladder, type ModeGroup } from "./duel-modes.js";

/** Duelo v1 (uma partida só, 20 rodadas). O v2 usa LEGS x LEG_ROUNDS de duel-modes.ts. */
export const DUEL_ROUNDS = 20;

/** Nota do bot na conta de troféus: o meio da faixa da liga dele. */
export const botRating = (bot: Pick<Bot, "league">) => leagueFloor(LEAGUES.indexOf(bot.league)) + LEAGUE_SPAN / 2;

export type DuelOutcome = "win" | "loss" | "draw";
export const TROPHY_K = 32;
/** Vitória sempre rende ao menos isto, e derrota tira ao menos isto (sem chegar a zero de tanto contar). */
export const MIN_SWING = 4;

/** Sequência: cada vitória seguida que a pessoa já tinha na escada soma STREAK_STEP troféus à próxima vitória, até STREAK_CAP vitórias
 *  (+12). Perder zera a sequência; o bônus só existe na vitória, a derrota não muda. */
export const STREAK_STEP = 3;
export const STREAK_CAP = 4;
export const streakBonus = (streak: number) => STREAK_STEP * Math.min(STREAK_CAP, Math.max(0, Math.floor(Number.isFinite(streak) ? streak : 0)));

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
  /** Vitórias seguidas que a pessoa já tinha nesta escada antes do duelo. */
  streak?: number;
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
  /** Quanto do ganho veio da sequência de vitórias (já dentro de `delta`). */
  streakBonus: number;
};

/** Vencedor e troféus a partir dos números finais (a mesma conta para 1 tempo ou 2). */
function settle(input: { trophies: number; bot: Bot; playerCorrect: number; botCorrect: number; playerMs: number | null; botMs: number; streak?: number }) {
  const { trophies, bot, playerCorrect, botCorrect, playerMs, botMs } = input;
  let outcome: DuelOutcome = playerCorrect > botCorrect ? "win" : playerCorrect < botCorrect ? "loss" : "draw";
  let tiebreak = false;
  if (outcome === "draw" && playerMs !== null && playerMs !== botMs) {
    outcome = playerMs < botMs ? "win" : "loss";
    tiebreak = true;
  }
  const score = outcome === "win" ? 1 : outcome === "loss" ? 0 : 0.5;
  let delta = Math.round(TROPHY_K * (score - expectedScore(trophies, botRating(bot))));
  const bonus = outcome === "win" ? streakBonus(input.streak ?? 0) : 0;
  if (outcome === "win") delta = Math.max(MIN_SWING, delta) + bonus;
  if (outcome === "loss") delta = Math.min(-MIN_SWING, delta);
  const trophiesAfter = Math.max(0, trophies + delta);
  return { outcome, tiebreak, delta: trophiesAfter - Math.max(0, trophies), trophiesAfter, streakBonus: bonus };
}

/** O que está em jogo antes do duelo: troféus se vencer e se perder (com os pisos de MIN_SWING e o chão em zero). */
export function previewStakes(trophies: number, bot: Pick<Bot, "league">, streak = 0) {
  const expected = expectedScore(trophies, botRating(bot));
  const win = Math.max(MIN_SWING, Math.round(TROPHY_K * (1 - expected))) + streakBonus(streak);
  const loss = Math.min(-MIN_SWING, Math.round(TROPHY_K * (0 - expected)));
  return { win: Math.max(0, trophies + win) - Math.max(0, trophies), loss: Math.max(0, trophies + loss) - Math.max(0, trophies) };
}

export function resolveDuel({ trophies, bot, playerCorrect, playerTotal, playerMs, seed, context, streak }: DuelInput): DuelResult {
  const { correct: botCorrect, totalMs: botMs } = simulateBot(bot, playerTotal, seed, context);
  return { botId: bot.id, botCorrect, botMs, ...settle({ trophies, bot, playerCorrect, botCorrect, playerMs, botMs, streak }) };
}

// ---- Duelo em dois tempos ----
export type LegInput = { group: ModeGroup; rounds: number; playerCorrect: number; playerMs: number | null };
export type LegResult = { group: ModeGroup; rounds: number; playerCorrect: number; botCorrect: number; botMs: number };
export type DuelLegsInput = {
  trophies: number;
  bot: Bot;
  legs: readonly LegInput[];
  seed: string;
  /** Divisão da pessoa na liga da escada (a força do bot acompanha). */
  division: 1 | 2 | 3 | null;
  /** Vitórias seguidas que a pessoa já tinha nesta escada (bônus de sequência). */
  streak?: number;
};
export type DuelLegsResult = DuelResult & { legs: LegResult[]; playerCorrect: number; total: number };

/** Cada tempo tem o próprio sorteio do bot, ajustado à dificuldade do modo; o placar soma os tempos. */
export function resolveDuelLegs({ trophies, bot, legs, seed, division, streak }: DuelLegsInput): DuelLegsResult {
  const results: LegResult[] = legs.map((leg, index) => {
    const def = groupDef(leg.group);
    const { correct, totalMs } = simulateBot(bot, leg.rounds, `${seed}:${index}`, { division, family: def.botFamily, tuning: { accuracy: def.accuracy, time: def.time } });
    return { group: leg.group, rounds: leg.rounds, playerCorrect: leg.playerCorrect, botCorrect: correct, botMs: totalMs };
  });
  const playerCorrect = results.reduce((sum, leg) => sum + leg.playerCorrect, 0);
  const botCorrect = results.reduce((sum, leg) => sum + leg.botCorrect, 0);
  const botMs = results.reduce((sum, leg) => sum + leg.botMs, 0);
  const playerMs = legs.every((leg) => leg.playerMs !== null) ? legs.reduce((sum, leg) => sum + (leg.playerMs as number), 0) : null;
  return { botId: bot.id, botCorrect, botMs, legs: results, playerCorrect, total: results.reduce((sum, leg) => sum + leg.rounds, 0), ...settle({ trophies, bot, playerCorrect, botCorrect, playerMs, botMs, streak }) };
}

// ---- Registro dos duelos (um por duelo, guardado na loja `preferences`) ----
export const DUEL_ID_PREFIX = "duel:";
export const DUEL_SOURCE = "duel-v1";

export type DuelLegRecord = { group: ModeGroup; playerCorrect: number; botCorrect: number; total: number };
export type DuelRecord = {
  id: string;
  sessionId: string;
  at: number;
  botId: string;
  /** Escada do duelo (Mapas ou Bandeiras). Registros antigos não tinham: vem da família jogada. */
  ladder: Ladder;
  family: string;
  variant: string;
  playerCorrect: number;
  total: number;
  botCorrect: number;
  outcome: DuelOutcome;
  tiebreak: boolean;
  delta: number;
  /** Só no duelo em dois tempos. */
  legs?: DuelLegRecord[];
};

export const duelRecordId = (sessionId: string) => `${DUEL_ID_PREFIX}${sessionId}`;

const parseLegs = (value: unknown): DuelLegRecord[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const legs = value.filter((leg): leg is DuelLegRecord =>
    Boolean(leg) && typeof leg.group === "string" && [leg.playerCorrect, leg.botCorrect, leg.total].every((n) => typeof n === "number" && Number.isFinite(n)));
  return legs.length === value.length && legs.length > 0 ? legs : undefined;
};

export function parseDuel(row: unknown): DuelRecord | null {
  const item = row as Partial<DuelRecord> | null;
  if (!item || typeof item.id !== "string" || !item.id.startsWith(DUEL_ID_PREFIX)) return null;
  if (typeof item.sessionId !== "string" || typeof item.at !== "number" || typeof item.botId !== "string") return null;
  if (item.outcome !== "win" && item.outcome !== "loss" && item.outcome !== "draw") return null;
  const numbers = [item.playerCorrect, item.total, item.botCorrect, item.delta];
  if (numbers.some((value) => typeof value !== "number" || !Number.isFinite(value))) return null;
  const family = String(item.family ?? "");
  const variant = String(item.variant ?? "");
  const legs = parseLegs(item.legs);
  return {
    id: item.id,
    sessionId: item.sessionId,
    at: item.at,
    botId: item.botId,
    ladder: isLadder(item.ladder) ? item.ladder : ladderForFamily(family, variant),
    family,
    variant,
    playerCorrect: item.playerCorrect as number,
    total: item.total as number,
    botCorrect: item.botCorrect as number,
    outcome: item.outcome,
    tiebreak: Boolean(item.tiebreak),
    delta: item.delta as number,
    ...(legs ? { legs } : {}),
  };
}

/** Os troféus são derivados do histórico (como XP e maestria): refaz a conta na ordem dos duelos, sem passar de zero.
 * Com `ladder`, conta só os duelos daquela escada. */
export function trophiesFromDuels(duels: readonly Pick<DuelRecord, "at" | "delta" | "id" | "ladder">[], ladder?: Ladder) {
  return [...duels]
    .filter((duel) => !ladder || duel.ladder === ladder)
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1))
    .reduce((total, duel) => Math.max(0, total + duel.delta), 0);
}
export const trophiesByLadder = (duels: readonly Pick<DuelRecord, "at" | "delta" | "id" | "ladder">[]): Record<Ladder, number> =>
  Object.fromEntries(LADDERS.map((ladder) => [ladder, trophiesFromDuels(duels, ladder)])) as Record<Ladder, number>;

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
  ladder?: Ladder;
  legs?: readonly DuelLegRecord[];
  /** Vitórias seguidas na escada antes e depois deste duelo. */
  streakBefore: number;
  streakAfter: number;
  /** Troféus que a sequência de vitórias acrescentou a este ganho. */
  streakBonus: number;
  /** A pessoa saiu antes de terminar os dois tempos. */
  abandoned: boolean;
  /** Moedas de cada tempo (sem o bônus de partida completa) e se o tempo foi de prévia (paga como o modo base). Só na tela, não é gravado. */
  legCoins?: readonly number[];
  legPreview?: readonly boolean[];
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
