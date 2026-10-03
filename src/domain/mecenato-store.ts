// Mecenato v2 no IndexedDB. O que viaja com a conta: a expedição (linha `expedition:<id>` na loja `preferences`, criada uma vez e nunca alterada), o débito
// no livro-caixa (`source: "museum"`, o mesmo das peças do Museu antigo, para o Patronato somar tudo), a peça no Acervo (`museum:<peça>` em `unlocks`) e a marca
// de desembarque (`expedition-landed:<id>` em `unlocks`). O que fica só neste aparelho: o andamento da aceleração e o baú de bordo (`mecenato-progress-v1`
// na loja `state`) e o Equipamento (localStorage `carta-mecenato`, fora da sincronização porque o servidor só guarda as chaves que já conhece).
import { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } from "./storage-schema.js";
import {
  ITEMS, ITEM_IDS, activeExpeditions, applyHit, emptyProgress, expeditionId, hitMatches, isBack, isItemId, itemOwned, launchBlock, lootFor, nextStage,
  routeById, ROUTES, stageCost, stageDurationMs,
  type ExpeditionProgress, type ExpeditionRecord, type ItemId, type ItemSlot, type LaunchBlock, type Loot, type MecenatoView, type RouteId,
} from "./mecenato.js";

const PROGRESS_ID = "mecenato-progress-v1";
const EXPEDITION_PREFIX = "expedition:";
const LANDED_PREFIX = "expedition-landed:";
const MUSEUM_PREFIX = "museum:";
const EQUIP_KEY = "carta-mecenato";

type LedgerEntry = { id: string; kind: "credit" | "debit"; amount: number; reason: string; source: string; createdAt: number };
type UnlockRow = { id: string; key?: string; source?: string; unlockedAt?: number };
type ExpeditionRow = ExpeditionRecord & { source: string };

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => upgradeStorage(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const done = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error("Mecenato transaction failed."));
  transaction.onabort = () => reject(transaction.error ?? new Error("Mecenato transaction aborted."));
});
const request = <T>(req: IDBRequest) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result as T); req.onerror = () => reject(req.error); });

const isExpeditionRow = (row: unknown): row is ExpeditionRow => {
  const value = row as Partial<ExpeditionRow> | null;
  return Boolean(value && typeof value.id === "string" && value.id.startsWith(EXPEDITION_PREFIX) && routeById(String(value.route)) && Number.isInteger(value.stage)
    && Number.isFinite(value.startedAt) && Number.isFinite(value.durationMs) && Number.isFinite(value.cost));
};
const recordOf = (row: ExpeditionRow): ExpeditionRecord => ({ id: row.id.slice(EXPEDITION_PREFIX.length), route: row.route, stage: row.stage, startedAt: row.startedAt, durationMs: row.durationMs, cost: row.cost });

/** Lê tudo o que o Mecenato precisa de uma loja já aberta numa transação. */
function readView(ledger: LedgerEntry[], unlocks: UnlockRow[], preferences: unknown[], progressRow: { progress?: Record<string, ExpeditionProgress> } | undefined, now: number): MecenatoView {
  const keys = new Set(unlocks.flatMap((row) => [row.id, row.key].filter((value): value is string => typeof value === "string")));
  const ownedPieces = new Set([...keys].filter((key) => key.startsWith(MUSEUM_PREFIX)).map((key) => key.slice(MUSEUM_PREFIX.length)));
  const landed = new Set([...keys].filter((key) => key.startsWith(LANDED_PREFIX)).map((key) => key.slice(LANDED_PREFIX.length)));
  const balance = ledger.reduce((sum, entry) => sum + (entry.kind === "credit" ? entry.amount : -entry.amount), 0);
  const invested = ledger.filter((entry) => entry.kind === "debit" && entry.source === "museum").reduce((sum, entry) => sum + entry.amount, 0);
  const investedLegacy = ledger.filter((entry) => entry.kind === "debit" && entry.source === "museum" && entry.reason !== "expedition").reduce((sum, entry) => sum + entry.amount, 0);
  const expeditions = preferences.filter(isExpeditionRow).map(recordOf);
  return { ownedPieces, expeditions, landed, progress: { ...(progressRow?.progress ?? {}) }, invested, investedLegacy, balance, now };
}

