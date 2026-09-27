// Duelos entre pessoas já terminados (IndexedDB, loja `preferences`, id `pvp:<código>`): histórico local, como os duelos contra bot (duel-store.ts).
// A força (rating) do valendo é sempre derivada desta lista, nunca guardada à parte (mesmo princípio dos troféus do duelo contra bot).
import { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } from "./storage-schema.js";
import type { Ladder, ModeGroup } from "./duel-modes.js";
import { pvpRatingFromHistory, type RankedPvpMatch } from "./pvp-rating.js";
import type { PvpMode, PvpOutcome } from "./pvp.js";

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

/** A força atual do valendo (só as partidas `ranked`, na ordem em que aconteceram); 1000 sem nenhuma ainda. */
export function pvpRatingOf(matches: readonly PvpMatchRecord[]): number {
  const ranked: RankedPvpMatch[] = matches.filter((match) => match.mode === "ranked").map((match) => ({ opponentRating: match.opponentRating, outcome: match.outcome }));
  return pvpRatingFromHistory(ranked);
}
