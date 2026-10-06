import type { AnyQuizVariant, Family, Region } from "./types";
import { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } from "./storage-schema.js";
import { POLICIES, canUnlock, policyFor, unlockAliases, type Policy, type UnlockKey } from "./economy-rules";
import { playerStatsFromSessions } from "./player-stats.js";
import { XP_ADJUST_ID } from "./debug-rules.js";
import { levelForXp, xpForLevel, xpFrom } from "./player-level.js";
import { everDominatedFromSessions, masteredFromSessions } from "./dominated.js";
import { ROUND_UNLOCKS, type RoundUnlockKey } from "./pace.js";
import { themeById, themeUnlockKey } from "./themes.js";
export { dominatedFromSessions, dominatedIdsFromSessions, everDominatedFromSessions, everDominatedIdsFromSessions, masteredFromSessions, masteredIdsFromSessions } from "./dominated.js";

export type LedgerEntry = { id: string; kind: "credit" | "debit"; amount: number; reason: string; source: string; createdAt: number };
export type EconomySnapshot = {
  balance: number; earned: number; spent: number; coverage: number; sessions: number;
  xp: number; level: number; xpBase: number; xpNext: number; rounds: number; completedSessions: number; dominated: number;
  /** XP calculado só pelo jogo e ajuste de XP das ferramentas de debug (0 fora do debug). */
  xpReal?: number; xpAdjust?: number;
  coverageByColumn: Record<"bandeiras" | "mapa" | "capitais" | "escrita", number>;
  unlocked: UnlockKey[];
};

export function isQualifyingSession(value: unknown): value is {
  complete: true;
  rounds: unknown[];
} {
  const session = value as { complete?: unknown; rounds?: unknown; deckSize?: unknown };
  const deckSize = typeof session.deckSize === "number" && session.deckSize > 0
    ? session.deckSize
    : 10;
  return session?.complete === true &&
    Array.isArray(session.rounds) &&
    session.rounds.length >= Math.min(10, deckSize);
}

export function roundsFromCompletedSessions(sessions: unknown[]) {
  return playerStatsFromSessions(sessions as any[]).rounds;
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
  };
  await done(tx);
  db.close();
  await convertEconomyV2();
  return queryEconomy();
}

// Economia v2 (moedas inflacionadas): o saldo que o jogador já tinha vira ×10, uma vez só. Modos já liberados continuam liberados.
export const ECONOMY_V2_CONVERSION_ID = "economy-v2-conversion";
export const ECONOMY_V2_FACTOR = 10;
export async function convertEconomyV2() {
  const db = await openDb();
  const tx = db.transaction(["state", "ledger"], "readwrite");
  const state = tx.objectStore("state");
  const ledger = tx.objectStore("ledger");
  const marker = state.get(ECONOMY_V2_CONVERSION_ID);
  marker.onsuccess = () => {
    if (marker.result) return;
    const all = ledger.getAll();
    all.onsuccess = () => {
      const entries = all.result as LedgerEntry[];
      const balance = entries.reduce((sum, entry) => sum + (entry.kind === "credit" ? entry.amount : -entry.amount), 0);
      const bonus = Math.max(0, balance) * (ECONOMY_V2_FACTOR - 1);
      if (bonus > 0) ledger.put({ id: "grant:economy-v2-conversion", kind: "credit", amount: bonus, reason: "economy-v2-conversion", source: "economy-v2", createdAt: Date.now() } satisfies LedgerEntry);
      state.put({ id: ECONOMY_V2_CONVERSION_ID, factor: ECONOMY_V2_FACTOR, balanceBefore: balance, createdAt: Date.now() });
    };
  };
  await done(tx);
  db.close();
}

