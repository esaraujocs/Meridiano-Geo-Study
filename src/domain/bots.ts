// Bots do Duelo: 5 por liga (7 ligas, do Bronze ao Grão-Mestre), cada um com nome e um jeito de jogar. O bot não responde de verdade: a cada rodada ele acerta
// com uma chance (que sobe com a divisão da pessoa e muda com o jeito dele) e "demora" um tempo, tudo sorteado com semente
// (a sessão), então o mesmo duelo sempre dá o mesmo placar. Lógica pura.
import { LEAGUES, leagueFloor, leagueSpan, type LeagueKey } from "./league.js";

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

/** Acerto e tempo por resposta do bot "constante" de cada liga, na divisão I (o tempo ainda leva o fator do modo, 1 a 1,9, e o do jeito do bot).
 *  19/10/2026, com o Enzo de referência (jogador muito engajado: 196 duelos; no Mestre de Bandeiras ~99% e ~2 s por resposta antes do fator do
 *  modo; nos modos digitados de Mapas ~80–86% e ~3,7 s). O Diamante e o Mestre ficaram mais rápidos (eram 4,6 e 3,8 s: o Mestre acertava bem,
 *  mas perdia quase todo empate no tempo, 20 das 38 vitórias dele no Mestre foram no desempate) e o Grão-Mestre acerta quase tudo no ritmo dele.
 *  Simulado com os números do Enzo (`.tmp-hub/sim-gm*.mjs`): ele vence ~85% do Mestre e ~56% do Grão-Mestre em Bandeiras (~53% e ~25% em Mapas),
 *  então, com a vitória rendendo pouco e a derrota custando muito no alto, ele se segura perto dos 3.000, a linha do Grão-Mestre. */
export const LEAGUE_BASE: Record<LeagueKey, { accuracy: number; avgMs: number }> = {
  bronze: { accuracy: 0.6, avgMs: 9000 },
  prata: { accuracy: 0.68, avgMs: 7800 },
  ouro: { accuracy: 0.76, avgMs: 6600 },
  platina: { accuracy: 0.84, avgMs: 5600 },
  diamante: { accuracy: 0.91, avgMs: 3800 },
  mestre: { accuracy: 0.96, avgMs: 2600 },
  "grao-mestre": { accuracy: 0.985, avgMs: 1700 },
};
/** Força contínua: o acerto e o tempo do bot para um rating qualquer, interpolados entre o meio de cada liga (LEAGUE_BASE; o do Grão-Mestre, sem
 *  teto, é 3.250). Abaixo do Bronze segue a mesma inclinação (com piso) e acima do Grão-Mestre o acerto sobe até 99% e o tempo cai 15% em
 *  RATING_TOP, então o bot acompanha o rating sorteado sem saltos de liga. */
export const RATING_TOP = 4000;
export function baseAtRating(rating: number): { accuracy: number; avgMs: number } {
  const anchors = LEAGUES.map((league, index) => ({ at: leagueFloor(index) + leagueSpan(index) / 2, ...LEAGUE_BASE[league] }));
  const value = Number.isFinite(rating) ? Math.max(0, rating) : 0;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (value <= first.at) {
    const next = anchors[1];
    const back = first.at - value;
    return { accuracy: Math.max(0.5, first.accuracy - ((next.accuracy - first.accuracy) / (next.at - first.at)) * back), avgMs: Math.min(12000, first.avgMs + ((first.avgMs - next.avgMs) / (next.at - first.at)) * back) };
  }
  if (value >= last.at) {
    const part = Math.min(1, (value - last.at) / (RATING_TOP - last.at));
    return { accuracy: Math.min(0.99, last.accuracy + (0.99 - last.accuracy) * part), avgMs: last.avgMs * (1 - 0.15 * part) };
  }
  const index = anchors.findIndex((anchor) => anchor.at > value);
  const low = anchors[index - 1];
  const high = anchors[index];
  const part = (value - low.at) / (high.at - low.at);
  return { accuracy: low.accuracy + (high.accuracy - low.accuracy) * part, avgMs: low.avgMs + (high.avgMs - low.avgMs) * part };
}

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
  "grao-mestre": ["Humboldt", "Marta Meridiana", "Ibn Battuta", "Capitã Monção", "Rosa dos Ventos"],
};
const STYLES: readonly BotStyle[] = ["constante", "preciso", "rapido", "irregular", "especialista"];
const SPECIALTY: Record<LeagueKey, BotFamily> = { bronze: "mapa", prata: "bandeiras", ouro: "capitais", platina: "idiomas", diamante: "mapa", mestre: "bandeiras", "grao-mestre": "capitais" };

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
  /** Rating do bot (matchmaking pelo MMR): se vier, a base do acerto e do tempo é a do rating e a divisão não pesa. */
  rating?: number;
  /** Modo em que a especialidade não vale nem para bem nem para mal (as bandeiras históricas: o especialista em bandeiras atuais não as domina). */
  neutral?: boolean;
  /** Dificuldade do modo do tempo: pontos de acerto (negativo = mais difícil) e fator de tempo. O ajuste encolhe nas ligas altas, que erram pouco em qualquer modo. */
  tuning?: { accuracy: number; time: number };
  /** Modos digitados: o tempo de cada rodada sai do tamanho da resposta (ver `typingMs`), não do fator de tempo do modo. `chars` são as letras de
   *  cada resposta do baralho, na ordem das rodadas. */
  typing?: { think: number; key: number; chars: readonly number[] };
  /** Tipo do modo (tocar numa alternativa, clicar no mapa, digitar): decide o piso de tempo humano de cada resposta (ver HUMAN_FLOOR). */
  kind?: "clique" | "opcoes" | "escrita";
};
/** Acerto em que o ajuste do modo vale por inteiro; quanto mais perto de 100%, menos ele pesa, mas nunca menos que TUNING_MIN: no topo os modos
 *  difíceis ainda dão uma pequena chance de erro (o Grão-Mestre, 98,5% nas alternativas, fica em ~94% na capital escrita e ~96% nas Históricas). */
