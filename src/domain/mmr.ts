// Troféus e nível de jogo escondido (MMR) do Duelo. Lógica pura.
//
// Os troféus (o que a pessoa vê) sobem e descem por uma tabela por liga: nas ligas de baixo a vitória rende mais do que a derrota
// custa, e nas de cima é o contrário, então a subida vai apertando. O MMR (o que a pessoa não vê) diz se ela joga melhor ou pior do
// que a liga em que está: acima da liga, ganha mais e perde menos; abaixo, ganha menos e perde mais. Além disso a vitória rende um
// extra pelo desempenho (acertos à frente do bot) e pela sequência de vitórias. Acima do Mestre não há teto, mas cada vitória vale
// menos e cada derrota custa mais, o que cria um limite teórico.
import { LEAGUE_SPAN, MASTER_AT, leagueOf, type LeagueKey } from "./league.js";

export const expectedScore = (rating: number, opponent: number) => 1 / (1 + Math.pow(10, (opponent - rating) / 400));

/** Ganho e perda-base por liga (com o MMR no nível da liga, sem sequência e sem desempenho). Chute inicial, para ajustar jogando. */
export const LEAGUE_STAKES: Record<LeagueKey, { win: number; loss: number }> = {
  bronze: { win: 34, loss: 22 },
  prata: { win: 32, loss: 25 },
  ouro: { win: 30, loss: 28 },
  platina: { win: 28, loss: 31 },
  diamante: { win: 26, loss: 34 },
  mestre: { win: 22, loss: 38 },
};
/** O teto da vitória é o ganho-base + isto (50 no Bronze): sequência e desempenho boostam até aí. */
export const WIN_CAP_EXTRA = 16;
/** Bônus de desempenho: até PERF_MAX troféus quando a pessoa termina PERF_SPAN acertos (ou mais) à frente do bot. */
export const PERF_MAX = 8;
export const PERF_SPAN = 8;
/** Vitória e derrota rendem ao menos isto (sem chegar a zero de tanto reduzir). */
export const MIN_WIN = 5;
export const MIN_LOSS = 5;
/** O MMR pesa por completo quando está GAP_SPAN troféus acima ou abaixo da pessoa; a vitória varia até ±WIN_GAP e a derrota até ±LOSS_GAP. */
export const GAP_SPAN = 200;
export const WIN_GAP = 0.35;
export const LOSS_GAP = 0.3;
/** A derrota apertada custa até 20% menos e a goleada até 10% mais. */
export const LOSS_CLOSE = 0.8;
export const LOSS_BLOWOUT = 1.1;
/** Velocidade do MMR (Elo). */
export const MMR_K = 40;
/** Mestre (a partir de MASTER_AT): a cada LEAGUE_SPAN troféus acima, a vitória cai e a derrota sobe (e os bônus encolhem junto com a vitória).
 *  Com esses valores quem vence 85% dos duelos para de subir por volta de 3.700 troféus: o limite teórico do Mestre. */
export const MASTER_WIN_DECAY = 0.6;
export const MASTER_LOSS_GROWTH = 0.2;
export const MASTER_MIN_WIN = 3;

/** Sequência: cada vitória seguida que a pessoa já tinha na escada soma STREAK_STEP troféus à próxima vitória, até STREAK_CAP vitórias
 *  (+12). Perder zera a sequência; o bônus só existe na vitória, a derrota não muda. */
export const STREAK_STEP = 3;
export const STREAK_CAP = 4;
export const streakBonus = (streak: number) => STREAK_STEP * Math.min(STREAK_CAP, Math.max(0, Math.floor(Number.isFinite(streak) ? streak : 0)));

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Ganho e perda-base de quem está com esses troféus (no Mestre, encolhe e cresce com a altura). `scale` é quanto o ganho do Mestre já
 *  encolheu (1 fora dele): os bônus de sequência e desempenho encolhem na mesma proporção, senão furariam o limite. */
export function baseStakes(trophies: number) {
  const status = leagueOf(trophies);
  const table = LEAGUE_STAKES[status.league];
  if (status.league !== "mestre") return { win: table.win, loss: table.loss, scale: 1, minWin: MIN_WIN };
  const above = Math.max(0, trophies - MASTER_AT) / LEAGUE_SPAN;
  const win = Math.max(MASTER_MIN_WIN, Math.round(table.win / (1 + MASTER_WIN_DECAY * above)));
  return { win, loss: Math.round(table.loss * (1 + MASTER_LOSS_GROWTH * above)), scale: Math.min(1, win / table.win), minWin: MASTER_MIN_WIN };
}

/** Quanto o MMR muda o ganho e a perda: `gap` é MMR menos troféus (positivo = joga melhor que a liga). */
export function gapFactors(gap: number) {
  const g = Math.min(1, Math.max(-1, (Number.isFinite(gap) ? gap : 0) / GAP_SPAN));
  return { win: 1 + WIN_GAP * g, loss: 1 - LOSS_GAP * g };
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

/** Quanto o duelo mexe nos troféus (antes do chão em zero): a tabela da liga, o MMR, a sequência e o desempenho. */
export function trophyChange({ trophies, mmr, streak, outcome, margin }: TrophyInput): TrophyChange {
  const { win, loss, scale, minWin } = baseStakes(trophies);
  const factors = gapFactors(mmr - trophies);
  if (outcome === "win") {
    const base = Math.round(win * factors.win);
    const room = Math.max(0, win + Math.round(WIN_CAP_EXTRA * scale) - base);
    const streakApplied = Math.min(room, Math.round(streakBonus(streak) * scale));
    const perfApplied = Math.min(room - streakApplied, Math.round(PERF_MAX * scale * clamp01(margin / PERF_SPAN)));
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