export async function queryEconomy(): Promise<EconomySnapshot> {
  const db = await openDb();
  const tx = db.transaction(["ledger", "unlocks", "progress", "sessions", "state"], "readonly");
  const [ledger, unlocks, progress, sessions, adjustRow] = await Promise.all([
    all<LedgerEntry>(tx.objectStore("ledger")), all<{ key: UnlockKey }>(tx.objectStore("unlocks")),
    all<{ mastery?: number; columns?: Record<string, number> }>(tx.objectStore("progress")), all<unknown>(tx.objectStore("sessions")),
    new Promise<{ amount?: number } | undefined>((resolve, reject) => { const r = tx.objectStore("state").get(XP_ADJUST_ID); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }),
  ]);
  db.close();
  const earned = ledger.filter((e) => e.kind === "credit").reduce((n, e) => n + e.amount, 0);
  const spent = ledger.filter((e) => e.kind === "debit").reduce((n, e) => n + e.amount, 0);
  const unlocked = [...new Set(unlocks.flatMap((u) => {
    const value = String(u.key);
    const match = value.match(/^(mapa|bandeiras|capitais|escrita|historicas|idiomas|silhueta|travel|gentilicos|moedas|brasil):(mapa|bandeira-nome|nome-bandeira|capital-pais|pais-capital|escrita-pais|escrita-capital|historica-nome|nome-historica|idioma-nome|idioma-pais|silhueta|silhueta-opcoes|travel|gentilico-pais|pais-gentilico|moeda-pais|pais-moeda|br-[a-z-]+)(?::.*)?$/);
    if (!match) return [u.key];
    const family = match[1] as Family;
    const variant = match[2] as AnyQuizVariant;
    return [policyFor(family, variant, "mundo")?.key ?? u.key];
  }))] as UnlockKey[];
  const coverageByColumn = {
    bandeiras: progress.filter((row) => (row.columns?.bandeiras ?? 0) > 0).length,
    mapa: progress.filter((row) => (row.columns?.mapa ?? 0) > 0).length,
    capitais: progress.filter((row) => (row.columns?.capitais ?? 0) > 0).length,
    escrita: progress.filter((row) => (row.columns?.escrita ?? 0) > 0).length,
  };
  const playerStats = playerStatsFromSessions(sessions as any[]);
  const rounds = playerStats.rounds;
  // maestria = países dominados pela regra permanente (dominated.ts, 04/10); o XP segue na regra antiga (todo país que já teve as 3 certas em 2 modos), então ninguém perde nível
  const dominated = masteredFromSessions(sessions);
  const xpReal = xpFrom(rounds, everDominatedFromSessions(sessions, progress), playerStats.boostedRounds);
  const xpAdjust = Number(adjustRow?.amount ?? 0) || 0; // só existe se a ferramenta de debug definiu o nível
  const xp = Math.max(0, xpReal + xpAdjust);
  const level = levelForXp(xp);
  const xpBase = xpForLevel(level);
  const xpNext = xpForLevel(level + 1);
  return {
    balance: earned - spent,
    earned,
    spent,
    coverage: progress.filter((p) => (p.mastery ?? 0) > 0).length,
    coverageByColumn,
    sessions: sessions.filter(isQualifyingSession).length,
    xp, level, xpBase, xpNext, rounds, completedSessions: playerStats.completedSessions, dominated,
    xpReal, xpAdjust,
    unlocked,
  };
}

/** Compra as rodadas extras (20 e baralho completo): valem para todos os modos. */
export async function unlockRounds(key: RoundUnlockKey) {
  const option = ROUND_UNLOCKS.find((item) => item.key === key);
  if (!option) throw new Error("Opção de rodadas inválida.");
  const db = await openDb();
  const tx = db.transaction(["ledger", "unlocks"], "readwrite");
  const unlocks = tx.objectStore("unlocks");
  const ledger = tx.objectStore("ledger");
  const owned = unlocks.get(key);
  owned.onsuccess = () => {
    if (owned.result) return;
    const entries = ledger.getAll();
    entries.onsuccess = () => {
      const balance = (entries.result as LedgerEntry[]).reduce((sum, entry) => sum + (entry.kind === "credit" ? entry.amount : -entry.amount), 0);
      if (balance < option.cost) { tx.abort(); return; }
      ledger.put({ id: `debit:unlock:${key}`, kind: "debit", amount: option.cost, reason: "unlock", source: key, createdAt: Date.now() } satisfies LedgerEntry);
      unlocks.put({ id: key, key, source: "purchase", unlockedAt: Date.now() });
    };
  };
  await done(tx).catch(() => { throw new Error("Saldo insuficiente."); });
  db.close();
  return queryEconomy();
}

