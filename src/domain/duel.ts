// Duelo contra bots: a pessoa joga a partida de sempre; o bot "joga" o mesmo número de rodadas (ver bots.ts) e o placar decide.
// Quem acertar mais vence; empatou nos acertos, o menor tempo total desempata. Os troféus seguem uma conta tipo Elo.
// O duelo v2 tem 2 tempos de 10 rodadas (ver duel-modes.ts) e troféus por escada (Mapas e Bandeiras).
import { DIVISION_SPAN, LEAGUES, leagueFloor, leagueOf, leagueSpan, type LeagueKey } from "./league.js";
import { hashSeed, simulateBot, type Bot, type BotContext, type BotStyle, type BotFamily } from "./bots.js";
import type { Milestone } from "./duel-rewards.js";
import { MIN_LOSS, MIN_WIN, MMR_MODEL, MMR_VALID_MODELS, SIGMA_MIN, leadOf, SURPRISE_WINDOW, expectedScore, mmrChange, outcomeScore, sigmaFromGames, sigmaNext, stakesRange, streakBonus, STREAK_CAP, STREAK_STEP, trophyChange, type SurpriseSample } from "./mmr.js";
import { LADDERS, groupDef, isLadder, ladderForFamily, type Ladder, type ModeGroup } from "./duel-modes.js";
import { timerSecondsFor } from "./pace.js";

/** Duelo v1 (uma partida só, 20 rodadas). O v2 usa LEGS x LEG_ROUNDS de duel-modes.ts. */
export const DUEL_ROUNDS = 20;

/** Nota do bot na conta do MMR: o meio da divisão em que a pessoa o enfrenta (a força do bot acompanha a divisão) ou, sem divisão, o meio da liga. */
export const botRating = (bot: Pick<Bot, "league">, division: 1 | 2 | 3 | null = null) =>
  leagueFloor(LEAGUES.indexOf(bot.league)) + (division ? (division - 1) * DIVISION_SPAN + DIVISION_SPAN / 2 : leagueSpan(LEAGUES.indexOf(bot.league)) / 2);

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
/** `chars`: nos modos digitados, as letras de cada resposta do baralho, na ordem (sem elas, o bot usa o fator de tempo do modo). `spots`: nos modos
 *  de clicar no mapa, quanto cada alvo pede de tempo (`mapSpot`; sem eles, o mesmo tempo médio em todos). */
