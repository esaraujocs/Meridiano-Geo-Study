// Números da tela de Progresso: maestria, pilares, recortes, revisão, atividade, recordes, evolução e histórico.
// Lógica pura: recebe os dados já lidos do IndexedDB e devolve o que a tela desenha.
import type { Meta } from "./types";
import type { SurfaceSession } from "./progress-surfaces.js";
import { MAP_ERROR_MIN_ROUNDS, meanMapErrorKm } from "./map-error.js";
import { MASTERY_STAGES, PILLAR_TITLES, clampPercent, hubProfile } from "./hub-profile.js";
import { pillarOfSession, type PillarKey } from "./pillars.js";
import { REGION_ITEMS, regionMatches } from "./regions.js";
import { placeLabel } from "./collection-view.js";
import {
  MONTH_NAMES, addDays, dayKey, formatDuration, formatShortDate, relativeWhen, sessionLabel, sessionRegionLabel, shortMonth, startOfDay,
  type SessionGroup,
} from "./session-view.js";
import { compareText, t } from "./i18n/index.js";
import { botById } from "./bots.js";
import type { DuelOutcome, DuelRecord } from "./duel.js";
import type { Ladder, ModeGroup } from "./duel-modes.js";
import { botLabel, styleLabel } from "./duel-labels.js";
import type { PvpMatchRecord } from "./pvp-store.js";

export const TITLE_GOAL = 90; // % de precisão do pilar que abre o título
export const FORM_WINDOW = 40; // rodadas da "forma recente"
export const REVIEW_MIN_TRIES = 3;
export const REVIEW_BELOW = 0.5;
export const HEATMAP_WEEKS = 12;
export const EVOLUTION_POINTS = 14;

export type ProgressRecordLike = { entityId?: unknown; id?: unknown; mastery?: unknown; columns?: Record<string, number | undefined> };
export type PillarSnapshot = { seen: number; correct: number; bayesianScore: number | null; status: string };

export type DashboardInput = {
  now: number;
  sessions: readonly SurfaceSession[];
  /** Os duelos gravados: cada um vira uma linha só no histórico, no lugar das duas partidas (tempos) que o compõem. */
  duels?: readonly DuelRecord[];
  /** Os duelos com amigo (PvP) já terminados: mesma ideia, uma linha só, ao lado dos duelos contra bot. */
  pvpMatches?: readonly PvpMatchRecord[];
  records: readonly ProgressRecordLike[];
  meta: Record<string, Meta>;
  /** ids jogáveis do atlas (denominador do domínio, o mesmo do Hub). */
  universe: readonly string[];
  dominatedIds: readonly string[];
  titleIds: readonly string[];
  pillars: Record<string, PillarSnapshot | undefined>;
  album: { discovered: number; total: number; distribution: readonly number[] };
  economy: { level: number; xp: number; xpBase: number; xpNext: number; completedSessions: number; rounds: number };
};

export type PillarTone = "good" | "mid" | "warn" | "earned";
export type PillarCard = {
  key: "bandeiras" | "mapa" | "capitais";
  label: string;
  title: string;
  earned: boolean;
  seen: number;
  correct: number;
  /** nota do pilar (bayesiana) em %, a mesma que abre o título. */
  scorePct: number | null;
  goalPct: number;
  gapPts: number;
  status: string;
  tone: PillarTone;
  coverage: number;
  coverageTotal: number;
  formPct: number | null;
  formDelta: number | null;
  /** só Bandeiras e Capitais: os títulos pedem escrita validada (2 acertos digitados). */
  writing: { ok: boolean; count: number; needed: number } | null;
};
export type RegionRow = { key: string; label: string; found: number; discovered: number; total: number; pct: number; world: boolean; tag: "good" | "warn" | null };
export type ReviewItem = { id: string; name: string; place: string; flag?: string; pct: number; correct: number; tries: number; weak: string[] };
type Miss = { id: string; name: string; flag?: string };
/** Um tempo do duelo: o modo, o placar contra o bot e, se a partida ainda existe, o que a pessoa acertou e errou. */
export type DuelLegRow = { mode: string; playerCorrect: number; botCorrect: number; total: number; playerMs: number | null; botMs: number | null; pattern: string; misses: Miss[] };
export type DuelRow = {
  /** Contra bot (liga/MMR) ou com amigo (PvP, força própria). O layout é o mesmo; só o rótulo do adversário e do delta muda. */
  kind: "bot" | "pvp";
  ladder: Ladder; ladderLabel: string; botName: string; botLeague: string; botStyle: string;
  outcome: DuelOutcome; tiebreak: boolean; playerCorrect: number; botCorrect: number; total: number; delta: number;
  /** Rótulo e texto do delta (Troféus/Força); null quando não há o que mostrar (duelo amistoso). */
  deltaLabel: string | null; deltaText: string | null;
  abandoned: boolean; playerMs: number | null; botMs: number | null; legs: DuelLegRow[];
};
export type SessionRow = {
  id: string; title: string; family: string; variant: string; group: SessionGroup; region: string;
  rounds: number; duration: string | null; pct: number | null; complete: boolean; startedAt: number; when: string;
  pattern: string; avgTimeMs: number | null; bestStreak: number; misses: Miss[];
  /** Só nas linhas de duelo: adversário, placar, troféus e os dois tempos. */
  duel?: DuelRow;
};
export type HistoryGroup = { key: string; label: string; sessions: number; rounds: number; pct: number | null; rows: SessionRow[] };

