import type { AnyQuizVariant, Family, QuizVariant, Region } from "./types";
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  upgradeStorage,
} from "./storage-schema.js";
import {
  mergeProgressRecord,
  masteryForProgress,
  type LearningColumn,
  type ProgressRecord,
} from "./learning-rules";
import { firstCorrectReward } from "./economy-rules";
import { notifyAchievementLifecycle } from "./achievements.js";
export { mergeProgressRecord, masteryForProgress };
export type { LearningColumn, ProgressRecord };

const PROGRESS_STORE = "progress";
const SESSIONS_STORE = "sessions";

export type LearningRound = {
  targetId: string;
  correct: boolean;
  responseTimeMs: number | null;
  answeredAt: number;
  selectedId?: string;
  clickedId?: string;
  attempts?: number;
  guesses?: string[];
  distanceKm?: number | null;
  byWater?: boolean;
};

export type CurrentLearningSession = {
  id: string;
  source: "current-v2";
  family: Family;
  variant: AnyQuizVariant;
  mode?: string;
  subject?: string;
  region: Region;
  startedAt: number;
  endedAt: number | null;
  complete: boolean;
  rounds: LearningRound[];
};

export type LearningSessionHandle = {
  id: string;
  recordRound: (round: LearningRound) => void;
  end: (options?: { complete?: boolean }) => Promise<void>;
  finish: () => Promise<void>;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => upgradeStorage(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function columnForVariant(variant: AnyQuizVariant): LearningColumn {
  if (variant === "mapa" || variant === "silhueta" || variant === "silhueta-opcoes" || variant === "travel") return "mapa";
  if (variant === "bandeira-nome" || variant === "nome-bandeira") {
    return "bandeiras";
  }
  if (variant === "escrita-pais" || variant === "escrita-capital") return "escrita";
  return "capitais";
}

async function closeSession(
  database: IDBDatabase,
  session: CurrentLearningSession,
  complete: boolean,
) {
  const transaction = database.transaction(SESSIONS_STORE, "readwrite");
  transaction.objectStore(SESSIONS_STORE).put({
    ...session,
    endedAt: session.endedAt ?? Date.now(),
    complete,
  });
  await transactionDone(transaction);
}

export async function startLearningSession(input: {
  family: Family;
  variant: AnyQuizVariant;
  region: Region;
  persistProgress?: boolean;
  mode?: string;
  subject?: string;
}): Promise<LearningSessionHandle> {
  const database = await openDatabase();
  if (
    !database.objectStoreNames.contains(SESSIONS_STORE) ||
    !database.objectStoreNames.contains(PROGRESS_STORE)
  ) {
    console.warn(
      "[carta-cega] learning persistence unavailable: IndexedDB v2 stores missing",
    );
    database.close();
    return {
      id: `current-v2-${newId()}`,
      recordRound() {},
      async end() {},
      async finish() {},
    };
  }
  const session: CurrentLearningSession = {
    id: `current-v2-${newId()}`,
    source: "current-v2",
    family: input.family,
    variant: input.variant,
    mode: input.mode ?? input.variant,
    subject: input.subject ?? "",
    region: input.region,
    startedAt: Date.now(),
    endedAt: null,
    complete: false,
    rounds: [],
  };
  const transaction = database.transaction(SESSIONS_STORE, "readwrite");
  transaction.objectStore(SESSIONS_STORE).put(session);
  await transactionDone(transaction);

  let current = session;
  let ended = false;
  let queue = Promise.resolve();
  const reportFailure = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[carta-cega] learning persistence failed: ${message}`);
  };

  const endSession = async (options?: { complete?: boolean }) => {
    if (ended) return queue;
    ended = true;
    queue = queue
      .then(async () => {
        current = { ...current, endedAt: current.endedAt ?? Date.now() };
        await closeSession(database, current, options?.complete === true);
        database.close();
      })
      .catch((error) => {
        reportFailure(error);
        database.close();
      });
    queue = queue.then(() => notifyAchievementLifecycle({
      phase: "finish",
      sessionId: current.id,
      roundCount: current.rounds.length,
    })).catch(reportFailure);
    return queue;
  };

  return {
    id: session.id,
    recordRound(round) {
      if (ended) return;
      const sessionAfterRound = {
        ...current,
        rounds: [...current.rounds, round],
      };
      current = sessionAfterRound;
      queue = queue
        .then(async () => {
          const transaction = database.transaction(
            [SESSIONS_STORE, PROGRESS_STORE, "ledger"],
            "readwrite",
          );
          const progress = transaction.objectStore(PROGRESS_STORE);
          const done = transactionDone(transaction);
          const request = progress.getAll();
          request.onsuccess = () => {
            try {
              const existing = (request.result as ProgressRecord[]).find(
                (item) =>
                  item.entityId === round.targetId ||
                  item.id === round.targetId,
              );
              const column = columnForVariant(session.variant);
              if (input.persistProgress === false) {
                transaction.objectStore(SESSIONS_STORE).put(sessionAfterRound);
                return;
              }
              const reward = firstCorrectReward(
                round.targetId,
                column,
                round.correct,
                existing?.columns?.[column] ?? 0,
              );
              progress.put(mergeProgressRecord(existing, round.targetId, column, round.correct, round.answeredAt));
              if (reward) {
                const ledger = transaction.objectStore("ledger");
                const ledgerRequest = ledger.get(reward.id);
                ledgerRequest.onsuccess = () => {
                  if (!ledgerRequest.result) {
                    ledger.put({ ...reward, kind: "credit", createdAt: round.answeredAt });
                  }
                };
              }
              transaction.objectStore(SESSIONS_STORE).put(sessionAfterRound);
            } catch {
              transaction.abort();
            }
          };
          request.onerror = () => transaction.abort();
          await done;
          await notifyAchievementLifecycle({
            phase: "round",
            sessionId: current.id,
            roundCount: current.rounds.length,
          });
        })
        .catch(reportFailure);
    },
    end: endSession,
    finish: () => endSession({ complete: true }),
  };
}