export type LegInput = { group: ModeGroup; rounds: number; playerCorrect: number; playerMs: number | null; chars?: readonly number[]; spots?: readonly number[] };
export type LegResult = { group: ModeGroup; rounds: number; playerCorrect: number; botCorrect: number; botMs: number };
export type DuelLegsInput = {
  trophies: number;
  bot: Bot;
  legs: readonly LegInput[];
  seed: string;
  /** Divisão do adversário (a força do bot acompanha); com `rating` ele não pesa. */
  division: 1 | 2 | 3 | null;
  /** Rating do bot sorteado pelo matchmaking: decide a força dele (menos com `own`) e é a nota contra a qual o MMR muda. */
  rating?: number;
  /** O bot é um do ranking e joga com a própria força (a base da liga e a divisão dele), não com a do rating (`rankedOpponent`). */
  own?: boolean;
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
export function resolveDuelLegs({ trophies, bot, legs, seed, division, rating, own, streak, mmr, sigma, recent }: DuelLegsInput): DuelLegsResult {
  const results: LegResult[] = legs.map((leg, index) => {
    const def = groupDef(leg.group);
    const typing = def.typing && leg.chars?.length ? { think: def.typing.think, key: def.typing.key, chars: leg.chars } : undefined;
    const spots = def.kind === "clique" && leg.spots?.length ? leg.spots : undefined;
    const { correct, totalMs } = simulateBot(bot, leg.rounds, `${seed}:${index}`, { division, ...(own ? { own: true } : { rating }), family: def.botFamily, neutral: def.neutral, tuning: { accuracy: def.accuracy, time: def.time }, typing, kind: def.kind, limitMs: timerSecondsFor(def.variants[0].variant) * 1000, ...(spots ? { spots } : {}) });
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
/** Correção do teto (19/10/2026, pedido do Enzo: "pensa num diminishing justo para encaixar minha conta no ranking; 3.600 está inflado do sistema
 *  anterior"). Os troféus e o MMR ganhos contra os bots de antes (o Mestre lento e a força esticada acima do Grão-Mestre, que dava centenas de
 *  troféus por uma diferença pequena de habilidade) ficaram altos demais. Uma vez, no instante `at`, o que passava de `from` passa a valer `keep`
 *  (3.558 → 3.346, o ponto onde a conta dele se estabiliza contra os bots novos, simulado em `.tmp-hub/sim-account.mjs`); o que vem depois soma
 *  normal. Nada é gravado: a soma do histórico aplica a correção ao passar pelo instante, então todo aparelho chega ao mesmo número. */
export const CEILING_FIX = { at: Date.UTC(2026, 9, 19, 6), from: 2500, keep: 0.8 } as const;
export const ceilingFix = (value: number) => (value <= CEILING_FIX.from ? value : Math.round(CEILING_FIX.from + (value - CEILING_FIX.from) * CEILING_FIX.keep));
/** Soma da escada na ordem, sem passar de zero, com a correção do teto ao chegar no instante dela (ou no fim, se tudo veio antes). */
function sumLadder<T extends { at: number }>(sorted: readonly T[], step: (entry: T) => number) {
  let total = 0;
  let fixed = false;
  for (const entry of sorted) {
    if (!fixed && entry.at >= CEILING_FIX.at) { total = ceilingFix(total); fixed = true; }
    total = Math.max(0, total + step(entry));
  }
  return fixed ? total : ceilingFix(total);
}

// ---- Ajustes da escada (20/10/2026) ----
/** Um ajuste de troféus e MMR numa escada, pedido pela pessoa (o primeiro, do Enzo: "me tira 500 em Bandeiras e 200 no Mapa"). Fica numa linha
 *  da loja `preferences` (`ladder-adjust:<id>`, sincroniza com a conta e entra no backup) e soma na escada no instante dele, como um duelo, mas
 *  **não é duelo**: não entra na forma, na sequência, na contagem de duelos nem na surpresa (`isDuelEntry`). */
export const ADJUST_ID_PREFIX = "ladder-adjust:";
export type LadderAdjustment = { id: string; at: number; ladder: Ladder; trophies: number; mmr: number };

export function parseAdjustment(row: unknown): LadderAdjustment | null {
  const item = row as Partial<LadderAdjustment> | null;
  if (!item || typeof item.id !== "string" || !item.id.startsWith(ADJUST_ID_PREFIX) || !isLadder(item.ladder)) return null;
  if (![item.at, item.trophies, item.mmr].every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  return { id: item.id, at: item.at as number, ladder: item.ladder, trophies: item.trophies as number, mmr: item.mmr as number };
}

/** O ajuste no formato das entradas da escada (o MMR vale como o de um duelo da versão atual). */
export const adjustmentEntry = (adjust: LadderAdjustment) => ({
  id: adjust.id, at: adjust.at, ladder: adjust.ladder, delta: adjust.trophies, outcome: "draw" as DuelOutcome,
  mmrDelta: adjust.mmr, mmrVersion: MMR_MODEL, adjust: true as const,
});
/** Entrada que é duelo de verdade (não ajuste): só elas contam na forma, na sequência e no número de duelos. */
export const isDuelEntry = (entry: { adjust?: boolean }) => !entry.adjust;

/** Ajustes por conta: o aparelho entrado nessa conta grava as linhas uma vez (ids fixos: dois aparelhos gravam a mesma linha e a sincronização
 *  une). A conta vai pelo `hashSeed("conta:<usuário em minúsculas>")`, para o nome não ficar no código. */
export const ACCOUNT_ADJUSTMENTS: readonly { account: number; rows: readonly LadderAdjustment[] }[] = [
  {
    account: 3176936172,
    rows: [
      { id: "ladder-adjust:2026-10-20:bandeiras", at: Date.UTC(2026, 9, 20, 0, 45), ladder: "bandeiras", trophies: -500, mmr: -500 },
      { id: "ladder-adjust:2026-10-20:mapas", at: Date.UTC(2026, 9, 20, 0, 45), ladder: "mapas", trophies: -200, mmr: -200 },
    ],
  },
];
export const accountAdjustments = (username: string): readonly LadderAdjustment[] =>
  username ? ACCOUNT_ADJUSTMENTS.find((entry) => entry.account === hashSeed(`conta:${username.trim().toLowerCase()}`))?.rows ?? [] : [];

export function trophiesFromDuels(duels: readonly Pick<DuelRecord, "at" | "delta" | "id" | "ladder">[], ladder?: Ladder) {
  const sorted = [...duels].filter((duel) => !ladder || duel.ladder === ladder).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  return sumLadder(sorted, (duel) => duel.delta);
}
/** O MMR escondido também é derivado do histórico: soma o `mmrDelta` (ou o `delta`, nos duelos antigos) na ordem dos duelos, sem passar de zero. */
/** O MMR gravado no registro só vale se veio de uma versão da conta que ainda vale. */
const validMmr = (duel: { mmrVersion?: number }) => duel.mmrVersion !== undefined && MMR_VALID_MODELS.includes(duel.mmrVersion);

/** O estado do MMR de uma escada, derivado do histórico: o MMR, a incerteza (a do último duelo que a gravou ou, sem ela, a de quem jogou tantos
 *  duelos sem surpresa), os duelos recentes para a surpresa e quantos duelos já foram jogados. */
export function mmrStateFromDuels(duels: readonly (Pick<DuelRecord, "at" | "delta" | "id" | "ladder" | "outcome" | "mmrDelta" | "mmrVersion" | "mmrSigma" | "mmrExp"> & { adjust?: boolean })[], ladder: Ladder) {
  const list = [...duels].filter((duel) => duel.ladder === ladder).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  const mmr = sumLadder(list, (duel) => (validMmr(duel) && duel.mmrDelta !== undefined ? duel.mmrDelta : duel.delta));
  const last = [...list].reverse().find((duel) => validMmr(duel) && duel.mmrSigma !== undefined);
  const samples: SurpriseSample[] = list
    .filter((duel) => validMmr(duel) && duel.mmrExp !== undefined)
    .slice(-SURPRISE_WINDOW)
    .map((duel) => ({ score: outcomeScore(duel.outcome), expected: duel.mmrExp as number }));
  const games = list.filter(isDuelEntry).length;
  return { mmr, sigma: last?.mmrSigma ?? sigmaFromGames(games), samples, games };
}
export function mmrFromDuels(duels: readonly Pick<DuelRecord, "at" | "delta" | "id" | "ladder" | "mmrDelta" | "mmrVersion">[], ladder?: Ladder) {
  const sorted = [...duels].filter((duel) => !ladder || duel.ladder === ladder).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  return sumLadder(sorted, (duel) => (validMmr(duel) && duel.mmrDelta !== undefined ? duel.mmrDelta : duel.delta));
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
  /** Tema de liga que este duelo desbloqueou (id), se algum: o resultado avisa e oferece aplicar. */
  themeUnlocked?: string;
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
