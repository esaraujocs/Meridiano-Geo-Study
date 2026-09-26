// Favoritas no IndexedDB (loja `preferences`, id `preset:<id>`): entram no Exportar/Importar progresso e sobrevivem à troca de link.
import { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } from "./storage-schema.js";
import { PRESET_ID_PREFIX, PRESET_SOURCE, parsePreset, type Preset } from "./presets.js";

const STORE = "preferences";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => upgradeStorage(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listPresets(): Promise<Preset[]> {
  const database = await openDatabase();
  try {
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return rows
      .filter((row) => String((row as { id?: unknown })?.id ?? "").startsWith(PRESET_ID_PREFIX))
      .map(parsePreset)
      .filter((item): item is Preset => item !== null);
  } finally { database.close(); }
}

/** Grava o que mudou e apaga o que saiu, numa transação só. */
export async function savePresets(changed: readonly Preset[], removedIds: readonly string[]) {
  if (!changed.length && !removedIds.length) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      for (const item of changed) store.put({ ...item, source: PRESET_SOURCE });
      for (const id of removedIds) store.delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}
