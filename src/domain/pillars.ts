// Pilares de maestria (Bandeiras, Mapa, Capitais + Escrita como validador) calculados a partir das partidas.
// Lógica pura, sem React nem IndexedDB.

import { NO_CAPITAL_IDS } from "./dominated.js";

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

// A precisão do pilar é a HISTÓRICA (acima, bayesiana): volta a ser só uma métrica (04/10/2026). Os TÍTULOS não dependem mais dela, e sim do domínio.
/** "Em forma" (conquista) pede precisão histórica de pelo menos 90% em algum pilar. */
export const FIT_SCORE = 0.9;
/** Títulos de pilar: % dos países do pilar CONQUISTADOS (5 certas seguidas já feitas no pilar, para sempre; ver dominated.ts) que abre o título. Escada de
 *  dificuldade pedida pelo Enzo: Bandeiras a mais alta, Mapa no meio, Capitais um pouco abaixo (mas ainda alta). Vexilólogo e Diplomata seguem pedindo a escrita validada. */
export const TITLE_DOMAIN_PCT: Readonly<Record<"bandeiras" | "mapa" | "capitais", number>> = { bandeiras: 90, mapa: 85, capitais: 80 };
export type PillarDomain = { done: number; total: number; pct: number };
/** Quantos dos países do universo cada pilar já conquistou (Capitais não conta Antártida e Macau, que não têm capital). */
export function pillarDomain(conquered: Record<"bandeiras" | "mapa" | "capitais", ReadonlySet<string>>, universe: readonly string[]): Record<"bandeiras" | "mapa" | "capitais", PillarDomain> {
  const out = {} as Record<"bandeiras" | "mapa" | "capitais", PillarDomain>;
  for (const key of ["bandeiras", "mapa", "capitais"] as const) {
    const ids = key === "capitais" ? universe.filter((id) => !NO_CAPITAL_IDS.has(id)) : universe;
    const done = ids.filter((id) => conquered[key].has(id)).length;
    out[key] = { done, total: ids.length, pct: ids.length ? (done / ids.length) * 100 : 0 };
  }
  return out;
}

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