// ───────── cache em memória (para a aceleração a cada rodada não abrir o banco) ─────────
let cache: MecenatoView | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };
export function onMecenatoChange(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export const cachedMecenato = () => cache;

export async function queryMecenato(): Promise<MecenatoView> {
  const db = await openDb();
  try {
    const tx = db.transaction(["ledger", "unlocks", "preferences", "state"], "readonly");
    const [ledger, unlocks, preferences, progressRow] = await Promise.all([
      request<LedgerEntry[]>(tx.objectStore("ledger").getAll()), request<UnlockRow[]>(tx.objectStore("unlocks").getAll()),
      request<unknown[]>(tx.objectStore("preferences").getAll()), request<{ progress?: Record<string, ExpeditionProgress> } | undefined>(tx.objectStore("state").get(PROGRESS_ID)),
    ]);
    cache = readView(ledger, unlocks, preferences, progressRow, Date.now());
    // o que estava sendo acelerado neste aparelho e ainda não foi gravado ganha do que veio do banco
    for (const [id, value] of Object.entries(pendingProgress)) cache.progress[id] = value;
    emit();
    return cache;
  } finally { db.close(); }
}

export type LaunchResult = { ok: true; record: ExpeditionRecord } | { ok: false; reason: LaunchBlock | "error" };
/** Zarpar: debita o custo da etapa e cria a expedição, numa transação só (com a mesma checagem de `launchBlock`). */
export async function launchExpedition(routeId: RouteId): Promise<LaunchResult> {
  const route = routeById(routeId);
  if (!route) return { ok: false, reason: "closed" };
  const db = await openDb();
  let result: LaunchResult = { ok: false, reason: "error" };
  try {
    const tx = db.transaction(["ledger", "unlocks", "preferences", "state"], "readwrite");
    const completion = done(tx);
    const reads = [tx.objectStore("ledger").getAll(), tx.objectStore("unlocks").getAll(), tx.objectStore("preferences").getAll(), tx.objectStore("state").get(PROGRESS_ID)];
    let pending = reads.length;
    const onRead = () => {
      pending -= 1;
      if (pending > 0) return;
      const now = Date.now();
      const view = readView(reads[0].result as LedgerEntry[], reads[1].result as UnlockRow[], reads[2].result as unknown[], reads[3].result as never, now);
      const block = launchBlock(route, view);
      const stage = nextStage(route, view);
      if (block || stage === null) { result = { ok: false, reason: block ?? "busy" }; return; }
      const id = expeditionId(route.id, stage);
      const record: ExpeditionRecord = { id, route: route.id, stage, startedAt: now, durationMs: stageDurationMs(stage), cost: stageCost(route, stage) };
      tx.objectStore("ledger").put({ id: `debit:expedition:${id}`, kind: "debit", amount: record.cost, reason: "expedition", source: "museum", createdAt: now } satisfies LedgerEntry);
      tx.objectStore("preferences").put({ ...record, id: `${EXPEDITION_PREFIX}${id}`, source: "expedition-v1" } satisfies ExpeditionRow);
      result = { ok: true, record };
    };
    for (const read of reads) { read.onsuccess = onRead; read.onerror = () => tx.abort(); }
    await completion;
  } catch { result = { ok: false, reason: "error" }; } finally { db.close(); }
  await queryMecenato().catch(() => null);
  return result;
}

export type LandResult = { ok: true; record: ExpeditionRecord; piece: string; loot: Loot } | { ok: false };
/** Desembarcar: põe a peça no Acervo, marca a expedição como desembarcada e entrega os achados (moedas de volta e suprimentos), numa transação só. */
export async function landExpedition(id: string): Promise<LandResult> {
  await flushProgress();
  const db = await openDb();
  let result: LandResult = { ok: false };
  try {
    const tx = db.transaction(["ledger", "unlocks", "preferences", "state"], "readwrite");
    const completion = done(tx);
    const reads = [tx.objectStore("ledger").getAll(), tx.objectStore("unlocks").getAll(), tx.objectStore("preferences").getAll(), tx.objectStore("state").get(PROGRESS_ID)];
    let pending = reads.length;
    const onRead = () => {
      pending -= 1;
      if (pending > 0) return;
      const now = Date.now();
      const progressRow = reads[3].result as { progress?: Record<string, ExpeditionProgress> } | undefined;
      const view = readView(reads[0].result as LedgerEntry[], reads[1].result as UnlockRow[], reads[2].result as unknown[], progressRow, now);
      const record = activeExpeditions(view).find((item) => item.id === id);
      const route = record && routeById(record.route);
      const piece = route?.stages[record!.stage]?.piece;
      const progress = record ? view.progress[record.id] ?? emptyProgress() : emptyProgress();
      if (!record || !piece || !isBack(record, progress, now)) return;
      const loot = lootFor(record, progress.chest);
      const unlocks = tx.objectStore("unlocks");
      unlocks.put({ id: `${MUSEUM_PREFIX}${piece}`, key: `${MUSEUM_PREFIX}${piece}`, source: "expedition", unlockedAt: now } satisfies UnlockRow);
      unlocks.put({ id: `${LANDED_PREFIX}${record.id}`, key: `${LANDED_PREFIX}${record.id}`, source: "expedition", unlockedAt: now } satisfies UnlockRow);
      if (loot.coins > 0) tx.objectStore("ledger").put({ id: `credit:expedition:${record.id}`, kind: "credit", amount: loot.coins, reason: "expedition-loot", source: "expedition", createdAt: now } satisfies LedgerEntry);
      const preferences = tx.objectStore("preferences");
      for (const [supply, count] of Object.entries(loot.supplies)) {
        const rowId = `supply:${supply}`;
        const existing = preferences.get(rowId);
        existing.onsuccess = () => preferences.put({ id: rowId, source: "supply-v1", count: (Number((existing.result as { count?: unknown } | undefined)?.count) || 0) + (count ?? 0) });
      }
      const nextProgress = { ...(progressRow?.progress ?? {}) };
      delete nextProgress[record.id];
      tx.objectStore("state").put({ id: PROGRESS_ID, progress: nextProgress, updatedAt: now });
      result = { ok: true, record, piece, loot };
    };
    for (const read of reads) { read.onsuccess = onRead; read.onerror = () => tx.abort(); }
    await completion;
  } catch { result = { ok: false }; } finally { db.close(); }
  delete pendingProgress[id];
  await queryMecenato().catch(() => null);
  return result;
}

// ───────── aceleração: cada acerto que vale corta a viagem das expedições da região ─────────
let regionOf: Promise<Record<string, string | undefined>> | null = null;
const loadRegions = () => {
  regionOf ??= fetch("/data/legacy/catalog.json").then((response) => response.json()).then((catalog: { meta?: Record<string, { reg?: string }> }) =>
    Object.fromEntries(Object.entries(catalog.meta ?? {}).map(([id, meta]) => [id, meta.reg]))).catch(() => ({}));
  return regionOf;
};
const pendingProgress: Record<string, ExpeditionProgress> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
async function flushProgress() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  const ids = Object.keys(pendingProgress);
  if (!ids.length) return;
  const db = await openDb();
  try {
    const tx = db.transaction("state", "readwrite");
    const store = tx.objectStore("state");
    const read = store.get(PROGRESS_ID);
    read.onsuccess = () => {
      const progress = { ...((read.result as { progress?: Record<string, ExpeditionProgress> } | undefined)?.progress ?? {}) };
      for (const id of ids) progress[id] = pendingProgress[id];
      store.put({ id: PROGRESS_ID, progress, updatedAt: Date.now() });
    };
    await done(tx);
    for (const id of ids) delete pendingProgress[id];
  } finally { db.close(); }
}
/** Chamado pelo learning-store a cada rodada gravada que vale para o Mecenato (certa, sem suprimento, fora do duelo/PvP). */
export async function noteExpeditionHit(hit: { targetId: string; family: string; variant: string; pace: string; tier?: number }) {
  const view = cache ?? await queryMecenato().catch(() => null);
  if (!view) return;
  const now = Date.now();
  const sailing = activeExpeditions(view).filter((record) => !isBack(record, view.progress[record.id] ?? emptyProgress(), now));
  if (!sailing.length) return;
  const reg = (await loadRegions())[hit.targetId];
  let changed = false;
  for (const record of sailing) {
    const route = routeById(record.route);
    if (!route || !hitMatches(route, { family: hit.family, variant: hit.variant, reg })) continue;
    const next = applyHit(record, view.progress[record.id] ?? emptyProgress(), { tier: hit.tier, training: hit.pace === "training" });
    view.progress[record.id] = next;
    pendingProgress[record.id] = next;
    changed = true;
  }
  if (!changed) return;
  emit();
  if (!flushTimer) flushTimer = setTimeout(() => { void flushProgress().catch(() => undefined); }, 1500);
}

