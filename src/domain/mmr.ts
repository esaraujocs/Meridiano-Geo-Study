// Troféus e nível de jogo escondido (MMR) do Duelo. Lógica pura.
//
// Os troféus (o que a pessoa vê) rendem o mesmo em quase toda a escada: a vitória vale BASE_WIN e a derrota custa BASE_LOSS, com um
// extra na vitória pelo desempenho (acertos à frente do bot) e pela sequência. O MMR (o que a pessoa não vê) diz se ela joga melhor ou
// pior do que a liga em que está e é ele que faz os troféus render mais ou menos:
//  - jogando no nível da liga (ganhando e perdendo perto de 50%), o MMR segura a pessoa: ela sobe devagar, tem de provar mais;
//  - jogando acima da liga, ganha mais, perde menos e o sorteio passa a trazer bots de ligas mais altas (matchmaking pelo MMR);
//  - jogando abaixo, ganha menos e perde mais, com bots de ligas mais baixas.
// Só no alto (a partir do Diamante) a vitória começa a render menos e a derrota a custar mais: o teto teórico, que separa quem tem o
// melhor desempenho. Não há limite de troféus no Mestre, mas a curva vai se fechando.
import { LEAGUES, LEAGUE_SPAN, leagueFloor, leagueOf } from "./league.js";

export const expectedScore = (rating: number, opponent: number) => 1 / (1 + Math.pow(10, (opponent - rating) / 400));

/** Ganho e perda-base (com o MMR no nível da liga, sem sequência nem desempenho) de Bronze a Platina. Chute inicial, para ajustar jogando. */
export const BASE_WIN = 33;
export const BASE_LOSS = 27;
/** O teto da vitória é o ganho-base + isto (50 no começo): sequência e desempenho boostam até aí. */
export const WIN_CAP_EXTRA = 17;
/** Bônus de desempenho: até PERF_MAX troféus quando a pessoa termina PERF_SPAN acertos (ou mais) à frente do bot. */
export const PERF_MAX = 8;
export const PERF_SPAN = 8;
/** Vitória e derrota rendem ao menos isto (no alto, onde a vitória encolhe, o piso da vitória é HIGH_MIN_WIN). */
export const MIN_WIN = 5;
export const MIN_LOSS = 5;
export const HIGH_MIN_WIN = 3;
/** A derrota apertada custa até 20% menos e a goleada até 10% mais. */
export const LOSS_CLOSE = 0.8;
export const LOSS_BLOWOUT = 1.1;

/** Alto elo: a partir de DECAY_START (o Diamante), a cada LEAGUE_SPAN troféus a vitória cai e a derrota sobe (e os bônus encolhem junto
 *  com a vitória). É o limite teórico: quanto mais alto, mais desempenho é preciso só para não descer. */
export const DECAY_START = leagueFloor(LEAGUES.indexOf("diamante"));
export const WIN_DECAY = 0.35;
export const LOSS_GROWTH = 0.15;

/** O MMR pesa por completo quando está GAP_SPAN troféus acima da pessoa (a vitória vai até +WIN_GAP e a derrota até −LOSS_GAP). Do lado de
 *  baixo, com os troféus à frente do MMR, o peso continua até GAP_DOWN vezes o vão (o MMR segura a subida). */
export const GAP_SPAN = 200;
export const GAP_DOWN = 3;
export const WIN_GAP = 0.35;
export const LOSS_GAP = 0.3;
export const WIN_FLOOR = 0.25;
/** Velocidade do MMR (Elo): o mesmo tamanho dos troféus, para os dois andarem juntos. */
export const MMR_K = 64;

/** Matchmaking pelo MMR: o bot sai da liga do MMR, no máximo MATCH_UP ligas acima e MATCH_DOWN abaixo da liga em troféus. */
export const MATCH_UP = 2;
export const MATCH_DOWN = 1;

/** Sequência: cada vitória seguida que a pessoa já tinha na escada soma STREAK_STEP troféus à próxima vitória, até STREAK_CAP vitórias
 *  (+12). Perder zera a sequência; o bônus só existe na vitória, a derrota não muda. */
export const STREAK_STEP = 3;
export const STREAK_CAP = 4;
export const streakBonus = (streak: number) => STREAK_STEP * Math.min(STREAK_CAP, Math.max(0, Math.floor(Number.isFinite(streak) ? streak : 0)));

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Ganho e perda-base de quem está com esses troféus: iguais até a Platina e, no alto, encolhendo e crescendo com a altura. `scale` é quanto o
 *  ganho já encolheu (1 fora do alto): os bônus de sequência e desempenho encolhem na mesma proporção, senão furariam o limite. */
