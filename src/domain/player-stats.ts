type SessionLike = {
  family?: unknown;
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
  // XP do Travel pelo tamanho da rota (22/10/2026, pedido do Enzo: "joguei algumas de Travel e o XP subiu praticamente nada"): cada rota vale
  // o peso das moedas dela (`weight`: países no meio × nível × o desconto dos chutes a mais) em rodadas de XP, no mínimo 1 (a rota perdida).
  // `xpRounds`/`xpBoosted` entram no XP; `rounds` segue sendo a contagem de rodadas que aparece na tela.
  const unit = (session: SessionLike, round: unknown) => (session.family === "travel" ? Math.max(1, Number((round as { weight?: unknown } | null)?.weight) || 0) : 1);
  let xpRounds = rounds, xpBoosted = boostedRounds;
  for (const session of completed) {
    if (session.family !== "travel" || !Array.isArray(session.rounds)) continue;
    for (const round of session.rounds) {
      const extra = unit(session, round) - 1;
      xpRounds += extra;
      if ((round as { boosted?: unknown } | null)?.boosted === true) xpBoosted += extra;
    }
  }
  return { completedSessions: completed.length, rounds, boostedRounds, xpRounds, xpBoosted };
}