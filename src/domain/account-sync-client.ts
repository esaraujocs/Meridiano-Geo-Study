// A sincronização do progresso com a conta, do lado do navegador: o IndexedDB como `LocalStore`, a rede de pvp-client.ts como `SyncTransport`, e quem decide QUANDO sincronizar
// (aberta a página, depois do login, de tempos em tempos, e quando a pessoa pede). As regras e o motor (testados sem navegador) estão em account-sync.ts e account-sync-engine.ts.
// O estado da sincronização mora no próprio IndexedDB (loja `state`, linha `sync:v1`) para ser gravado na MESMA transação que as cartas; ele nunca entra em backup.
import { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } from "./storage-schema.js";
import { SYNC_ROW_STORES, SUPPLY_ROW_PREFIX, countRows, emptyRows, isCounterPreference, type SyncRow, type SyncRowStore, type SyncRows } from "./account-sync.js";
import { SYNC_STATE_ID, syncUntilSettled, type CurrentLocal, type LocalStore, type LocalWrites, type SupplyRow, type SyncResult, type SyncState, type SyncSnapshot } from "./account-sync-engine.js";
import { BOT_RANKING_ROW_ID } from "./account-sync.js";
import { markSyncConnection } from "./account-live.js";
import { parseBotRanking } from "./bot-ranking.js";
import { deviceId, readLocalPrefs, setMissingLocalPrefs } from "./progress-backup.js";
import { PvpClientError, hasPvpIdentity, pvpAccountName, pvpAccountRefresh, pvpIdentity, pvpSyncCommit, pvpSyncPlan, pvpSyncRows } from "./pvp-client.js";
import type { ProgressRecord } from "./learning-rules.js";

const ROW_AND_PROGRESS_STORES = [...SYNC_ROW_STORES, "progress"] as const;
const ALL_STORES = [...ROW_AND_PROGRESS_STORES, "state"] as const;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => upgradeStorage(request.result);
    request.onsuccess = () => resolve(markSyncConnection(request.result));
    request.onerror = () => reject(request.error);
  });
}

const splitPreferences = (rows: SyncRow[]) => ({
  rows: rows.filter((row) => !isCounterPreference(row)),
  supply: rows.filter((row) => isCounterPreference(row)) as SupplyRow[],
});

