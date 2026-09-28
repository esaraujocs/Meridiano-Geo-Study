// Estoque de suprimentos de expedição (IndexedDB, loja `preferences`, id `supply:<id>`, campo `count`): compra debita o livro-caixa e soma ao
// estoque; usar (numa rodada) decrementa 1. Sem tabela própria (como as favoritas e o histórico de duelo/PvP).
import { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } from "./storage-schema.js";
import type { LedgerEntry } from "./economy-store.js";
import { SUPPLY_COST, SUPPLY_IDS, emptySupplyCounts, type SupplyCounts, type SupplyId } from "./supplies.js";

const STORE = "preferences";
const SUPPLY_ID_PREFIX = "supply:";
const supplyRowId = (id: SupplyId): string => `${SUPPLY_ID_PREFIX}${id}`;

function openDatabase() {
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

export async function supplyCounts(): Promise<SupplyCounts> {
  const database = await openDatabase();
  try {
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const counts = emptySupplyCounts();
    for (const row of rows) {
      const id = String((row as { id?: unknown })?.id ?? "");
      if (!id.startsWith(SUPPLY_ID_PREFIX)) continue;
      const key = id.slice(SUPPLY_ID_PREFIX.length) as SupplyId;
      if (SUPPLY_IDS.includes(key)) counts[key] = Number((row as { count?: unknown })?.count) || 0;
    }
    return counts;
  } finally { database.close(); }
}

/** Compra `qty` unidades de um suprimento (preço fixo por unidade): debita o saldo e soma ao estoque, numa transação só. */
export async function buySupply(id: SupplyId, qty: number): Promise<void> {
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantidade inválida.");
  const cost = SUPPLY_COST[id] * qty;
  const rowId = supplyRowId(id);
  const database = await openDatabase();
  const transaction = database.transaction(["ledger", STORE], "readwrite");
  const ledger = transaction.objectStore("ledger");
  const preferences = transaction.objectStore(STORE);
  const entries = ledger.getAll();
  entries.onsuccess = () => {
    const balance = (entries.result as LedgerEntry[]).reduce((sum, entry) => sum + (entry.kind === "credit" ? entry.amount : -entry.amount), 0);
    if (balance < cost) { transaction.abort(); return; }
    const existing = preferences.get(rowId);
    existing.onsuccess = () => {
      const current = Number((existing.result as { count?: unknown })?.count) || 0;
      ledger.put({ id: `debit:supply:${id}:${Date.now()}`, kind: "debit", amount: cost, reason: "supply", source: id, createdAt: Date.now() } satisfies LedgerEntry);
      preferences.put({ id: rowId, source: "supply-v1", count: current + qty });
    };
  };
  try { await transactionDone(transaction); } catch { throw new Error("Saldo insuficiente."); } finally { database.close(); }
}

/** Usa um suprimento numa rodada em andamento: decrementa 1 (nunca abaixo de 0) e devolve o estoque novo. */
export async function useSupply(id: SupplyId): Promise<number> {
  const rowId = supplyRowId(id);
  const database = await openDatabase();
  const transaction = database.transaction(STORE, "readwrite");
  const preferences = transaction.objectStore(STORE);
  let next = 0;
  const existing = preferences.get(rowId);
  existing.onsuccess = () => {
    const current = Number((existing.result as { count?: unknown })?.count) || 0;
    next = Math.max(0, current - 1);
    preferences.put({ id: rowId, source: "supply-v1", count: next });
  };
  await transactionDone(transaction);
  database.close();
  return next;
}
