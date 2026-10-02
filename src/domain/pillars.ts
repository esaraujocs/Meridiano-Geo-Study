// Pilares de maestria (Bandeiras, Mapa, Capitais + Escrita como validador) calculados a partir das partidas.
// Lógica pura, sem React nem IndexedDB.

export type PillarKey = "bandeiras" | "mapa" | "capitais" | "escrita";
export const PILLAR_KEYS: readonly PillarKey[] = ["bandeiras", "mapa", "capitais", "escrita"];

export type PillarSession = {
  column?: string;
  family?: string;
  variant?: string;
  mode?: string;
  subject?: string;
  correct?: number;
  roundCount?: number;
  startedAt?: number | null;
  rounds?: ReadonlyArray<{ correct: boolean; assisted?: boolean }>;
};

// Prior bayesiano do clássico: (acertos + 12 × 0,45) ÷ (rodadas + 12). Poucas rodadas puxam a nota para baixo.
export const BAYES_WEIGHT = 12;
export const BAYES_PRIOR = 0.45;
export const bayesianScore = (correct: number, seen: number) => (correct + BAYES_WEIGHT * BAYES_PRIOR) / (seen + BAYES_WEIGHT);

// Nota que abre os títulos: a MELHOR entre a precisão de sempre (acima) e a das últimas TITLE_WINDOW rodadas do pilar.
// Só a de sempre punia quem aprende jogando: 3.380 rodadas em Capitais a 87% (os primeiros erros pesando para sempre) com ~97% nas últimas 100
// pediam mais de mil rodadas sem erro para chegar a 90%. A janela mede quem a pessoa é agora; exige TITLE_WINDOW rodadas (não vale sorte em poucas)
// e não conta rodada com suprimento (assistida).
export const TITLE_WINDOW = 100;
export const TITLE_SCORE = 0.9;
export function recentPrecision(sessions: readonly PillarSession[]) {
  const flags: Record<PillarKey, boolean[]> = { bandeiras: [], mapa: [], capitais: [], escrita: [] };
  const ordered = sessions.map((session, index) => ({ session, index })).sort((a, b) => ((a.session.startedAt ?? 0) - (b.session.startedAt ?? 0)) || a.index - b.index);
  for (const { session } of ordered) {
    const key = pillarOfSession(session);
    if (!key) continue;
    for (const round of session.rounds ?? []) if (!round.assisted) flags[key].push(Boolean(round.correct));
  }
  const out = {} as Record<PillarKey, number | null>;
  for (const key of PILLAR_KEYS) {
    const recent = flags[key].slice(-TITLE_WINDOW);
    out[key] = recent.length >= TITLE_WINDOW ? recent.filter(Boolean).length / recent.length : null;
  }
  return out;
}
/** A nota do título: o maior entre a bayesiana (sempre) e a janela recente (quando já há rodadas para ela). */
export const titleScore = (bayes: number | null, recent: number | null | undefined) => (bayes === null && recent == null ? null : Math.max(bayes ?? 0, recent ?? 0));

export function pillarStatus(score: number | null, seen: number) {
  if (score === null) return "sem evidência";
  if (seen < 10) return "diagnóstico";
  return score >= 0.75 ? "forte" : score >= 0.55 ? "em desenvolvimento" : "revisar";
}

// Que pilar uma partida alimenta. Históricas e Idiomas não entram (não têm país do atlas).
export function pillarOfSession(session: PillarSession): PillarKey | null {
  if (session.column && (PILLAR_KEYS as readonly string[]).includes(session.column)) return session.column as PillarKey;
  const family = session.family ?? "";
  if (family === "historicas" || family === "idiomas") return null;
  if (family === "mapa" || family === "silhueta" || family === "travel") return "mapa";
  if (family === "escrita") return "escrita";
  if (family === "capitais") return "capitais";
  if (family === "bandeiras") return "bandeiras";
  // sessões do perfil clássico: modo + assunto
  const mode = session.mode || session.variant || "";
  if (mode === "escr") return "escrita";
  if (mode === "bnhist" || mode === "nbhist" || mode === "idioma") return null;
  if (session.subject === "capital" || session.variant === "capital" || mode.includes("capital")) return "capitais";
  if (mode === "mapa" || mode === "silhueta" || mode === "travel") return "mapa";
  return "bandeiras";
}

export function sessionTotals(session: PillarSession) {
  const rounds = session.rounds ?? [];
  if (rounds.length) return { seen: rounds.length, correct: rounds.filter((round) => round.correct).length };
  const seen = Number(session.roundCount ?? 0);
  return { seen, correct: Math.min(seen, Number(session.correct ?? 0)) };
}

// Rodadas e acertos por pilar, somando todas as partidas (completas ou não: o progresso também grava rodada a rodada).
export function pillarTotals(sessions: readonly PillarSession[]) {
  const totals: Record<PillarKey, { seen: number; correct: number }> = {
    bandeiras: { seen: 0, correct: 0 }, mapa: { seen: 0, correct: 0 }, capitais: { seen: 0, correct: 0 }, escrita: { seen: 0, correct: 0 },
  };
  for (const session of sessions) {
    const key = pillarOfSession(session);
    if (!key) continue;
    const { seen, correct } = sessionTotals(session);
    totals[key].seen += seen;
    totals[key].correct += correct;
  }
  return totals;
}