/** O `LocalStore` do navegador. Cada operação abre e fecha a conexão (como o resto dos módulos de armazenamento). */
export function createIdbLocalStore(): LocalStore {
  return {
    async snapshot(): Promise<SyncSnapshot> {
      const database = await openDatabase();
      try {
        const data = await new Promise<Record<string, SyncRow[]>>((resolve, reject) => {
          const out: Record<string, SyncRow[]> = {};
          const transaction = database.transaction([...ROW_AND_PROGRESS_STORES], "readonly");
          transaction.oncomplete = () => resolve(out);
          transaction.onabort = () => reject(transaction.error ?? new Error("A leitura do progresso foi interrompida."));
          for (const name of ROW_AND_PROGRESS_STORES) {
            const request = transaction.objectStore(name).getAll();
            request.onsuccess = () => { out[name] = request.result as SyncRow[]; };
          }
        });
        const rows = emptyRows();
        for (const store of SYNC_ROW_STORES) rows[store] = data[store] ?? [];
        const { rows: prefRows, supply } = splitPreferences(rows.preferences);
        rows.preferences = prefRows;
        return { rows, progress: (data.progress ?? []) as unknown as ProgressRecord[], supply, local: readLocalPrefs() };
      } finally { database.close(); }
    },

    async readState(): Promise<SyncState | null> {
      const database = await openDatabase();
      try {
        const row = await new Promise<unknown>((resolve, reject) => {
          const request = database.transaction("state", "readonly").objectStore("state").get(SYNC_STATE_ID);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        return row ? (row as SyncState) : null;
      } finally { database.close(); }
    },

    async writeState(state: SyncState): Promise<void> {
      const database = await openDatabase();
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction("state", "readwrite");
          transaction.objectStore("state").put(state);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } finally { database.close(); }
    },

    async applyLocal(wanted: Record<SyncRowStore, string[]>, compute: (current: CurrentLocal) => LocalWrites): Promise<void> {
      const database = await openDatabase();
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction([...ALL_STORES], "readwrite");
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error ?? new Error("A gravação do progresso foi interrompida."));
          const existing = new Map<string, SyncRow>();
          let progress: ProgressRecord[] = [];
          let supply: SupplyRow[] = [];
          let pending = 0;
          let ready = false;
          const finish = () => {
            if (pending > 0 || !ready) return;
            ready = false; // roda uma vez só
            let writes: LocalWrites;
            try { writes = compute({ progress, supply, row: (store, id) => existing.get(`${store}\u0000${id}`) }); }
            catch (error) { try { transaction.abort(); } catch { /* já abortada */ } reject(error); return; }
            for (const row of writes.progress) transaction.objectStore("progress").put(row);
            const preferences = transaction.objectStore("preferences");
            for (const row of writes.supply) preferences.put(row);
            for (const store of SYNC_ROW_STORES) for (const row of writes.rows[store]) transaction.objectStore(store).put(row);
            transaction.objectStore("state").put(writes.state);
          };
          const track = (request: IDBRequest, onResult: (result: unknown) => void) => {
            pending += 1;
            request.onsuccess = () => { onResult(request.result); pending -= 1; finish(); };
          };
          track(transaction.objectStore("progress").getAll(), (result) => { progress = result as ProgressRecord[]; });
          track(transaction.objectStore("preferences").getAll(), (result) => { supply = (result as SyncRow[]).filter((row) => row.id.startsWith(SUPPLY_ROW_PREFIX)) as SupplyRow[]; });
          for (const store of SYNC_ROW_STORES) for (const id of wanted[store]) {
            track(transaction.objectStore(store).get(id), (result) => { if (result) existing.set(`${store}\u0000${id}`, result as SyncRow); });
          }
          ready = true;
          finish();
        });
      } finally { database.close(); }
    },
  };
}

// ───────────── quando e como sincronizar ─────────────

const STATUS_KEY = "carta-sync-status";
const CAPS_KEY = "carta-sync-caps";
const serverCaps = (): string[] => { try { return JSON.parse(localStorage.getItem(CAPS_KEY) ?? "[]") as string[]; } catch { return []; } };
const rememberCaps = (caps: readonly string[]) => { try { localStorage.setItem(CAPS_KEY, JSON.stringify(caps)); } catch { /* sem armazenamento */ } };
const OWNER_KEY = "carta-sync-owner";

/** `needsChoice`: o primeiro envio deste aparelho espera a escolha "somar ou usar o da conta" (a linha Conta das Opções pergunta). */
export type SyncStatus = { at: number; ok: boolean; changed: boolean; rev: number; error?: string; needsChoice?: boolean };
export function syncStatus(): SyncStatus | null {
  try { const raw = localStorage.getItem(STATUS_KEY); return raw ? (JSON.parse(raw) as SyncStatus) : null; } catch { return null; }
}
/** O usuário da última conta com que este aparelho sincronizou (não é apagado ao sair: serve para avisar quando outra conta entra no mesmo aparelho). */
export function lastSyncedAccount(): string { try { return localStorage.getItem(OWNER_KEY) ?? ""; } catch { return ""; } }
const remember = (status: SyncStatus, account?: string) => {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(status));
    if (account) localStorage.setItem(OWNER_KEY, account);
  } catch { /* sem armazenamento */ }
};
export function forgetSyncStatus() { try { localStorage.removeItem(STATUS_KEY); } catch { /* sem armazenamento */ } }

export type SyncOutcome = SyncResult | { status: "skipped" | "busy" } | { status: "error"; message: string; network: boolean };

