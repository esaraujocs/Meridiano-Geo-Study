// Exportar/importar o progresso: o navegador guarda tudo por origem (endereço + porta), então trocar de
// link (ex.: túnel novo do Cloudflare) "perde" o progresso. O arquivo de backup leva o jogo junto.
import { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } from "./storage-schema.js";
import { masteryForProgress, type ProgressRecord } from "./learning-rules.js";
import { BOT_RANKING_ID, parseBotRanking } from "./bot-ranking.js";
import { SYNC_STATE_ROW_PREFIX } from "./account-sync.js";

export const BACKUP_FORMAT = "meridiano-backup";
export const BACKUP_VERSION = 1;
export const BACKUP_STORES = ["state", "sessions", "progress", "historicalCollection", "preferences", "achievements", "ledger", "unlocks"] as const;
export type BackupStore = (typeof BACKUP_STORES)[number];
export type Row = { id: string } & Record<string, unknown>;
export type StoreRows = Record<BackupStore, Row[]>;

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  /** Aparelho/origem que gerou o arquivo; importar de volta no mesmo lugar nunca soma duas vezes. */
  deviceId?: string;
  stores: StoreRows;
  /** Preferências leves (tema, ritmo…): só entram se ainda não existirem no aparelho de destino. */
  local: Record<string, string>;
};

export type MergePlan = {
  /** Este mesmo arquivo já foi importado aqui: nada a fazer (evita somar as cartas duas vezes). */
  alreadyImported: boolean;
  writes: StoreRows;
  added: Record<BackupStore, number>;
  summed: number;
  coinsBefore: number;
  coinsAfter: number;
};

export const emptyRows = (): StoreRows => Object.fromEntries(BACKUP_STORES.map((name) => [name, []])) as unknown as StoreRows;
const emptyCounts = () => Object.fromEntries(BACKUP_STORES.map((name) => [name, 0])) as Record<BackupStore, number>;

export const coinBalance = (ledger: readonly Row[]) =>
  ledger.reduce((sum, entry) => sum + (entry.kind === "credit" ? Number(entry.amount) || 0 : -(Number(entry.amount) || 0)), 0);

export function buildBackup(stores: StoreRows, local: Record<string, string>, deviceId?: string, now = Date.now()): BackupFile {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, deviceId, stores, local };
}

/** Valida o arquivo escolhido; devolve null se não for um backup do Meridiano. */
export function parseBackup(text: string): BackupFile | null {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== "object") return null;
  const file = raw as Partial<BackupFile>;
  if (file.format !== BACKUP_FORMAT || typeof file.version !== "number" || file.version > BACKUP_VERSION) return null;
  if (!file.stores || typeof file.stores !== "object") return null;
  const stores = emptyRows();
  for (const name of BACKUP_STORES) {
    const rows = (file.stores as Record<string, unknown>)[name];
    if (rows === undefined) continue;
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || typeof (row as Row).id !== "string")) return null;
    if (name === "preferences") {
      try {
        stores[name] = (rows as Row[]).map((row) =>
          row.id === BOT_RANKING_ID ? parseBotRanking(row) as unknown as Row : row);
      } catch { return null; }
    } else if (name === "state") stores[name] = (rows as Row[]).filter((row) => !row.id.startsWith(SYNC_STATE_ROW_PREFIX));
    else stores[name] = rows as Row[];
  }
  const local: Record<string, string> = {};
  for (const [key, value] of Object.entries(file.local ?? {})) if (typeof value === "string") local[key] = value;
  return { format: BACKUP_FORMAT, version: file.version, exportedAt: Number(file.exportedAt) || 0, deviceId: typeof file.deviceId === "string" ? file.deviceId : undefined, stores, local };
}

