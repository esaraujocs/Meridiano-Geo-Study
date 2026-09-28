import type { AnyQuizVariant, Family, QuizVariant, Region, RegionSelection } from "./types";
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  upgradeStorage,
} from "./storage-schema.js";
import {
  mergeProgressRecord,
  masteryForProgress,
  parentCardCredit,
  type LearningColumn,
  type ProgressRecord,
} from "./learning-rules";
import { computeSpoils, emptySpoils, scaleSpoils, type Pace, type Spoils, type Tier } from "./spoils.js";
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
  /** Dificuldade do país (1 fácil, 3 difícil): entra no valor das moedas do acerto. */
  tier?: Tier;
  /** Travel: quantos países da rota foram acertados (vale moedas mesmo se a rota não fechou). */
  weight?: number;
  /** O tempo da pergunta acabou (conta como erro). */
  timedOut?: boolean;
};

/** Carta que subiu de nível nesta partida (de 0 = carta nova). */
export type Promotion = { id: string; from: number; to: number };

export type CurrentLearningSession = {
  id: string;
  source: "current-v2";
  family: Family;
  variant: AnyQuizVariant;
  mode?: string;
  subject?: string;
  region: Region;
  regions?: Region[];
  startedAt: number;
  endedAt: number | null;
  complete: boolean;
  rounds: LearningRound[];
  /** Duelo: as moedas são calculadas por este modo em vez do jogado (modo de prévia paga como o modo base). */
  coinVariant?: AnyQuizVariant;
  /** Duelo a que a sessão pertence e o número do tempo (0 ou 1). */
  duelId?: string;
  duelLeg?: number;
  /** Ritmo (Partida com tempo ou Treino), tamanho pedido e segundos por pergunta. */
  pace?: Pace;
  roundLimit?: number | null;
  timerSeconds?: number | null;
  promotions?: Promotion[];
  spoils?: Spoils;
};

export type SessionResult = { session: CurrentLearningSession; spoils: Spoils | null };

export type LearningSessionHandle = {
  id: string;
  recordRound: (round: LearningRound) => void;
  end: (options?: { complete?: boolean }) => Promise<SessionResult>;
  finish: () => Promise<SessionResult>;
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
  credit: LedgerCredit | null,
) {
  const transaction = database.transaction([SESSIONS_STORE, "ledger"], "readwrite");
  transaction.objectStore(SESSIONS_STORE).put({
    ...session,
    endedAt: session.endedAt ?? Date.now(),
    complete,
  });
  if (credit) transaction.objectStore("ledger").put(credit);
  await transactionDone(transaction);
}
type LedgerCredit = { id: string; kind: "credit"; amount: number; reason: string; source: string; createdAt: number };

