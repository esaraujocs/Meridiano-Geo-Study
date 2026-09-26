// Duelos no IndexedDB (loja `preferences`, id `duel:<sessão>`): entram no Exportar/Importar progresso, como as Favoritas.
import { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } from "./storage-schema.js";
import { DUEL_ID_PREFIX, DUEL_SOURCE, parseDuel, type DuelRecord } from "./duel.js";
import { milestoneLedgerId, pendingMilestones, type Milestone } from "./duel-rewards.js";

const STORE = "preferences";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => upgradeStorage(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listDuels(): Promise<DuelRecord[]> {
  const database = await openDatabase();
  try {
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return rows
      .filter((row) => String((row as { id?: unknown })?.id ?? "").startsWith(DUEL_ID_PREFIX))
      .map(parseDuel)
      .filter((item): item is DuelRecord => item !== null)
      .sort((a, b) => a.at - b.at);
  } finally { database.close(); }
}

export async function saveDuel(record: DuelRecord) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put({ ...record, source: DUEL_SOURCE });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

/** Credita no livro-caixa os marcos já alcançados que ainda não foram pagos (um crédito por marco, id único: nunca repete). */
export async function claimDuelMilestones(trophies: number): Promise<Milestone[]> {
  const database = await openDatabase();
  try {
    return await new Promise<Milestone[]>((resolve, reject) => {
      const transaction = database.transaction("ledger", "readwrite");
      const store = transaction.objectStore("ledger");
      const keys = store.getAllKeys();
      let granted: Milestone[] = [];
      keys.onsuccess = () => {
        granted = pendingMilestones(trophies, new Set((keys.result as IDBValidKey[]).map(String)));
        for (const milestone of granted) {
          store.put({ id: milestoneLedgerId(milestone), kind: "credit", amount: milestone.coins, reason: "duel-milestone", source: milestone.id, createdAt: Date.now() });
        }
      };
      transaction.oncomplete = () => resolve(granted);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}
