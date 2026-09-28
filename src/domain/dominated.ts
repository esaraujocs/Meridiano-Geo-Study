// Países dominados: as 3 últimas respostas de um país estão certas e ele já foi acertado em pelo menos 2 colunas (modos)
// diferentes, em qualquer momento. Lógica pura, sem IndexedDB, para ser usada pela economia e pela tela de Progresso.
// Até 26/09 as 2 colunas tinham de estar entre as 3 últimas respostas (regra do perfil clássico): acertar o mesmo país
// 3 vezes seguidas no mesmo modo tirava o domínio, e o XP caía jogando certo. Agora só um erro tira o domínio.

export type EconomyRound = { targetId: string; correct: boolean; column: string; at: number };

function sessionRounds(value: any, sessionIndex: number): EconomyRound[] {
  const source = Array.isArray(value?.rounds) ? value.rounds : Array.isArray(value?.r)
    ? value.r.filter(Array.isArray).map((item: any[]) => ({ targetId: item[0], correct: item[1], distanceKm: item[3], tuple: true }))
    : [];
  // Rodada respondida com ajuda de um suprimento de expedição não conta pra maestria/domínio (fica de fora da evidência,
  // como se não tivesse acontecido — não reseta nem avança o domínio do país).
  const raw = source.filter((round: any) => !round?.assisted);
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

function roundsByEntity(sessions: unknown[]) {
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
  for (const list of byEntity.values()) list.sort((a, b) => a.at - b.at);
  return byEntity;
}

/** Domínio no fim de uma sequência de respostas (já em ordem): 3 últimas certas e acertos em 2 ou mais colunas. */
function dominatedAt(rounds: readonly EconomyRound[], correctColumns: ReadonlySet<string>) {
  const last = rounds.slice(-3);
  return last.length === 3 && last.every((round) => round.correct) && correctColumns.size >= 2;
}

// Migrações antigas podem ter guardado só a evidência das 3 últimas respostas, sem as partidas originais.
// Vale só essa evidência normalizada; maestria sozinha nunca conta como domínio.
function legacyEvidence(progress: unknown[], byEntity: Map<string, EconomyRound[]>) {
  const ids = new Set<string>();
  for (const row of progress as any[]) {
    const history = Array.isArray(row?.last3) ? row.last3 : Array.isArray(row?.lastThree) ? row.lastThree : [];
    const last = history.slice(-3);
    const id = String(row?.entityId ?? row?.id ?? "");
    if (last.length === 3 && last.every((item: any) => Boolean(item?.correct ?? item?.ok ?? item === true)) &&
      new Set(last.map((item: any) => String(item?.column ?? item?.family ?? ""))).size >= 2 &&
      !byEntity.has(id)) ids.add(id);
  }
  return ids;
}

/** Países dominados agora (a maestria do Hub e da tela de Progresso). Um erro recente tira o país da lista. */
export function dominatedIdsFromSessions(sessions: unknown[], progress: unknown[] = []): Set<string> {
  const byEntity = roundsByEntity(sessions);
  const dominated = new Set<string>();
  for (const [id, rounds] of byEntity.entries()) {
    const columns = new Set(rounds.filter((round) => round.correct).map((round) => round.column));
    if (dominatedAt(rounds, columns)) dominated.add(id);
  }
  for (const id of legacyEvidence(progress, byEntity)) dominated.add(id);
  return dominated;
}

/** Países que já estiveram dominados em algum momento: é o que rende XP, que por isso nunca cai. */
export function everDominatedIdsFromSessions(sessions: unknown[], progress: unknown[] = []): Set<string> {
  const byEntity = roundsByEntity(sessions);
  const ever = new Set<string>();
  for (const [id, rounds] of byEntity.entries()) {
    const columns = new Set<string>();
    for (let index = 0; index < rounds.length; index += 1) {
      if (rounds[index].correct) columns.add(rounds[index].column);
      if (dominatedAt(rounds.slice(0, index + 1), columns)) { ever.add(id); break; }
    }
  }
  for (const id of legacyEvidence(progress, byEntity)) ever.add(id);
  return ever;
}

export const dominatedFromSessions = (sessions: unknown[], progress: unknown[] = []) => dominatedIdsFromSessions(sessions, progress).size;
export const everDominatedFromSessions = (sessions: unknown[], progress: unknown[] = []) => everDominatedIdsFromSessions(sessions, progress).size;