export async function startLearningSession(input: {
  family: Family;
  variant: AnyQuizVariant;
  region: RegionSelection;
  persistProgress?: boolean;
  mode?: string;
  subject?: string;
  pace?: Pace;
  roundLimit?: number | null;
  timerSeconds?: number | null;
  coinVariant?: AnyQuizVariant;
  duel?: { id: string; leg: number };
  /** Chamado a cada rodada respondida, antes de gravar (o duelo entre pessoas avisa o servidor a cada rodada). */
  onRound?: (round: LearningRound) => void;
  /** Multiplica as moedas da sessão (1 = normal; o duelo amistoso entre pessoas paga menos). */
  coinFactor?: number;
  /** Nação → carta mãe (`cardParentsOf`): o acerto de uma nação no mapa também credita a carta do Reino Unido, que o mapa não pergunta. */
  cardParents?: Readonly<Record<string, string>>;
}): Promise<LearningSessionHandle> {
  const database = await openDatabase();
  const idle = (): LearningSessionHandle => {
    const empty: CurrentLearningSession = {
      id: `current-v2-${newId()}`, source: "current-v2", family: input.family, variant: input.variant, region: "mundo",
      startedAt: Date.now(), endedAt: Date.now(), complete: false, rounds: [],
    };
    return { id: empty.id, recordRound() {}, async end() { return { session: empty, spoils: null }; }, async finish() { return { session: empty, spoils: null }; } };
  };
  if (
    !database.objectStoreNames.contains(SESSIONS_STORE) ||
    !database.objectStoreNames.contains(PROGRESS_STORE)
  ) {
    console.warn(
      "[carta-cega] learning persistence unavailable: IndexedDB v2 stores missing",
    );
    database.close();
    return idle();
  }
  const session: CurrentLearningSession = {
    id: `current-v2-${newId()}`,
    source: "current-v2",
    family: input.family,
    variant: input.variant,
    mode: input.mode ?? input.variant,
    subject: input.subject ?? "",
    region: Array.isArray(input.region) ? (input.region.includes("mundo") ? "mundo" : input.region[0] ?? "mundo") : input.region,
    regions: Array.isArray(input.region) ? [...input.region] : [input.region],
    startedAt: Date.now(),
    endedAt: null,
    complete: false,
    rounds: [],
    pace: input.pace ?? "timed",
    roundLimit: input.roundLimit ?? null,
    timerSeconds: input.timerSeconds ?? null,
    promotions: [],
    ...(input.coinVariant ? { coinVariant: input.coinVariant } : {}),
    ...(input.duel ? { duelId: input.duel.id, duelLeg: input.duel.leg } : {}),
  };
  const transaction = database.transaction(SESSIONS_STORE, "readwrite");
  transaction.objectStore(SESSIONS_STORE).put(session);
  await transactionDone(transaction);

  let current = session;
  let ended = false;
  let queue = Promise.resolve();
  let result: Promise<SessionResult> | null = null;
  const reportFailure = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[carta-cega] learning persistence failed: ${message}`);
  };

  const endSession = (options?: { complete?: boolean }): Promise<SessionResult> => {
    if (ended && result) return result;
    ended = true;
    const complete = options?.complete === true;
    result = new Promise<SessionResult>((resolve) => {
      queue = queue
        .then(async () => {
          const promotions = current.promotions ?? [];
          // Só a partida terminada paga moedas (e conta XP); sair no meio guarda o aprendizado, sem recompensa.
          const raw = complete
            ? computeSpoils({
              variant: current.coinVariant ?? current.variant,
              pace: current.pace ?? "timed",
              rounds: current.rounds.map((round) => ({ correct: round.correct, tier: round.tier, weight: round.weight })),
              complete,
              newCards: promotions.filter((item) => item.from === 0).length,
              levelUps: promotions.filter((item) => item.from > 0).length,
            })
            : emptySpoils(current.pace ?? "timed");
          // O duelo amistoso entre pessoas paga menos (coinFactor < 1); os outros modos não mexem em nada.
          const spoils = input.coinFactor !== undefined && input.coinFactor !== 1 ? scaleSpoils(raw, input.coinFactor) : raw;
          const endedAt = current.endedAt ?? Date.now();
          current = { ...current, endedAt, spoils };
          const credit: LedgerCredit | null = spoils.total > 0
            ? { id: `spoils:${current.id}`, kind: "credit", amount: spoils.total, reason: "session-spoils", source: current.id, createdAt: endedAt }
            : null;
          await closeSession(database, current, complete, credit);
          database.close();
          resolve({ session: { ...current, complete }, spoils: complete && current.rounds.length > 0 ? spoils : null });
        })
        .catch((error) => {
          reportFailure(error);
          database.close();
          resolve({ session: { ...current, complete }, spoils: null });
        });
    });
    queue = queue.then(() => notifyAchievementLifecycle({
      phase: "finish",
      sessionId: current.id,
      roundCount: current.rounds.length,
    })).catch(reportFailure);
    return result;
  };

  return {
    id: session.id,
    recordRound(round) {
      if (ended) return;
      input.onRound?.(round);
      const sessionAfterRound = {
        ...current,
        rounds: [...current.rounds, round],
      };
      current = sessionAfterRound;
      queue = queue
        .then(async () => {
          const transaction = database.transaction(
            [SESSIONS_STORE, PROGRESS_STORE],
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
              const merged = mergeProgressRecord(existing, round.targetId, column, round.correct, round.answeredAt);
              progress.put(merged);
              const before = existing?.mastery ?? 0;
              let promotions = merged.mastery > before && round.correct
                ? [...(current.promotions ?? []), { id: round.targetId, from: before, to: merged.mastery }]
                : current.promotions ?? [];
              const parentId = parentCardCredit(input.cardParents, round.targetId, column, round.correct);
              if (parentId) {
                const parentExisting = (request.result as ProgressRecord[]).find((item) => item.entityId === parentId || item.id === parentId);
                const parentMerged = mergeProgressRecord(parentExisting, parentId, column, true, round.answeredAt);
                progress.put(parentMerged);
                const parentBefore = parentExisting?.mastery ?? 0;
                if (parentMerged.mastery > parentBefore) promotions = [...promotions, { id: parentId, from: parentBefore, to: parentMerged.mastery }];
              }
              current = { ...current, promotions };
              transaction.objectStore(SESSIONS_STORE).put({ ...sessionAfterRound, promotions });
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
