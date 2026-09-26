// Cenários prontos do resultado do duelo, só para o modo debug (?debug=1): `__cartaDuelResult("t4")` no console abre a tela com os
// dados de cada caso (vitória, perfeita, divisão, liga, derrota, por pouco, rebaixamentos, saída e empate). Não grava nada.
import type { DuelView } from "./duel.js";
import { MILESTONES } from "./duel-rewards.js";
import { buildResultView, type ResultView } from "./result-view.js";
import type { Spoils } from "./spoils.js";
import { t } from "./i18n/index.js";

type Scenario = {
  from: number;
  to: number;
  legs: [number, number][];
  /** Acertos do bot em cada tempo. */
  bot: [number, number];
  streakBefore: number;
  streakAfter: number;
  milestones?: string[];
  /** Troféus da sequência dentro do ganho. */
  bonus?: number;
  abandoned?: boolean;
  tiebreak?: boolean;
  coins: [number, number];
  completion: number;
};

const SCENARIOS: Record<string, Scenario> = {
  t1: { from: 1240, to: 1261, legs: [[8, 10], [6, 10]], bot: [6, 5], streakBefore: 3, streakAfter: 4, bonus: 9, coins: [431, 288], completion: 100 },
  t2: { from: 1240, to: 1272, legs: [[10, 10], [10, 10]], bot: [5, 4], streakBefore: 4, streakAfter: 5, bonus: 12, coins: [480, 320], completion: 280 },
  t3: { from: 1320, to: 1352, legs: [[8, 10], [7, 10]], bot: [6, 6], streakBefore: 0, streakAfter: 1, coins: [420, 300], completion: 100 },
  t4: { from: 1480, to: 1512, legs: [[8, 10], [8, 10]], bot: [6, 6], streakBefore: 1, streakAfter: 2, bonus: 3, milestones: ["league:platina"], coins: [430, 310], completion: 100 },
  loss: { from: 1240, to: 1223, legs: [[6, 10], [3, 10]], bot: [7, 6], streakBefore: 4, streakAfter: 0, coins: [302, 144], completion: 0 },
  close: { from: 1240, to: 1229, legs: [[7, 10], [6, 10]], bot: [7, 7], streakBefore: 0, streakAfter: 0, coins: [340, 280], completion: 0 },
  ddiv: { from: 1170, to: 1148, legs: [[4, 10], [4, 10]], bot: [7, 7], streakBefore: 0, streakAfter: 0, coins: [180, 170], completion: 0 },
  dleague: { from: 1010, to: 988, legs: [[3, 10], [4, 10]], bot: [8, 7], streakBefore: 0, streakAfter: 0, coins: [150, 160], completion: 0 },
  left: { from: 1240, to: 1226, legs: [[5, 10], [0, 10]], bot: [6, 6], streakBefore: 0, streakAfter: 0, abandoned: true, coins: [280, 0], completion: 0 },
  tiebreak: { from: 1240, to: 1256, legs: [[7, 10], [6, 10]], bot: [7, 6], streakBefore: 0, streakAfter: 1, tiebreak: true, coins: [400, 290], completion: 100 },
  draw: { from: 1240, to: 1241, legs: [[7, 10], [6, 10]], bot: [7, 6], streakBefore: 2, streakAfter: 0, coins: [400, 290], completion: 100 },
};

export const DUEL_PREVIEW_NAMES = Object.keys(SCENARIOS);

export function duelPreview(name: string): { duel: DuelView; view: ResultView } | null {
  const scenario = SCENARIOS[name];
  if (!scenario) return null;
  const legs = scenario.legs.map(([correct, total], index) => ({
    group: index === 0 ? ("mapa" as const) : ("capitais-escrita" as const), playerCorrect: correct, botCorrect: scenario.bot[index], total,
  }));
  const playerCorrect = legs.reduce((sum, leg) => sum + leg.playerCorrect, 0);
  const botCorrect = legs.reduce((sum, leg) => sum + leg.botCorrect, 0);
  const outcome = name === "draw" ? "draw" : scenario.to >= scenario.from ? "win" : "loss";
  const coins = scenario.coins[0] + scenario.coins[1] + scenario.completion;
  const spoils: Spoils = {
    pace: "timed", factor: 1,
    hits: { count: playerCorrect, coins: coins - scenario.completion }, streak: { best: 5, coins: 0 }, newCards: { count: 0, coins: 0 }, levelUps: { count: 0, coins: 0 },
    completion: { pct: Math.round((playerCorrect / 20) * 100), coins: scenario.completion }, total: coins,
  };
  const now = Date.now();
  const view = buildResultView({
    session: { variant: "mapa", startedAt: now - 300000, endedAt: now, complete: true, rounds: Array.from({ length: 20 }, (_, index) => ({ correct: index < playerCorrect })), pace: "timed", timerSeconds: 20 },
    spoils, before: { balance: 9308, xp: 552, level: 20 }, after: { balance: 9308 + coins, xp: 592, level: 20 }, regionLabel: t.duel.ladders.mapas,
  });
  const duel: DuelView = {
    botName: "Nina Longitude", botLeague: "ouro", botStyle: "constante", botSpecialty: null,
    outcome, tiebreak: Boolean(scenario.tiebreak), playerCorrect, botCorrect, total: 20, delta: scenario.to - scenario.from,
    trophiesBefore: scenario.from, trophiesAfter: scenario.to,
    milestones: (scenario.milestones ?? []).flatMap((id) => MILESTONES.filter((milestone) => milestone.id === id)),
    ladder: "mapas", legs, streakBefore: scenario.streakBefore, streakAfter: scenario.streakAfter, streakBonus: scenario.bonus ?? 0, abandoned: Boolean(scenario.abandoned),
    legCoins: scenario.coins, legPreview: [false, true],
  };
  return { duel, view: { ...view, eyebrow: t.duel.reveal.eyebrow(t.duel.ladders.mapas) } };
}
