import type { AnyQuizVariant, Family, Region } from "./types";
import { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } from "./storage-schema.js";
import { POLICIES, canUnlock, policyFor, unlockAliases, type Policy, type UnlockKey } from "./economy-rules";

export type LedgerEntry = { id: string; kind: "credit" | "debit"; amount: number; reason: string; source: string; createdAt: number };
export type EconomySnapshot = {
  balance: number; earned: number; spent: number; coverage: number; sessions: number;
  unlocked: UnlockKey[];
};

export function isQualifyingSession(value: unknown): value is {
  complete: true;
  rounds: unknown[];
} {
  const session = value as { complete?: unknown; rounds?: unknown };
  return session?.complete === true &&
    Array.isArray(session.rounds) &&
    session.rounds.length > 0;
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => upgradeStorage(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
}
function all<T>(store: IDBObjectStore) {
  return new Promise<T[]>((resolve, reject) => { const r = store.getAll(); r.onsuccess = () => resolve(r.result as T[]); r.onerror = () => reject(r.error); });
}

export async function initializeEconomy() {
  const db = await openDb();
  const tx = db.transaction(["state", "ledger", "unlocks", "progress", "sessions", "achievements", "historicalCollection"], "readwrite");
  const state = tx.objectStore("state");
  const metaReq = state.get("economy-retroactive-v1");
  metaReq.onsuccess = () => {
    if (metaReq.result) return;
    const ledger = tx.objectStore("ledger");
    const progress = tx.objectStore("progress");
    const achievements = tx.objectStore("achievements");
    const collection = tx.objectStore("historicalCollection");
    const count = (progress as IDBObjectStore).getAll();
    count.onsuccess = () => {
      const achievementsRequest = achievements.getAll();
      achievementsRequest.onsuccess = () => {
        const collectionRequest = collection.getAll();
        collectionRequest.onsuccess = () => {
          const amount = (count.result.length * 2) + (achievementsRequest.result.length * 3) + collectionRequest.result.length;
          if (amount > 0) ledger.put({ id: "grant:retroactive-v1", kind: "credit", amount, reason: "retroactive-migration", source: "legacy-progress", createdAt: Date.now() } satisfies LedgerEntry);
          state.put({ id: "economy-retroactive-v1", amount, createdAt: Date.now() });
        };
      };
    };
    const unlocks = tx.objectStore("unlocks");
    for (const policy of POLICIES.filter((item) => item.cost === 0)) {
      unlocks.put({ id: policy.key, key: policy.key, source: "intro", unlockedAt: Date.now() });
    }
    const progressRequest = progress.getAll();
    const achievementsRequest = achievements.getAll();
    const collectionRequest = collection.getAll();
    let ready = 0;
    const unlockLegacy = () => {
      ready += 1;
      if (ready < 3) return;
      if (
        progressRequest.result.length ||
        achievementsRequest.result.length ||
        collectionRequest.result.length
      ) {
        for (const policy of POLICIES) {
          unlocks.put({
            id: policy.key,
            key: policy.key,
            source: "retroactive-migration",
            unlockedAt: Date.now(),
          });
        }
      }
    };
    progressRequest.onsuccess = unlockLegacy;
    achievementsRequest.onsuccess = unlockLegacy;
    collectionRequest.onsuccess = unlockLegacy;
  };
  await done(tx);
  db.close();
  return queryEconomy();
}

export async function queryEconomy(): Promise<EconomySnapshot> {
  const db = await openDb();
  const tx = db.transaction(["ledger", "unlocks", "progress", "sessions"], "readonly");
  const [ledger, unlocks, progress, sessions] = await Promise.all([
    all<LedgerEntry>(tx.objectStore("ledger")), all<{ key: UnlockKey }>(tx.objectStore("unlocks")),
    all<{ mastery?: number }>(tx.objectStore("progress")), all<unknown>(tx.objectStore("sessions")),
  ]);
  db.close();
  const earned = ledger.filter((e) => e.kind === "credit").reduce((n, e) => n + e.amount, 0);
  const spent = ledger.filter((e) => e.kind === "debit").reduce((n, e) => n + e.amount, 0);
  const unlocked = [...new Set(unlocks.flatMap((u) => {
    const value = String(u.key);
    const match = value.match(/^(bandeiras|historicas):(bandeira-nome|nome-bandeira|historica-nome|nome-historica):(.*)$/);
    if (!match) return [u.key];
    const family = match[1] as Family;
    const variant = match[2] as AnyQuizVariant;
    return [policyFor(family, variant, match[3] as Region)?.key ?? u.key];
  }))] as UnlockKey[];
  return {
    balance: earned - spent,
    earned,
    spent,
    coverage: progress.filter((p) => (p.mastery ?? 0) > 0).length,
    sessions: sessions.filter(isQualifyingSession).length,
    unlocked,
  };
}

export async function unlockContent(family: Family, variant: AnyQuizVariant, region: Region) {
  const policy = policyFor(family, variant, region);
  if (!policy) throw new Error("Conteúdo não disponível.");
  const db = await openDb();
  const tx = db.transaction(["ledger", "unlocks", "sessions"], "readwrite");
  const unlocks = tx.objectStore("unlocks");
  const existing = unlocks.getAll();
  existing.onsuccess = () => {
    const aliases = unlockAliases(family, variant, region);
    if ((existing.result as { key: UnlockKey }[]).some((item) => aliases.includes(item.key))) return;
    const sessionsReq = tx.objectStore("sessions").getAll();
    sessionsReq.onsuccess = () => {
      const ledgerReq = tx.objectStore("ledger").getAll();
      ledgerReq.onsuccess = () => {
        const ledger = ledgerReq.result as LedgerEntry[];
        const balance = ledger.reduce((n, e) => n + (e.kind === "credit" ? e.amount : -e.amount), 0);
        const qualifying = (sessionsReq.result as unknown[]).filter(isQualifyingSession);
        if (!canUnlock(policy, balance, qualifying.length)) { tx.abort(); return; }
        if (policy.cost) tx.objectStore("ledger").put({ id: `debit:unlock:${policy.key}`, kind: "debit", amount: policy.cost, reason: "unlock", source: policy.key, createdAt: Date.now() } satisfies LedgerEntry);
        unlocks.put({ id: policy.key, key: policy.key, source: "purchase", unlockedAt: Date.now() });
      };
    };
  };
  await done(tx).catch(() => { throw new Error("Saldo ou requisito insuficiente."); });
  db.close();
  return queryEconomy();
}

export { POLICIES, policyFor };