export type Dashboard = {
  empty: boolean;
  hero: {
    pct: number; dominated: number; total: number; stageTitle: string; stageIndex: number; cosmographer: boolean;
    stages: Array<{ name: string; at: string }>;
    next: { name: string; at: number } | null; missing: number | null;
    titles: Array<{ id: string; label: string; earned: boolean }>;
  };
  kpis: {
    level: number; xpInLevel: number; xpSpan: number;
    album: { discovered: number; total: number; distribution: readonly number[] };
    sessions: number; rounds: number;
    accuracyPct: number | null; accuracyDelta: number | null;
    avgTimeMs: number | null; timeDeltaMs: number | null;
  };
  pillars: PillarCard[];
  regions: RegionRow[];
  review: { total: number; items: ReviewItem[] };
  activity: {
    /** início (segunda-feira) da primeira semana do mapa de calor. */
    start: number; weeks: number[][]; months: string[]; streak: number; bestStreak: number;
    weekRounds: number; weekAccuracy: number | null; activeDays: number; daysTotal: number;
  };
  records: {
    bestStreak: { value: number; when: string } | null;
    bestSession: { pct: number; rounds: number; when: string } | null;
    fastest: { ms: number; family: string; when: string } | null;
    bestMapError: { km: number; when: string } | null;
  };
  evolution: { points: Array<{ pct: number; when: string }>; delta: number | null; deltaOver: number; first: string; last: string };
  recent: SessionRow[];
  history: SessionRow[];
};

const PILLAR_META: Array<{ key: PillarCard["key"]; label: string; titleId: "vexilologo" | "cartografo" | "diplomata" }> = [
  { key: "bandeiras", label: t.progress.pillarLabels.bandeiras, titleId: "vexilologo" },
  { key: "mapa", label: t.progress.pillarLabels.mapa, titleId: "cartografo" },
  { key: "capitais", label: t.progress.pillarLabels.capitais, titleId: "diplomata" },
];
const PILLAR_WORD: Record<PillarKey, string> = t.progress.pillarWords;

const startedAtOf = (session: SurfaceSession) => session.startedAt ?? session.endedAt ?? 0;
const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
const roundPct = (fraction: number) => Math.round(fraction * 100);
const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0");

