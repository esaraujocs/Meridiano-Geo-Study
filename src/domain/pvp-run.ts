// O andamento local do duelo entre pessoas (2 tempos de 10 rodadas, como o duelo contra bot): a semente da SALA decide os grupos, o sentido e o baralho
// (drawLegs, sem depender de quem comprou o quê — os dois jogadores tiram a mesma semente do servidor e sorteiam os mesmos tempos, cada um no próprio
// ritmo). Lógica pura; o relato ao servidor (onRound) é responsabilidade de quem chama (app.tsx). Ver server/pvp-rooms.ts para o lado da sala.
import { coinModeFor, drawLegs, isVariantOwned, type DuelLeg, type Ladder } from "./duel-modes.js";
import type { LearningRound } from "./learning-store.js";
import type { LegDone } from "./duel-run.js";
import { FRIENDLY_COIN_FACTOR, type PvpMode } from "./pvp.js";

export type PvpRun = {
  code: string;
  ladder: Ladder;
  mode: PvpMode;
  isHost: boolean;
  legs: readonly [DuelLeg, DuelLeg];
  done: readonly LegDone[];
  index: number;
};

export const newPvpRun = (input: { code: string; ladder: Ladder; mode: PvpMode; isHost: boolean; seed: string }): PvpRun => {
  const [a, b] = drawLegs(input.ladder, input.seed);
  return { code: input.code, ladder: input.ladder, mode: input.mode, isHost: input.isHost, legs: [a, b], done: [], index: 0 };
};

/** Opções do tempo em jogo: sempre com tempo, 10 rodadas, baralho da semente; modo que a pessoa não tem paga como o modo base da escada (a mesma
 *  regra de prévia do duelo contra bot); o amistoso paga a metade. `onRound` reporta cada rodada respondida (o app.tsx avisa o servidor). */
export function pvpLegOptions(run: PvpRun, index: number, unlocked: readonly string[], onRound: (round: LearningRound) => void) {
  const leg = run.legs[index];
  const owned = isVariantOwned(leg, unlocked);
  const coin = coinModeFor(run.ladder, leg, owned);
  return {
    pace: "timed" as const, roundLimit: leg.rounds, deckSeed: leg.deckSeed, duel: { id: run.code, leg: index }, pvp: true, onRound,
    ...(owned ? {} : { coinVariant: coin.variant }),
    ...(run.mode === "friendly" && FRIENDLY_COIN_FACTOR !== 1 ? { coinFactor: FRIENDLY_COIN_FACTOR } : {}),
  };
}

export const recordPvpLeg = (run: PvpRun, done: LegDone): PvpRun => ({ ...run, done: [...run.done, done], index: Math.min(1, run.index + 1) });
export const isPvpRunComplete = (run: PvpRun) => run.done.length >= 2;
