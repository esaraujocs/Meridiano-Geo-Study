// A "força" do duelo entre pessoas: um Elo simples, próprio (não é o MMR/troféus do duelo contra bot, ver mmr.ts), derivado do histórico de partidas
// valendo (o amistoso não muda nada). Chute inicial, para calibrar depois de jogar. Lógica pura.
import type { PvpOutcome } from "./pvp.js";

export const PVP_RATING_BASE = 1000;
/** Passo do Elo: quanto o resultado (surpreendente ou esperado) move a força de cada lado. */
export const PVP_K = 24;

/** Chance esperada de vitória (0 a 1) com a diferença de força entre os dois. */
export const pvpExpectedScore = (mine: number, opponent: number) => 1 / (1 + 10 ** ((opponent - mine) / 400));

/** Quanto a força muda depois de um duelo valendo (positivo ganha, negativo perde; simétrico, some do outro lado). */
export function pvpRatingChange(mine: number, opponent: number, outcome: PvpOutcome): number {
  const score = outcome === "win" ? 1 : outcome === "loss" ? 0 : 0.5;
  return Math.round(PVP_K * (score - pvpExpectedScore(mine, opponent)));
}

/** Uma partida valendo já resolvida, na ordem em que aconteceu, com a força do adversário no momento (o que ele informou ao entrar). */
export type RankedPvpMatch = { opponentRating: number; outcome: PvpOutcome };

/** A força atual, a partir do zero e do histórico de partidas valendo, em ordem. */
export function pvpRatingFromHistory(matches: readonly RankedPvpMatch[]): number {
  let rating = PVP_RATING_BASE;
  for (const match of matches) rating = Math.max(0, rating + pvpRatingChange(rating, match.opponentRating, match.outcome));
  return rating;
}
