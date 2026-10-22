// Um duelo em andamento (2 tempos de 10 rodadas): o estado, as opções de cada sessão e a resolução no fim. Lógica pura.
import type { Bot } from "./bots.js";
import type { AnyQuizVariant } from "./types";
import { SIGMA_MIN, type SurpriseSample } from "./mmr.js";
import { LEGS, coinModeFor, isVariantOwned, type DuelLeg, type Ladder, type ModeGroup } from "./duel-modes.js";
import { resolveDuelLegs, type DuelLegsResult, type LegInput } from "./duel.js";

/** `chars`: nos modos digitados, as letras de cada resposta do tempo (o bot digita o mesmo baralho). */
export type LegDone = { group: ModeGroup; rounds: number; playerCorrect: number; playerMs: number | null; chars?: readonly number[]; spots?: readonly number[]; regions?: readonly (string | undefined)[] };

export type DuelRun = {
  /** Também é a semente do duelo: sorteio dos tempos, baralhos e bot. */
  id: string;
  ladder: Ladder;
  bot: Bot;
  trophiesBefore: number;
  /** Divisão do adversário sorteado (matchmaking pelo MMR). */
  division: 1 | 2 | 3 | null;
  /** Rating do adversário: decide a força do bot e a nota contra a qual o MMR muda (sem ele, a divisão). */
  rating?: number;
  /** O bot é um do ranking e joga com a própria força (`rankedOpponent`); sem isso (duelos de antes, sem o ranking), com a do rating. */
  own?: boolean;
  /** Os troféus do bot no ranking na hora do duelo: a liga dele que aparece na tela (a mesma do ranking), não a de nascimento. */
  botTrophies?: number;
  /** A pessoa saiu no meio: o duelo é derrota, mesmo que o tempo interrompido (gravado com o que ela respondeu, `quitLeg`) somasse mais. */
  abandoned?: boolean;
  /** Vitórias seguidas na escada antes deste duelo (bônus de sequência). */
  streak: number;
  /** MMR escondido na escada antes deste duelo (muda o ganho e a perda de troféus). */
  mmr: number;
  /** Incerteza do MMR nesta escada e os duelos recentes para a surpresa (decidem o passo do MMR). */
  sigma: number;
  samples: readonly SurpriseSample[];
  legs: readonly DuelLeg[];
  done: readonly LegDone[];
  /** Tempo em jogo (0 ou 1). */
  index: number;
};

export const newDuelRun = (input: { id: string; ladder: Ladder; bot: Bot; trophiesBefore: number; division: 1 | 2 | 3 | null; legs: readonly DuelLeg[]; streak?: number; mmr?: number; rating?: number; own?: boolean; botTrophies?: number; sigma?: number; samples?: readonly SurpriseSample[] }): DuelRun => ({ ...input, streak: input.streak ?? 0, mmr: input.mmr ?? input.trophiesBefore, sigma: input.sigma ?? SIGMA_MIN, samples: input.samples ?? [], done: [], index: 0 });

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

/** A pessoa saiu no meio de um tempo (20/10/2026, pedido do Enzo: "quitar no meio podia marcar as que eu joguei"): o tempo fica com os acertos
 *  das rodadas que ela respondeu (as que faltaram valem zero, sem tempo) e o duelo fica marcado como abandonado. */
export function quitLeg(run: DuelRun, answered: readonly { correct: boolean }[]): DuelRun {
  const leg = run.legs[run.index];
  const partial = run.done.length <= run.index && answered.length > 0
    ? recordLeg(run, { group: leg.group, rounds: leg.rounds, playerCorrect: answered.filter((round) => round.correct).length, playerMs: null })
    : run;
  return { ...partial, abandoned: true };
}

/** Fecha o duelo. Tempo que ficou por jogar (a pessoa saiu no meio) conta como zero acerto, e sair é sempre derrota (`forfeit`): desistir no 2º
 *  tempo não é escapatória. */
export function resolveRun(run: DuelRun): DuelLegsResult {
  const legs: LegInput[] = run.legs.map((leg, index) => run.done[index] ?? { group: leg.group, rounds: leg.rounds, playerCorrect: 0, playerMs: null });
  return resolveDuelLegs({ trophies: run.trophiesBefore, bot: run.bot, legs, seed: run.id, division: run.division, rating: run.rating, own: run.own, streak: run.streak, mmr: run.mmr, sigma: run.sigma, recent: run.samples, forfeit: isAbandoned(run) });
}
export const isAbandoned = (run: DuelRun) => Boolean(run.abandoned) || run.done.length < LEGS;
