type SessionLike = {
  complete?: unknown;
  completa?: unknown;
  rounds?: unknown;
  r?: unknown;
  roundCount?: unknown;
  rodadas?: unknown;
  aggregate?: { rod?: unknown };
  ag?: { rod?: unknown };
};

export function playerStatsFromSessions(sessions: SessionLike[]) {
  const completed = sessions.filter((session) => Boolean(session.complete ?? session.completa));
  // Rodadas jogadas com o Tônico de XP ativo (`boosted`): só contam as de partidas concluídas, como o resto do XP.
  const boostedRounds = completed.reduce((total, session) => total + (Array.isArray(session.rounds) ? session.rounds.filter((round) => (round as { boosted?: unknown } | null)?.boosted === true).length : 0), 0);
  const rounds = completed.reduce((total, session) => {
    const entries = Array.isArray(session.rounds)
      ? session.rounds
      : Array.isArray(session.r)
        ? session.r.filter(Array.isArray)
        : [];
    const aggregate = session.aggregate ?? session.ag ?? {};
    return total + (
      entries.length ||
      Number(session.roundCount ?? session.rodadas ?? aggregate.rod ?? 0)
    );
  }, 0);
  return { completedSessions: completed.length, rounds, boostedRounds };
}