function longestStreak(rounds: SurfaceSession["rounds"]) {
  let best = 0;
  let run = 0;
  for (const round of rounds) {
    run = round.correct ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

function timedRounds(session: SurfaceSession) {
  return session.rounds.map((round) => round.responseTimeMs).filter((ms): ms is number => typeof ms === "number" && ms >= 100 && ms <= 120_000);
}

/** Os países errados, sem repetir (mesmo que tenha errado duas vezes). */
function missesOf(rounds: SurfaceSession["rounds"], meta: Record<string, Meta>, flagOf: (id: string) => string | undefined): Miss[] {
  const misses: Miss[] = [];
  const seen = new Set<string>();
  for (const round of rounds) {
    if (round.correct || !round.targetId || seen.has(round.targetId)) continue;
    seen.add(round.targetId);
    misses.push({ id: round.targetId, name: meta[round.targetId]?.pt ?? round.targetId, flag: flagOf(round.targetId) });
  }
  return misses;
}

function buildRow(session: SurfaceSession, meta: Record<string, Meta>, flagOf: (id: string) => string | undefined, now: number): SessionRow {
  const label = sessionLabel(session);
  const startedAt = startedAtOf(session);
  const times = timedRounds(session);
  const misses = missesOf(session.rounds, meta, flagOf);
  return {
    id: session.id,
    title: `${label.family} · ${label.variant}`,
    family: label.family,
    variant: label.variant,
    group: label.group,
    region: sessionRegionLabel(session),
    rounds: session.roundCount,
    duration: session.startedAt && session.endedAt ? formatDuration(session.endedAt - session.startedAt) : null,
    pct: session.roundCount ? roundPct(session.correct / session.roundCount) : null,
    complete: session.complete,
    startedAt,
    when: startedAt ? relativeWhen(startedAt, now) : "",
    pattern: session.rounds.slice(0, 60).map((round) => (round.correct ? "1" : "0")).join(""),
    avgTimeMs: mean(times),
    bestStreak: longestStreak(session.rounds),
    misses,
  };
}

/** As partidas (tempos) de um duelo: as que trazem o id dele e, nos duelos de antes dos dois tempos, a única partida com o id do registro. */
function legSessionsOf(record: DuelRecord, sessions: readonly SurfaceSession[]) {
  return sessions
    .filter((session) => session.duelId === record.sessionId || (!record.legs && session.id === record.sessionId))
    .sort((a, b) => (a.duelLeg ?? 0) - (b.duelLeg ?? 0) || startedAtOf(a) - startedAtOf(b));
}

type LegSource = { group: ModeGroup | null; playerCorrect: number; botCorrect: number; total: number; playerMs?: number | null; botMs?: number };

/** Uma linha por duelo, no lugar das partidas que o compõem (`used` diz quais sessões foram absorvidas). Sem as sessões, o registro sozinho basta. */
function buildDuelRows(duels: readonly DuelRecord[], sessions: readonly SurfaceSession[], meta: Record<string, Meta>, flagOf: (id: string) => string | undefined, now: number) {
  const used = new Set<string>();
  const rows = duels.map((record): SessionRow => {
    const mine = legSessionsOf(record, sessions);
    mine.forEach((session) => used.add(session.id));
    const bot = botById(record.botId);
    const ladderLabel = t.duel.ladders[record.ladder];
    const sources: LegSource[] = record.legs ?? [{ group: null, playerCorrect: record.playerCorrect, botCorrect: record.botCorrect, total: record.total }];
    const legs: DuelLegRow[] = sources.map((leg, index) => {
      const session = mine.find((item) => item.duelLeg === index) ?? (record.legs ? undefined : mine[0]);
      const mode = leg.group ? t.duel.groups[leg.group] : session ? sessionLabel(session).variant : sessionLabel({ family: record.family, variant: record.variant }).variant;
      return {
        mode, playerCorrect: leg.playerCorrect, botCorrect: leg.botCorrect, total: leg.total,
        playerMs: typeof leg.playerMs === "number" ? leg.playerMs : null, botMs: typeof leg.botMs === "number" ? leg.botMs : null,
        pattern: session ? session.rounds.slice(0, 30).map((round) => (round.correct ? "1" : "0")).join("") : "",
        misses: session ? missesOf(session.rounds, meta, flagOf) : [],
      };
    });
    const startedAt = mine.length ? Math.min(...mine.map(startedAtOf)) || record.at : record.at;
    const spent = mine.reduce((sum, session) => sum + (session.startedAt && session.endedAt ? Math.max(0, session.endedAt - session.startedAt) : 0), 0);
    const rounds = mine.flatMap((session) => session.rounds);
    const abandoned = record.abandoned ?? (mine.length > 0 && (mine.length < (record.legs?.length ?? 1) || mine.some((session) => !session.complete)));
    const seen = new Set<string>();
    const misses = legs.flatMap((leg) => leg.misses).filter((miss) => !seen.has(miss.id) && Boolean(seen.add(miss.id)));
    return {
      id: `duel:${record.sessionId}`,
      title: t.progress.duelTitle(ladderLabel),
      family: ladderLabel,
      variant: "",
      group: record.ladder === "mapas" ? "mapa" : "bandeiras",
      region: mine[0] ? sessionRegionLabel(mine[0]) : t.regions.mundo[0],
      rounds: record.total,
      duration: formatDuration(spent),
      pct: record.total ? roundPct(record.playerCorrect / record.total) : null,
      complete: !abandoned,
      startedAt,
      when: relativeWhen(startedAt, now),
      pattern: rounds.slice(0, 60).map((round) => (round.correct ? "1" : "0")).join(""),
      avgTimeMs: mean(mine.flatMap(timedRounds)),
      bestStreak: longestStreak(rounds),
      misses,
      duel: {
        kind: "bot",
        ladder: record.ladder, ladderLabel,
        botName: bot ? botLabel(bot) : t.duel.opponent,
        botLeague: bot ? t.duel.leagues[bot.league] : "",
        botStyle: bot ? styleLabel(bot.style, bot.specialty) : "",
        outcome: record.outcome, tiebreak: record.tiebreak,
        playerCorrect: record.playerCorrect, botCorrect: record.botCorrect, total: record.total, delta: record.delta,
        deltaLabel: t.progress.duelTrophies, deltaText: `${signed(record.delta)} ${t.duel.result.trophies}`,
        abandoned,
        playerMs: legs.every((leg) => leg.playerMs !== null) ? legs.reduce((sum, leg) => sum + (leg.playerMs as number), 0) : null,
        botMs: legs.every((leg) => leg.botMs !== null) ? legs.reduce((sum, leg) => sum + (leg.botMs as number), 0) : null,
        legs,
      },
    };
  });
  return { rows, used };
}

/** Uma linha por duelo com amigo (PvP), no lugar das duas partidas (tempos) que o compõem — o mesmo princípio de `buildDuelRows`, mas o adversário é uma
 *  pessoa (sem liga/estilo) e o delta é a força própria do PvP (`pvp-rating.ts`), não os troféus do duelo contra bot. O amistoso não tem delta para mostrar. */
function buildPvpRows(matches: readonly PvpMatchRecord[], sessions: readonly SurfaceSession[], meta: Record<string, Meta>, flagOf: (id: string) => string | undefined, now: number) {
  const used = new Set<string>();
  const rows = matches.map((record): SessionRow => {
    const mine = sessions.filter((session) => session.duelId === record.code).sort((a, b) => (a.duelLeg ?? 0) - (b.duelLeg ?? 0) || startedAtOf(a) - startedAtOf(b));
    mine.forEach((session) => used.add(session.id));
    const ladderLabel = t.duel.ladders[record.ladder];
    // sem os grupos salvos (registro de antes desta versão), sorteia de novo pela semente não é possível sem ela: usa só o placar total, sem os dois tempos
    const sources = record.legs ?? [];
    const legs: DuelLegRow[] = sources.map((leg, index) => {
      const session = mine.find((item) => item.duelLeg === index);
      return {
        mode: t.duel.groups[leg.group], playerCorrect: leg.youCorrect, botCorrect: leg.opponentCorrect, total: leg.total,
        playerMs: leg.youMs, botMs: leg.opponentMs,
        pattern: session ? session.rounds.slice(0, 30).map((round) => (round.correct ? "1" : "0")).join("") : "",
        misses: session ? missesOf(session.rounds, meta, flagOf) : [],
      };
    });
    const startedAt = mine.length ? Math.min(...mine.map(startedAtOf)) || record.at : record.at;
    const spent = mine.reduce((sum, session) => sum + (session.startedAt && session.endedAt ? Math.max(0, session.endedAt - session.startedAt) : 0), 0);
    const rounds = mine.flatMap((session) => session.rounds);
    const abandoned = record.youForfeited;
    const seen = new Set<string>();
    const misses = legs.flatMap((leg) => leg.misses).filter((miss) => !seen.has(miss.id) && Boolean(seen.add(miss.id)));
    return {
      id: `pvp:${record.code}`,
      title: t.progress.pvpDuelTitle(ladderLabel),
      family: ladderLabel,
      variant: "",
      group: record.ladder === "mapas" ? "mapa" : "bandeiras",
      region: mine[0] ? sessionRegionLabel(mine[0]) : t.regions.mundo[0],
      rounds: record.totalRounds,
      duration: formatDuration(spent),
      pct: record.totalRounds ? roundPct(record.youCorrect / record.totalRounds) : null,
      complete: !abandoned,
      startedAt,
      when: relativeWhen(startedAt, now),
      pattern: rounds.slice(0, 60).map((round) => (round.correct ? "1" : "0")).join(""),
      avgTimeMs: mean(mine.flatMap(timedRounds)),
      bestStreak: longestStreak(rounds),
      misses,
      duel: {
        kind: "pvp",
        ladder: record.ladder, ladderLabel,
        botName: record.opponentName, botLeague: "", botStyle: "",
        outcome: record.outcome, tiebreak: record.tiebreak,
        playerCorrect: record.youCorrect, botCorrect: record.opponentCorrect, total: record.totalRounds,
        delta: record.ratingDelta ?? 0,
        deltaLabel: record.ratingDelta !== null && record.ratingDelta !== undefined ? t.progress.pvpForceLabel : null,
        deltaText: record.ratingDelta !== null && record.ratingDelta !== undefined ? t.pvp.result.ratingChange(record.ratingDelta) : t.pvp.modeFriendly,
        abandoned,
        playerMs: record.youMs, botMs: record.opponentMs,
        legs,
      },
    };
  });
  return { rows, used };
}

export function buildProgressDashboard(input: DashboardInput): Dashboard {
  const { now, meta } = input;
  const sessions = input.sessions.filter((session) => session.roundCount > 0).slice().sort((a, b) => startedAtOf(a) - startedAtOf(b));
  const universe = new Set(input.universe);
  const total = input.universe.length;
  const flagOf = (id: string) => meta[id]?.fl;

  // ---- maestria e estágios
  const dominated = input.dominatedIds.length;
  const pct = total > 0 ? clampPercent((dominated / total) * 100) : 0;
  const profile = hubProfile({ masteryPct: pct, titleIds: input.titleIds });
  const cosmographer = input.titleIds.includes("cosmografo");
  let stageIndex = 0;
  MASTERY_STAGES.forEach((stage, index) => { if (pct >= stage.from) stageIndex = index; });
  if (cosmographer) stageIndex = MASTERY_STAGES.length;
  const stages = [...MASTERY_STAGES.map((stage) => ({ name: stage.title as string, at: `${stage.from}%` })), { name: t.titles.cosmografo, at: t.titles.threeTitles }];
  const hero: Dashboard["hero"] = {
    pct, dominated, total,
    stageTitle: profile.title,
    stageIndex,
    cosmographer,
    stages,
    next: profile.next ? { name: profile.next.title, at: profile.next.at } : null,
    missing: profile.next ? Math.max(0, Math.ceil((profile.next.at / 100) * total) - dominated) : null,
    titles: [
      ...PILLAR_TITLES.map((title) => ({ id: title.id as string, label: title.label, earned: input.titleIds.includes(title.id) })),
      { id: "cosmografo", label: t.titles.cosmografo, earned: cosmographer },
    ],
  };

  // ---- números rápidos
  const byRecency = sessions;
  const accuracyOf = (items: SurfaceSession[]) => {
    const rounds = items.reduce((sum, session) => sum + session.roundCount, 0);
    const correct = items.reduce((sum, session) => sum + session.correct, 0);
    return rounds ? correct / rounds : null;
  };
  const overall = accuracyOf(byRecency);
  const lastFive = byRecency.slice(-5);
  const beforeLastFive = byRecency.slice(0, -5);
  const accRecent = accuracyOf(lastFive);
  const accRest = accuracyOf(beforeLastFive);
  const timeOf = (items: SurfaceSession[]) => mean(items.flatMap(timedRounds));
  const timeRecent = timeOf(lastFive);
  const timeRest = timeOf(beforeLastFive);
  const kpis: Dashboard["kpis"] = {
    level: input.economy.level,
    xpInLevel: Math.max(0, input.economy.xp - input.economy.xpBase),
    xpSpan: Math.max(1, input.economy.xpNext - input.economy.xpBase),
    album: input.album,
    sessions: input.economy.completedSessions,
    rounds: input.economy.rounds,
    accuracyPct: overall === null ? null : roundPct(overall),
    accuracyDelta: byRecency.length > 5 && accRecent !== null && accRest !== null ? roundPct(accRecent) - roundPct(accRest) : null,
    avgTimeMs: timeOf(byRecency),
    timeDeltaMs: byRecency.length > 5 && timeRecent !== null && timeRest !== null ? timeRecent - timeRest : null,
  };

  // ---- pilares
  const roundsByPillar: Record<string, boolean[]> = {};
  for (const session of sessions) {
    const key = pillarOfSession(session);
    if (!key || !session.rounds.length) continue;
    (roundsByPillar[key] ??= []).push(...session.rounds.map((round) => round.correct));
  }
  const writingCorrect = input.pillars.escrita?.correct ?? 0;
  const pillars: PillarCard[] = PILLAR_META.map(({ key, label, titleId }) => {
    const snapshot = input.pillars[key];
    const seen = snapshot?.seen ?? 0;
    const correct = snapshot?.correct ?? 0;
    const score = snapshot?.bayesianScore ?? null;
    const earned = input.titleIds.includes(titleId);
    const scorePct = score === null ? null : roundPct(score);
    const status = snapshot?.status ?? "sem evidência";
    const tone: PillarTone = earned ? "earned" : status === "forte" ? "good" : status === "revisar" ? "warn" : "mid";
    const labels = t.progress.status;
    const statusLabel = earned ? labels.earned : status === "forte" ? labels.forte : status === "em desenvolvimento" ? labels.desenvolvimento : status === "revisar" ? labels.revisar : status === "diagnóstico" ? labels.diagnostico : labels.none;
    const flags = roundsByPillar[key] ?? [];
    const window = (from: number, to: number) => { const part = flags.slice(from, to); return part.length >= 10 ? roundPct(part.filter(Boolean).length / part.length) : null; };
    const formNow = window(Math.max(0, flags.length - FORM_WINDOW), flags.length);
    const formBefore = window(Math.max(0, flags.length - 2 * FORM_WINDOW), Math.max(0, flags.length - FORM_WINDOW));
    const coverage = input.records.filter((record) => universe.has(String(record.entityId ?? record.id ?? "")) && (record.columns?.[key] ?? 0) > 0).length;
    return {
      key, label,
      title: PILLAR_TITLES.find((item) => item.id === titleId)?.label ?? "",
      earned, seen, correct, scorePct, goalPct: TITLE_GOAL,
      gapPts: earned || scorePct === null ? (earned ? 0 : TITLE_GOAL) : Math.max(0, TITLE_GOAL - scorePct),
      status: statusLabel, tone,
      coverage, coverageTotal: total,
      formPct: formNow, formDelta: formNow !== null && formBefore !== null ? formNow - formBefore : null,
      writing: key === "mapa" ? null : { ok: writingCorrect >= 2, count: writingCorrect, needed: 2 },
    };
  });

  // ---- domínio por recorte
  const dominatedSet = new Set(input.dominatedIds);
  const discoveredSet = new Set(input.records.filter((record) => Number(record.mastery ?? 0) > 0).map((record) => String(record.entityId ?? record.id ?? "")));
  const rows: RegionRow[] = REGION_ITEMS.map(([key, label]) => {
    const ids = key === "mundo" ? [...input.universe] : input.universe.filter((id) => regionMatches(meta[id], key));
    const found = key === "mundo" ? dominated : ids.filter((id) => dominatedSet.has(id)).length;
    const count = key === "mundo" ? total : ids.length;
    return { key, label, found, discovered: ids.filter((id) => discoveredSet.has(id)).length, total: count, pct: count ? Math.round((found / count) * 100) : 0, world: key === "mundo", tag: null };
  });
  const regional = rows.filter((row) => !row.world && row.total > 0);
  if (regional.length > 1 && dominated > 0) {
    const best = regional.reduce((a, b) => (b.pct > a.pct ? b : a));
    const worst = regional.reduce((a, b) => (b.pct < a.pct || (b.pct === a.pct && b.total > a.total) ? b : a));
    if (best.pct > worst.pct) { best.tag = "good"; worst.tag = "warn"; }
  }

  // ---- para revisar
  type Tally = { tries: number; correct: number; byPillar: Map<PillarKey, { tries: number; correct: number }> };
  const tally = new Map<string, Tally>();
  for (const session of sessions) {
    const key = pillarOfSession(session);
    if (!key) continue;
    for (const round of session.rounds) {
      if (!round.targetId || !meta[round.targetId]) continue;
      const item = tally.get(round.targetId) ?? { tries: 0, correct: 0, byPillar: new Map() };
      item.tries += 1;
      if (round.correct) item.correct += 1;
      const part = item.byPillar.get(key) ?? { tries: 0, correct: 0 };
      part.tries += 1;
      if (round.correct) part.correct += 1;
      item.byPillar.set(key, part);
      tally.set(round.targetId, item);
    }
  }
  const weak = [...tally.entries()]
    .filter(([, item]) => item.tries >= REVIEW_MIN_TRIES && item.correct / item.tries < REVIEW_BELOW)
    .sort((a, b) => a[1].correct / a[1].tries - b[1].correct / b[1].tries || b[1].tries - a[1].tries || compareText(meta[a[0]]?.pt ?? "", meta[b[0]]?.pt ?? ""));
  const review: Dashboard["review"] = {
    total: weak.length,
    items: weak.slice(0, 30).map(([id, item]) => ({
      id, name: meta[id]?.pt ?? id, place: placeLabel(meta[id]), flag: flagOf(id),
      pct: roundPct(item.correct / item.tries), correct: item.correct, tries: item.tries,
      weak: [...item.byPillar.entries()].filter(([, part]) => part.tries >= 2 && part.correct / part.tries < REVIEW_BELOW).map(([key]) => PILLAR_WORD[key]),
    })),
  };

  // ---- atividade (mapa de calor de 12 semanas, segunda a domingo)
  const today = startOfDay(now);
  const mondayOffset = (new Date(today).getDay() + 6) % 7;
  const mondayThisWeek = addDays(today, -mondayOffset);
  const firstMonday = addDays(mondayThisWeek, -(HEATMAP_WEEKS - 1) * 7);
  const perDay = new Map<string, number>();
  for (const session of sessions) {
    const at = startedAtOf(session);
    if (!at) continue;
    perDay.set(dayKey(at), (perDay.get(dayKey(at)) ?? 0) + session.roundCount);
  }
  const weeks: number[][] = [];
  const months: string[] = [];
  let activeDays = 0;
  let daysTotal = 0;
  for (let week = 0; week < HEATMAP_WEEKS; week += 1) {
    const monday = addDays(firstMonday, week * 7);
    const previous = week ? addDays(firstMonday, (week - 1) * 7) : null;
    months.push(previous === null || new Date(monday).getMonth() !== new Date(previous).getMonth() ? shortMonth(monday) : "");
    const column: number[] = [];
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(monday, day);
      if (date > today) { column.push(-1); continue; }
      const rounds = perDay.get(dayKey(date)) ?? 0;
      daysTotal += 1;
      if (rounds > 0) activeDays += 1;
      column.push(rounds);
    }
    weeks.push(column);
  }
  // um mês recém-começado não divide o espaço com o anterior: fica só o rótulo mais novo
  for (let index = 0; index < months.length - 1; index += 1) if (months[index] && months[index + 1]) months[index] = "";
  const activeStamps = [...perDay.entries()].filter(([, rounds]) => rounds > 0).map(([key]) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d).getTime(); }).sort((a, b) => a - b);
  const activeSet = new Set(activeStamps);
  let streak = 0;
  for (let cursor = activeSet.has(today) ? today : addDays(today, -1); activeSet.has(cursor); cursor = addDays(cursor, -1)) streak += 1;
  let bestStreak = 0;
  let run = 0;
  activeStamps.forEach((stamp, index) => {
    run = index > 0 && addDays(activeStamps[index - 1], 1) === stamp ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
  });
  const thisWeek = sessions.filter((session) => startedAtOf(session) >= mondayThisWeek);
  const weekAcc = accuracyOf(thisWeek);
  const activity: Dashboard["activity"] = {
    start: firstMonday, weeks, months, streak, bestStreak,
    weekRounds: thisWeek.reduce((sum, session) => sum + session.roundCount, 0),
    weekAccuracy: weekAcc === null ? null : roundPct(weekAcc),
    activeDays, daysTotal,
  };

  // ---- recordes
  const dateOf = (session: SurfaceSession) => formatShortDate(startedAtOf(session));
  let bestStreakRecord: Dashboard["records"]["bestStreak"] = null;
  for (const session of sessions) {
    const value = longestStreak(session.rounds);
    if (value > (bestStreakRecord?.value ?? 0)) bestStreakRecord = { value, when: dateOf(session) };
  }
  let bestSession: Dashboard["records"]["bestSession"] = null;
  let fastest: Dashboard["records"]["fastest"] = null;
  let bestMapError: Dashboard["records"]["bestMapError"] = null;
  for (const session of sessions.filter((item) => item.complete)) {
    if (session.roundCount >= 10) {
      const pctValue = roundPct(session.correct / session.roundCount);
      if (!bestSession || pctValue > bestSession.pct || (pctValue === bestSession.pct && session.roundCount >= bestSession.rounds)) {
        bestSession = { pct: pctValue, rounds: session.roundCount, when: dateOf(session) };
      }
      const times = timedRounds(session);
      const average = times.length >= 10 ? mean(times) : null;
      if (average !== null && (!fastest || average < fastest.ms)) fastest = { ms: average, family: sessionLabel(session).family, when: dateOf(session) };
    }
    const label = sessionLabel(session);
    if (label.group === "mapa") {
      const error = meanMapErrorKm(session.rounds);
      if (error && error.rounds >= MAP_ERROR_MIN_ROUNDS && (!bestMapError || error.km < bestMapError.km)) bestMapError = { km: error.km, when: dateOf(session) };
    }
  }
  const records: Dashboard["records"] = { bestStreak: bestStreakRecord, bestSession, fastest, bestMapError };

  // ---- evolução da precisão
  const finished = sessions.filter((session) => session.complete && session.roundCount >= 5).slice(-EVOLUTION_POINTS);
  const points = finished.map((session) => ({ pct: roundPct(session.correct / session.roundCount), when: dateOf(session) }));
  const compare = Math.min(5, Math.floor(points.length / 2));
  const evolution: Dashboard["evolution"] = {
    points,
    delta: compare >= 2 ? Math.round((mean(points.slice(-compare).map((point) => point.pct)) ?? 0) - (mean(points.slice(0, compare).map((point) => point.pct)) ?? 0)) : null,
    deltaOver: compare,
    first: points[0]?.when ?? "",
    last: finished.length ? relativeWhen(startedAtOf(finished[finished.length - 1]), now).split(",")[0] : "",
  };

  // ---- partidas (mais recentes primeiro)
  const duelRows = buildDuelRows(input.duels ?? [], sessions, meta, flagOf, now);
  const pvpRows = buildPvpRows(input.pvpMatches ?? [], sessions, meta, flagOf, now);
  const used = new Set([...duelRows.used, ...pvpRows.used]);
  const history = [...sessions.filter((session) => !used.has(session.id)).reverse().map((session) => buildRow(session, meta, flagOf, now)), ...duelRows.rows, ...pvpRows.rows]
    .sort((a, b) => b.startedAt - a.startedAt);

  return {
    empty: sessions.length === 0,
    hero, kpis, pillars, regions: rows, review, activity, records, evolution,
    recent: history.slice(0, 5),
    history,
  };
}

