// Duelo contra bots: a pessoa joga a partida de sempre; o bot "joga" o mesmo número de rodadas (ver bots.ts) e o placar decide.
// Quem acertar mais vence; empatou nos acertos, o menor tempo total desempata. Os troféus seguem uma conta tipo Elo.
// O duelo v2 tem 2 tempos de 10 rodadas (ver duel-modes.ts) e troféus por escada (Mapas e Bandeiras).
import { DIVISION_SPAN, LEAGUES, LEAGUE_SPAN, leagueFloor, leagueOf, type LeagueKey } from "./league.js";
import { simulateBot, type Bot, type BotContext, type BotStyle, type BotFamily } from "./bots.js";
import type { Milestone } from "./duel-rewards.js";
import { MIN_LOSS, MIN_WIN, MMR_MODEL, MMR_VALID_MODELS, SIGMA_MIN, leadOf, SURPRISE_WINDOW, expectedScore, mmrChange, outcomeScore, sigmaFromGames, sigmaNext, stakesRange, streakBonus, STREAK_CAP, STREAK_STEP, trophyChange, type SurpriseSample } from "./mmr.js";
import { LADDERS, groupDef, isLadder, ladderForFamily, type Ladder, type ModeGroup } from "./duel-modes.js";

/** Duelo v1 (uma partida só, 20 rodadas). O v2 usa LEGS x LEG_ROUNDS de duel-modes.ts. */
export const DUEL_ROUNDS = 20;

/** Nota do bot na conta do MMR: o meio da divisão em que a pessoa o enfrenta (a força do bot acompanha a divisão) ou, sem divisão, o meio da liga. */
export const botRating = (bot: Pick<Bot, "league">, division: 1 | 2 | 3 | null = null) =>
  leagueFloor(LEAGUES.indexOf(bot.league)) + (division ? (division - 1) * DIVISION_SPAN + DIVISION_SPAN / 2 : LEAGUE_SPAN / 2);

export type DuelOutcome = "win" | "loss" | "draw";
// Troféus, MMR escondido e bônus (sequência e desempenho): ver mmr.ts.
export { MIN_LOSS, MIN_WIN, MMR_MODEL, expectedScore, leadOf, stakesRange, streakBonus, STREAK_CAP, STREAK_STEP };
export type { SurpriseSample };

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
  /** MMR escondido da pessoa nesta escada (sem ele, vale os próprios troféus). */
  mmr?: number;
  /** Incerteza do MMR nesta escada e os duelos recentes (para a surpresa): decidem o passo do MMR. */
  sigma?: number;
  recent?: readonly SurpriseSample[];
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
  /** Quanto do ganho veio da sequência de vitórias e do desempenho (já dentro de `delta`). */
  streakBonus: number;
  perfBonus: number;
  /** Mudança do MMR escondido e o valor novo. */
  mmrDelta: number;
  mmrAfter: number;
  /** Incerteza do MMR depois do duelo e o que o MMR esperava dele (guardados no registro). */
  mmrSigma: number;
  mmrExp: number;
};

/** Vencedor e troféus a partir dos números finais (a mesma conta para 1 tempo ou 2). */
function settle(input: { trophies: number; mmr?: number; sigma?: number; recent?: readonly SurpriseSample[]; rating?: number; division?: 1 | 2 | 3 | null; bot: Bot; playerCorrect: number; botCorrect: number; playerMs: number | null; botMs: number; streak?: number }) {
  const { trophies, bot, playerCorrect, botCorrect, playerMs, botMs } = input;
  const mmr = input.mmr ?? trophies;
  let outcome: DuelOutcome = playerCorrect > botCorrect ? "win" : playerCorrect < botCorrect ? "loss" : "draw";
  let tiebreak = false;
  if (outcome === "draw" && playerMs !== null && playerMs !== botMs) {
    outcome = playerMs < botMs ? "win" : "loss";
    tiebreak = true;
  }
  const margin = playerCorrect - botCorrect;
  // quantas ligas o bot está acima da pessoa (crescente, pelo rating): soma ao ganho da vitória
  const opponent = input.rating ?? botRating(bot, input.division ?? null);
  const lead = input.rating === undefined ? Math.max(0, LEAGUES.indexOf(bot.league) - leagueOf(trophies).index) : leadOf(opponent, trophies);
  const change = trophyChange({ trophies, mmr, streak: input.streak ?? 0, outcome, margin, lead });
  const trophiesAfter = Math.max(0, trophies + change.delta);
  const sigma = input.sigma ?? SIGMA_MIN;
  const mmrAfter = Math.max(0, mmr + mmrChange(mmr, opponent, outcome, margin, sigma));
  const expected = expectedScore(mmr, opponent);
  const mmrSigma = sigmaNext(sigma, [...(input.recent ?? []), { score: outcomeScore(outcome), expected }]);
  return { outcome, tiebreak, delta: trophiesAfter - Math.max(0, trophies), trophiesAfter, streakBonus: change.streakBonus, perfBonus: change.perfBonus, mmrDelta: mmrAfter - mmr, mmrAfter, mmrSigma, mmrExp: expected };
}

