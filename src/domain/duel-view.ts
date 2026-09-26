// O que as telas do duelo mostram, derivado do histórico: cartões das escadas no Hub, sequência de vitórias e o "plano" do
// resultado (que festa fazer, quais pílulas mostrar e como a barra de troféus se move). Lógica pura.
import { trophiesByLadder, type DuelOutcome, type DuelRecord } from "./duel.js";
import { LADDERS, groupsOfLadder, isGroupOwned, type Ladder, type ModeGroup } from "./duel-modes.js";
import { MILESTONES, reachedMilestones, type Milestone } from "./duel-rewards.js";
import { DIVISION_SPAN, leagueFloor, leagueOf, LEAGUE_SPAN, type LeagueStatus } from "./league.js";

export type LadderCard = {
  ladder: Ladder;
  trophies: number;
  status: LeagueStatus;
  /** Últimos 5 resultados, do mais antigo para o mais novo. */
  form: DuelOutcome[];
  /** Vitórias seguidas até agora nesta escada. */
  streak: number;
  duels: number;
  groups: { group: ModeGroup; owned: boolean }[];
};

/** Um cartão por escada, com a liga, a forma recente e os modos que entram no sorteio (com os de prévia marcados). */
export function ladderCards(duels: readonly DuelRecord[], unlocked: readonly string[]): LadderCard[] {
  const byLadder = trophiesByLadder(duels);
  return LADDERS.map((ladder) => {
    const mine = duels.filter((duel) => duel.ladder === ladder).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
    return {
      ladder,
      trophies: byLadder[ladder],
      status: leagueOf(byLadder[ladder]),
      form: mine.slice(-5).map((duel) => duel.outcome),
      streak: winStreak(mine),
      duels: mine.length,
      groups: groupsOfLadder(ladder).map((def) => ({ group: def.group, owned: isGroupOwned(def, unlocked) })),
    };
  });
}

/** Os próximos marcos ainda não alcançados: o de divisão e o de liga mais perto, olhando a escada com mais troféus. */
export function nextMilestones(duels: readonly DuelRecord[]): Milestone[] {
  const byLadder = trophiesByLadder(duels);
  const best = LADDERS.reduce((top, ladder) => (byLadder[ladder] > byLadder[top] ? ladder : top), LADDERS[0]);
  const reached = new Set(reachedMilestones(byLadder).map((milestone) => milestone.id));
  const pending = MILESTONES.filter((milestone) => !reached.has(milestone.id) && (milestone.ladder === null || milestone.ladder === best));
  const division = pending.find((milestone) => milestone.kind === "division");
  const league = pending.find((milestone) => milestone.kind === "league");
  return [division, league].filter((milestone): milestone is Milestone => Boolean(milestone)).sort((a, b) => a.at - b.at);
}

/** Tempo no relógio: 1:32 (minutos e segundos). */
export const clockOf = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
/** Segundos por resposta, com uma casa (null se não há resposta ou tempo). */
export const secondsPer = (ms: number | null | undefined, answers: number) =>
  ms === null || ms === undefined || answers <= 0 ? null : Math.round((ms / answers / 1000) * 10) / 10;

/** Vitórias seguidas até o duelo mais recente (em qualquer escada). */
export function winStreak(duels: readonly Pick<DuelRecord, "at" | "id" | "outcome">[]) {
  const ordered = [...duels].sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
  let streak = 0;
  for (const duel of ordered) { if (duel.outcome !== "win") break; streak += 1; }
  return streak;
}

export type ResultTier = "win" | "perfect" | "division-up" | "league-up" | "loss" | "close" | "division-down" | "league-down" | "draw";
export type PillKey = "delta" | "boost" | "perf" | "streak" | "perfect" | "division" | "league" | "broken" | "stay" | "close" | "kept" | "marks";
export type Pill = { key: PillKey; tone: "up" | "fire" | "gold" | "down" | "calm"; value?: number };

