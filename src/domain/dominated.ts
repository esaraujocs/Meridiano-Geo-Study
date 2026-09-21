// Países dominados: as 3 últimas respostas certas de um país, vindas de pelo menos 2 colunas (modos) diferentes.
// Regra do perfil clássico. Lógica pura, sem IndexedDB, para ser usada pela economia e pela tela de Progresso.

export type EconomyRound = { targetId: string; correct: boolean; column: string; at: number };

function sessionRounds(value: any, sessionIndex: number): EconomyRound[] {
  const raw = Array.isArray(value?.rounds) ? value.rounds : Array.isArray(value?.r)
    ? value.r.filter(Array.isArray).map((item: any[]) => ({ targetId: item[0], correct: item[1], distanceKm: item[3], tuple: true }))
    : [];
  const variant = String(value?.variant ?? value?.assunto ?? value?.modo ?? value?.mode ?? "");
  const family = String(value?.family ?? value?.mode ?? "");
  const column = String(value?.column ?? value?.learningColumn ?? "") ||
    (/histor|bandeira|flag|bnhist|nbhist/i.test(variant + family)
    ? "bandeiras"
    : /capital|capitais/i.test(variant + family)
      ? "capitais"
      : /escrit|idioma/i.test(variant + family)
        ? "escrita"
        : "mapa");
  const sessionOrder = Number(value?.sourceIndex ?? value?.startedAt ?? value?.ini ?? value?.endedAt ?? value?.fim ?? sessionIndex);
  return raw.map((round: any, index: number) => ({
    targetId: String(round?.targetId ?? round?.entityId ?? round?.id ?? round?.[0] ?? ""),
    correct: Boolean(round?.correct ?? round?.ok ?? round?.c ?? round?.[1]),
    column: String(round?.column ?? column),
    at: Number(round?.tuple
      ? sessionOrder * 1000000 + index
      : round?.answeredAt ?? round?.at ?? sessionOrder * 1000000 + index),
  })).filter((round: EconomyRound) => round.targetId);
}

/** Classic profile rule: the last three answers for a country must all be
 * correct, and those answers must span at least two game columns. */
export function dominatedIdsFromSessions(sessions: unknown[], progress: unknown[] = []): Set<string> {
  const byEntity = new Map<string, EconomyRound[]>();
  sessions.forEach((session, index) => {
    const value = session as any;
    if (value?.complete !== true) return;
    for (const round of sessionRounds(value, index)) {
      const list = byEntity.get(round.targetId) ?? [];
      list.push(round);
      byEntity.set(round.targetId, list);
    }
  });
  const dominated = new Set<string>();
  for (const [id, rounds] of byEntity.entries()) {
    const last = rounds.sort((a, b) => a.at - b.at).slice(-3);
    if (last.length === 3 && last.every((round) => round.correct) &&
      new Set(last.map((round) => round.column)).size >= 2) dominated.add(id);
  }
  // Older migrations may have preserved explicit last-three evidence but not
  // the original session rows. Accept only that normalized evidence; mastery
  // alone is deliberately not treated as domination.
  for (const row of progress as any[]) {
    const history = Array.isArray(row?.last3) ? row.last3 : Array.isArray(row?.lastThree) ? row.lastThree : [];
    const last = history.slice(-3);
    if (last.length === 3 && last.every((item: any) => Boolean(item?.correct ?? item?.ok ?? item === true)) &&
      new Set(last.map((item: any) => String(item?.column ?? item?.family ?? ""))).size >= 2 &&
      !byEntity.has(String(row?.entityId ?? row?.id ?? ""))) dominated.add(String(row?.entityId ?? row?.id ?? ""));
  }
  return dominated;
}

export const dominatedFromSessions = (sessions: unknown[], progress: unknown[] = []) => dominatedIdsFromSessions(sessions, progress).size;

