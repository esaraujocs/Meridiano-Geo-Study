const LEGACY_KEYS = {
  history: "carta-cega.hist.v1",
  historicalCollection: "carta-cega.histcol.v1",
  preferences: "carta-cega.pref.v1",
  achievements: "carta-cega.conq.v1",
} as const;

export const LEGACY_MIGRATION_VERSION = 2;
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  upgradeStorage,
} from "./storage-schema.js";
const SNAPSHOT_ID = "legacy-v1";
const KEY_NAMES = Object.keys(LEGACY_KEYS) as LegacyKey[];

type LegacyKey = keyof typeof LEGACY_KEYS;
type RawLegacyValues = Partial<Record<LegacyKey, string>>;

export type LegacyRound = [
  id: string,
  correct: boolean,
  milliseconds?: number | null,
  kilometers?: number | null,
];

type LegacySession = {
  id?: string;
  ini?: number;
  fim?: number | null;
  modo?: string;
  recorte?: string;
  assunto?: string;
  completa?: boolean;
  r?: unknown[];
  ag?: {
    rod?: number;
    ac?: number;
    kmS?: number;
    kmN?: number;
    msS?: number;
    msN?: number;
    reg?: Record<string, [number, number]>;
  };
  [key: string]: unknown;
};

type ParsedLegacyValues = {
  history?: { v: 1; sessoes: LegacySession[] };
  historicalCollection?: { v: 1; itens: Record<string, unknown> };
  preferences?: Record<string, unknown>;
  achievements?: Record<string, number>;
};

type LegacySnapshot = {
  id: string;
  kind: "legacy-raw-backup";
  schemaVersion: typeof LEGACY_MIGRATION_VERSION;
  source: "localStorage";
  fingerprint: string;
  importedAt: string;
  raw: RawLegacyValues;
};

type MigrationMeta = {
  id: typeof SNAPSHOT_ID;
  kind: "migration-meta";
  migrationVersion: typeof LEGACY_MIGRATION_VERSION;
  fingerprint: string;
  keyFingerprints: Partial<Record<LegacyKey, string>>;
  invalidKeys: LegacyKey[];
  warnings: string[];
  rawBackupId: string;
  importedAt: string;
};

export type MigratedSession = {
  id: string;
  source: "legacy-v1";
  sourceIndex: number;
  complete: boolean;
  startedAt: number | null;
  endedAt: number | null;
  mode: string;
  region: string;
  subject: string;
  column: MasteryColumn;
  rounds: LegacyRound[];
  aggregate: LegacySession["ag"] | null;
  raw: LegacySession;
};

export type EntityProgress = {
  id: string;
  seen: number;
  correct: number;
  columns: Record<MasteryColumn, number>;
  latest: number;
  mastery: 0 | 1 | 2 | 3 | 4 | 5;
  source: "legacy-v1";
};

export type MasteryColumn = "bandeiras" | "mapa" | "capitais" | "escrita";

export type LegacyProfile = {
  detected: boolean;
  migrated: boolean;
  status: "absent" | "imported" | "current" | "unavailable";
  sessions: number;
  completedSessions: number;
  rounds: number;
  achievements: number;
  invalidKeys: LegacyKey[];
  warnings?: string[];
};

export type LegacyTransform = {
  sessions: MigratedSession[];
  progress: EntityProgress[];
  historicalCollection: { id: string; value: unknown }[];
  preferences: Record<string, unknown> | null;
  achievements: { id: string; unlockedAt: number }[];
  warnings: string[];
};

const emptyProfile = (): LegacyProfile => ({
  detected: false,
  migrated: false,
  status: "absent",
  sessions: 0,
  completedSessions: 0,
  rounds: 0,
  achievements: 0,
  invalidKeys: [],
  warnings: [],
});

function parseLegacy(raw: RawLegacyValues) {
  const parsed: ParsedLegacyValues = {};
  const invalidKeys: LegacyKey[] = [];
  const warnings: string[] = [];

  for (const key of KEY_NAMES) {
    if (raw[key] === undefined) continue;
    try {
      const value = JSON.parse(raw[key] ?? "null");
      if (
        key === "history" &&
        value?.v === 1 &&
        Array.isArray(value.sessoes)
      ) {
        parsed.history = value;
      } else if (
        key === "historicalCollection" &&
        value?.v === 1 &&
        value.itens &&
        typeof value.itens === "object" &&
        !Array.isArray(value.itens)
      ) {
        parsed.historicalCollection = value;
      } else if (
        key === "preferences" &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        parsed.preferences = value;
      } else if (
        key === "achievements" &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        parsed.achievements = value;
      } else {
        invalidKeys.push(key);
      }
    } catch {
      invalidKeys.push(key);
    }
  }

  return { parsed, invalidKeys, warnings };
}

