// Ritmo da partida (Treino ou Partida com tempo) e quantidade de rodadas. Lógica pura.
import type { AnyQuizVariant, Family } from "./types";
import type { Pace } from "./spoils.js";
import type { LearningRound } from "./learning-store.js";
import { t } from "./i18n/index.js";
import { baseVariant } from "./divisions.js";

/** Tamanho da partida: 10 grátis; 20, 50, 100 e todas (baralho completo) são compradas. */
export type RoundTier = "short" | "long" | "fifty" | "hundred" | "all";
export const ROUND_TIERS: readonly RoundTier[] = ["short", "long", "fifty", "hundred", "all"];
export type SessionOptions = {
  pace: Pace;
  roundLimit: number | null;
  /** Duelo: semente do baralho (dois jogadores com a mesma semente recebem as mesmas cartas na mesma ordem). */
  deckSeed?: number;
  /** Duelo: o modo que paga as moedas, quando não é o próprio (modo de prévia paga como o modo base da escada). */
  coinVariant?: AnyQuizVariant;
  /** Duelo: a que duelo e a que tempo esta sessão pertence. */
  duel?: { id: string; leg: number };
  /** Duelo entre pessoas (não contra bot): a saída do meio conta o que já foi jogado, não é derrota automática (o aviso de sair usa outro texto). */
  pvp?: boolean;
  /** Chamado a cada rodada respondida, na hora (antes de gravar): o duelo entre pessoas usa para avisar o servidor a cada rodada. */
  onRound?: (round: LearningRound) => void;
  /** Multiplica as moedas da sessão (1 = normal); hoje nenhum modo usa (o amistoso pagava metade até 28/09, FRIENDLY_COIN_FACTOR em pvp.ts). */
  coinFactor?: number;
};

/** Desbloqueios de rodadas: valem para todos os modos, para sempre. Comprar um corte maior inclui os menores. */
export const ROUND_UNLOCKS = [
  { tier: "long" as const, key: "rounds:20" as const, label: t.roundUnlocks.long, cost: 3000 },
  { tier: "fifty" as const, key: "rounds:50" as const, label: t.roundUnlocks.fifty, cost: 8000 },
  { tier: "hundred" as const, key: "rounds:100" as const, label: t.roundUnlocks.hundred, cost: 20000 },
  { tier: "all" as const, key: "rounds:all" as const, label: t.roundUnlocks.all, cost: 85000 },
];
export type RoundUnlockKey = (typeof ROUND_UNLOCKS)[number]["key"];
export const roundUnlockFor = (tier: RoundTier) => ROUND_UNLOCKS.find((item) => item.tier === tier) ?? null;

// No Travel a rodada é uma rota inteira (bem mais longa), então os cortes são a metade.
export function roundLimitFor(tier: RoundTier, family: Family): number | null {
  if (tier === "all") return null;
  const limits = family === "travel" ? [5, 10, 25, 50] : [10, 20, 50, 100];
  return limits[ROUND_TIERS.indexOf(tier)];
}
/** O menor corte que já cobre o baralho inteiro do recorte (é ele que aparece como "Todas · N"). */
export function coveringTier(family: Family, total: number): RoundTier {
  return ROUND_TIERS.find((tier) => { const limit = roundLimitFor(tier, family); return limit === null || limit >= total; }) ?? "all";
}
/** Cortes que fazem sentido para o recorte: só até o que cobre tudo (Caribe com 27 não oferece 50 nem 100). */
export function roundChips(family: Family, total: number): { tier: RoundTier; label: string }[] {
  const covering = coveringTier(family, total);
  return ROUND_TIERS.slice(0, ROUND_TIERS.indexOf(covering) + 1).map((tier) => ({
    tier,
    label: tier !== covering ? String(roundLimitFor(tier, family)) : tier === "short" ? String(total) : t.config.allRounds(total),
  }));
}
/** Um corte guardado maior do que o recorte precisa aparece como o corte que cobre o recorte. */
export const displayTier = (tier: RoundTier, family: Family, total: number): RoundTier => {
  const covering = coveringTier(family, total);
  return ROUND_TIERS.indexOf(tier) > ROUND_TIERS.indexOf(covering) ? covering : tier;
};
export const isRoundTierUnlocked = (tier: RoundTier, unlocked: readonly string[]) => {
  const index = ROUND_TIERS.indexOf(tier);
  if (index <= 0) return true;
  return ROUND_UNLOCKS.some((item) => ROUND_TIERS.indexOf(item.tier) >= index && unlocked.includes(item.key));
};

