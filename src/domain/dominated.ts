// DOMÍNIO (regra de 04/10/2026, a que vale para a maestria do Hub e para os títulos) está na seção "Domínio permanente" no fim deste arquivo.
// As funções `dominatedIdsFromSessions`/`everDominatedIdsFromSessions` abaixo são a regra ANTIGA (3 últimas certas + 2 modos): hoje só o XP usa a
// `everDominated…` (para ninguém perder nível). Regra antiga, em detalhe: as 3 últimas respostas de um país estão certas e ele já foi acertado em pelo menos 2 colunas (modos)
// diferentes, em qualquer momento. Lógica pura, sem IndexedDB, para ser usada pela economia e pela tela de Progresso.
// Até 26/09 as 2 colunas tinham de estar entre as 3 últimas respostas (regra do perfil clássico): acertar o mesmo país
// 3 vezes seguidas no mesmo modo tirava o domínio, e o XP caía jogando certo. Agora só um erro tira o domínio.

export type EconomyRound = { targetId: string; correct: boolean; column: string; at: number; /** rodada de Escrita (digitada): na regra antiga ela caía em "capitais"/"escrita"; o domínio novo a trata à parte */ written: boolean; /** variante e assunto da partida (distingue escrita da capital de escrita do país) */ sub: string };

/** Gentílicos e Moedas perguntam sobre países, mas não são prova de reconhecimento no mapa, na bandeira ou na capital: ficam fora do domínio e do XP de
 *  domínio. A família Brasil pergunta sobre os estados, que não são cartas do atlas. */
export const OUTSIDE_DOMAIN_FAMILIES: ReadonlySet<string> = new Set(["gentilicos", "moedas", "brasil"]);

function sessionRounds(value: any, sessionIndex: number): EconomyRound[] {
  if (OUTSIDE_DOMAIN_FAMILIES.has(String(value?.family ?? ""))) return [];
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
  const sub = `${variant} ${String(value?.subject ?? "")}`;
  const written = family === "escrita" || /escrit|^escr$/i.test(variant);
  const sessionOrder = Number(value?.sourceIndex ?? value?.startedAt ?? value?.ini ?? value?.endedAt ?? value?.fim ?? sessionIndex);
  return raw.map((round: any, index: number) => ({
    targetId: String(round?.targetId ?? round?.entityId ?? round?.id ?? round?.[0] ?? ""),
    correct: Boolean(round?.correct ?? round?.ok ?? round?.c ?? round?.[1]),
    column: String(round?.column ?? column),
    sub,
    written,
    at: Number(round?.tuple
      ? sessionOrder * 1000000 + index
      : round?.answeredAt ?? round?.at ?? sessionOrder * 1000000 + index),
  })).filter((round: EconomyRound) => round.targetId);
}

export function roundsByEntity(sessions: unknown[]) {
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


// ───────────────────────── Domínio permanente (04/10/2026) ─────────────────────────
// Pedido do Enzo: o domínio não pode ser perdível (conquistou, é para sempre, errar depois não tira) e tem de exigir mais que 3 acertos: acertos seguidos
// em VÁRIOS modos, e escrever a capital como prova de que a pessoa sabe e não só reconhece. Regras (números em DOMAIN_*):
//  · um país é CONQUISTADO NUM PILAR (Mapa, Bandeiras ou Capitais) quando, em algum momento, houve DOMAIN_STREAK respostas certas seguidas dele naquele pilar;
//  · um país é DOMINADO (a maestria do Hub) quando está conquistado em pelo menos DOMAIN_PILLARS pilares E a pessoa já acertou escrevendo a capital dele
//    (nos países sem capital, escrevendo o nome do país);
//  · rodada com suprimento não conta (como antes); só partidas completas contam.
export const DOMAIN_STREAK = 5;
export const DOMAIN_PILLARS = 2;
/** Países sem capital no catálogo (Antártida e Macau): a escrita que vale para eles é a do nome do país. Conferido por scripts/test-domain.mjs. */
export const NO_CAPITAL_IDS: ReadonlySet<string> = new Set(["10", "446"]);
export type RecognitionPillar = "mapa" | "bandeiras" | "capitais";
export const RECOGNITION_PILLARS: readonly RecognitionPillar[] = ["mapa", "bandeiras", "capitais"];
export type Conquest = { pillars: Set<RecognitionPillar>; wroteCapital: boolean; wroteCountry: boolean };

/** O que cada país já conquistou, na ordem em que as respostas aconteceram. */
export function conquestFromSessions(sessions: unknown[]): Map<string, Conquest> {
  const out = new Map<string, Conquest>();
  for (const [id, rounds] of roundsByEntity(sessions).entries()) {
    const conquest: Conquest = { pillars: new Set(), wroteCapital: false, wroteCountry: false };
    const run: Record<string, number> = {};
    for (const round of rounds) {
      if (round.written) {
        if (round.correct) { if (/capital/i.test(round.sub)) conquest.wroteCapital = true; else conquest.wroteCountry = true; }
      } else if ((RECOGNITION_PILLARS as readonly string[]).includes(round.column)) {
        run[round.column] = round.correct ? (run[round.column] ?? 0) + 1 : 0;
        if (run[round.column] >= DOMAIN_STREAK) conquest.pillars.add(round.column as RecognitionPillar);
      }
    }
    out.set(id, conquest);
  }
  return out;
}

export const isDominated = (id: string, conquest: Conquest) =>
  conquest.pillars.size >= DOMAIN_PILLARS && (NO_CAPITAL_IDS.has(id) ? conquest.wroteCountry : conquest.wroteCapital);

/** Países dominados (permanente): é a maestria do Hub e da tela de Progresso. */
export function masteredIdsFromSessions(sessions: unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const [id, conquest] of conquestFromSessions(sessions).entries()) if (isDominated(id, conquest)) ids.add(id);
  return ids;
}
export const masteredFromSessions = (sessions: unknown[]) => masteredIdsFromSessions(sessions).size;

/** Países conquistados em cada pilar (permanente): é o que abre os títulos. */
export function conqueredByPillar(sessions: unknown[]): Record<RecognitionPillar, Set<string>> {
  const out: Record<RecognitionPillar, Set<string>> = { mapa: new Set(), bandeiras: new Set(), capitais: new Set() };
  for (const [id, conquest] of conquestFromSessions(sessions).entries()) for (const pillar of conquest.pillars) out[pillar].add(id);
  return out;
}