function columnFor(session: LegacySession): MasteryColumn {
  if (session.modo === "escr") return "escrita";
  if (session.assunto === "capital") return "capitais";
  if (
    session.modo === "mapa" ||
    session.modo === "silhueta" ||
    session.modo === "travel"
  ) {
    return "mapa";
  }
  return "bandeiras";
}

function normalizeRound(value: unknown): LegacyRound | null {
  if (!Array.isArray(value) || typeof value[0] !== "string") return null;
  if (typeof value[1] !== "boolean") return null;
  return [
    value[0],
    value[1],
    typeof value[2] === "number" ? value[2] : null,
    typeof value[3] === "number" ? value[3] : null,
  ];
}

type MasteryEvidence = Omit<EntityProgress, "id" | "mastery" | "source">;

function masteryFor(record: MasteryEvidence): EntityProgress["mastery"] {
  let mastery = record.seen ? 1 : 0;
  if (record.correct) mastery = Math.max(mastery, 1);
  const modes = (Object.keys(record.columns) as MasteryColumn[]).filter(
    (column) => record.columns[column] > 0,
  ).length;
  if (modes >= 2) mastery = 2;
  if (modes >= 3) mastery = 3;
  if (modes >= 4) mastery = 4;
  if (modes >= 4 && record.columns.escrita >= 2 && record.columns.capitais >= 2) {
    mastery = 5;
  }
  return mastery as EntityProgress["mastery"];
}

/**
 * Pure transformation kept separate from IndexedDB so fixtures can assert the
 * legacy rules without a browser. Complete sessions alone feed progress;
 * aggregate/pruned sessions remain available in the sessions store.
 */
export function transformLegacy(parsed: ParsedLegacyValues): LegacyTransform {
  const warnings: string[] = [];
  const sessions: MigratedSession[] = [];
  const evidence = new Map<string, MasteryEvidence>();

  for (const [sourceIndex, session] of (parsed.history?.sessoes ?? []).entries()) {
    if (!session || typeof session !== "object") {
      warnings.push(`history.sessoes[${sourceIndex}] ignorada: sessão inválida.`);
      continue;
    }
    const rounds: LegacyRound[] = [];
    for (const [roundIndex, value] of (session.r ?? []).entries()) {
      const round = normalizeRound(value);
      if (round) rounds.push(round);
      else {
        warnings.push(
          `history.sessoes[${sourceIndex}].r[${roundIndex}] ignorada: rodada inválida.`,
        );
      }
    }
    const migrated: MigratedSession = {
      id: `legacy-v1-${sourceIndex}-${session.id ?? "session"}`,
      source: "legacy-v1",
      sourceIndex,
      complete: Boolean(session.completa),
      startedAt: typeof session.ini === "number" ? session.ini : null,
      endedAt: typeof session.fim === "number" ? session.fim : null,
      mode: typeof session.modo === "string" ? session.modo : "",
      region: typeof session.recorte === "string" ? session.recorte : "",
      subject: typeof session.assunto === "string" ? session.assunto : "",
      column: columnFor(session),
      rounds,
      aggregate: session.ag ?? null,
      raw: session,
    };
    sessions.push(migrated);
    if (!migrated.complete) continue;

    for (const round of rounds) {
      const current = evidence.get(round[0]) ?? {
        seen: 0,
        correct: 0,
        columns: { bandeiras: 0, mapa: 0, capitais: 0, escrita: 0 },
        latest: 0,
      };
      current.seen += 1;
      if (round[1]) {
        current.correct += 1;
        current.columns[migrated.column] += 1;
        current.latest = Math.max(current.latest, migrated.startedAt ?? 0);
      }
      evidence.set(round[0], current);
    }
  }

  return {
    sessions,
    progress: [...evidence.entries()].map(([id, record]) => ({
      ...record,
      id,
      mastery: masteryFor(record),
      source: "legacy-v1",
    })),
    historicalCollection: Object.entries(
      parsed.historicalCollection?.itens ?? {},
    ).map(([id, value]) => ({ id, value })),
    preferences: parsed.preferences ?? null,
    achievements: Object.entries(parsed.achievements ?? {})
      .filter(([, unlockedAt]) => typeof unlockedAt === "number")
      .map(([id, unlockedAt]) => ({ id, unlockedAt })),
    warnings,
  };
}