export function resolveDuel({ trophies, bot, playerCorrect, playerTotal, playerMs, seed, context, streak, mmr, sigma, recent }: DuelInput): DuelResult {
  const { correct: botCorrect, totalMs: botMs } = simulateBot(bot, playerTotal, seed, context);
  return { botId: bot.id, botCorrect, botMs, ...settle({ trophies, mmr, sigma, recent, rating: context?.rating, division: context?.division ?? null, bot, playerCorrect, botCorrect, playerMs, botMs, streak }) };
}

// ---- Duelo em dois tempos ----
export type LegInput = { group: ModeGroup; rounds: number; playerCorrect: number; playerMs: number | null };
export type LegResult = { group: ModeGroup; rounds: number; playerCorrect: number; botCorrect: number; botMs: number };
export type DuelLegsInput = {
  trophies: number;
  bot: Bot;
  legs: readonly LegInput[];
  seed: string;
  /** Divisão do adversário (a força do bot acompanha); com `rating` ele não pesa. */
  division: 1 | 2 | 3 | null;
  /** Rating do bot sorteado pelo matchmaking: decide a força dele e é a nota contra a qual o MMR muda. */
  rating?: number;
  /** Vitórias seguidas que a pessoa já tinha nesta escada (bônus de sequência). */
  streak?: number;
  /** MMR escondido da pessoa nesta escada (sem ele, vale os próprios troféus). */
  mmr?: number;
  /** Incerteza do MMR nesta escada e os duelos recentes (para a surpresa). */
  sigma?: number;
  recent?: readonly SurpriseSample[];
};
export type DuelLegsResult = DuelResult & { legs: LegResult[]; playerCorrect: number; total: number };

/** Cada tempo tem o próprio sorteio do bot, ajustado à dificuldade do modo; o placar soma os tempos. */
export function resolveDuelLegs({ trophies, bot, legs, seed, division, rating, streak, mmr, sigma, recent }: DuelLegsInput): DuelLegsResult {
  const results: LegResult[] = legs.map((leg, index) => {
    const def = groupDef(leg.group);
    const { correct, totalMs } = simulateBot(bot, leg.rounds, `${seed}:${index}`, { division, rating, family: def.botFamily, neutral: def.neutral, tuning: { accuracy: def.accuracy, time: def.time } });
    return { group: leg.group, rounds: leg.rounds, playerCorrect: leg.playerCorrect, botCorrect: correct, botMs: totalMs };
  });
  const playerCorrect = results.reduce((sum, leg) => sum + leg.playerCorrect, 0);
  const botCorrect = results.reduce((sum, leg) => sum + leg.botCorrect, 0);
  const botMs = results.reduce((sum, leg) => sum + leg.botMs, 0);
  const playerMs = legs.every((leg) => leg.playerMs !== null) ? legs.reduce((sum, leg) => sum + (leg.playerMs as number), 0) : null;
  return { botId: bot.id, botCorrect, botMs, legs: results, playerCorrect, total: results.reduce((sum, leg) => sum + leg.rounds, 0), ...settle({ trophies, mmr, sigma, recent, rating, division, bot, playerCorrect, botCorrect, playerMs, botMs, streak }) };
}

// ---- Registro dos duelos (um por duelo, guardado na loja `preferences`) ----
export const DUEL_ID_PREFIX = "duel:";
export const DUEL_SOURCE = "duel-v1";

