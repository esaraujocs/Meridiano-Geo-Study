// Troféus do duelo entre pessoas (valendo): a mesma escada e a mesma conta do duelo contra bot (mmr.ts), com o adversário de verdade no lugar do bot.
// Transição (28/09): enquanto há pouca gente, bot e pessoa mexem nos mesmos troféus; o MMR escondido do adversário (que o aparelho dele informa ao
// servidor) faz o papel do rating do bot. O amistoso não mexe em troféu. Lógica pura.
import { MMR_MODEL, expectedScore, leadOf, mmrChange, outcomeScore, sigmaNext, trophyChange, SIGMA_MIN, type SurpriseSample } from "./mmr.js";
import type { DuelOutcome } from "./duel.js";
import type { Ladder } from "./duel-modes.js";

/** Onde a pessoa está na escada antes do duelo (tudo derivado do histórico: troféus, MMR, incerteza, surpresa e sequência). */
export type LadderState = { trophies: number; mmr: number; sigma: number; samples: readonly SurpriseSample[]; streak: number };

export type PvpTrophyInput = LadderState & {
  /** MMR do adversário naquela escada (sem ele, os troféus dele). */
  opponentMmr: number;
  outcome: DuelOutcome;
  /** Acertos da pessoa menos os do adversário. */
  margin: number;
};

export type PvpTrophyResult = {
  trophyDelta: number;
  trophiesAfter: number;
  streakBonus: number;
  perfBonus: number;
  mmrDelta: number;
  mmrVersion: number;
  mmrSigma: number;
  mmrExp: number;
};

/** Quanto um duelo valendo contra uma pessoa mexe nos troféus e no MMR (a mesma conta do duelo contra bot, mmr.ts). */
export function settlePvpTrophies({ trophies, mmr, sigma, samples, streak, opponentMmr, outcome, margin }: PvpTrophyInput): PvpTrophyResult {
  const start = Math.max(0, Number.isFinite(trophies) ? trophies : 0);
  const own = Number.isFinite(mmr) ? mmr : start;
  const opponent = Math.max(0, Number.isFinite(opponentMmr) ? opponentMmr : 0);
  const change = trophyChange({ trophies: start, mmr: own, streak, outcome, margin, lead: leadOf(opponent, start) });
  const trophiesAfter = Math.max(0, start + change.delta);
  const step = Number.isFinite(sigma) ? sigma : SIGMA_MIN;
  const mmrAfter = Math.max(0, own + mmrChange(own, opponent, outcome, margin, step));
  const expected = expectedScore(own, opponent);
  return {
    trophyDelta: trophiesAfter - start, trophiesAfter, streakBonus: change.streakBonus, perfBonus: change.perfBonus,
    mmrDelta: mmrAfter - own, mmrVersion: MMR_MODEL, mmrSigma: sigmaNext(step, [...samples, { score: outcomeScore(outcome), expected }]), mmrExp: expected,
  };
}

/** Um duelo que conta na escada (contra bot ou contra pessoa), no formato que as contas de troféus, MMR e sequência leem (duel.ts, duel-view.ts). */
export type LadderEntry = {
  id: string; at: number; ladder: Ladder; delta: number; outcome: DuelOutcome;
  mmrDelta?: number; mmrVersion?: number; mmrSigma?: number; mmrExp?: number;
};

/** O que um duelo entre pessoas guarda para a escada (só o valendo calculado no aparelho tem; o amistoso e os que vieram só do servidor, não). */
export type PvpLadderFields = {
  id: string; at: number; ladder: Ladder; mode: string; outcome: DuelOutcome;
  trophyDelta?: number | null; mmrDelta?: number; mmrVersion?: number; mmrSigma?: number; mmrExp?: number;
};

/** Os duelos entre pessoas que mexeram nos troféus, prontos para somar aos duelos contra bot. */
export function pvpLadderEntries(matches: readonly PvpLadderFields[]): LadderEntry[] {
  return matches
    .filter((match) => match.mode === "ranked" && typeof match.trophyDelta === "number" && Number.isFinite(match.trophyDelta))
    .map((match) => ({
      id: match.id, at: match.at, ladder: match.ladder, delta: match.trophyDelta as number, outcome: match.outcome,
      ...(typeof match.mmrDelta === "number" ? { mmrDelta: match.mmrDelta } : {}),
      ...(typeof match.mmrVersion === "number" ? { mmrVersion: match.mmrVersion } : {}),
      ...(typeof match.mmrSigma === "number" ? { mmrSigma: match.mmrSigma } : {}),
      ...(typeof match.mmrExp === "number" ? { mmrExp: match.mmrExp } : {}),
    }));
}
