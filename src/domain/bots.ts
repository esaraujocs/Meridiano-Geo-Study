// Bots do Duelo: 5 por liga, cada um com nome e um jeito de jogar. O bot não responde de verdade: a cada rodada ele acerta
// com uma chance (que sobe com a divisão da pessoa e muda com o jeito dele) e "demora" um tempo, tudo sorteado com semente
// (a sessão), então o mesmo duelo sempre dá o mesmo placar. Lógica pura.
import { LEAGUES, type LeagueKey } from "./league.js";

export type BotFamily = "mapa" | "bandeiras" | "capitais" | "idiomas";
export type BotStyle = "constante" | "preciso" | "rapido" | "irregular" | "especialista";

export type Bot = {
  id: string;
  name: string;
  league: LeagueKey;
  style: BotStyle;
  /** Só o especialista: a família em que ele é forte (nas outras, é fraco). */
  specialty: BotFamily | null;
};

/** Acerto e tempo por resposta do bot "constante" de cada liga, na divisão I. */
export const LEAGUE_BASE: Record<LeagueKey, { accuracy: number; avgMs: number }> = {
  bronze: { accuracy: 0.6, avgMs: 9000 },
  prata: { accuracy: 0.68, avgMs: 7800 },
  ouro: { accuracy: 0.76, avgMs: 6600 },
  platina: { accuracy: 0.84, avgMs: 5600 },
  diamante: { accuracy: 0.91, avgMs: 4600 },
  mestre: { accuracy: 0.96, avgMs: 3800 },
};
/** Cada divisão acima da I deixa os bots da liga um pouco mais fortes (I, II, III → +0, +2, +4 pontos). */
export const DIVISION_STEP = 0.02;
export const PRECISE = { accuracy: 0.03, time: 1.35 };
export const FAST = { accuracy: -0.04, time: 0.7 };
export const SPECIALIST = { inside: 0.08, outside: -0.05 };
/** O irregular alterna fases boas e ruins (mesma média): acerto ± isto, trocando de fase com esta chance por rodada. */
export const STREAKY = { swing: 0.2, switchChance: 0.15 };

// Ordem em cada liga: Constante, Preciso e lento, Rápido e descuidado, Irregular, Especialista.
const ROSTER: Record<LeagueKey, readonly [string, string, string, string, string]> = {
  bronze: ["Zeca Turista", "Mari Iniciante", "Léo Passeio", "Tio Beto", "Duda Atlas"],
  prata: ["Carol Rota", "Lia Escala", "Rafa Globo", "Téo Farol", "Bruna Sul"],
  ouro: ["Hugo Bússola", "Sofia Norte", "Caio Latitude", "Nina Longitude", "Otávio Cabo"],
  platina: ["Helena Estreito", "Yara Cordilheira", "Marcos Delta", "Vítor Península", "Alice Arquipélago"],
  diamante: ["Ísis Cartógrafa", "Vera Equador", "Bento Polar", "Nando Trópico", "Dr. Mercator"],
  mestre: ["Mestre Ptolomeu", "Lúcia Antípoda", "Cosmo", "Almirante Zé", "Ana Hemisfério"],
};
const STYLES: readonly BotStyle[] = ["constante", "preciso", "rapido", "irregular", "especialista"];
const SPECIALTY: Record<LeagueKey, BotFamily> = { bronze: "mapa", prata: "bandeiras", ouro: "capitais", platina: "idiomas", diamante: "mapa", mestre: "bandeiras" };

export const BOTS: readonly Bot[] = LEAGUES.flatMap((league) =>
  ROSTER[league].map((name, index): Bot => ({
    id: `bot-${league}-${index}`,
    name,
    league,
    style: STYLES[index],
    specialty: STYLES[index] === "especialista" ? SPECIALTY[league] : null,
  })),
);
export const botsOfLeague = (league: LeagueKey) => BOTS.filter((bot) => bot.league === league);

/** Registros antigos guardavam só a liga (`bot-bronze`); o nome vira "Bot Bronze" e o jeito, o de um constante. */
export function botById(id: string): Bot | null {
  const found = BOTS.find((bot) => bot.id === id);
  if (found) return found;
  const league = LEAGUES.find((key) => id === `bot-${key}`);
  return league ? { id, name: "", league, style: "constante", specialty: null } : null;
}

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

/** Sorteia um bot da liga (sem repetir o do duelo anterior, se houver outros). */
export function pickBot(league: LeagueKey, seed: string | number, excludeId?: string | null): Bot {
  const all = botsOfLeague(league);
  const pool = all.filter((bot) => bot.id !== excludeId);
  const options = pool.length ? pool : all;
  return options[Math.floor(mulberry32(hashSeed(`pick:${seed}`))() * options.length)];
}

export type BotContext = {
  /** Divisão da pessoa na liga (1 a 3); o Mestre não tem divisões. */
  division: 1 | 2 | 3 | null;
  /** Família do Hub que está sendo jogada (só o especialista liga para isso). */
  family: BotFamily | null;
  /** Modo em que a especialidade não vale nem para bem nem para mal (as bandeiras históricas: o especialista em bandeiras atuais não as domina). */
  neutral?: boolean;
  /** Dificuldade do modo do tempo: pontos de acerto (negativo = mais difícil) e fator de tempo. O ajuste encolhe nas ligas altas, que erram pouco em qualquer modo. */
  tuning?: { accuracy: number; time: number };
};
/** Acerto em que o ajuste do modo vale por inteiro; quanto mais perto de 100%, menos ele pesa. */
export const TUNING_REF = 0.4;
export type BotProfile = { accuracy: number; avgMs: number; streaky: boolean };

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Acerto, tempo médio e regularidade do bot naquele contexto. */
export function botProfile(bot: Bot, context: BotContext): BotProfile {
  const base = LEAGUE_BASE[bot.league];
  let accuracy = base.accuracy + (context.division ? (context.division - 1) * DIVISION_STEP : 0);
  let avgMs = base.avgMs;
  if (bot.style === "preciso") { accuracy += PRECISE.accuracy; avgMs *= PRECISE.time; }
  if (bot.style === "rapido") { accuracy += FAST.accuracy; avgMs *= FAST.time; }
  if (bot.style === "especialista" && bot.specialty && !context.neutral) accuracy += context.family === bot.specialty ? SPECIALIST.inside : SPECIALIST.outside;
  if (context.tuning) {
    accuracy += context.tuning.accuracy * clamp((1 - accuracy) / TUNING_REF, 0, 1);
    avgMs *= context.tuning.time;
  }
  return { accuracy: clamp(accuracy, 0.05, 0.99), avgMs: Math.round(avgMs), streaky: bot.style === "irregular" };
}

export function simulateBot(bot: Bot, rounds: number, seed: string, context: BotContext = { division: 1, family: null }) {
  const profile = botProfile(bot, context);
  const random = mulberry32(hashSeed(`${bot.id}:${seed}`));
  let hot = random() < 0.5;
  let correct = 0;
  let totalMs = 0;
  for (let round = 0; round < rounds; round += 1) {
    if (profile.streaky && random() < STREAKY.switchChance) hot = !hot;
    // a oscilação encolhe perto de 0% e 100% para a média continuar sendo o acerto do perfil
    const swing = Math.min(STREAKY.swing, profile.accuracy, 1 - profile.accuracy);
    const chance = profile.streaky ? profile.accuracy + (hot ? swing : -swing) : profile.accuracy;
    if (random() < chance) correct += 1;
    totalMs += Math.round(profile.avgMs * (0.7 + random() * 0.6));
  }
  return { correct, totalMs };
}