// ───────── Equipamento ─────────
export type Equipment = Partial<Record<ItemSlot, ItemId>>;
export function readEquipment(): Equipment {
  try {
    const raw = JSON.parse(localStorage.getItem(EQUIP_KEY) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(raw).filter(([slot, item]) => isItemId(item) && ITEMS[item].slot === slot)) as Equipment;
  } catch { return {}; }
}
export function equipItem(slot: ItemSlot, item: ItemId | null) {
  const next = { ...readEquipment() };
  if (item && ITEMS[item]?.slot === slot) next[slot] = item; else delete next[slot];
  try { localStorage.setItem(EQUIP_KEY, JSON.stringify(next)); } catch { /* sem armazenamento */ }
  emit();
}
/** O que está equipado E é da pessoa (com o Acervo ainda não lido, nada vale). Os motores de partida e o Hub leem isto. */
export function activeCosmetics(): Equipment {
  if (!cache) return {};
  const owned = cache.ownedPieces;
  return Object.fromEntries(Object.entries(readEquipment()).filter(([, item]) => isItemId(item) && itemOwned(item, owned))) as Equipment;
}
export const ownedItems = (view: MecenatoView) => ITEM_IDS.filter((id) => itemOwned(id, view.ownedPieces));

// ───────── debug ─────────
/** Só para testes (debug): dá por terminada a viagem de todas as expedições no mar, neste aparelho. */
export async function debugFinishExpeditions() {
  const view = await queryMecenato();
  for (const record of activeExpeditions(view)) pendingProgress[record.id] = { cutMs: record.durationMs, chest: (view.progress[record.id]?.chest ?? 0) };
  await flushProgress();
  await queryMecenato();
}
export { ROUTES };
