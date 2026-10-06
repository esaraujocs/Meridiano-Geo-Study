// Moedas ganhas numa partida ("espólios"). Lógica pura: as regras de recompensa, sem IndexedDB nem React.
import type { AnyQuizVariant, Meta } from "./types";

export type Pace = "training" | "timed";
export type Tier = 1 | 2 | 3;

/** O Treino paga só uma fração das moedas, para incentivar a jogar com tempo. */
export const TRAINING_COIN_FACTOR = 0.5;
/** Rodada em que um suprimento de expedição foi usado paga só uma fração do acerto (e da sequência dele) — o resto da partida paga cheio. */
export const ASSISTED_COIN_FACTOR = 0.5;
export const NEW_CARD_COINS = 60;
export const LEVEL_UP_COINS = 30;
/**
 * Sequência: cada acerto seguido soma 3% do valor daquele acerto, até +75% (o teto chega no 25º acerto seguido).
 * É proporcional ao valor do modo (e não um número fixo) para o modo fácil nunca pagar tanto por hora quanto o difícil.
 */
export const STREAK_STEP = 0.03;
export const STREAK_CAP = 0.75;
const TIER_FACTOR: Record<Tier, number> = { 1: 1, 2: 1.12, 3: 1.25 };

// Moedas base por acerto (Partida). Bandeira/nome com alternativas = 32; capital escrita = 96 (3×).
const BASE_BY_VARIANT: Partial<Record<AnyQuizVariant, number>> = {
  "bandeira-nome": 32, "nome-bandeira": 32,
  "pais-capital": 40,
  "historica-nome": 44, "nome-historica": 44, "idioma-nome": 40, "idioma-pais": 44,
  "gentilico-pais": 32, "pais-gentilico": 36, "pais-moeda": 40, "moeda-pais": 44,
  mapa: 48,
  "capital-pais": 56, "silhueta-opcoes": 56,
  travel: 64,
  "escrita-pais": 80,
  silhueta: 88,
  "escrita-capital": 96,
  // Brasil: 3/4 do modo equivalente do mapa-múndi (27 estados se aprendem bem mais depressa que 250 países)
  "br-nome-bandeira": 24, "br-bandeira-nome": 24,
  "br-estado-capital": 30,
  "br-mapa": 36,
  "br-capital-mapa": 42, "br-silhueta-opcoes": 42,
  "br-escrita-estado": 60,
  "br-silhueta": 66,
  "br-escrita-capital": 72,
};
export const baseCoins = (variant: AnyQuizVariant) => BASE_BY_VARIANT[variant] ?? 32;
export const hitCoins = (variant: AnyQuizVariant, tier: Tier = 1) => Math.round(baseCoins(variant) * TIER_FACTOR[tier]);
/** Faixa por acerto mostrada na configuração (país fácil → país difícil). */
export const hitRange = (variant: AnyQuizVariant, pace: Pace): [number, number] => {
  const factor = pace === "training" ? TRAINING_COIN_FACTOR : 1;
  return [Math.round(hitCoins(variant, 1) * factor), Math.round(hitCoins(variant, 3) * factor)];
};

// Dificuldade do país: menos populoso e menor = mais difícil de reconhecer ou achar no mapa.
// Catálogo sem população (os estados do Brasil): a ordem sai só da área, do maior para o menor.
const tierCache = new WeakMap<object, Map<string, Tier>>();
function buildTiers(meta: Record<string, Meta>) {
  const tiers = new Map<string, Tier>();
  const byPop = Object.entries(meta).filter(([, item]) => !item.absorvido && typeof item.pop === "number" && item.pop > 0).sort((a, b) => (b[1].pop ?? 0) - (a[1].pop ?? 0));
  const ranked = byPop.length ? byPop : Object.entries(meta).filter(([, item]) => !item.absorvido && typeof item.area === "number" && item.area > 0).sort((a, b) => (b[1].area ?? 0) - (a[1].area ?? 0));
  const third = Math.max(1, Math.ceil(ranked.length / 3));
  ranked.forEach(([id], index) => tiers.set(id, index < third ? 1 : index < third * 2 ? 2 : 3));
  for (const [id, item] of Object.entries(meta)) {
    const base = tiers.get(id) ?? 3;
    const area = typeof item.area === "number" ? item.area : Infinity;
    tiers.set(id, (area < 1000 ? 3 : area < 20000 ? Math.max(base, 2) : base) as Tier);
  }
  return tiers;
}
export function entityTier(meta: Record<string, Meta> | undefined, id: string): Tier {
  if (!meta) return 1;
  let tiers = tierCache.get(meta);
  if (!tiers) { tiers = buildTiers(meta); tierCache.set(meta, tiers); }
  return tiers.get(id) ?? 1;
}

export type SpoilsRound = {
  correct: boolean;
  tier?: Tier;
  /** Quanto da rodada foi cumprido (Travel: países da rota acertados). Sem valor: 1 se acertou, 0 se errou. */
  weight?: number;
  /** Rodada respondida com ajuda de um suprimento de expedição (Lupa/Bússola/Ampulheta): paga ASSISTED_COIN_FACTOR do normal. */
  assisted?: boolean;
  /** O Escudo de sequência cobriu este erro: a rodada sai da conta da sequência e da precisão da partida (não quebra nem soma). */
  shielded?: boolean;
};
export type SpoilsInput = {
  variant: AnyQuizVariant;
  pace: Pace;
  rounds: readonly SpoilsRound[];
  complete: boolean;
  newCards: number;
  levelUps: number;
};
export type Spoils = {
  pace: Pace;
  factor: number;
  hits: { count: number; coins: number };
  streak: { best: number; coins: number };
  newCards: { count: number; coins: number };
  levelUps: { count: number; coins: number };
  completion: { pct: number; coins: number };
  total: number;
};