export function baseStakes(trophies: number) {
  const above = Math.max(0, trophies - DECAY_START) / LEAGUE_SPAN;
  if (above <= 0) return { win: BASE_WIN, loss: BASE_LOSS, scale: 1, minWin: MIN_WIN };
  const win = Math.max(HIGH_MIN_WIN, Math.round(BASE_WIN / (1 + WIN_DECAY * above)));
  return { win, loss: Math.round(BASE_LOSS * (1 + LOSS_GROWTH * above)), scale: Math.min(1, win / BASE_WIN), minWin: HIGH_MIN_WIN };
}

/** Quanto o MMR muda o ganho e a perda: `gap` é MMR menos troféus (positivo = joga melhor que a liga). */
export function gapFactors(gap: number) {
  const g = Math.min(1, Math.max(-GAP_DOWN, (Number.isFinite(gap) ? gap : 0) / GAP_SPAN));
  return { win: Math.max(WIN_FLOOR, 1 + WIN_GAP * g), loss: 1 - LOSS_GAP * g };
}

/** Com quem a pessoa enfrenta: a liga e a divisão do MMR, presas entre MATCH_DOWN ligas abaixo e MATCH_UP acima da liga em troféus. */
export function matchmaking(trophies: number, mmr: number) {
  const home = leagueOf(trophies).index;
  const wanted = leagueOf(mmr).index;
  const index = Math.min(LEAGUES.length - 1, Math.max(0, Math.min(home + MATCH_UP, Math.max(home - MATCH_DOWN, wanted))));
  const low = leagueFloor(index);
  return leagueOf(Math.min(low + LEAGUE_SPAN - 1, Math.max(low, Math.floor(Number.isFinite(mmr) ? mmr : 0))));
}

export type TrophyInput = {
  trophies: number;
  mmr: number;
  /** Vitórias seguidas que a pessoa já tinha na escada. */
  streak: number;
  outcome: "win" | "loss" | "draw";
  /** Acertos da pessoa menos os do bot. */
  margin: number;
};
export type TrophyChange = { delta: number; streakBonus: number; perfBonus: number };

/** Quanto o duelo mexe nos troféus (antes do chão em zero): o valor-base, o MMR, a sequência e o desempenho. */
export function trophyChange({ trophies, mmr, streak, outcome, margin }: TrophyInput): TrophyChange {
  const { win, loss, scale, minWin } = baseStakes(trophies);
  const factors = gapFactors(mmr - trophies);
  if (outcome === "win") {
    const base = Math.round(win * factors.win);
    // os bônus também encolhem quando os troféus estão à frente do MMR (senão sequência e desempenho furavam a "trava" do MMR)
    const hold = scale * Math.min(1, factors.win);
    const room = Math.max(0, win + Math.round(WIN_CAP_EXTRA * scale) - base);
    const streakApplied = Math.min(room, Math.round(streakBonus(streak) * hold));
    const perfApplied = Math.min(room - streakApplied, Math.round(PERF_MAX * hold * clamp01(margin / PERF_SPAN)));
    return { delta: Math.max(minWin, base + streakApplied + perfApplied), streakBonus: streakApplied, perfBonus: perfApplied };
  }
  if (outcome === "loss") {
    const severity = LOSS_CLOSE + (LOSS_BLOWOUT - LOSS_CLOSE) * clamp01((Math.abs(margin) - 1) / (PERF_SPAN + 1));
    return { delta: -Math.max(MIN_LOSS, Math.round(loss * factors.loss * severity)), streakBonus: 0, perfBonus: 0 };
  }
  return { delta: Math.round(0.5 * win * factors.win - 0.5 * loss * factors.loss), streakBonus: 0, perfBonus: 0 };
}

/** Quanto o duelo mexe no MMR: Elo contra a nota do bot, com o placar contando pelo desempenho (vitória apertada vale menos que goleada). */
export function mmrChange(mmr: number, opponent: number, outcome: "win" | "loss" | "draw", margin: number) {
  const score = outcome === "win" ? 0.85 + 0.15 * clamp01(margin / PERF_SPAN)
    : outcome === "loss" ? 0.15 * (1 - clamp01(Math.abs(margin) / PERF_SPAN))
      : 0.5;
  return Math.round(MMR_K * (score - expectedScore(mmr, opponent)));
}

/** O que está em jogo antes do duelo, como faixa: vitória de `win[0]` (apertada) a `win[1]` (goleada); derrota de `loss[0]` (apertada) a
 *  `loss[1]` (goleada, negativos). O chão em zero vale nas duas. */
export function stakesRange(trophies: number, mmr: number, streak = 0) {
  const floor = (delta: number) => Math.max(0, trophies + delta) - Math.max(0, trophies);
  const at = (outcome: "win" | "loss", margin: number) => floor(trophyChange({ trophies, mmr, streak, outcome, margin }).delta);
  return { win: [at("win", 0), at("win", PERF_SPAN)] as [number, number], loss: [at("loss", -1), at("loss", -(PERF_SPAN + 2))] as [number, number] };
}