export type ResultPlan = {
  kind: "win" | "loss" | "draw";
  tier: ResultTier;
  from: number;
  to: number;
  delta: number;
  /** Passagem de liga: a barra enche (ou esvazia) até a beirada, troca de liga e segue. */
  cross: { floorA: number; floorB: number; mid: number } | null;
  /** Festa: quantas partículas, quando a barra começa e quanto dura. */
  particles: number;
  delayMs: number;
  durationMs: number;
  pills: Pill[];
  /** Diferença de acertos (positiva se a pessoa venceu). */
  margin: number;
};

/** "Por pouco": perdeu por até 2 acertos. */
export const CLOSE_MARGIN = 2;
/** Sequência mínima para virar pílula. */
export const STREAK_PILL = 3;

export function resultPlan(input: {
  outcome: DuelOutcome;
  playerCorrect: number;
  botCorrect: number;
  total: number;
  before: number;
  after: number;
  /** Vitórias seguidas contando este duelo (0 se perdeu). */
  streakAfter: number;
  /** Vitórias seguidas que havia antes deste duelo. */
  streakBefore: number;
  /** Marcos que este duelo abriu. */
  milestones: number;
  /** Troféus da sequência de vitórias dentro do ganho (0 se não houve). */
  streakBonus?: number;
  /** Troféus do desempenho (acertos à frente do bot) dentro do ganho. */
  perfBonus?: number;
}): ResultPlan {
  const { outcome, playerCorrect, botCorrect, total, before, after } = input;
  const from = leagueOf(before);
  const to = leagueOf(after);
  const delta = after - before;
  const margin = playerCorrect - botCorrect;
  const leagueChanged = to.index !== from.index;
  const divisionChanged = !leagueChanged && (to.division ?? 0) !== (from.division ?? 0);
  const kind = outcome === "draw" ? "draw" : outcome === "win" ? "win" : "loss";
  let tier: ResultTier;
  if (kind === "win") tier = leagueChanged && to.index > from.index ? "league-up" : divisionChanged && (to.division ?? 0) > (from.division ?? 0) ? "division-up" : playerCorrect === total && total > 0 ? "perfect" : "win";
  else if (kind === "loss") tier = leagueChanged && to.index < from.index ? "league-down" : divisionChanged && (to.division ?? 0) < (from.division ?? 0) ? "division-down" : botCorrect - playerCorrect <= CLOSE_MARGIN ? "close" : "loss";
  else tier = "draw";

  const cross = leagueChanged
    ? { floorA: leagueFloor(from.index), floorB: leagueFloor(to.index), mid: leagueFloor(Math.max(from.index, to.index)) }
    : null;
  const pills: Pill[] = [];
  if (kind !== "draw") pills.push({ key: "delta", tone: kind === "win" ? "up" : "down", value: delta });
  if (kind === "win" && (input.perfBonus ?? 0) > 0) pills.push({ key: "perf", tone: "gold", value: input.perfBonus });
  if (kind === "win" && (input.streakBonus ?? 0) > 0) pills.push({ key: "boost", tone: "fire", value: input.streakBonus });
  if (kind === "win") {
    if (tier === "perfect") pills.push({ key: "perfect", tone: "gold" });
    if (input.streakAfter >= STREAK_PILL) pills.push({ key: "streak", tone: "fire", value: input.streakAfter });
    if (tier === "division-up") pills.push({ key: "division", tone: "gold" });
    if (tier === "league-up") pills.push({ key: "league", tone: "gold" });
    if (input.milestones > 0) pills.push({ key: "marks", tone: "gold", value: input.milestones });
  } else if (kind === "loss") {
    if (input.streakBefore >= STREAK_PILL) pills.push({ key: "broken", tone: "fire", value: input.streakBefore });
    if (tier === "close") pills.push({ key: "close", tone: "gold", value: Math.abs(margin) });
    if (tier === "division-down" || tier === "league-down") pills.push({ key: "kept", tone: "calm" });
    else pills.push({ key: "stay", tone: "calm" });
  }
  const particlesBy: Record<ResultTier, number> = { win: 24, perfect: 44, "division-up": 40, "league-up": 70, loss: 18, close: 12, "division-down": 24, "league-down": 28, draw: 0 };
  return {
    kind, tier, from: before, to: after, delta, cross,
    particles: particlesBy[tier],
    delayMs: kind === "loss" ? 1300 : 1300,
    durationMs: cross ? 4200 : tier === "division-up" || tier === "division-down" ? 2600 : 2200,
    pills, margin,
  };
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Quadro da animação da barra de troféus: valor mostrado e a faixa (liga) em que a barra está, para p de 0 a 1. */
export function trophyFrame(plan: Pick<ResultPlan, "from" | "to" | "cross">, progress: number) {
  const p = Math.min(1, Math.max(0, progress));
  if (plan.cross) {
    const { floorA, floorB, mid } = plan.cross;
    const split = 0.5;
    if (p < split) return { value: lerp(plan.from, mid, easeOut(p / split)), floor: floorA, span: LEAGUE_SPAN, phase: 0 as const };
    return { value: lerp(mid, plan.to, easeOut((p - split) / (1 - split))), floor: floorB, span: LEAGUE_SPAN, phase: 1 as const };
  }
  return { value: lerp(plan.from, plan.to, easeOut(p)), floor: leagueOf(plan.from).floor, span: LEAGUE_SPAN, phase: 0 as const };
}


export type MeterFrame = {
  value: number;
  /** Faixa em que a barra está (a liga) e se já passou da beirada numa mudança de liga. */
  floor: number;
  span: number;
  phase: 0 | 1;
  status: LeagueStatus;
  /** Preenchimento da barra e o trecho ganho (verde) ou perdido (hachurado), em % da faixa. */
  fill: number;
  deltaFrom: number;
  deltaTo: number;
  /** Divisões II e III já alcançadas nesta faixa. */
  ticks: [boolean, boolean];
  /** Diferença de troféus já mostrada no emblema, com sinal. */
  shown: number;
};

/** Tudo que a barra de troféus desenha num instante da animação (p de 0 a 1): valor, liga, preenchimento e o trecho ganho ou perdido. */
export function meterLayout(plan: Pick<ResultPlan, "from" | "to" | "cross">, progress: number): MeterFrame {
  const frame = trophyFrame(plan, progress);
  const rising = plan.to >= plan.from;
  const pct = (value: number) => Math.min(100, Math.max(0, ((value - frame.floor) / frame.span) * 100));
  const status = leagueOf(frame.value);
  const start = Math.max(plan.from, frame.floor);
  const fill = rising ? pct(start) : pct(frame.value);
  const deltaFrom = rising ? pct(start) : pct(frame.value);
  const deltaTo = rising ? pct(frame.value) : pct(plan.from);
  const master = frame.floor >= leagueFloor(5);
  return {
    value: frame.value, floor: frame.floor, span: frame.span, phase: frame.phase, status, fill, deltaFrom, deltaTo,
    ticks: master ? [false, false] : [frame.value >= frame.floor + DIVISION_SPAN, frame.value >= frame.floor + 2 * DIVISION_SPAN],
    shown: Math.round(frame.value - plan.from),
  };
}

/** O tempo que decidiu o duelo: numa vitória, o único tempo em que a pessoa foi melhor; numa derrota, o único em que ficou atrás.
 *  Null quando os dois tempos pesaram do mesmo lado (ou empataram). */
export function decisiveLeg(legs: readonly { playerCorrect: number; botCorrect: number }[], kind: "win" | "loss" | "draw"): { index: number; margin: number } | null {
  if (kind === "draw" || legs.length < 2) return null;
  const margins = legs.map((leg) => leg.playerCorrect - leg.botCorrect);
  const sign = kind === "win" ? 1 : -1;
  const hits = margins.map((margin, index) => ({ margin, index })).filter((item) => item.margin * sign > 0);
  const rest = margins.filter((margin) => margin * sign > 0).length;
  return rest === 1 && hits.length === 1 ? hits[0] : null;
}

/** O tempo em que a pessoa mais ficou atrás (base do "Treinar"): null se nenhum tempo foi perdido. */
export function worstLeg(legs: readonly { playerCorrect: number; botCorrect: number }[]): { index: number; margin: number } | null {
  let worst: { index: number; margin: number } | null = null;
  for (let index = 0; index < legs.length; index += 1) {
    const margin = legs[index].playerCorrect - legs[index].botCorrect;
    if (margin < 0 && (!worst || margin < worst.margin)) worst = { index, margin };
  }
  return worst;
}