const acceptRow = (store: SyncRowStore, row: SyncRow) => {
  if (store === "preferences" && row.id === BOT_RANKING_ROW_ID) { try { parseBotRanking(row); return true; } catch { return false; } }
  return true;
};

let running = false;
/** Sincroniza o progresso com a conta (se este aparelho está numa conta). Uma por vez (também entre abas, onde há Web Locks). Nunca lança: o resultado diz o que houve. */
export async function runAccountSync(options: { mode?: "sum" | "adopt" } = {}): Promise<SyncOutcome> {
  const account = pvpAccountName();
  if (!hasPvpIdentity() || !account) return { status: "skipped" };
  const identity = pvpIdentity();
  if (!identity) return { status: "skipped" };
  const job = async (): Promise<SyncOutcome> => {
    try {
      // conta ao vivo (22/10/2026): a primeira vez deste aparelho na conta não pergunta mais. Progresso de quem jogava sem conta junta na conta uma
      // vez (decisão do Enzo); um aparelho que já sincronizou ESTA conta e perdeu o estado fica com o número da conta (não soma duas vezes).
      // (o modo só vale nessa primeira vez: em toda sincronização, "usar o da conta" descartaria o que este aparelho jogou e ainda não subiu)
      const autoMode = lastSyncedAccount() === account ? "adopt" as const : "sum" as const;
      const run = (mode: "sum" | "adopt" | undefined) => syncUntilSettled({
        owner: identity.id,
        store: createIdbLocalStore(),
        transport: {
          // o servidor diz o que entende; vale a partir da próxima sincronização
          plan: async (manifest) => { const plan = await pvpSyncPlan(manifest); rememberCaps(plan.caps ?? []); return plan; },
          pushRows: (rows: SyncRows) => (countRows(rows) ? pvpSyncRows(rows) : Promise.resolve()),
          commit: pvpSyncCommit,
        },
        newDeviceId: () => deviceId() ?? crypto.randomUUID(),
        acceptRow,
        applyLocalPrefs: setMissingLocalPrefs,
        mode,
        sessionStamps: serverCaps().includes("session-stamps"),
      });
      let result = await run(options.mode);
      if (result.status === "needs-choice") result = await run(autoMode);
      if (result.status === "ok") {
        remember({ at: Date.now(), ok: true, changed: result.changedFromAccount, rev: result.rev }, account);
        window.dispatchEvent(new CustomEvent("carta-sync", { detail: result }));
      } else {
        const previous = syncStatus();
        remember({ at: previous?.at ?? 0, ok: false, changed: false, rev: previous?.rev ?? 0, needsChoice: true });
        window.dispatchEvent(new CustomEvent("carta-sync", { detail: result }));
      }
      return result;
    } catch (error) {
      // 401: este aparelho foi desconectado da conta (a senha foi trocada em outro aparelho, ou o segredo dele foi revogado). Confere com o servidor, que esquece a identidade daqui
      // (aí a linha Conta volta a mostrar Entrar/Criar e o aviso "crie uma conta" volta a valer), em vez de continuar "conectado" sem conseguir sincronizar.
      if (error instanceof PvpClientError && error.code === "unauthorized") {
        await pvpAccountRefresh().catch(() => undefined);
        window.dispatchEvent(new CustomEvent("carta-sync", { detail: { status: "signed-out" } }));
      }
      const network = error instanceof PvpClientError && error.code === "network";
      const message = error instanceof Error ? error.message : String(error);
      const previous = syncStatus();
      remember({ at: previous?.at ?? 0, ok: false, changed: false, rev: previous?.rev ?? 0, error: message });
      return { status: "error", message, network };
    }
  };
  if (running) return { status: "busy" };
  running = true;
  try {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (!locks) return await job();
    const outcome = await locks.request("carta-account-sync", { ifAvailable: true }, async (lock) => (lock ? job() : ({ status: "busy" } as SyncOutcome)));
    return outcome;
  } finally { running = false; }
}
