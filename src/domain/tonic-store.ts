// Tônico de XP no aparelho: quantas rodadas ainda valem XP em dobro, guardado na loja `state` (não sincroniza: a ativação é de cada aparelho; o estoque
// `supply:tonico` e as rodadas já turbinadas `boosted` nas sessões é que viajam com a conta). A cada gravação de rodada o learning-store chama takeTonicRound().
import { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } from "./storage-schema.js";
import { createTonicState } from "./tonic.js";

const STORE = "state";
const ROW_ID = "tonic-v1";
const state = createTonicState(0);
const listeners = new Set<(left: number) => void>();
let loading: Promise<void> | null = null;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => upgradeStorage(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const emit = () => { for (const listener of listeners) listener(state.left); };
async function persist() {
  const database = await openDatabase();
  try {
    if (!database.objectStoreNames.contains(STORE)) return;
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put({ id: ROW_ID, left: state.left, updatedAt: Date.now() });
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); });
  } finally { database.close(); }
}

/** Lê o estado guardado uma vez (as chamadas seguintes só esperam essa leitura) e devolve quantas rodadas faltam. */
export function loadTonic(): Promise<number> {
  loading ??= (async () => {
    const database = await openDatabase();
    try {
      if (!database.objectStoreNames.contains(STORE)) return;
      const row = await new Promise<{ left?: unknown } | undefined>((resolve, reject) => {
        const request = database.transaction(STORE, "readonly").objectStore(STORE).get(ROW_ID);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (row && state.left === 0) { state.set(Number(row.left)); emit(); }
    } finally { database.close(); }
  })().catch(() => undefined);
  return loading.then(() => state.left);
}
/** Quantas rodadas do Tônico faltam agora (na memória; `loadTonic` primeiro). */
export const tonicLeft = () => state.left;
export function onTonicChange(listener: (left: number) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
/** Liga o Tônico (50 rodadas). Falso se já havia um ativo. */
export async function activateTonic(): Promise<boolean> {
  await loadTonic();
  if (!state.activate()) return false;
  emit();
  await persist().catch(() => undefined);
  return true;
}
/** A rodada que está sendo gravada é turbinada? Gasta uma rodada do Tônico se for. */
export function takeTonicRound(): boolean {
  if (!state.take()) return false;
  emit();
  void persist().catch(() => undefined);
  return true;
}
