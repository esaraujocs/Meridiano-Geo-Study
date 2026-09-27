import type { Legacy, Meta } from "./types";
import { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } from "./storage-schema.js";
import { achievementContext, evaluateAchievementDefinitions } from "./achievements.js";
import { collectionSummary } from "./collection-summary.js";
import { playerStatsFromSessions } from "./player-stats.js";
import type { HistoricalEntity } from "./special-data.js";
import { regionMatches } from "./regions.js";
import { matchesSearch, type ProgressColumns } from "./collection-view.js";
import type { Region } from "./types.js";
import { PILLAR_KEYS, bayesianScore, pillarStatus, pillarTotals } from "./pillars.js";
import { dominatedIdsFromSessions } from "./dominated.js";
import { t } from "./i18n/index.js";
import { DUEL_ID_PREFIX, parseDuel, type DuelRecord } from "./duel.js";
import { PVP_ID_PREFIX, parsePvpMatch, type PvpMatchRecord } from "./pvp-store.js";

export type SurfaceSession = {
  id: string;
  mode: string;
  family: string;
  variant: string;
  region: string;
  regions?: string[];
  startedAt: number | null;
  endedAt: number | null;
  complete: boolean;
  rounds: Array<{ targetId: string; correct: boolean; responseTimeMs: number | null; distanceKm?: number | null; byWater?: boolean }>;
  /** Rodadas jogadas: as listadas em `rounds` ou, em partida antiga já resumida, o total do resumo. */
  roundCount: number;
  /** Tamanho pedido ao começar (10/20/50/100) ou `null` quando o jogador escolheu "Todas" — o baralho
   * inteiro do recorte. `undefined` em partida antiga migrada, que não carrega esse dado. */
  roundLimit?: number | null;
  /** Pilar gravado pelo perfil clássico migrado, quando existe. */
  column?: string;
  /** "pais" ou "capital" (assunto da partida). */
  subject?: string;
  /** Duelo a que a partida pertence e o número do tempo (0 ou 1); só nas partidas jogadas dentro de um duelo. */
  duelId?: string;
  duelLeg?: number;
  correct: number;
  accuracy: number | null;
  averageTime: number | null;
};
export type ProgressSnapshot = {
  total: number;
  discovered: number;
  distribution: number[];
  pillars: Record<string, { seen: number; correct: number; accuracy: number | null; bayesianScore: number | null; status: string; aggregate?: boolean }>;
  records?: any[];
};
export type CollectionCard = { id: string; name: string; mastery: number; region?: string; sub?: string; un?: boolean; flag?: string; fields: Array<[string, string]>; columns?: ProgressColumns };
export type CollectionFilters = { region?: Region | "todas"; mastery?: number | "todas"; state?: "todas" | "descobertas" | "faltando"; unOnly?: boolean; query?: string };
export type HistoricalAlbumCard = { id: string; name: string; region?: string; sub?: string; type?: string; flag?: string; discovered: boolean; value?: HistoricalEntity };
export type Achievement = { id: string; name: string; description: string; unlocked: boolean; unlockedAt?: number; category?: string; rarity?: number; hidden?: boolean; target?: number; current?: number; deprecated?: boolean };

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => upgradeStorage(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function all<T>(store: IDBObjectStore) {
  return new Promise<T[]>((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result ?? []) as T[]);
    request.onerror = () => reject(request.error);
  });
}
function familyFor(mode: string) {
  if (mode === "mapa" || mode === "silhueta" || mode === "travel") return "mapa";
  if (mode === "escr") return "escrita";
  if (mode === "bnhist" || mode === "nbhist") return "historicas";
  if (mode === "idioma") return "idiomas";
  if (mode === "capital-pais" || mode === "pais-capital") return "capitais";
  return "bandeiras";
}
type NormalizedRound = { targetId: string; correct: boolean; responseTimeMs: number | null; distanceKm?: number | null; byWater?: boolean };
// A rodada vem como objeto (partida atual) ou como tupla [alvo, acertou, ms, km] (perfil clássico, inclusive
// quando migrado para o campo `rounds`).
function roundFrom(round: any): NormalizedRound {
  if (Array.isArray(round)) return {
    targetId: String(round[0] ?? ""),
    correct: Boolean(round[1]),
    responseTimeMs: typeof round[2] === "number" ? round[2] : null,
    distanceKm: typeof round[3] === "number" ? round[3] : null,
    byWater: typeof round[3] === "number" && round[3] > 0,
  };
  return {
    targetId: String(round?.targetId ?? ""),
    correct: Boolean(round?.correct),
    responseTimeMs: typeof round?.responseTimeMs === "number" ? round.responseTimeMs : null,
    distanceKm: typeof round?.distanceKm === "number" ? round.distanceKm : null,
    byWater: Boolean(round?.byWater),
  };
}
function roundsOf(value: any): NormalizedRound[] {
  if (Array.isArray(value?.rounds)) return value.rounds.map(roundFrom);
  if (Array.isArray(value?.r)) return value.r.filter(Array.isArray).map(roundFrom);
  return [];
}
export function normalizeSession(value: any, index = 0): SurfaceSession {
  const rounds = roundsOf(value);
  const aggregate = value?.aggregate ?? value?.ag ?? {};
  const correct = rounds.length ? rounds.filter((round: NormalizedRound) => round.correct).length : Number(aggregate.ac ?? 0);
  const total = rounds.length || Number(aggregate.rod ?? 0);
  const times = rounds.map((round: NormalizedRound) => round.responseTimeMs).filter((time: number | null): time is number => typeof time === "number");
  return {
    id: String(value?.id ?? `session-${index}`),
    mode: String(value?.mode ?? value?.modo ?? ""),
    family: String(value?.family ?? familyFor(String(value?.mode ?? value?.modo ?? ""))),
    variant: String(value?.variant ?? value?.assunto ?? value?.modo ?? ""),
    region: String(value?.region ?? value?.recorte ?? ""),
    regions: Array.isArray(value?.regions) ? value.regions.map(String) : undefined,
    startedAt: typeof value?.startedAt === "number" ? value.startedAt : typeof value?.ini === "number" ? value.ini : null,
    endedAt: typeof value?.endedAt === "number" ? value.endedAt : typeof value?.fim === "number" ? value.fim : null,
    complete: Boolean(value?.complete ?? value?.completa),
    rounds,
    roundCount: total,
    roundLimit: value?.roundLimit === null ? null : typeof value?.roundLimit === "number" ? value.roundLimit : undefined,
    column: typeof value?.column === "string" ? value.column : undefined,
    subject: typeof value?.subject === "string" ? value.subject : typeof value?.assunto === "string" ? value.assunto : undefined,
    duelId: typeof value?.duelId === "string" ? value.duelId : undefined,
    duelLeg: typeof value?.duelLeg === "number" ? value.duelLeg : undefined,
    correct,
    accuracy: total ? correct / total : null,
    averageTime: times.length ? times.reduce((sum: number, time: number) => sum + time, 0) / times.length : null,
  };
}
export function canonicalCurrentIds(meta: Record<string, Meta> = {}) {
  return Object.entries(meta).filter(([, item]) => !item?.absorvido && Boolean(item?.mapa || item?.soBandeira || item?.cap || item?.pt)).map(([id]) => id);
}
// Sem `sessions`, os pilares vêm só das cartas (o total de rodadas de cada carta é dividido igual entre os pilares).
// Com `sessions`, cada pilar usa as rodadas das partidas dele, que é a conta certa para precisão e títulos.
export function deriveProgress(records: any[], universe?: string[], sessions?: SurfaceSession[]): ProgressSnapshot {
  const distribution = [0, 0, 0, 0, 0, 0];
  const pillars: ProgressSnapshot["pillars"] = {};
  const ids = new Set(universe ?? records.map((record) => String(record.entityId ?? record.id)));
  distribution[0] = ids.size;
  for (const record of records) {
    const id = String(record.entityId ?? record.id ?? "");
    if (universe && !ids.has(id)) continue;
    const mastery = Math.max(0, Math.min(5, Number(record.mastery ?? 0)));
    if (mastery > 0) {
      distribution[0] = Math.max(0, distribution[0] - 1);
      distribution[mastery] += 1;
    }
    for (const [pillar, count] of Object.entries(record.columns ?? {})) {
      const aggregate = pillar === "escrita" && !("subject" in record) && record.source === "legacy-v1";
      const item = pillars[pillar] ?? (pillars[pillar] = { seen: 0, correct: 0, accuracy: null, bayesianScore: null, status: "sem evidência" });
      item.correct += Number(count);
      item.seen += Number(record.seen ?? 0);
      item.aggregate = item.aggregate || aggregate;
      item.accuracy = item.seen ? item.correct / item.seen : null;
      item.bayesianScore = item.seen ? (item.correct + 12 * 0.45) / (item.seen + 12) : null;
      item.status = pillarStatus(item.bayesianScore, item.seen);
    }
  }
  if (sessions) {
    const totals = pillarTotals(sessions);
    for (const key of PILLAR_KEYS) {
      const item = pillars[key] ?? (pillars[key] = { seen: 0, correct: 0, accuracy: null, bayesianScore: null, status: "sem evidência" });
      // acertos gravados nas cartas incluem o perfil clássico migrado sem as partidas originais
      const correct = Math.max(totals[key].correct, item.correct);
      const seen = Math.max(totals[key].seen, correct);
      item.correct = correct;
      item.seen = seen;
      item.accuracy = seen ? correct / seen : null;
      item.bayesianScore = seen ? bayesianScore(correct, seen) : null;
      item.status = pillarStatus(item.bayesianScore, seen);
    }
  }
  const collection = collectionSummary(records, ids);
  return { total: collection.total, discovered: collection.discovered, distribution, pillars, records };
}
export function collectionCard(id: string, meta: Meta | undefined, mastery = 0, flag?: string, columns?: ProgressColumns): CollectionCard {
  const fields: Array<[string, string]> = [];
  const labels = t.collection.cardFields;
  if (mastery >= 1) fields.push([labels.region, meta?.reg ?? "—"]);
  if (mastery >= 2) fields.push([labels.capital, meta?.cap ?? "—"]);
  if (mastery >= 3) fields.push([labels.language, "—"]);
  if (mastery >= 4) fields.push([labels.un, meta?.un ? labels.member : labels.nonMember]);
  if (mastery >= 5) fields.push([labels.status, labels.complete]);
  return { id, name: meta?.pt ?? id, region: meta?.reg, sub: meta?.sub, un: meta?.un, flag, mastery, fields, columns };
}
const regionForCard = (card: CollectionCard, region: Region | "todas") =>
  region === "todas" || regionMatches({ reg: card.region, sub: card.sub }, region);