export const TUNING_REF = 0.4;
export const TUNING_MIN = 0.12;
export type BotProfile = { accuracy: number; avgMs: number; streaky: boolean };

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Acerto, tempo médio e regularidade do bot naquele contexto. */
export function botProfile(bot: Bot, context: BotContext): BotProfile {
  const base = context.rating === undefined ? LEAGUE_BASE[bot.league] : baseAtRating(context.rating);
  let accuracy = base.accuracy + (context.rating === undefined && context.division ? (context.division - 1) * DIVISION_STEP : 0);
  let avgMs = base.avgMs;
  if (bot.style === "preciso") { accuracy += PRECISE.accuracy; avgMs *= PRECISE.time; }
  if (bot.style === "rapido") { accuracy += FAST.accuracy; avgMs *= FAST.time; }
  if (bot.style === "especialista" && bot.specialty && !context.neutral) accuracy += context.family === bot.specialty ? SPECIALIST.inside : SPECIALIST.outside;
  if (context.tuning) {
    accuracy += context.tuning.accuracy * clamp((1 - accuracy) / TUNING_REF, TUNING_MIN, 1);
    if (!context.typing?.chars.length) avgMs *= context.tuning.time;
  }
  return { accuracy: clamp(accuracy, 0.05, 0.99), avgMs: Math.round(avgMs), streaky: bot.style === "irregular" };
}

/** Digitação do bot (19/10/2026, pedido do Enzo: "1,7 s fixo castiga a escrita: cai República Centro-Africana e eu nunca bato o tempo do bot"):
 *  cada letra da resposta conta de TYPO_MIN a TYPO_MAX teclas (os erros de digitação e as correções: 10 letras viram 13 a 15 teclas) e cada tecla
 *  leva `key` vezes o tempo-base do bot; antes vem o tempo de pensar (`think` vezes o tempo-base, com a mesma variação das outras respostas). */
export const TYPO_MIN = 1.3;
export const TYPO_MAX = 1.5;
export const typingMs = (avgMs: number, typing: { think: number; key: number }, chars: number, random: () => number) =>
  Math.round(avgMs * (typing.think * (0.7 + random() * 0.6) + Math.max(1, chars) * (TYPO_MIN + random() * (TYPO_MAX - TYPO_MIN)) * typing.key));

/** O mais rápido que uma pessoa muito rápida responde (19/10/2026, pedido do Enzo: "o tempo de reação tem que ser realista, humano, senão os bots
 *  ficam imbatíveis"): ler e tocar numa alternativa 0,9 s; achar e clicar no mapa 1,3 s; digitar 0,5 s para começar e 140 ms por letra (~85
 *  palavras por minuto, já com algum erro). Nenhuma resposta do bot sai mais rápida; só pesa nos mais rápidos (o "rápido" do Grão-Mestre). */
export const HUMAN_FLOOR = { opcoes: 900, clique: 1300, escritaStart: 500, escritaPerChar: 140 };
/** Letras de uma resposta digitada quando o baralho não é conhecido (o nome médio de país). */
const MEAN_CHARS = 10;
export function humanFloorMs(kind: BotContext["kind"], chars?: number) {
  if (!kind) return 0;
  if (kind === "escrita") return HUMAN_FLOOR.escritaStart + Math.max(1, chars ?? MEAN_CHARS) * HUMAN_FLOOR.escritaPerChar;
  return HUMAN_FLOOR[kind];
}

export function simulateBot(bot: Bot, rounds: number, seed: string, context: BotContext = { division: 1, family: null }) {
  const profile = botProfile(bot, context);
  const typing = context.typing?.chars.length ? context.typing : null;
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
    const chars = typing ? typing.chars[round % typing.chars.length] : undefined;
    const ms = typing ? typingMs(profile.avgMs, typing, chars as number, random) : Math.round(profile.avgMs * (0.7 + random() * 0.6));
    totalMs += Math.max(ms, humanFloorMs(context.kind, chars));
  }
  return { correct, totalMs };
}