// Bônus de partida completa por rodada: 90%+ → 14, 75%+ → 9, 60%+ → 5.
export const completionPerRound = (accuracy: number) => (accuracy >= 0.9 ? 14 : accuracy >= 0.75 ? 9 : accuracy >= 0.6 ? 5 : 0);

/** Partida abandonada no meio: nenhuma moeda (e nenhum XP, que só conta partidas completas). */
export function emptySpoils(pace: Pace): Spoils {
  return {
    pace, factor: pace === "training" ? TRAINING_COIN_FACTOR : 1,
    hits: { count: 0, coins: 0 }, streak: { best: 0, coins: 0 }, newCards: { count: 0, coins: 0 },
    levelUps: { count: 0, coins: 0 }, completion: { pct: 0, coins: 0 }, total: 0,
  };
}

/** Escala todas as moedas do espólio por um fator (o duelo amistoso entre pessoas paga menos, ver FRIENDLY_COIN_FACTOR em pvp.ts). */
export function scaleSpoils(spoils: Spoils, coinFactor: number): Spoils {
  if (coinFactor === 1) return spoils;
  const scale = (value: number) => Math.round(value * coinFactor);
  return {
    ...spoils, factor: spoils.factor * coinFactor,
    hits: { ...spoils.hits, coins: scale(spoils.hits.coins) },
    streak: { ...spoils.streak, coins: scale(spoils.streak.coins) },
    newCards: { ...spoils.newCards, coins: scale(spoils.newCards.coins) },
    levelUps: { ...spoils.levelUps, coins: scale(spoils.levelUps.coins) },
    completion: { ...spoils.completion, coins: scale(spoils.completion.coins) },
    total: scale(spoils.total),
  };
}

/** Soma dos espólios de várias sessões (os dois tempos de um duelo): a mesma decomposição, com a melhor sequência e a precisão ponderadas. */
export function mergeSpoils(parts: readonly Spoils[]): Spoils {
  const sum = (pick: (spoils: Spoils) => number) => parts.reduce((total, spoils) => total + pick(spoils), 0);
  const weighted = parts.length ? Math.round(sum((spoils) => spoils.completion.pct) / parts.length) : 0;
  return {
    pace: parts[0]?.pace ?? "timed",
    factor: parts[0]?.factor ?? 1,
    hits: { count: sum((s) => s.hits.count), coins: sum((s) => s.hits.coins) },
    streak: { best: Math.max(0, ...parts.map((s) => s.streak.best)), coins: sum((s) => s.streak.coins) },
    newCards: { count: sum((s) => s.newCards.count), coins: sum((s) => s.newCards.coins) },
    levelUps: { count: sum((s) => s.levelUps.count), coins: sum((s) => s.levelUps.coins) },
    completion: { pct: weighted, coins: sum((s) => s.completion.coins) },
    total: sum((s) => s.total),
  };
}

export function computeSpoils(input: SpoilsInput): Spoils {
  const factor = input.pace === "training" ? TRAINING_COIN_FACTOR : 1;
  let hitCount = 0;
  let hitCoinsRaw = 0;
  let streak = 0;
  let best = 0;
  let streakRaw = 0;
  let correctRounds = 0;
  // Rodada coberta pelo Escudo: não quebra a sequência nem entra na precisão que paga o bônus de conclusão (só o que já foi acertado dentro dela, como
  // os países de uma rota do Travel, ainda paga).
  const counted = input.rounds.filter((round) => !round.shielded);
  for (const round of input.rounds) {
    const weight = round.weight ?? (round.correct ? 1 : 0);
    const assistedFactor = round.assisted ? ASSISTED_COIN_FACTOR : 1;
    if (weight > 0) {
      hitCount += 1;
      hitCoinsRaw += hitCoins(input.variant, round.tier ?? 1) * weight * assistedFactor;
    }
    if (round.shielded) continue;
    if (round.correct) {
      correctRounds += 1;
      streak += 1;
      best = Math.max(best, streak);
      streakRaw += hitCoins(input.variant, round.tier ?? 1) * weight * assistedFactor * Math.min(streak * STREAK_STEP, STREAK_CAP);
    } else streak = 0;
  }
  const accuracy = counted.length ? correctRounds / counted.length : 0;
  const completionRaw = input.complete ? completionPerRound(accuracy) * counted.length : 0;
  const scale = (value: number) => Math.round(value * factor);
  const lines = {
    hits: { count: hitCount, coins: scale(hitCoinsRaw) },
    streak: { best, coins: scale(streakRaw) },
    newCards: { count: input.newCards, coins: scale(input.newCards * NEW_CARD_COINS) },
    levelUps: { count: input.levelUps, coins: scale(input.levelUps * LEVEL_UP_COINS) },
    completion: { pct: Math.round(accuracy * 100), coins: scale(completionRaw) },
  };
  const total = lines.hits.coins + lines.streak.coins + lines.newCards.coins + lines.levelUps.coins + lines.completion.coins;
  return { pace: input.pace, factor, ...lines, total };
}
