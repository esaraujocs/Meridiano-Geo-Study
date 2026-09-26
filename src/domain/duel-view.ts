// O que as telas do duelo mostram, derivado do histórico: cartões das escadas no Hub, sequência de vitórias e o "plano" do
// resultado (que festa fazer, quais pílulas mostrar e como a barra de troféus se move). Lógica pura.
import { trophiesByLadder, type DuelOutcome, type DuelRecord } from "./duel.js";
import { LADDERS, groupsOfLadder, isGroupOwned, type Ladder, type ModeGroup } from "./duel-modes.js";
import { MILESTONES, reachedMilestones, type Milestone } from "./duel-rewards.js";
import { leagueFloor, leagueOf, LEAGUE_SPAN, type LeagueStatus } from "./league.js";

export type LadderCard = {
  ladder: Ladder;
  trophies: number;
  status: LeagueStatus;
  /** Últimos 5 resultados, do mais antigo para o mais novo. */
  form: DuelOutcome[];
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

/** Vitórias seguidas até o duelo mais recente (em qualquer escada). */
export function winStreak(duels: readonly Pick<DuelRecord, "at" | "id" | "outcome">[]) {
  const ordered = [...duels].sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
  let streak = 0;
  for (const duel of ordered) { if (duel.outcome !== "win") break; streak += 1; }
  return streak;
}

export type ResultTier = "win" | "perfect" | "division-up" | "league-up" | "loss" | "close" | "division-down" | "league-down" | "draw";
export type PillKey = "delta" | "streak" | "perfect" | "division" | "league" | "broken" | "stay" | "close" | "kept" | "marks";
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