/** Cartas que existem nos dois lados têm os acertos somados; a maestria é recalculada. */
export function sumProgress(a: ProgressRecord, b: ProgressRecord): ProgressRecord {
  const columns: ProgressRecord["columns"] = { bandeiras: 0, mapa: 0, capitais: 0 };
  for (const column of ["bandeiras", "mapa", "capitais", "escrita"] as const) {
    if (a.columns?.[column] === undefined && b.columns?.[column] === undefined) continue;
    columns[column] = (a.columns?.[column] ?? 0) + (b.columns?.[column] ?? 0);
  }
  const merged: ProgressRecord = { ...a, seen: a.seen + b.seen, correct: a.correct + b.correct, columns, latest: Math.max(a.latest ?? 0, b.latest ?? 0), mastery: 0 };
  merged.mastery = masteryForProgress(merged);
  if (merged.source === "current-v2" && b.source !== "current-v2") merged.source = "combined";
  return merged;
}

export const importMarkerId = (file: Pick<BackupFile, "deviceId" | "exportedAt">) => `backup-import:${file.deviceId ?? "sem-id"}:${file.exportedAt}`;

/** União por id, sem nunca apagar nem reduzir o que já existe no aparelho. Idempotente por marcador no estado. */
export function planMerge(local: StoreRows, incoming: StoreRows, options: { sameDevice?: boolean; marker?: string } = {}): MergePlan {
  const writes = emptyRows();
  // Rank snapshots are mutable whole-state counters, not additive preferences. Validate both sides
  // before planning so malformed persisted or imported state is surfaced rather than overwritten.
  const localRanking = local.preferences.find((row) => row.id === BOT_RANKING_ID);
  const incomingRanking = incoming.preferences.find((row) => row.id === BOT_RANKING_ID);
  const localBotRanking = localRanking ? parseBotRanking(localRanking) : undefined;
  const incomingBotRanking = incomingRanking ? parseBotRanking(incomingRanking) : undefined;
  if (options.marker && local.state.some((row) => row.id === options.marker)) {
    const balance = coinBalance(local.ledger);
    return { alreadyImported: true, writes, added: emptyCounts(), summed: 0, coinsBefore: balance, coinsAfter: balance };
  }
  const added = emptyCounts();
  let summed = 0;
  for (const name of BACKUP_STORES) {
    const here = new Map(local[name].map((row) => [row.id, row]));
    for (const row of incoming[name]) {
      const existing = here.get(row.id);
      if (!existing) { writes[name].push(row); added[name] += 1; continue; }
      if (name === "preferences" && row.id === BOT_RANKING_ID) {
        // Forks are resolved by revision only: the higher complete snapshot wins; ties stay local.
        // This intentionally lets a populated backup replace a fresh revision-0 seed even if the
        // seed happens to have a later lastDay. No counters are combined or history replayed.
        if (incomingBotRanking && localBotRanking && incomingBotRanking.revision > localBotRanking.revision) {
          writes[name].push(incomingBotRanking as unknown as Row);
        }
      } else if (name === "progress") {
        if (options.sameDevice) continue;
        writes[name].push(sumProgress(existing as unknown as ProgressRecord, row as unknown as ProgressRecord) as unknown as Row); summed += 1;
      } else if (name === "achievements" && Number(row.unlockedAt) < Number(existing.unlockedAt)) writes[name].push(row);
      // Mesma compra em dois lugares (id igual) por preços diferentes: vale o que foi realmente pago, o maior. Senão
      // o preço antigo/barato apagava o gasto maior e "devolvia" moedas.
      else if (name === "ledger" && row.kind === "debit" && existing.kind === "debit" && Number(row.amount) > Number(existing.amount)) { writes[name].push(row); }
    }
  }
  const coinsBefore = coinBalance(local.ledger);
  const finalLedger = new Map(local.ledger.map((row) => [row.id, row]));
  for (const row of writes.ledger) finalLedger.set(row.id, row);
  const coinsAfter = coinBalance([...finalLedger.values()]);
  return { alreadyImported: false, writes, added, summed, coinsBefore, coinsAfter };
}

