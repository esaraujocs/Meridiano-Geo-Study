export const DATABASE_NAME = "carta-cega";
export const DATABASE_VERSION = 4;

export const CURRENT_STORES = [
  "sessions",
  "progress",
  "historicalCollection",
  "preferences",
  "achievements",
  "ledger",
  "unlocks",
] as const;

export function upgradeStorage(database: IDBDatabase) {
  if (!database.objectStoreNames.contains("state")) {
    database.createObjectStore("state", { keyPath: "id" });
  }
  for (const name of CURRENT_STORES) {
    if (!database.objectStoreNames.contains(name)) {
      database.createObjectStore(name, { keyPath: "id" });
    }
  }
}