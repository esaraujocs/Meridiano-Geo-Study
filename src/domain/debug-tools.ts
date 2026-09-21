import { ACHIEVEMENT_DEFINITIONS } from "./achievements";
import { masteryForProgress, type ProgressRecord } from "./learning-rules";
import { POLICIES } from "./economy-rules";
import { ROUND_UNLOCKS } from "./pace";
import { queryEconomy, type EconomySnapshot, type LedgerEntry } from "./economy-store";
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  upgradeStorage,
} from "./storage-schema";
import { FRESH_START_ID, XP_ADJUST_ID, clampLevel, columnsForLevel, createdSinceFreshStart, isStashId, purchasesToUndo, stashId, xpAdjustFor } from "./debug-rules";

// Toda alteração do debug guarda antes o registro original (em `state`, chave "debug-stash:<loja>:<id>"),
// então "Restaurar dados reais" desfaz tudo e o perfil de verdade nunca se perde.
type Store = "progress" | "historicalCollection" | "achievements" | "ledger" | "unlocks" | "sessions";
const STORES: Store[] = ["progress", "historicalCollection", "achievements", "ledger", "unlocks", "sessions"];
// Tudo o que faz o perfil parecer "de quem já jogou": o "jogador novo" guarda e esvazia estas lojas.
const FRESH_STORES: Store[] = ["sessions", "ledger", "unlocks", "progress", "historicalCollection", "achievements"];
type Stash = { id: string; store: Store; key: string; original: unknown | null; at?: number };

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => upgradeStorage(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const request = <T>(source: IDBRequest<T>) => new Promise<T>((resolve, reject) => { source.onsuccess = () => resolve(source.result); source.onerror = () => reject(source.error); });
const finished = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });

async function withTx<T>(stores: Store[], run: (tx: IDBTransaction) => Promise<T>) {
  const db = await openDb();
  try {
    const tx = db.transaction([...stores, "state"], "readwrite");
    const done = finished(tx);
    const result = await run(tx);
    await done;
    return result;
  } finally {
    db.close();
  }
}

async function remember(tx: IDBTransaction, store: Store, key: string) {
  const state = tx.objectStore("state");
  const id = stashId(store, key);
  if (await request(state.get(id))) return; // já guardado: mantém o original mais antigo
  const original = await request(tx.objectStore(store).get(key));
  await request(state.put({ id, store, key, original: original ?? null, at: Date.now() } satisfies Stash));
}
async function putStashed<T extends { id: string }>(tx: IDBTransaction, store: Store, record: T) {
  await remember(tx, store, record.id);
  await request(tx.objectStore(store).put(record));
}
async function deleteStashed(tx: IDBTransaction, store: Store, key: string) {
  await remember(tx, store, key);
  await request(tx.objectStore(store).delete(key));
}

// ---- Álbum ----
const entityOf = (record: any) => String(record?.entityId ?? record?.value?.id ?? String(record?.id ?? "").replace(/^current:/, ""));

/** Põe todas as cartas no nível pedido (0 a 5). Nível 0 zera; nas históricas, 0 remove e 1+ marca como descoberta. */
export async function setAlbumLevel(entityIds: string[], level: number, historicalIds: string[] = []) {
  const target = Math.max(0, Math.min(5, Math.floor(level)));
  await withTx(["progress", "historicalCollection"], async (tx) => {
    const existing = await request(tx.objectStore("progress").getAll()) as ProgressRecord[];
    for (const entityId of entityIds) {
      const columns = columnsForLevel(target);
      const correct = Object.values(columns).reduce((sum, value) => sum + value, 0);
      const record: ProgressRecord = { id: `current:${entityId}`, entityId, seen: Math.max(target, correct), correct, columns, latest: Date.now(), mastery: 0, source: "debug" as ProgressRecord["source"] };
      record.mastery = masteryForProgress(record);
      // outros registros do mesmo país (ex.: perfil clássico migrado) saem de cena para não competir com o do debug
      for (const other of existing.filter((item) => entityOf(item) === entityId && item.id !== record.id)) await deleteStashed(tx, "progress", other.id);
      await putStashed(tx, "progress", record);
    }
    if (historicalIds.length) {
      const collection = await request(tx.objectStore("historicalCollection").getAll()) as any[];
      for (const historicalId of historicalIds) {
        const matching = collection.filter((item) => entityOf(item) === historicalId);
        if (target === 0) { for (const item of matching) await deleteStashed(tx, "historicalCollection", item.id); continue; }
        for (const item of matching.filter((entry) => entry.id !== `current:${historicalId}`)) await deleteStashed(tx, "historicalCollection", item.id);
        await putStashed(tx, "historicalCollection", { id: `current:${historicalId}`, entityId: historicalId, source: "debug", value: { id: historicalId, debug: true, discovered: true, mastery: target } } as { id: string });
      }
    }
  });
  return entityIds.length + historicalIds.length;
}