function summarize(
  parsed: ParsedLegacyValues,
  invalidKeys: LegacyKey[],
  warnings: string[],
): Omit<LegacyProfile, "detected" | "migrated" | "status"> {
  const sessions = parsed.history?.sessoes ?? [];
  return {
    sessions: sessions.length,
    completedSessions: sessions.filter((session) => Boolean(session.completa))
      .length,
    rounds: sessions.reduce(
      (total, session) =>
        total + (session.r?.length ?? Number(session.ag?.rod ?? 0)),
      0,
    ),
    achievements: Object.values(parsed.achievements ?? {}).filter(
      (value) => typeof value === "number",
    ).length,
    invalidKeys,
    warnings,
  };
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function fingerprints(raw: RawLegacyValues) {
  const values = Object.fromEntries(
    await Promise.all(
      KEY_NAMES.map(async (key) => [key, await digest(raw[key] ?? "")]),
    ),
  ) as Record<LegacyKey, string>;
  return {
    values,
    all: await digest(KEY_NAMES.map((key) => `${key}:${values[key]}`).join("\n")),
  };
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      upgradeStorage(request.result);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readMeta(database: IDBDatabase) {
  return new Promise<MigrationMeta | undefined>((resolve, reject) => {
    const request = database
      .transaction("state", "readonly")
      .objectStore("state")
      .get(SNAPSHOT_ID);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putAll(
  transaction: IDBTransaction,
  storeName: string,
  values: unknown[],
) {
  const store = transaction.objectStore(storeName);
  for (const value of values) store.put(value);
}

function replaceLegacyRecords(
  transaction: IDBTransaction,
  storeName: string,
  values: unknown[],
) {
  const store = transaction.objectStore(storeName);
  const cursorRequest = store.openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) {
      putAll(transaction, storeName, values);
      return;
    }
    if (cursor.value?.source === "legacy-v1") cursor.delete();
    cursor.continue();
  };
}

type StoredProgress = Omit<EntityProgress, "source"> & {
  entityId?: string;
  legacyBaseline?: EntityProgress;
  source: string;
};

function mergeProgressBaseline(
  existing: StoredProgress | undefined,
  baseline: EntityProgress,
): StoredProgress {
  const previous = existing?.legacyBaseline;
  const legacyOnly = existing?.source === "legacy-v1";
  const currentSeen = legacyOnly
    ? 0
    : Math.max(0, (existing?.seen ?? 0) - (previous?.seen ?? 0));
  const currentCorrect = Math.max(
    0,
    legacyOnly ? 0 : (existing?.correct ?? 0) - (previous?.correct ?? 0),
  );
  const currentColumns = {
    bandeiras: Math.max(
      0,
      legacyOnly
        ? 0
        : (existing?.columns?.bandeiras ?? 0) -
          (previous?.columns?.bandeiras ?? 0),
    ),
    mapa: Math.max(
      0,
      legacyOnly
        ? 0
        : (existing?.columns?.mapa ?? 0) - (previous?.columns?.mapa ?? 0),
    ),
    capitais: Math.max(
      0,
      legacyOnly
        ? 0
        : (existing?.columns?.capitais ?? 0) -
          (previous?.columns?.capitais ?? 0),
    ),
    escrita: Math.max(
      0,
      legacyOnly
        ? 0
        : (existing?.columns?.escrita ?? 0) -
          (previous?.columns?.escrita ?? 0),
    ),
  };
  const combined: MasteryEvidence = {
    seen: baseline.seen + currentSeen,
    correct: baseline.correct + currentCorrect,
    columns: {
      bandeiras: baseline.columns.bandeiras + currentColumns.bandeiras,
      mapa: baseline.columns.mapa + currentColumns.mapa,
      capitais: baseline.columns.capitais + currentColumns.capitais,
      escrita: baseline.columns.escrita + currentColumns.escrita,
    },
    latest: Math.max(baseline.latest, existing?.latest ?? 0),
  };
  return {
    ...combined,
    id: existing?.id ?? `entity:${baseline.id}`,
    entityId: baseline.id,
    mastery: masteryFor(combined),
    source: currentSeen || currentCorrect ? "combined" : "legacy-v1",
    legacyBaseline: baseline,
  };
}

function replaceProgressRecords(
  transaction: IDBTransaction,
  values: EntityProgress[],
) {
  const store = transaction.objectStore("progress");
  const request = store.getAll();
  request.onsuccess = () => {
    const existing = request.result as StoredProgress[];
    const byEntity = new Map<string, StoredProgress>();
    for (const item of existing) {
      const entityId = String(item.entityId ?? item.id).replace(/^legacy:/, "");
      if (!byEntity.has(entityId) || item.source === "combined") {
        byEntity.set(entityId, item);
      }
    }
    const incoming = new Map(values.map((item) => [item.id, item]));
    const merged = values.map((item) => mergeProgressBaseline(byEntity.get(item.id), item));
    const preserved = [...byEntity.entries()]
      .filter(([entityId]) => !incoming.has(entityId))
      .map(([, item]) => item);
    store.clear();
    for (const item of [...preserved, ...merged]) store.put(item);
  };
  request.onerror = () => transaction.abort();
}

function commitMigration(
  database: IDBDatabase,
  raw: RawLegacyValues,
  source: Awaited<ReturnType<typeof fingerprints>>,
  parsed: ParsedLegacyValues,
  invalidKeys: LegacyKey[],
  warnings: string[],
  transformed: LegacyTransform,
) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [
        "state",
        "sessions",
        "progress",
        "historicalCollection",
        "preferences",
        "achievements",
      ],
      "readwrite",
    );
    const now = new Date().toISOString();
    const backupId = `legacy-raw-${source.all}`;
    const backup: LegacySnapshot = {
      id: backupId,
      kind: "legacy-raw-backup",
      schemaVersion: LEGACY_MIGRATION_VERSION,
      source: "localStorage",
      fingerprint: source.all,
      importedAt: now,
      raw,
    };
    transaction.objectStore("state").put(backup);

    // A malformed key never clears its last valid current-domain store.
    if (raw.history !== undefined && !invalidKeys.includes("history")) {
      replaceLegacyRecords(transaction, "sessions", transformed.sessions);
      replaceProgressRecords(transaction, transformed.progress);
    }
    if (
      raw.historicalCollection !== undefined &&
      !invalidKeys.includes("historicalCollection")
    ) {
      replaceLegacyRecords(
        transaction,
        "historicalCollection",
        transformed.historicalCollection.map((item) => ({
          id: `legacy:${item.id}`,
          entityId: item.id,
          source: "legacy-v1",
          value: item.value,
        })),
      );
    }
    if (raw.preferences !== undefined && !invalidKeys.includes("preferences")) {
      replaceLegacyRecords(transaction, "preferences", [
        { id: "legacy-v1", source: "legacy-v1", value: parsed.preferences ?? {} },
      ]);
    }
    if (raw.achievements !== undefined && !invalidKeys.includes("achievements")) {
      replaceLegacyRecords(
        transaction,
        "achievements",
        transformed.achievements.map((item) => ({
          id: `legacy:${item.id}`,
          achievementId: item.id,
          source: "legacy-v1",
          unlockedAt: item.unlockedAt,
        })),
      );
    }

    transaction.objectStore("state").put({
      id: SNAPSHOT_ID,
      kind: "migration-meta",
      migrationVersion: LEGACY_MIGRATION_VERSION,
      fingerprint: source.all,
      keyFingerprints: source.values,
      invalidKeys,
      warnings,
      rawBackupId: backupId,
      importedAt: now,
    } satisfies MigrationMeta);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function migrateLegacyProgress(): Promise<LegacyProfile> {
  const raw: RawLegacyValues = {};
  try {
    for (const [key, storageKey] of Object.entries(LEGACY_KEYS) as [
      LegacyKey,
      string,
    ][]) {
      const value = localStorage.getItem(storageKey);
      if (value !== null) raw[key] = value;
    }
  } catch {
    return { ...emptyProfile(), status: "unavailable" };
  }

  if (!Object.keys(raw).length) return emptyProfile();
  const { parsed, invalidKeys, warnings: parseWarnings } = parseLegacy(raw);
  const transformed = transformLegacy(parsed);
  const warnings = [...parseWarnings, ...transformed.warnings];
  const summary = summarize(parsed, invalidKeys, warnings);

  try {
    const [database, source] = await Promise.all([
      openDatabase(),
      fingerprints(raw),
    ]);
    const current = await readMeta(database);
    if (
      current?.migrationVersion === LEGACY_MIGRATION_VERSION &&
      current.fingerprint === source.all
    ) {
      database.close();
      return {
        detected: true,
        migrated: true,
        status: "current",
        ...summary,
      };
    }

    await commitMigration(
      database,
      raw,
      source,
      parsed,
      invalidKeys,
      warnings,
      transformed,
    );
    database.close();
    return {
      detected: true,
      migrated: true,
      status: "imported",
      ...summary,
    };
  } catch {
    return {
      detected: true,
      migrated: false,
      status: "unavailable",
      ...summary,
    };
  }
}