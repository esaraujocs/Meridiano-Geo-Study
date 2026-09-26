// Um duelo em andamento (2 tempos de 10 rodadas): o estado, as opções de cada sessão e a resolução no fim. Lógica pura.
import type { Bot } from "./bots.js";
import type { AnyQuizVariant } from "./types";
import { LEGS, coinModeFor, isVariantOwned, type DuelLeg, type Ladder, type ModeGroup } from "./duel-modes.js";
import { resolveDuelLegs, type DuelLegsResult, type LegInput } from "./duel.js";

export type LegDone = { group: ModeGroup; rounds: number; playerCorrect: number; playerMs: number | null };

export type DuelRun = {
  /** Também é a semente do duelo: sorteio dos tempos, baralhos e bot. */
  id: string;
  ladder: Ladder;
  bot: Bot;
  trophiesBefore: number;
  division: 1 | 2 | 3 | null;
  /** Vitórias seguidas na escada antes deste duelo (bônus de sequência). */
  streak: number;
  legs: readonly DuelLeg[];
  done: readonly LegDone[];
  /** Tempo em jogo (0 ou 1). */
  index: number;
};

export const newDuelRun = (input: { id: string; ladder: Ladder; bot: Bot; trophiesBefore: number; division: 1 | 2 | 3 | null; legs: readonly DuelLeg[]; streak?: number }): DuelRun => ({ ...input, streak: input.streak ?? 0, done: [], index: 0 });

/** Opções da sessão de um tempo: sempre com tempo, 10 rodadas, baralho da semente e, se o modo é de prévia, as moedas do modo base. */
export type LegSessionOptions = { pace: "timed"; roundLimit: number; deckSeed: number; coinVariant?: AnyQuizVariant; duel: { id: string; leg: number } };
export function legOptions(run: DuelRun, unlocked: readonly string[], index = run.index): LegSessionOptions {
  const leg = run.legs[index];
  const owned = isVariantOwned(leg, unlocked);
  const coin = coinModeFor(run.ladder, leg, owned);
  return {
    pace: "timed",
    roundLimit: leg.rounds,
    deckSeed: leg.deckSeed,
    ...(owned ? {} : { coinVariant: coin.variant }),
    duel: { id: run.id, leg: index },
  };
}

/** Cada tempo com o que a pessoa tem ou não (prévia) e o modo que paga as moedas, para mostrar antes de começar. */
export const previewLegs = (run: DuelRun, unlocked: readonly string[]) =>
  run.legs.map((leg, index) => {
    const owned = isVariantOwned(leg, unlocked);
    return { index, leg, owned, coin: coinModeFor(run.ladder, leg, owned) };
  });

/** Registra o tempo que acabou e passa para o próximo. */
export const recordLeg = (run: DuelRun, done: LegDone): DuelRun => ({ ...run, done: [...run.done, done], index: Math.min(LEGS - 1, run.index + 1) });
export const isRunComplete = (run: DuelRun) => run.done.length >= LEGS;

/** Fecha o duelo. Tempo que ficou por jogar (a pessoa saiu no meio) conta como zero acerto: desistir no 2º tempo é derrota, não escapatória. */
export function resolveRun(run: DuelRun): DuelLegsResult {
  const legs: LegInput[] = run.legs.map((leg, index) => run.done[index] ?? { group: leg.group, rounds: leg.rounds, playerCorrect: 0, playerMs: null });
  return resolveDuelLegs({ trophies: run.trophiesBefore, bot: run.bot, legs, seed: run.id, division: run.division, streak: run.streak });
}