export function filterCollectionCards(cards: CollectionCard[], filters: CollectionFilters = {}) {
  return cards.filter((card) =>
    regionForCard(card, filters.region ?? "todas") &&
    (filters.mastery === undefined || filters.mastery === "todas" || card.mastery === filters.mastery) &&
    (filters.state === undefined || filters.state === "todas" ||
      (filters.state === "descobertas" ? card.mastery > 0 : card.mastery === 0)) &&
    (!filters.unOnly || card.un === true) &&
    matchesSearch(card.name, filters.query ?? ""));
}
export function historicalAlbum(entries: HistoricalEntity[], records: any[] = []): HistoricalAlbumCard[] {
  const found = new Set(records.map((record) => String(record.entityId ?? record.value?.id ?? record.value?.entityId ?? record.id ?? "").replace(/^current:/, "")));
  return entries.map((entry) => ({
    id: entry.id, name: entry.pt, region: entry.reg, sub: entry.sub, type: entry.tipo,
    flag: entry.fl, discovered: found.has(entry.id), value: entry,
  }));
}
export function filterHistoricalAlbum(
  cards: HistoricalAlbumCard[], region: Region | "todas" = "todas", type = "todos",
  extra: { query?: string; state?: "todas" | "descobertas" | "faltando" } = {},
) {
  return cards.filter((card) =>
    (region === "todas" || regionMatches({ reg: card.region, sub: card.sub }, region)) &&
    (type === "todos" || card.type === type) &&
    (extra.state === undefined || extra.state === "todas" || (extra.state === "descobertas" ? card.discovered : !card.discovered)) &&
    matchesSearch(card.name, extra.query ?? ""));
}
export function evaluateAchievements(progress: ProgressSnapshot, sessions: SurfaceSession[], existing: any[] = [], catalog: Record<string, any> = {}): Achievement[] {
  const evaluated: Achievement[] = evaluateAchievementDefinitions(achievementContext(progress, sessions, catalog), existing).map((item) => ({
    id: item.id, name: item.name, description: item.description, unlocked: item.unlocked,
    unlockedAt: item.unlockedAt, category: item.category, rarity: item.rarity, hidden: item.hidden,
    target: item.target, current: item.current,
  }));
  // Kept only as an app-local compatibility view for old fixtures and clients.
  // It is never part of the canonical catalog or persisted by querySurfaces.
  const first = evaluated.find(item => item.id === "primeira");
  if (first) evaluated.push({ ...first, id: "first-session", name: t.achievementsView.legacyFirst[0], description: t.achievementsView.legacyFirst[1], unlocked: sessions.length > 0, deprecated: true });
  evaluated.push({ id: "coverage-10", name: t.achievementsView.legacyCoverage[0], description: t.achievementsView.legacyCoverage[1], unlocked: progress.discovered >= 10, deprecated: true, target: 10, current: progress.discovered });
  return evaluated;
}
export async function querySurfaces(data?: Legacy) {
  const db = await openDb();
  const [rawSessions, progress, achievements, historical, preferences] = await Promise.all([
    all<any>(db.transaction("sessions", "readonly").objectStore("sessions")),
    all<any>(db.transaction("progress", "readonly").objectStore("progress")),
    all<any>(db.transaction("achievements", "readonly").objectStore("achievements")),
    all<any>(db.transaction("historicalCollection", "readonly").objectStore("historicalCollection")),
    all<any>(db.transaction("preferences", "readonly").objectStore("preferences")),
  ]);
  db.close();
  const duels = preferences.filter((row) => String(row?.id ?? "").startsWith(DUEL_ID_PREFIX)).map(parseDuel).filter((item): item is DuelRecord => item !== null);
  const pvpMatches = preferences.filter((row) => String(row?.id ?? "").startsWith(PVP_ID_PREFIX)).map(parsePvpMatch).filter((item): item is PvpMatchRecord => item !== null);
  const sessions = rawSessions.map(normalizeSession).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  const universe = canonicalCurrentIds(data?.meta);
  const snapshot = deriveProgress(progress, universe, sessions);
   const evaluated = evaluateAchievements(snapshot, sessions, achievements, data?.meta);
   const missing = evaluated.filter((item) => !item.deprecated && item.unlocked && !achievements.some((saved) => saved.achievementId === item.id || saved.id === item.id));
  if (missing.length) {
    const writeDb = await openDb();
    const transaction = writeDb.transaction("achievements", "readwrite");
    const store = transaction.objectStore("achievements");
    for (const item of missing) store.put({ id: `current:${item.id}`, achievementId: item.id, source: "current-v2", unlockedAt: Date.now() });
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    writeDb.close();
  }
  const cards = data ? universe.map((id) => {
    const record = progress.find((item) => String(item.entityId ?? item.id) === id);
    return collectionCard(id, data.meta[id], Number(record?.mastery ?? 0), data.meta[id]?.fl, record?.columns);
  }) : [];
   return { sessions, duels, pvpMatches, playerStats: playerStatsFromSessions(rawSessions), progress: snapshot, cards, achievements: evaluated.filter((item) => !item.deprecated), historical, dominatedIds: [...dominatedIdsFromSessions(rawSessions, progress)] };
}

export async function queryCollectionSummary(data: Legacy) {
  const db = await openDb();
  const progress = await all<any>(db.transaction("progress", "readonly").objectStore("progress"));
  db.close();
  return collectionSummary(progress, canonicalCurrentIds(data.meta));
}

export async function addHistoricalCollection(id: string, value: unknown) {
  const db = await openDb();
  const transaction = db.transaction("historicalCollection", "readwrite");
  transaction.objectStore("historicalCollection").put({ id: `current:${id}`, entityId: id, source: "current-v2", value });
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  db.close();
}