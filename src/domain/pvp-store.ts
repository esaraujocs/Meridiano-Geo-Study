// Duelos entre pessoas já terminados (IndexedDB, loja `preferences`, id `pvp:<código>`): histórico local, como os duelos contra bot (duel-store.ts).
// A força (rating) do valendo é sempre derivada desta lista, nunca guardada à parte (mesmo princípio dos troféus do duelo contra bot).
import { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } from "./storage-schema.js";
import { LEGS, LEG_ROUNDS, drawLegs, type Ladder, type ModeGroup } from "./duel-modes.js";
import { pvpRatingFromHistory, type RankedPvpMatch } from "./pvp-rating.js";
import type { PvpMode, PvpOutcome, PvpServerMatch } from "./pvp.js";

const STORE = "preferences";
export const PVP_ID_PREFIX = "pvp:";
export const PVP_SOURCE = "pvp-v1";

/** Um tempo do duelo: o grupo sorteado e o placar dos dois lados (o seu vem da sua sessão salva; o do amigo só tem o que o servidor relatou). */
export type PvpLegRecord = { group: ModeGroup; youCorrect: number; opponentCorrect: number; total: number; youMs: number | null; opponentMs: number | null };

export type PvpMatchRecord = {
  id: string;
  code: string;
  at: number;
  ladder: Ladder;
  mode: PvpMode;
  opponentName: string;
  /** Força do adversário no momento do duelo (0 se ele não tinha nenhuma ainda). */
  opponentRating: number;
  youCorrect: number;
  opponentCorrect: number;
  totalRounds: number;
  outcome: PvpOutcome;
  tiebreak: boolean;
  youForfeited: boolean;
  opponentForfeited: boolean;
  youMs: number | null;
  opponentMs: number | null;
  /** Os dois tempos, quando dá para saber a semente (sempre, exceto num registro salvo antes desta versão). */
  legs?: readonly PvpLegRecord[];
  /** Mudança da força (só no valendo; null no amistoso). Calculada uma vez, na hora, e guardada — nunca recalculada depois. */
  ratingDelta: number | null;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => upgradeStorage(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function parsePvpMatch(row: unknown): PvpMatchRecord | null {
  const item = row as Partial<PvpMatchRecord> & { id?: unknown };
  if (typeof item?.id !== "string" || !item.id.startsWith(PVP_ID_PREFIX)) return null;
  if (typeof item.code !== "string" || typeof item.at !== "number" || typeof item.outcome !== "string") return null;
  return item as PvpMatchRecord;
}

export async function listPvpMatches(): Promise<PvpMatchRecord[]> {
  const database = await openDatabase();
  try {
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return rows.map(parsePvpMatch).filter((item): item is PvpMatchRecord => item !== null).sort((a, b) => a.at - b.at);
  } finally { database.close(); }
}

export async function savePvpMatch(record: PvpMatchRecord) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put({ ...record, source: PVP_SOURCE });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

/** Um duelo guardado no servidor, no formato do histórico local (os dois tempos saem de novo da semente, a mesma conta dos dois jogadores). */
export function pvpRecordFromServer(match: PvpServerMatch): PvpMatchRecord {
  const groups = match.seed ? drawLegs(match.ladder, match.seed) : null;
  const legs = groups?.map((leg, index) => ({
    group: leg.group, youCorrect: match.you.totals.legs[index]?.correct ?? 0, opponentCorrect: match.opponent.totals.legs[index]?.correct ?? 0,
    total: leg.rounds, youMs: match.you.totals.legs[index]?.ms ?? null, opponentMs: match.opponent.totals.legs[index]?.ms ?? null,
  }));
  return {
    id: `${PVP_ID_PREFIX}${match.code}`, code: match.code, at: match.at, ladder: match.ladder, mode: match.mode,
    opponentName: match.opponent.name, opponentRating: match.opponent.rating?.before ?? 0,
    youCorrect: match.you.totals.correct, opponentCorrect: match.opponent.totals.correct, totalRounds: LEG_ROUNDS * LEGS,
    outcome: match.you.outcome, tiebreak: match.tiebreak, youForfeited: match.you.totals.forfeited, opponentForfeited: match.opponent.totals.forfeited,
    youMs: match.you.totals.ms, opponentMs: match.opponent.totals.ms,
    ...(legs ? { legs } : {}),
    ratingDelta: match.you.rating ? match.you.rating.after - match.you.rating.before : null,
  };
}

/** Os duelos que o servidor tem e este aparelho não (união por id: o que já está no aparelho não é tocado). Ex.: o app fechou antes do resultado sair. */
export function missingPvpRecords(server: readonly PvpServerMatch[], local: readonly PvpMatchRecord[]): PvpMatchRecord[] {
  const known = new Set(local.map((record) => record.id));
  return server.map(pvpRecordFromServer).filter((record) => !known.has(record.id));
}

/** A força atual do valendo calculada só com o histórico do aparelho (reserva para quando o servidor não responde; a de verdade é a do servidor, GET /me). */
export function pvpRatingOf(matches: readonly PvpMatchRecord[]): number {
  const ranked: RankedPvpMatch[] = matches.filter((match) => match.mode === "ranked").map((match) => ({ opponentRating: match.opponentRating, outcome: match.outcome }));
  return pvpRatingFromHistory(ranked);
}
