import { queryEconomy, type LedgerEntry } from "./economy-store";
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  upgradeStorage,
} from "./storage-schema";
import { POLICIES } from "./economy-rules";

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => upgradeStorage(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function grantDebugCoins(amount = 10) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Quantidade de moedas inválida.");
  }

  const db = await openDb();
  const transaction = db.transaction(["ledger"], "readwrite");
  const ledger = transaction.objectStore("ledger");
  const request = ledger.getAll();
  request.onsuccess = () => {
    const entries = request.result as LedgerEntry[];
    const next =
      entries.filter((entry) => entry.source === "debug-opt-in").length + 1;
    ledger.put({
      id: `grant:debug-opt-in:${next}`,
      kind: "credit",
      amount,
      reason: "debug-grant",
      source: "debug-opt-in",
      createdAt: Date.now(),
    } satisfies LedgerEntry);
  };
  await done(transaction);
  db.close();
  return queryEconomy();
}

export async function unlockAllDebugContent() {
  const db = await openDb();
  const transaction = db.transaction(["unlocks"], "readwrite");
  const store = transaction.objectStore("unlocks");
  for (const policy of POLICIES) {
    store.put({
      id: policy.key,
      key: policy.key,
      source: "debug-opt-in",
      unlockedAt: Date.now(),
    });
  }
  await done(transaction);
  db.close();
  return queryEconomy();
}