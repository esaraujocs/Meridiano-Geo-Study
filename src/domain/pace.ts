// Ritmo da partida (Treino ou Partida com tempo) e quantidade de rodadas. Lógica pura.
import type { AnyQuizVariant, Family } from "./types";
import type { Pace } from "./spoils.js";

/** Tamanho da partida: 10 grátis; 20, 50, 100 e todas (baralho completo) são compradas. */
export type RoundTier = "short" | "long" | "fifty" | "hundred" | "all";
export const ROUND_TIERS: readonly RoundTier[] = ["short", "long", "fifty", "hundred", "all"];
export type SessionOptions = { pace: Pace; roundLimit: number | null };

/** Desbloqueios de rodadas: valem para todos os modos, para sempre. Comprar um corte maior inclui os menores. */
export const ROUND_UNLOCKS = [
  { tier: "long" as const, key: "rounds:20" as const, label: "20 rodadas", cost: 3000 },
  { tier: "fifty" as const, key: "rounds:50" as const, label: "50 rodadas", cost: 8000 },
  { tier: "hundred" as const, key: "rounds:100" as const, label: "100 rodadas", cost: 20000 },
  { tier: "all" as const, key: "rounds:all" as const, label: "Baralho completo", cost: 85000 },
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
    label: tier !== covering ? String(roundLimitFor(tier, family)) : tier === "short" ? String(total) : `Todas · ${total}`,
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
//   vez de um nome só (idioma-pais).
// - 30 s — digitar o nome completo, com acentuação.
// - 120 s — Travel, várias etapas e vários países pra digitar numa rota só.
export function timerSecondsFor(variant: AnyQuizVariant): number {
  switch (variant) {
    case "mapa": case "historica-nome": case "nome-historica": case "silhueta-opcoes": case "idioma-pais":
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
  return { pace, roundLimit: options?.roundLimit ?? null, timerSeconds: paceSecondsFor(pace, variant) };
}
