import { MUSEUM_PIECES, museumPieceById } from "./museum.js";
import { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } from "./storage-schema.js";

type LedgerEntry = {
  id: string;
  kind: "credit" | "debit";
  amount: number;
  reason: string;
  source: string;
  createdAt: number;
};
type UnlockRecord = { id: string; key?: string; source?: string; unlockedAt?: number };
type MuseumPiece = (typeof MUSEUM_PIECES)[number];

export type MuseumSnapshot = {
  balance: number;
  owned: string[];
  nextId: string | null;
  spent: number;
};

const unlockKey = (id: string) => `museum:${id}`;
const purchaseId = (id: string) => `purchase:museum:${id}`;

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
    transaction.onerror = () => reject(transaction.error ?? new Error("Museum transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Museum transaction was aborted."));
  });
}

function all<T>(store: IDBObjectStore) {
  return new Promise<T[]>((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

function museumOwned(unlocks: UnlockRecord[]) {
  const unlockIds = new Set(unlocks.flatMap((unlock) => [unlock.id, unlock.key].filter((value): value is string => typeof value === "string")));
  return new Set<string>(MUSEUM_PIECES.filter((piece) => unlockIds.has(unlockKey(piece.id))).map((piece) => piece.id));
}

export async function queryMuseum(): Promise<MuseumSnapshot> {
  const db = await openDb();
  try {
    const transaction = db.transaction(["ledger", "unlocks"], "readonly");
    const [ledger, unlocks] = await Promise.all([
      all<LedgerEntry>(transaction.objectStore("ledger")),
      all<UnlockRecord>(transaction.objectStore("unlocks")),
    ]);
    const balance = ledger.reduce((sum, entry) => sum + (entry.kind === "credit" ? entry.amount : -entry.amount), 0);
    const ownedSet = museumOwned(unlocks);
    const owned = MUSEUM_PIECES.filter((piece) => ownedSet.has(piece.id)).map((piece) => piece.id);
    const nextId = MUSEUM_PIECES.find((piece) => !ownedSet.has(piece.id))?.id ?? null;
    const spent = ledger
      .filter((entry) => entry.kind === "debit" && entry.source === "museum")
      .reduce((sum, entry) => sum + entry.amount, 0);
    return { balance, owned, nextId, spent };
  } finally {
    db.close();
  }
}

/** Compra a próxima peça do museu pelo preço integral, gravando débito e desbloqueio atomicamente. */
export async function fundMuseumExpedition(id: string): Promise<boolean> {
  if (typeof id !== "string") return false;
  const piece: MuseumPiece | undefined = museumPieceById(id) ?? undefined;
  const pieceIndex = MUSEUM_PIECES.findIndex((candidate) => candidate.id === id);
  if (!piece || pieceIndex < 0 || !Number.isFinite(piece.cost) || piece.cost <= 0) return false;

  const db = await openDb();
  try {
    const transaction = db.transaction(["ledger", "unlocks"], "readwrite");
    const completion = done(transaction);
    const ledgerStore = transaction.objectStore("ledger");
    const unlockStore = transaction.objectStore("unlocks");
    const ledgerRequest = ledgerStore.getAll();
    const unlockRequest = unlockStore.getAll();
    let result = false;
    let handled = false;

    const tryPurchase = () => {
      if (handled || ledgerRequest.readyState !== "done" || unlockRequest.readyState !== "done") return;
      handled = true;
      try {
        const ledger = ledgerRequest.result as LedgerEntry[];
        const unlocks = unlockRequest.result as UnlockRecord[];
        const owned = museumOwned(unlocks);
        const next = MUSEUM_PIECES.find((candidate) => !owned.has(candidate.id));
        const key = unlockKey(id);

        if (owned.has(id) || next?.id !== id || ledger.some((entry) => entry.id === purchaseId(id))) return;
        const balance = ledger.reduce((sum, entry) => sum + (entry.kind === "credit" ? entry.amount : -entry.amount), 0);
        if (!Number.isFinite(balance) || balance < piece.cost) return;

        const now = Date.now();
        ledgerStore.put({
          id: purchaseId(id),
          kind: "debit",
          amount: piece.cost,
          reason: "museum-expedition",
          source: "museum",
          createdAt: now,
        } satisfies LedgerEntry);
        unlockStore.put({ id: key, key, source: "purchase", unlockedAt: now } satisfies UnlockRecord);
        result = true;
      } catch {
        transaction.abort();
      }
    };

    ledgerRequest.onsuccess = tryPurchase;
    unlockRequest.onsuccess = tryPurchase;
    await completion;
    return result;
  } finally {
    db.close();
  }
}