/** `playerMs` e `botMs` (tempo gasto no tempo, em ms) só existem nos duelos gravados depois do histórico unificado. */
export type DuelLegRecord = { group: ModeGroup; playerCorrect: number; botCorrect: number; total: number; playerMs?: number | null; botMs?: number };
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
  /** Mudança do MMR escondido neste duelo e a versão da conta que a calculou (sem os dois, ou de uma versão que não vale, o MMR conta o próprio delta). */
  mmrDelta?: number;
  mmrVersion?: number;
  /** Incerteza do MMR depois deste duelo e o que o MMR esperava dele (versão 4 em diante). */
  mmrSigma?: number;
  mmrExp?: number;
  /** Só no duelo em dois tempos. */
  legs?: DuelLegRecord[];
  /** A pessoa saiu antes de terminar os dois tempos (o que faltou valeu zero). Sem o campo, o histórico deduz pelas sessões. */
  abandoned?: boolean;
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
    ...(typeof item.mmrDelta === "number" && Number.isFinite(item.mmrDelta) ? { mmrDelta: item.mmrDelta } : {}),
    ...(typeof item.mmrVersion === "number" && Number.isFinite(item.mmrVersion) ? { mmrVersion: item.mmrVersion } : {}),
    ...(typeof item.mmrSigma === "number" && Number.isFinite(item.mmrSigma) ? { mmrSigma: item.mmrSigma } : {}),
    ...(typeof item.mmrExp === "number" && Number.isFinite(item.mmrExp) ? { mmrExp: item.mmrExp } : {}),
    ...(legs ? { legs } : {}),
    ...(typeof item.abandoned === "boolean" ? { abandoned: item.abandoned } : {}),
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
/** O MMR escondido também é derivado do histórico: soma o `mmrDelta` (ou o `delta`, nos duelos antigos) na ordem dos duelos, sem passar de zero. */
/** O MMR gravado no registro só vale se veio de uma versão da conta que ainda vale. */
const validMmr = (duel: { mmrVersion?: number }) => duel.mmrVersion !== undefined && MMR_VALID_MODELS.includes(duel.mmrVersion);

/** O estado do MMR de uma escada, derivado do histórico: o MMR, a incerteza (a do último duelo que a gravou ou, sem ela, a de quem jogou tantos
 *  duelos sem surpresa), os duelos recentes para a surpresa e quantos duelos já foram jogados. */
export function mmrStateFromDuels(duels: readonly Pick<DuelRecord, "at" | "delta" | "id" | "ladder" | "outcome" | "mmrDelta" | "mmrVersion" | "mmrSigma" | "mmrExp">[], ladder: Ladder) {
  const list = [...duels].filter((duel) => duel.ladder === ladder).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  const mmr = list.reduce((total, duel) => Math.max(0, total + (validMmr(duel) && duel.mmrDelta !== undefined ? duel.mmrDelta : duel.delta)), 0);
  const last = [...list].reverse().find((duel) => validMmr(duel) && duel.mmrSigma !== undefined);
  const samples: SurpriseSample[] = list
    .filter((duel) => validMmr(duel) && duel.mmrExp !== undefined)
    .slice(-SURPRISE_WINDOW)
    .map((duel) => ({ score: outcomeScore(duel.outcome), expected: duel.mmrExp as number }));
  return { mmr, sigma: last?.mmrSigma ?? sigmaFromGames(list.length), samples, games: list.length };
}
export function mmrFromDuels(duels: readonly Pick<DuelRecord, "at" | "delta" | "id" | "ladder" | "mmrDelta" | "mmrVersion">[], ladder?: Ladder) {
  return [...duels]
    .filter((duel) => !ladder || duel.ladder === ladder)
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1))
    .reduce((total, duel) => Math.max(0, total + (validMmr(duel) && duel.mmrDelta !== undefined ? duel.mmrDelta : duel.delta)), 0);
}
export const mmrByLadder = (duels: readonly Pick<DuelRecord, "at" | "delta" | "id" | "ladder" | "mmrDelta" | "mmrVersion">[]): Record<Ladder, number> =>
  Object.fromEntries(LADDERS.map((ladder) => [ladder, mmrFromDuels(duels, ladder)])) as Record<Ladder, number>;
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
  /** Troféus que o desempenho (acertos à frente do bot) acrescentou a este ganho. */
  perfBonus: number;
  /** A pessoa saiu antes de terminar os dois tempos. */
  abandoned: boolean;
  /** Tempo de cada tempo: o da pessoa (null se não deu para saber) e o simulado do bot; e a soma dos dois tempos (o desempate usa a soma). */
  legTimes?: readonly { playerMs: number | null; botMs: number }[];
  playerMs?: number | null;
  botMs?: number;
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
