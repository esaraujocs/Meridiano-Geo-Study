// Economia persistente e simulação diária dos bots do ranking. Lógica pura.
//
// Desde 19/10/2026 (pedido do Enzo: "uma rodada massiva entre os bots, para ver se com essas stats muda a escada; quero que use isso") cada dia é
// um duelo de verdade, com as estatísticas de cada bot (acerto, tempo, ajuste do modo, digitação pelo tamanho da resposta, piso humano), no lugar do
// sorteio "MMR + forma do dia" de antes. Na mesma noite a 1ª versão (bot × bot entre vizinhos de força) foi trocada: um mundo fechado de bots não tem
// âncora, a média fica onde os troféus iniciais a puseram e a escada se espalha em volta dela (os 5 do Grão-Mestre entraram com ~3.400 e o topo foi
// a ~3.900). Pedido dele: "só garanta competitividade, o top 1 precisa de outros grão-mestres batendo de frente com ele, assim o limite natural
// surge". Então cada bot joga o duelo da pessoa: o matchmaking dela (`matchmaking`, pelo MMR, a incerteza e a surpresa do próprio bot) escolhe um bot
// da liga do rating, com a força desse rating; quanto mais alto, mais forte o adversário, e o bot para onde vence metade, na mesma escala da pessoa.
// Um estado salvo de outra versão é recalibrado uma vez com um ano desses duelos (`calibrateBotRanking`).
import { BOTS, duelForm, hashSeed, mulberry32, pickBot, simulateBot, type Bot, type BotContext } from "./bots.js";
import { LEAGUES, hasDivisions, leagueFloor } from "./league.js";
import { LADDERS, drawLegs, groupDef, type Ladder } from "./duel-modes.js";
import { TYPED_LENGTHS } from "./typed-lengths.js";
import { MAP_SPOTS } from "./map-spots.js";
import { timerSecondsFor } from "./pace.js";
import {
  SURPRISE_WINDOW,
  SIGMA_MAX,
  SIGMA_MIN,
  SIGMA_START,
  expectedScore,
  leadOf,
  matchmaking,
  mmrChange,
  outcomeScore,
  sigmaNext,
  surprise,
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
  /** Versão da calibração pelos duelos do dia (ausente nos estados de antes; de outra versão, recalibrado ao abrir). */
  calibration?: number;
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
const OFFSETS = [70, 170, 260, 350, 440, 120, 310, 400] as const;
/** O Grão-Mestre, sem teto, espalha os bots um pouco mais (de 3.060 a 3.700); o Mestre, desde 19/10/2026 com 500 troféus, é uma liga comum. */
const GRAND_OFFSETS = [60, 220, 380, 540, 700, 140, 460, 620] as const;
const DAILY_SWING = 30;

/**
 * Keep the exact initial seed calculation from leaderboard.botTrophies here
 * rather than importing leaderboard: leaderboard can consume this module
 * without introducing a runtime cycle.
 */
function initialBotTrophies(bot: Bot, ladder: Ladder, day: number) {
  const index = LEAGUES.indexOf(bot.league);
  const slot = Math.max(0, Number(bot.id.split("-").pop()) || 0);
  const offset = (bot.league === "grao-mestre" ? GRAND_OFFSETS : OFFSETS)[Math.min(slot, OFFSETS.length - 1)];
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

/** Strict persistence parser: malformed or roster-incompatible data is an explicit error, never a silent reset. Bots added to the roster later
 *  are seeded on read; an unknown bot id is still an error. */
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
    if (ids.some((id) => !BOT_ID_SET.has(id))) {
      throw new TypeError(`Bot ranking ${ladder} roster does not match the current bot roster`);
    }
    const parsed: Record<string, BotStanding> = {};
    for (const botId of BOT_IDS) {
      // bot que chegou depois (os do Grão-Mestre, 19/10/2026): entra com os troféus iniciais do dia em que o estado parou, sem inventar histórico
      if (!(botId in ladderBots)) {
        const trophies = initialBotTrophies(BOTS.find((bot) => bot.id === botId) as Bot, ladder, value.lastDay as number);
        parsed[botId] = { trophies, mmr: trophies, sigma: SIGMA_START, streak: 0, samples: [], matches: 0 };
        continue;
      }
      const standing = ladderBots[botId];
      assertStanding(standing, `bots.${ladder}.${botId}`);
      parsed[botId] = copyStanding(standing);
    }
    bots[ladder] = parsed;
  }
  if (value.calibration !== undefined && !Number.isSafeInteger(value.calibration)) throw new TypeError("Bot ranking calibration must be an integer");
  return {
    id: BOT_RANKING_ID,
    version: 1,
    revision: value.revision as number,
    lastDay: value.lastDay as number,
    bots,
    ...(value.calibration !== undefined ? { calibration: value.calibration as number } : {}),
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

/** A força própria do bot: a base da liga dele (divisão II nas ligas com divisões), sem o rating do matchmaking. */
export const ownDivision = (bot: Bot): 2 | null => (hasDivisions(LEAGUES.indexOf(bot.league)) ? 2 : null);

/** Quantos bots do ranking, os mais perto do rating do matchmaking, entram no sorteio do adversário da pessoa. */
export const NEAREST_OPPONENTS = 3;
/** O adversário da pessoa é um bot do ranking com a força dele (20/10/2026, pedido do Enzo: "os bots têm que ser consistentes em performance; o
 *  bot que tem tempo médio de 2,1 s tem que oscilar nesse entorno, não se adequar ao meu MMR"). Antes o nome era sorteado na liga do rating e a
 *  força vinha do rating, então a Capitã Monção, 1ª do ranking com ~1,7 s, jogava contra ele como um bot de 3.000 (~2,15 s). Agora o matchmaking
 *  só dá o alvo: sorteia-se entre os NEAREST_OPPONENTS bots com o MMR mais perto dele (sem repetir o anterior), que joga com a própria força (a
 *  base da liga, como no ranking) e cujo MMR é a nota contra a qual o MMR da pessoa muda. Acima do 1º do ranking não há bot mais forte: o
 *  adversário mais duro é o topo, e o limite vem da curva de troféus. */
export function rankedOpponent(state: BotRankingState, ladder: Ladder, target: number, seed: string, excludeId?: string | null) {
  const standings = state.bots[ladder];
  const pool = BOTS.filter((bot) => standings[bot.id] && bot.id !== excludeId);
  const gap = (bot: Bot) => Math.abs(standings[bot.id].mmr - target);
  const nearest = [...pool].sort((a, b) => gap(a) - gap(b)).slice(0, NEAREST_OPPONENTS);
  const bot = nearest[Math.floor(mulberry32(hashSeed(`opponent:${seed}`))() * nearest.length)];
  return { bot, rating: Math.round(standings[bot.id].mmr), division: ownDivision(bot) };
}
const expand = (pairs: readonly (readonly [number, number])[]) => pairs.flatMap(([length, count]) => Array<number>(count).fill(length));
const LENGTH_POOLS = { nome: expand(TYPED_LENGTHS.nome), capital: expand(TYPED_LENGTHS.capital) };
/** Os lugares do baralho do mapa (quanto cada um pede de tempo): os modos de clicar sorteiam daqui, os mesmos para os dois lados. */
const SPOT_POOL = Object.values(MAP_SPOTS);

export type BotDuel = { outcome: "win" | "loss" | "draw"; margin: number; opponentId: string; rating: number };

/** O duelo do dia de um bot, como o da pessoa: o matchmaking pelo MMR, a incerteza e a surpresa dele dá o alvo e, com o ranking (`state`), o
 *  adversário é um dos bots de MMR mais perto dele (nunca ele mesmo, `rankedOpponent`), os dois com a própria força e a forma do dia; o MMR muda
 *  contra o MMR do adversário (Elo de verdade: quem vence quem decide a ordem, e o jeito conta). A âncora fica no fim do dia (`simulateDay`): o
 *  k-º do ranking é puxado para a k-ª força. (Ancorar cada duelo na força rotulada do adversário fazia a Capitã Monção, a mais forte de fato no
 *  topo, disparar 600 troféus: vencia "forças 3.900" que no jeito delas eram mais fracas.) Sem `state`, o de antes: um bot da liga do alvo com a
 *  força do alvo. Os 2 tempos sorteados da
 *  escada (nos modos digitados, as mesmas respostas sorteadas do catálogo para os dois); mais acertos vence, empate no menor tempo total. */
export function botDuel(bot: Bot, standing: BotStanding, ladder: Ladder, seed: string, state?: BotRankingState): BotDuel {
  const match = matchmaking(standing.trophies, standing.mmr, standing.sigma, surprise(standing.samples));
  const opponent = state ? rankedOpponent(state, ladder, match.rating, seed, bot.id).bot : pickBot(match.league, seed, bot.id);
  const formA = duelForm(bot, seed), formB = duelForm(opponent, `${seed}:rival`);
  let correctA = 0, correctB = 0, msA = 0, msB = 0;
  drawLegs(ladder, seed).forEach((leg, index) => {
    const def = groupDef(leg.group);
    const typing = def.typing;
    let chars: number[] | undefined;
    if (typing) {
      const pool = LENGTH_POOLS[typing.answer];
      const random = mulberry32(hashSeed(`bot-ranking:deck:${seed}:${index}`));
      chars = Array.from({ length: leg.rounds }, () => pool[Math.floor(random() * pool.length)]);
    }
    let spots: number[] | undefined;
    if (def.kind === "clique") {
      const random = mulberry32(hashSeed(`bot-ranking:spots:${seed}:${index}`));
      spots = Array.from({ length: leg.rounds }, () => SPOT_POOL[Math.floor(random() * SPOT_POOL.length)]);
    }
    const shared = {
      family: def.botFamily, neutral: def.neutral, tuning: { accuracy: def.accuracy, time: def.time }, kind: def.kind,
      limitMs: timerSecondsFor(def.variants[0].variant) * 1000,
      ...(typing && chars ? { typing: { think: typing.think, key: typing.key, chars } } : {}),
      ...(spots ? { spots } : {}),
    };
    const own: BotContext = { ...shared, division: null, own: true, form: formA };
    const rival: BotContext = state ? { ...shared, division: null, own: true, form: formB } : { ...shared, division: match.division, rating: match.rating };
    const resultA = simulateBot(bot, leg.rounds, `${seed}:${index}`, own);
    const resultB = simulateBot(opponent, leg.rounds, `${seed}:${index}`, rival);
    correctA += resultA.correct; correctB += resultB.correct; msA += resultA.totalMs; msB += resultB.totalMs;
  });
  const outcome = correctA > correctB ? "win" : correctA < correctB ? "loss" : msA < msB ? "win" : msA > msB ? "loss" : "draw";
  return { outcome, margin: correctA - correctB, opponentId: opponent.id, rating: state ? Math.round(state.bots[ladder][opponent.id].mmr) : match.rating };
}

const botOf = new Map(BOTS.map((bot) => [bot.id, bot]));

/** As forças em ordem: a escala da escada. Cada dia, o bot na posição k do ranking (pelo MMR) anda RANK_PULL do caminho até a k-ésima força. */
const SKILL_SCALE = BOTS.map((bot) => bot.skill).sort((a, b) => b - a);
export const RANK_PULL = 0.1;

function simulateDay(state: BotRankingState, day: number): BotRankingState {
  let next = state;
  for (const ladder of LADDERS) {
    for (const botId of BOT_IDS) {
      const standing = state.bots[ladder][botId];
      const { outcome, margin, rating } = botDuel(botOf.get(botId) as Bot, standing, ladder, `bot-ranking:${ladder}:${day}:${botId}`, state);
      next = settleBotMatchCore(next, { ladder, botId, opponentMmr: rating, outcome, margin });
    }
    // âncora: o Elo entre bots decide a ORDEM; a escala vem das forças (o 1º puxado para a maior, o 2º para a segunda…), então a escada tem
    // sempre o mesmo formato (8 no Grão-Mestre, o topo perto de 3.900) e não deriva
    const standings = next.bots[ladder];
    const order = [...BOT_IDS].sort((a, b) => standings[b].mmr - standings[a].mmr);
    const pulled = Object.fromEntries(order.map((id, rank) => [id, { ...standings[id], mmr: Math.max(0, Math.round(standings[id].mmr + (SKILL_SCALE[rank] - standings[id].mmr) * RANK_PULL)) }]));
    next = { ...next, bots: { ...next.bots, [ladder]: { ...standings, ...pulled } } };
  }
  return { ...next, revision: state.revision + 1, lastDay: day };
}

/** Versão da calibração pelos duelos do dia (1: bot × bot entre vizinhos; 2: o matchmaking da pessoa; 3: 8 bots por liga, com os de nick; 4: força própria de cada bot e duelos entre eles; 5: Elo entre eles, a escala pelas forças e a forma do dia); subir este número recalibra os estados
 *  salvos na próxima abertura. */
export const BOT_RANKING_CALIBRATION = 5;
/** Quantos dias de duelos a recalibração simula (de onde cada bot estava). */
export const CALIBRATION_DAYS = 365;
export const needsCalibration = (state: BotRankingState) => state.calibration !== BOT_RANKING_CALIBRATION;

/** Recalibra uma vez: um ano de duelos do dia a partir de onde cada bot estava, para a escada já refletir as estatísticas; o dia do estado
 *  não muda (os dias simulados são "de bastidor") e a revisão sobe uma vez. Determinística: o mesmo estado dá o mesmo resultado em qualquer aparelho. */
export function calibrateBotRanking(state: BotRankingState): BotRankingState {
  let next = state;
  for (let day = 1; day <= CALIBRATION_DAYS; day += 1) next = simulateDay(next, -day);
  return { ...next, revision: state.revision + 1, lastDay: state.lastDay, calibration: BOT_RANKING_CALIBRATION };
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