/** Compra um tema do Hub na Loja: debita as moedas e guarda o desbloqueio (uma vez só; o padrão nunca precisa de compra). */
export async function unlockTheme(id: string) {
  const theme = themeById(id);
  if (!theme || theme.cost <= 0) throw new Error("Tema inválido.");
  const key = themeUnlockKey(id);
  const db = await openDb();
  const tx = db.transaction(["ledger", "unlocks"], "readwrite");
  const unlocks = tx.objectStore("unlocks");
  const ledger = tx.objectStore("ledger");
  const owned = unlocks.get(key);
  owned.onsuccess = () => {
    if (owned.result) return;
    const entries = ledger.getAll();
    entries.onsuccess = () => {
      const balance = (entries.result as LedgerEntry[]).reduce((sum, entry) => sum + (entry.kind === "credit" ? entry.amount : -entry.amount), 0);
      if (balance < theme.cost) { tx.abort(); return; }
      ledger.put({ id: `debit:unlock:${key}`, kind: "debit", amount: theme.cost, reason: "unlock", source: key, createdAt: Date.now() } satisfies LedgerEntry);
      unlocks.put({ id: key, key, source: "purchase", unlockedAt: Date.now() });
    };
  };
  try { await done(tx); } catch { throw new Error("Saldo insuficiente."); } finally { db.close(); }
  return queryEconomy();
}

export async function unlockContent(family: Family, variant: AnyQuizVariant, region: Region) {
  const policy = policyFor(family, variant, region);
  if (!policy) throw new Error("Conteúdo não disponível.");
  const db = await openDb();
  const tx = db.transaction(["ledger", "unlocks", "sessions", "progress"], "readwrite");
  const unlocks = tx.objectStore("unlocks");
  const existing = unlocks.getAll();
  existing.onsuccess = () => {
    const aliases = unlockAliases(family, variant, region);
    if ((existing.result as { key: UnlockKey }[]).some((item) => {
      if ((aliases as UnlockKey[]).includes(item.key)) return true;
      const legacy = String(item.key).match(/^([^:]+):([^:]+):/);
      return legacy && policyFor(legacy[1] as Family, legacy[2] as AnyQuizVariant, region)?.key === policy.key;
    })) return;
    const sessionsReq = tx.objectStore("sessions").getAll();
    sessionsReq.onsuccess = () => {
        const progressReq = tx.objectStore("progress").getAll();
        progressReq.onsuccess = () => {
      const ledgerReq = tx.objectStore("ledger").getAll();
      ledgerReq.onsuccess = () => {
        const ledger = ledgerReq.result as LedgerEntry[];
        const balance = ledger.reduce((n, e) => n + (e.kind === "credit" ? e.amount : -e.amount), 0);
        const qualifying = (sessionsReq.result as unknown[]).filter(isQualifyingSession);
        const progress = policy.coverage
          ? (progressReq.result as { columns?: Record<string, number> }[])
            .filter((row) => (row.columns?.[policy.coverage!] ?? 0) > 0).length
          : 0;
        if (!canUnlock(policy, balance, qualifying.length, progress)) { tx.abort(); return; }
        if (policy.cost) tx.objectStore("ledger").put({ id: `debit:unlock:${policy.key}`, kind: "debit", amount: policy.cost, reason: "unlock", source: policy.key, createdAt: Date.now() } satisfies LedgerEntry);
        unlocks.put({ id: policy.key, key: policy.key, source: "purchase", unlockedAt: Date.now() });
      };
    };
      };
  };
  await done(tx).catch(() => { throw new Error("Saldo ou requisito insuficiente."); });
  db.close();
  return queryEconomy();
}


export { POLICIES, policyFor };