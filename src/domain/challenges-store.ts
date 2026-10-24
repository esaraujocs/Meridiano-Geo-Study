// As tentativas dos Desafios no IndexedDB (loja `preferences`, id `challenge-run:<desafio>:<instante>`): cada uma é gravada uma vez e nunca muda, então
// sincroniza com a conta e entra no Exportar/Importar progresso pela união por id; os recordes saem delas (`bestRun`).
import { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } from "./storage-schema.js";
import { CHALLENGE_RUN_PREFIX, parseRun, type ChallengeEnd, type ChallengeRun } from "./challenges.js";

const STORE = "preferences";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => upgradeStorage(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listChallengeRuns(): Promise<ChallengeRun[]> {
  const database = await openDatabase();
  try {
    const range = IDBKeyRange.bound(CHALLENGE_RUN_PREFIX, `${CHALLENGE_RUN_PREFIX}￿`);
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll(range);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return rows.map(parseRun).filter((run): run is ChallengeRun => run !== null);
  } finally { database.close(); }
}

export async function saveChallengeRun(challenge: string, result: { correct: number; total: number; ms: number; end: ChallengeEnd }): Promise<ChallengeRun> {
  const at = Date.now();
  const run: ChallengeRun = { id: `${CHALLENGE_RUN_PREFIX}${challenge}:${at}`, challenge, ...result, at };
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put({ ...run, source: "challenge-v1" });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
  return run;
}