// ---- Conquistas ----
export const achievementIds = () => ACHIEVEMENT_DEFINITIONS.map((definition) => definition.id);
/** Grava as conquistas como desbloqueadas (uma, várias ou todas). */
export async function unlockAchievements(ids: string[]) {
  await withTx(["achievements"], async (tx) => {
    for (const id of ids) await putStashed(tx, "achievements", { id: `current:${id}`, achievementId: id, source: "debug", unlockedAt: Date.now() } as { id: string });
  });
  return ids.length;
}

// ---- Nível do jogador ----
/** Faz o nível calculado ser exatamente `level` (XP no início do nível), qualquer que seja o XP real. */
export async function setPlayerLevel(level: number) {
  const economy = await queryEconomy();
  const realXp = economy.xpReal ?? economy.xp;
  const target = clampLevel(level);
  await withTx([], async (tx) => { await request(tx.objectStore("state").put({ id: XP_ADJUST_ID, amount: xpAdjustFor(target, realXp), level: target })); });
  return target;
}
/** Volta ao nível que o jogo calcula de verdade. */
export async function clearPlayerLevel() {
  await withTx([], async (tx) => { await request(tx.objectStore("state").delete(XP_ADJUST_ID)); });
}

// ---- Moedas e modos ----
export async function grantCoins(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Informe um número inteiro positivo de moedas.");
  await withTx(["ledger"], async (tx) => {
    const entries = await request(tx.objectStore("ledger").getAll()) as LedgerEntry[];
    const next = entries.filter((entry) => entry.source === "debug-opt-in").length + 1;
    await putStashed(tx, "ledger", { id: `grant:debug-opt-in:${next}`, kind: "credit", amount, reason: "debug-grant", source: "debug-opt-in", createdAt: Date.now() } satisfies LedgerEntry);
  });
}
/** Se o saldo ficou negativo (compras pagas com moedas de debug que já foram desfeitas), desfaz as compras mais recentes até voltar a zero ou mais. */
async function undoPurchasesAboveBalance(tx: IDBTransaction) {
  const ledger = tx.objectStore("ledger");
  const undo = purchasesToUndo(await request(ledger.getAll()) as LedgerEntry[]);
  for (const purchase of undo) {
    await request(ledger.delete(purchase.id));
    await request(tx.objectStore("unlocks").delete(purchase.source));
  }
  return undo.length;
}
export async function repairNegativeBalance() {
  return withTx(["ledger", "unlocks"], (tx) => undoPurchasesAboveBalance(tx));
}
export async function unlockAllModes() {
  await withTx(["unlocks"], async (tx) => {
    for (const policy of POLICIES) await putStashed(tx, "unlocks", { id: policy.key, key: policy.key, source: "debug-opt-in", unlockedAt: Date.now() } as { id: string });
    for (const option of ROUND_UNLOCKS) await putStashed(tx, "unlocks", { id: option.key, key: option.key, source: "debug-opt-in", unlockedAt: Date.now() } as { id: string });
  });
}