// Agrupa o histórico em Hoje · Ontem · Esta semana · meses anteriores.
export function groupHistory(rows: readonly SessionRow[], now: number): HistoryGroup[] {
  const today = startOfDay(now);
  const yesterday = addDays(today, -1);
  const monday = addDays(today, -((new Date(today).getDay() + 6) % 7));
  const groups = new Map<string, HistoryGroup>();
  for (const row of rows) {
    const day = startOfDay(row.startedAt);
    const date = new Date(row.startedAt);
    let key: string;
    let label: string;
    if (day === today) { key = "hoje"; label = t.dates.todayGroup; }
    else if (day === yesterday) { key = "ontem"; label = t.dates.yesterdayGroup; }
    else if (day >= monday) { key = "semana"; label = t.dates.thisWeek; }
    else {
      key = `${date.getFullYear()}-${date.getMonth()}`;
      label = `${MONTH_NAMES[date.getMonth()]}${date.getFullYear() === new Date(now).getFullYear() ? "" : ` ${date.getFullYear()}`}`;
    }
    const group = groups.get(key) ?? { key, label, sessions: 0, rounds: 0, pct: null, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const rounds = group.rows.reduce((sum, row) => sum + row.rounds, 0);
    const correct = group.rows.reduce((sum, row) => sum + Math.round(((row.pct ?? 0) / 100) * row.rounds), 0);
    return { ...group, sessions: group.rows.length, rounds, pct: rounds ? Math.round((correct / rounds) * 100) : null };
  });
}
