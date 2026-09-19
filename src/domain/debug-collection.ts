import { masteryForProgress, type ProgressRecord } from "./learning-rules";
import { addHistoricalCollection } from "./progress-surfaces";
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  upgradeStorage,
} from "./storage-schema";

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => upgradeStorage(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** Build the smallest valid learning evidence for each mastery level. */
export function debugColumnsForMastery(mastery: number): ProgressRecord["columns"] {
  const level = Math.max(0, Math.min(5, Math.floor(mastery)));
  return {
    bandeiras: level >= 2 ? 1 : 0,
    mapa: level >= 2 ? 1 : 0,
    capitais: level >= 3 ? (level >= 5 ? 2 : 1) : 0,
    ...(level >= 4 ? { escrita: level >= 5 ? 2 : 1 } : {}),
  };
}

export async function setDebugCollection(
  entityId: string,
  mastery: number,
  historical = false,
) {
  const level = Math.max(0, Math.min(5, Math.floor(mastery)));
  const columns = debugColumnsForMastery(level);
  const record: ProgressRecord = {
    id: `current:${entityId}`,
    entityId,
    seen: Math.max(level, Object.values(columns).reduce((sum, value) => sum + value, 0)),
    correct: Object.values(columns).reduce((sum, value) => sum + value, 0),
    columns,
    latest: Date.now(),
    mastery: 0,
    source: "debug",
  };
  record.mastery = masteryForProgress(record);
  const db = await openDb();
  const transaction = db.transaction("progress", "readwrite");
  transaction.objectStore("progress").put(record);
  await transactionDone(transaction);
  db.close();
  if (historical) {
    const rarity = level >= 5 ? "lendária" : level >= 4 ? "rara" : level >= 2 ? "incomum" : "comum";
    await addHistoricalCollection(entityId, { id: entityId, debug: true, discovered: level > 0, mastery: level, rarity });
  }
}