// Tempo por pergunta na Partida — rede de segurança, não corrida: confirmar que a pessoa sabe, sem
// apressar, mas sem sobrar tempo ocioso. Revisitado por completo (22/09), não só o caso do capital-pais:
// - 15 s — 4 alternativas curtas, reconhecidas de cara (nome/bandeira/idioma) ou capital-pais (clique no
//   mapa, mas quem sabe a capital de cor já sabe o país — o gargalo é o mesmo clique de "mapa", só que
//   sem precisar escanear opção nenhuma antes).
// - 20 s — clicar no mapa de verdade (busca física, às vezes com zoom/pan, não é só reconhecer) ou
//   4 alternativas que pedem mais leitura: entidade histórica pouco conhecida (historica-nome/
//   nome-historica), silhueta sem cor pra ajudar (silhueta-opcoes), ou opção com lista de países em
//   vez de um nome só (idioma-pais), ou o nome de uma moeda (pais-moeda, moeda-pais: rial, riel e real pedem leitura).
// - 30 s — digitar o nome completo, com acentuação.
// - 120 s — Travel, várias etapas e vários países pra digitar numa rota só.
export function timerSecondsFor(variant: AnyQuizVariant): number {
  // os modos de Estados e províncias têm o tempo do modo equivalente do mapa-múndi
  switch (baseVariant(variant)) {
    case "mapa": case "historica-nome": case "nome-historica": case "silhueta-opcoes": case "idioma-pais": case "pais-moeda": case "moeda-pais":
      return 20;
    case "capital-pais": return 15;
    case "escrita-pais": case "escrita-capital": case "silhueta": return 30;
    case "travel": return 120;
    default: return 15;
  }
}
export const paceSecondsFor = (pace: Pace, variant: AnyQuizVariant) => (pace === "timed" ? timerSecondsFor(variant) : null);

export const DEFAULT_PACE: Pace = "timed";
export const isPace = (value: unknown): value is Pace => value === "training" || value === "timed";
export const isRoundTier = (value: unknown): value is RoundTier => ROUND_TIERS.includes(value as RoundTier);

/** Ritmo, tamanho e tempo por pergunta que um jogo usa. Sem opções (uso direto do motor): sem cronômetro e baralho completo. */
export function sessionSettings(options: SessionOptions | undefined, variant: AnyQuizVariant) {
  const pace: Pace = options?.pace ?? "training";
  // Só leva as chaves do duelo quando existem (o solo continua com {pace, roundLimit, timerSeconds}).
  const duel: Pick<SessionOptions, "deckSeed" | "coinVariant" | "duel" | "pvp" | "onRound" | "coinFactor"> = {
    ...(options?.deckSeed !== undefined ? { deckSeed: options.deckSeed } : {}),
    ...(options?.coinVariant ? { coinVariant: options.coinVariant } : {}),
    ...(options?.duel ? { duel: options.duel } : {}),
    ...(options?.pvp ? { pvp: options.pvp } : {}),
    ...(options?.onRound ? { onRound: options.onRound } : {}),
    ...(options?.coinFactor !== undefined ? { coinFactor: options.coinFactor } : {}),
  };
  return { pace, roundLimit: options?.roundLimit ?? null, timerSeconds: paceSecondsFor(pace, variant), ...duel };
}