// ---- Jogador novo ----
export type FreshStart = { at: number; counts: Partial<Record<Store, number>> };
/** Guarda o histórico inteiro (partidas, moedas, modos liberados, cartas, conquistas) e deixa o app como no primeiro acesso. */
export async function startAsNewPlayer() {
  return withTx(FRESH_STORES, async (tx) => {
    const state = tx.objectStore("state");
    if (await request(state.get(FRESH_START_ID))) throw new Error("O jogador novo já está ativo. Restaure os dados reais antes de zerar de novo.");
    const counts: FreshStart["counts"] = {};
    for (const store of FRESH_STORES) {
      const keys = await request(tx.objectStore(store).getAllKeys());
      for (const key of keys) await deleteStashed(tx, store, String(key));
      counts[store] = keys.length;
    }
    await request(state.delete(XP_ADJUST_ID)); // o nível passa a vir só das partidas de teste
    await request(state.put({ id: FRESH_START_ID, at: Date.now(), counts } satisfies FreshStart & { id: string }));
    return counts;
  });
}
export async function freshStartInfo(): Promise<FreshStart | null> {
  const db = await openDb();
  try {
    const row = await request(db.transaction("state", "readonly").objectStore("state").get(FRESH_START_ID)) as (FreshStart & { id: string }) | undefined;
    return row ? { at: row.at, counts: row.counts } : null;
  } finally { db.close(); }
}

// ---- Restauração ----
export async function countDebugChanges() {
  const db = await openDb();
  try {
    const rows = await request(db.transaction("state", "readonly").objectStore("state").getAll()) as Array<{ id?: unknown }>;
    return rows.filter((row) => isStashId(row.id) || row.id === XP_ADJUST_ID || row.id === FRESH_START_ID).length;
  } finally { db.close(); }
}
/** Desfaz tudo o que o debug mexeu: devolve os registros originais e apaga os que ele criou. */
export async function restoreRealData() {
  return withTx(STORES, async (tx) => {
    const state = tx.objectStore("state");
    const rows = await request(state.getAll()) as Array<Stash | { id: string }>;
    let restored = 0;
    let since = Infinity;
    // Depois do "jogador novo": o que existe agora e não estava entre os originais foi criado nos testes e sai.
    if (rows.some((row) => row.id === FRESH_START_ID)) {
      const stashed = rows.filter((row): row is Stash => isStashId(row.id));
      for (const store of FRESH_STORES) {
        const current = (await request(tx.objectStore(store).getAllKeys())).map(String);
        const keep = stashed.filter((item) => item.store === store).map((item) => item.key);
        for (const key of createdSinceFreshStart(current, keep)) { await request(tx.objectStore(store).delete(key)); restored++; }
      }
      await request(state.delete(FRESH_START_ID));
    }
    for (const row of rows) {
      if (row.id === XP_ADJUST_ID) { await request(state.delete(row.id)); restored++; continue; }
      if (!isStashId(row.id)) continue;
      const stash = row as Stash;
      since = Math.min(since, stash.at ?? Infinity);
      const target = tx.objectStore(stash.store);
      if (stash.original === null) await request(target.delete(stash.key));
      else await request(target.put(stash.original));
      await request(state.delete(stash.id));
      restored++;
    }
    // Conquistas que o app gravou enquanto o debug estava ativo (derivadas de álbum/nível falsos) também saem:
    // se ainda valerem com os dados reais, o avaliador as grava de novo na próxima leitura.
    if (Number.isFinite(since)) {
      const saved = await request(tx.objectStore("achievements").getAll()) as Array<{ id: string; source?: string; unlockedAt?: number }>;
      for (const record of saved.filter((item) => item.source === "current-v2" && Number(item.unlockedAt ?? 0) >= since)) {
        await request(tx.objectStore("achievements").delete(record.id));
        restored++;
      }
    }
    // Compras pagas com moedas de debug: sem as moedas o saldo ficaria negativo, então as compras voltam também.
    restored += await undoPurchasesAboveBalance(tx);
    return restored;
  });
}

export { queryEconomy };
export type { EconomySnapshot };
