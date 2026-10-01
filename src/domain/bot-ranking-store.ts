// Persistência do ranking dos bots na mesma loja `preferences` dos duelos.
import { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } from "./storage-schema.js";
import {
  BOT_RANKING_ID,
  advanceBotRanking,
  createBotRanking,
  parseBotRanking,
  type BotRankingState,
} from "./bot-ranking.js";

const STORE = "preferences";
const UTC_DAY_MS = 86_400_000;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => upgradeStorage(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function botRankingDay(now: number): number {
  if (!Number.isFinite(now)) throw new TypeError("Bot ranking time must be finite");
  const day = Math.floor(now / UTC_DAY_MS);
  if (!Number.isSafeInteger(day)) throw new TypeError("Bot ranking day must be a safe integer");
  return day;
}

/** A missing row is a fresh seed; a present malformed row is always an error, never reset. */
export function advanceStoredBotRanking(value: unknown, now = Date.now()): BotRankingState {
  const day = botRankingDay(now);
  return value === undefined
    ? createBotRanking(day)
    : advanceBotRanking(parseBotRanking(value), day);
}

/** Read, lazily catch up to the current UTC day, and persist in one readwrite transaction. */
export async function loadBotRanking(now = Date.now()): Promise<BotRankingState> {
  const day = botRankingDay(now);
  const database = await openDatabase();
  try {
    return await new Promise<BotRankingState>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      const request = store.get(BOT_RANKING_ID);
      let state: BotRankingState | undefined;
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        try { transaction.abort(); } catch { /* já abortada */ }
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      request.onsuccess = () => {
        try {
          state = advanceStoredBotRanking(request.result, day * UTC_DAY_MS);
          store.put(state);
        } catch (error) { fail(error); }
      };
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        if (state) resolve(state);
        else reject(new Error("Bot ranking transaction completed without a state."));
      };
      transaction.onerror = () => {
        if (!settled) { settled = true; reject(transaction.error ?? new Error("Bot ranking transaction failed.")); }
      };
      transaction.onabort = () => {
        if (!settled) { settled = true; reject(transaction.error ?? new Error("Bot ranking transaction was aborted.")); }
      };
    });
  } finally { database.close(); }
}