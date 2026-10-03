// Estatísticas de UM modo de jogo, para a lateral da Mesa de jogo: precisão, recordes, evolução e partidas recentes. Lógica pura, sem React nem banco.
// Um "modo" é o que a Mesa oferece: família do motor + variante (nas bandeiras a variante não conta, porque os dois sentidos são o mesmo modo).

/** O mínimo de uma sessão que a conta precisa (o `SurfaceSession` do Progresso serve). */
export type StatSession = {
  family: string;
  variant: string;
  startedAt: number | null;
  complete: boolean;
  roundCount: number;
  correct: number;
  duelId?: string;
  rounds: ReadonlyArray<{ correct: boolean; responseTimeMs: number | null; assisted?: boolean }>;
};
export type StatMode = { family: string; variant: string; flag?: string };

export type ModeRecent = { at: number; correct: number; rounds: number; pct: number; avgMs: number | null; duel: boolean };
export type ModeStats = {
  matches: number;
  rounds: number;
  /** Acerto de todas as rodadas do modo (0 a 100) ou `null` sem partidas. */
  accuracy: number | null;
  /** Melhor partida com pelo menos 5 rodadas. */
  best: { pct: number; correct: number; rounds: number; at: number } | null;
  /** Acertos seguidos, na ordem em que foram jogados (rodadas com suprimento não entram). */
  bestStreak: number;
  fastestMs: number | null;
  /** Precisão das últimas partidas (da mais antiga para a mais nova). */
  trend: Array<{ pct: number; at: number }>;
  /** As partidas mais novas primeiro. */
  recent: ModeRecent[];
};

export const TREND_LENGTH = 12;
export const RECENT_LENGTH = 4;
const MIN_ROUNDS = 5;

export const sessionInMode = (session: StatSession, mode: StatMode) => session.family === mode.family && (mode.flag !== undefined || session.variant === mode.variant);

const pctOf = (correct: number, rounds: number) => (rounds > 0 ? Math.round((correct / rounds) * 100) : 0);

export function modeStats(sessions: readonly StatSession[], mode: StatMode): ModeStats {
  const mine = sessions
    .filter((session) => session.complete && session.roundCount > 0 && sessionInMode(session, mode))
    .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
  const rounds = mine.reduce((total, session) => total + session.roundCount, 0);
  const correct = mine.reduce((total, session) => total + session.correct, 0);
  let best: ModeStats["best"] = null;
  let streak = 0;
  let bestStreak = 0;
  let fastestMs: number | null = null;
  for (const session of mine) {
    if (session.roundCount >= MIN_ROUNDS) {
      const pct = pctOf(session.correct, session.roundCount);
      if (!best || pct > best.pct || (pct === best.pct && session.roundCount > best.rounds)) best = { pct, correct: session.correct, rounds: session.roundCount, at: session.startedAt ?? 0 };
    }
    for (const round of session.rounds) {
      if (round.assisted) continue;
      streak = round.correct ? streak + 1 : 0;
      bestStreak = Math.max(bestStreak, streak);
      if (round.correct && round.responseTimeMs && round.responseTimeMs > 0) fastestMs = fastestMs === null ? round.responseTimeMs : Math.min(fastestMs, round.responseTimeMs);
    }
  }
  const sized = mine.filter((session) => session.roundCount >= MIN_ROUNDS);
  const trend = sized.slice(-TREND_LENGTH).map((session) => ({ pct: pctOf(session.correct, session.roundCount), at: session.startedAt ?? 0 }));
  const recent = mine.slice(-RECENT_LENGTH).reverse().map((session): ModeRecent => {
    const times = session.rounds.map((round) => round.responseTimeMs).filter((ms): ms is number => typeof ms === "number" && ms > 0);
    return { at: session.startedAt ?? 0, correct: session.correct, rounds: session.roundCount, pct: pctOf(session.correct, session.roundCount), avgMs: times.length ? Math.round(times.reduce((sum, ms) => sum + ms, 0) / times.length) : null, duel: Boolean(session.duelId) };
  });
  return { matches: mine.length, rounds, accuracy: rounds > 0 ? pctOf(correct, rounds) : null, best, bestStreak, fastestMs, trend, recent };
}