// ---- IndexedDB / localStorage -------------------------------------------------------------------------

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => upgradeStorage(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAll(database: IDBDatabase): Promise<StoreRows> {
  const rows = emptyRows();
  return new Promise<StoreRows>((resolve, reject) => {
    const transaction = database.transaction([...BACKUP_STORES], "readonly");
    transaction.oncomplete = () => resolve(rows);
    transaction.onabort = () => reject(transaction.error ?? new Error("Progress backup read transaction was aborted."));
    transaction.onerror = () => {};
    for (const name of BACKUP_STORES) {
      const request = transaction.objectStore(name).getAll();
      request.onsuccess = () => { rows[name] = request.result as Row[]; };
      request.onerror = () => {};
    }
  });
}

const LOCAL_KEY = /^carta-(theme|pace|round-tier|flag-direction|reduced-motion|timer-late|last-variant:.+)$/;
/** Preferências leves (tema, ritmo…) deste aparelho; a sincronização com a conta as leva também. */
export function readLocalPrefs() {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && LOCAL_KEY.test(key)) out[key] = localStorage.getItem(key) ?? "";
    }
  } catch { /* sem armazenamento */ }
  return out;
}

/** Grava só as preferências que este aparelho ainda não tem (a conta nunca troca o que a pessoa já escolheu aqui). */
export function setMissingLocalPrefs(prefs: Record<string, string>) {
  try {
    for (const [key, value] of Object.entries(prefs)) if (LOCAL_KEY.test(key) && localStorage.getItem(key) === null) localStorage.setItem(key, value);
  } catch { /* sem armazenamento */ }
}

export function deviceId() {
  try {
    let id = localStorage.getItem("carta-device-id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("carta-device-id", id); }
    return id;
  } catch { return undefined; }
}

const planFor = (rows: StoreRows, file: BackupFile) =>
  planMerge(rows, file.stores, { sameDevice: file.deviceId !== undefined && file.deviceId === deviceId(), marker: importMarkerId(file) });

export async function exportProgress(): Promise<BackupFile> {
  const database = await openDatabase();
  try {
    const rows = await readAll(database);
    // o estado da sincronização com a conta (baselines, números de envio) é deste aparelho: levá-lo num arquivo para outro aparelho o faria somar o que já foi somado
    rows.state = rows.state.filter((row) => !row.id.startsWith(SYNC_STATE_ROW_PREFIX));
    return buildBackup(rows, readLocalPrefs(), deviceId());
  } finally { database.close(); }
}

export async function previewImport(file: BackupFile): Promise<MergePlan> {
  const database = await openDatabase();
  try { return planFor(await readAll(database), file); } finally { database.close(); }
}

/** Grava tudo numa transação só: entra tudo ou nada. */
export async function importProgress(file: BackupFile): Promise<MergePlan> {
  const database = await openDatabase();
  try {
    const plan = planFor(await readAll(database), file);
    if (plan.alreadyImported) return plan;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([...BACKUP_STORES], "readwrite");
      let explicitError: Error | undefined;
      for (const name of BACKUP_STORES) {
        for (const row of plan.writes[name]) {
          if (name === "preferences" && row.id === BOT_RANKING_ID) continue;
          transaction.objectStore(name).put(row);
        }
      }
      const rankingWrite = plan.writes.preferences.find((row) => row.id === BOT_RANKING_ID);
      if (rankingWrite) {
        const preferences = transaction.objectStore("preferences");
        const request = preferences.get(BOT_RANKING_ID);
        request.onsuccess = () => {
          try {
            const incoming = parseBotRanking(rankingWrite);
            const current = request.result === undefined ? undefined : parseBotRanking(request.result);
            if (!current || incoming.revision > current.revision) preferences.put(incoming);
          } catch (error) {
            explicitError = error instanceof Error ? error : new Error(String(error));
            try { transaction.abort(); } catch { /* já abortada */ }
          }
        };
      }
      transaction.objectStore("state").put({ id: importMarkerId(file), importedAt: Date.now() });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(explicitError ?? transaction.error ?? new Error("Progress import transaction failed."));
      transaction.onabort = () => reject(explicitError ?? transaction.error ?? new Error("Progress import transaction was aborted."));
    });
    try {
      for (const [key, value] of Object.entries(file.local)) if (LOCAL_KEY.test(key) && localStorage.getItem(key) === null) localStorage.setItem(key, value);
    } catch { /* sem armazenamento */ }
    return plan;
  } finally { database.close(); }
}
