// As tentativas dos Desafios no IndexedDB (loja `preferences`, id `challenge-run:<desafio>:<instante>`): cada uma é gravada uma vez e nunca muda, então
// sincroniza com a conta e entra no Exportar/Importar progresso pela união por id; os recordes saem delas (`bestRun`). Desde 23/10/2026 a tentativa
// paga moedas (crédito `challenge:<tentativa>` no livro-caixa) e o bônus das medalhas novas (`grant:challenge:<desafio>:<medalha>`, uma vez por
// medalha e desafio, mesmo entre aparelhos), na mesma transação; o XP sai das tentativas (`runXp`, em `queryEconomy`).
import { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } from "./storage-schema.js";
import {
  CHALLENGE_RUN_PREFIX, MEDALS, MEDAL_BONUS_PER_ANSWER, challengeLedgerId, challengeReward, medalGrantId, parseRun,
  type ChallengeEnd, type ChallengeRun, type Medal,
} from "./challenges.js";

const STORE = "preferences";
const runRange = (challenge = "") => IDBKeyRange.bound(`${CHALLENGE_RUN_PREFIX}${challenge}`, `${CHALLENGE_RUN_PREFIX}${challenge}￿`);

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
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll(runRange());
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return rows.map(parseRun).filter((run): run is ChallengeRun => run !== null);
  } finally { database.close(); }
}

export type SavedChallengeRun = ChallengeRun & { medals: NonNullable<Medal>[] };

/** Grava a tentativa com a recompensa (moedas, XP, o dobro do dia e as medalhas novas), numa transação só. */
export async function saveChallengeRun(challenge: string, result: { correct: number; total: number; ms: number; end: ChallengeEnd; missed: string[] }): Promise<SavedChallengeRun> {
  const at = Date.now();
  const id = `${CHALLENGE_RUN_PREFIX}${challenge}:${at}`;
  const database = await openDatabase();
  try {
    return await new Promise<SavedChallengeRun>((resolve, reject) => {
      const transaction = database.transaction([STORE, "ledger"], "readwrite");
      const preferences = transaction.objectStore(STORE);
      const ledger = transaction.objectStore("ledger");
      let saved: SavedChallengeRun | null = null;
      const earlierRequest = preferences.getAll(runRange(`${challenge}:`));
      earlierRequest.onsuccess = () => {
        const earlier = (earlierRequest.result as unknown[]).map(parseRun).filter((run): run is ChallengeRun => run !== null);
        const granted = new Set<NonNullable<Medal>>();
        let pending = MEDALS.length;
        for (const medal of MEDALS) {
          const lookup = ledger.get(medalGrantId(challenge, medal));
          lookup.onsuccess = () => {
            if (lookup.result) granted.add(medal);
            pending -= 1;
            if (pending > 0) return;
            const reward = challengeReward({ challenge, correct: result.correct, total: result.total, at, earlier, granted });
            const run: ChallengeRun = { id, challenge, correct: result.correct, total: result.total, ms: result.ms, end: result.end, at,
              coins: reward.coins, xp: reward.xp, ...(reward.daily ? { daily: true } : {}), medalBonus: reward.medalBonus, missed: result.missed };
            preferences.put({ ...run, source: "challenge-v1" });
            if (reward.coins > 0) ledger.put({ id: challengeLedgerId(id), kind: "credit", amount: reward.coins, reason: `challenge:${challenge}`, source: "challenge", createdAt: at });
            for (const medal of reward.medals) {
              ledger.put({ id: medalGrantId(challenge, medal), kind: "credit", amount: result.total * MEDAL_BONUS_PER_ANSWER[medal], reason: `challenge-medal:${medal}`, source: "challenge", createdAt: at });
            }
            saved = { ...run, medals: reward.medals };
          };
          lookup.onerror = () => reject(lookup.error);
        }
      };
      earlierRequest.onerror = () => reject(earlierRequest.error);
      transaction.oncomplete = () => saved ? resolve(saved) : reject(new Error("tentativa não gravada"));
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}
