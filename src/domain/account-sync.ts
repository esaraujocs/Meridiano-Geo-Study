// Sincronização do progresso com a conta (usuário + senha, ver server/pvp-accounts.ts): as regras PURAS que o servidor (server/pvp-account-data.ts) e o aparelho
// (domain/account-sync-client.ts) compartilham. Nada aqui toca rede, IndexedDB ou localStorage.
//
// O progresso do jogo mora no IndexedDB do aparelho (lojas de progress-backup.ts). Para a conta, as lojas se dividem em três jeitos de juntar:
//  1. LINHAS (sessões, duelos, livro-caixa, conquistas, desbloqueios, coleção histórica, favoritas…): cada linha tem um id único e nasce uma vez; juntar é a união por id,
//     sem nunca apagar. Poucas linhas mudam depois de criadas; para elas vale o "carimbo" (rowStamp): maior carimbo vence, empate fica como está.
//  2. CONTADORES (a loja `progress`: acertos por carta; o estoque `supply:*` das favoritas de expedição): linhas que SOMAM. Juntar duas cópias somando duplicaria tudo a cada
//     sincronização, então cada aparelho manda só o que jogou DESDE a última vez (o delta: contadores locais − o que o aparelho já sabia da conta) e a conta soma deltas.
//     Depois o aparelho adota o total da conta + o que jogou nesse meio tempo (o que ainda não foi enviado).
//  3. `state` (marcadores de migração do próprio aparelho) NÃO sincroniza: é do aparelho.
import { masteryForProgress, type ProgressRecord } from "./learning-rules.js";

export const SYNC_ROW_STORES = ["sessions", "historicalCollection", "preferences", "achievements", "ledger", "unlocks"] as const;
export type SyncRowStore = (typeof SYNC_ROW_STORES)[number];
export type SyncRow = { id: string } & Record<string, unknown>;
export type SyncRows = Record<SyncRowStore, SyncRow[]>;
/** id → carimbo, por loja: o resumo barato do que um lado tem (o que viaja a cada sincronização em vez das linhas). */
export type Manifest = Record<SyncRowStore, Record<string, number>>;

export const SUPPLY_ROW_PREFIX = "supply:";
// Igual a BOT_RANKING_ID (bot-ranking.ts); repetido aqui para o servidor não carregar o módulo dos bots. O teste confere que continuam iguais.
export const BOT_RANKING_ROW_ID = "bot-ranking:v1";
export const SYNC_STATE_ROW_PREFIX = "sync:"; // a linha de estado da sincronização (loja `state`) nunca entra em backup nem na conta

export const SYNC_LIMITS = {
  idLength: 200,
  rowBytes: 400_000,
  rowsPerStore: 200_000,
  progressRows: 5_000,
  supplyIds: 50,
  counter: 1_000_000_000,
  timestamp: 1e14, // ms desde 1970: bem além do ano 5000
  /** Corpo máximo de um pedido de sincronização (as outras rotas do PvP aceitam 8 KB). */
  bodyBytes: 8 * 1024 * 1024,
  /** Tamanho-alvo de cada lote de linhas enviado. */
  chunkBytes: 1024 * 1024,
  /** Teto do que a conta guarda no servidor. */
  accountBytes: 120 * 1024 * 1024,
} as const;

export const emptyRows = (): SyncRows => Object.fromEntries(SYNC_ROW_STORES.map((store) => [store, []])) as unknown as SyncRows;
export const emptyManifest = (): Manifest => Object.fromEntries(SYNC_ROW_STORES.map((store) => [store, {}])) as unknown as Manifest;

export const isSyncRowStore = (value: unknown): value is SyncRowStore => typeof value === "string" && (SYNC_ROW_STORES as readonly string[]).includes(value);

/** Linha comum (sincroniza por união) ou contador (sincroniza por delta, não entra aqui)? As do estoque ficam em `preferences` mas somam. */
export const isCounterPreference = (row: { id: string }) => row.id.startsWith(SUPPLY_ROW_PREFIX);

// ───────────── linhas ─────────────

/** O carimbo de uma linha: maior vence. Quase tudo é 0 (a primeira que chegou fica). Conquista: a desbloqueada mais cedo (carimbo = −quando). Compra: o valor realmente pago
 *  (o preço antigo, mais barato, não pode "devolver" moedas). Favorita: a editada por último. Ranking dos bots: a revisão mais alta. */
export function rowStamp(store: SyncRowStore, row: SyncRow): number {
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  if (store === "achievements") return row.unlockedAt === undefined ? 0 : -number(row.unlockedAt);
  if (store === "ledger") return row.kind === "debit" ? number(row.amount) : 0;
  if (store === "preferences") {
    if (row.id === BOT_RANKING_ROW_ID) return number(row.revision);
    if (row.id.startsWith("preset:")) return number(row.updatedAt);
  }
  return 0;
}

export function manifestOf(rows: Partial<Record<SyncRowStore, readonly SyncRow[]>>): Manifest {
  const manifest = emptyManifest();
  for (const store of SYNC_ROW_STORES) for (const row of rows[store] ?? []) {
    if (store === "preferences" && isCounterPreference(row)) continue;
    manifest[store][row.id] = rowStamp(store, row);
  }
  return manifest;
}

/** Compara o resumo de um lado (`mine`) com o do outro (`theirs`): o que EU preciso mandar (o outro não tem, ou o meu carimbo é maior) e o que o OUTRO precisa me mandar. */
export function diffManifests(mine: Manifest, theirs: Manifest): { send: Record<SyncRowStore, string[]>; receive: Record<SyncRowStore, string[]> } {
  const send = Object.fromEntries(SYNC_ROW_STORES.map((store) => [store, [] as string[]])) as Record<SyncRowStore, string[]>;
  const receive = Object.fromEntries(SYNC_ROW_STORES.map((store) => [store, [] as string[]])) as Record<SyncRowStore, string[]>;
  for (const store of SYNC_ROW_STORES) {
    for (const [id, stamp] of Object.entries(mine[store])) {
      const other = theirs[store][id];
      if (other === undefined || stamp > other) send[store].push(id);
    }
    for (const [id, stamp] of Object.entries(theirs[store])) {
      const own = mine[store][id];
      if (own === undefined || stamp > own) receive[store].push(id);
    }
  }
  return { send, receive };
}

/** A linha que deve ficar quando já existe uma (`existing`) e chega outra (`incoming`): a que chega só vence se o carimbo dela for maior. */
export function mergeRow(store: SyncRowStore, existing: SyncRow | undefined, incoming: SyncRow): SyncRow | null {
  if (!existing) return incoming;
  return rowStamp(store, incoming) > rowStamp(store, existing) ? incoming : null;
}

/** Valida linhas vindas da rede: lojas conhecidas, id texto curto, tamanho razoável; ignora o que é contador. Devolve null se o formato é inválido. */
export function parseRows(value: unknown): SyncRows | null {
  if (value === undefined || value === null) return emptyRows();
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const rows = emptyRows();
  for (const [store, list] of Object.entries(value as Record<string, unknown>)) {
    if (!isSyncRowStore(store)) continue; // loja desconhecida (ou `state`/`progress`): ignorada
    if (!Array.isArray(list) || list.length > SYNC_LIMITS.rowsPerStore) return null;
    for (const item of list) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as SyncRow;
      if (typeof row.id !== "string" || !row.id || row.id.length > SYNC_LIMITS.idLength) return null;
      if (store === "preferences" && isCounterPreference(row)) continue;
      if (JSON.stringify(row).length > SYNC_LIMITS.rowBytes) return null;
      rows[store].push(row);
    }
  }
  return rows;
}

export function parseManifest(value: unknown): Manifest | null {
  if (value === undefined || value === null) return emptyManifest();
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const manifest = emptyManifest();
  for (const [store, entries] of Object.entries(value as Record<string, unknown>)) {
    if (!isSyncRowStore(store)) continue;
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) return null;
    const pairs = Object.entries(entries as Record<string, unknown>);
    if (pairs.length > SYNC_LIMITS.rowsPerStore) return null;
    for (const [id, stamp] of pairs) {
      if (!id || id.length > SYNC_LIMITS.idLength || typeof stamp !== "number" || !Number.isFinite(stamp)) return null;
      manifest[store][id] = stamp;
    }
  }
  return manifest;
}

/** Divide linhas em lotes de ~`limit` bytes (uma linha maior que o limite vai sozinha). */
export function chunkRows(rows: SyncRows, limit: number = SYNC_LIMITS.chunkBytes): SyncRows[] {
  const chunks: SyncRows[] = [];
  let current = emptyRows();
  let size = 0;
  let count = 0;
  for (const store of SYNC_ROW_STORES) for (const row of rows[store]) {
    const bytes = JSON.stringify(row).length;
    if (count > 0 && size + bytes > limit) { chunks.push(current); current = emptyRows(); size = 0; count = 0; }
    current[store].push(row);
    size += bytes;
    count += 1;
  }
  if (count > 0) chunks.push(current);
  return chunks;
}

export const countRows = (rows: Partial<Record<SyncRowStore, readonly unknown[]>>) => SYNC_ROW_STORES.reduce((sum, store) => sum + (rows[store]?.length ?? 0), 0);

// ───────────── contadores ─────────────

export type ProgressCounters = {
  entityId?: string;
  source: string;
  seen: number;
  correct: number;
  columns: { bandeiras: number; mapa: number; capitais: number; escrita: number };
  latest: number;
};
export type CounterState = { progress: Record<string, ProgressCounters>; supply: Record<string, number> };

export const emptyCounters = (): CounterState => ({ progress: {}, supply: {} });
export const zeroCounters = (): ProgressCounters => ({ source: "current-v2", seen: 0, correct: 0, columns: { bandeiras: 0, mapa: 0, capitais: 0, escrita: 0 }, latest: 0 });
const COLUMNS = ["bandeiras", "mapa", "capitais", "escrita"] as const;

const int = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0);

function countersOfRow(row: ProgressRecord): ProgressCounters {
  return {
    ...(row.entityId !== undefined ? { entityId: String(row.entityId) } : {}),
    source: typeof row.source === "string" ? row.source : "current-v2",
    seen: Math.max(0, int(row.seen)),
    correct: Math.max(0, int(row.correct)),
    columns: Object.fromEntries(COLUMNS.map((column) => [column, Math.max(0, int(row.columns?.[column]))])) as ProgressCounters["columns"],
    latest: Math.max(0, int(row.latest)),
  };
}

/** Os contadores deste aparelho: um por carta da loja `progress` e um por item de estoque (`supply:<id>`, campo `count`). */
export function countersFrom(progressRows: readonly ProgressRecord[], supplyRows: readonly { id: string; count?: unknown }[]): CounterState {
  const state = emptyCounters();
  for (const row of progressRows) state.progress[row.id] = countersOfRow(row);
  for (const row of supplyRows) if (row.id.startsWith(SUPPLY_ROW_PREFIX)) state.supply[row.id.slice(SUPPLY_ROW_PREFIX.length)] = Math.max(0, int(row.count));
  return state;
}

const isZero = (c: ProgressCounters) => c.seen === 0 && c.correct === 0 && COLUMNS.every((column) => c.columns[column] === 0);

/** `a − b`: o que `a` tem a mais. Cartas só crescem (diferença negativa vira 0: um "zerar" no aparelho não derruba o total da conta); o estoque pode ter diminuído (uso). */
export function diffCounters(a: CounterState, b: CounterState): CounterState {
  const out = emptyCounters();
  for (const [id, now] of Object.entries(a.progress)) {
    const before = b.progress[id] ?? zeroCounters();
    const diff: ProgressCounters = {
      ...(now.entityId !== undefined ? { entityId: now.entityId } : {}), source: now.source,
      seen: Math.max(0, now.seen - before.seen), correct: Math.max(0, now.correct - before.correct),
      columns: Object.fromEntries(COLUMNS.map((column) => [column, Math.max(0, now.columns[column] - before.columns[column])])) as ProgressCounters["columns"],
      latest: now.latest,
    };
    if (!isZero(diff)) out.progress[id] = diff;
  }
  for (const [id, now] of Object.entries(a.supply)) {
    const change = now - (b.supply[id] ?? 0);
    if (change !== 0) out.supply[id] = change;
  }
  return out;
}

/** `a + b` (o `latest` fica com o maior). Não altera as entradas. */
export function addCounters(a: CounterState, b: CounterState): CounterState {
  const out: CounterState = { progress: {}, supply: { ...a.supply } };
  for (const [id, value] of Object.entries(a.progress)) out.progress[id] = { ...value, columns: { ...value.columns } };
  for (const [id, add] of Object.entries(b.progress)) {
    const base = out.progress[id];
    if (!base) { out.progress[id] = { ...add, columns: { ...add.columns } }; continue; }
    base.seen += add.seen;
    base.correct += add.correct;
    for (const column of COLUMNS) base.columns[column] += add.columns[column];
    base.latest = Math.max(base.latest, add.latest);
    if (base.entityId === undefined && add.entityId !== undefined) base.entityId = add.entityId;
  }
  for (const [id, add] of Object.entries(b.supply)) out.supply[id] = (out.supply[id] ?? 0) + add;
  return out;
}

export const isEmptyCounters = (c: CounterState) => Object.keys(c.progress).length === 0 && Object.keys(c.supply).length === 0;

/** Valida contadores vindos da rede (números inteiros e limitados); null se o formato é inválido. */
export function parseCounters(value: unknown): CounterState | null {
  if (value === undefined || value === null) return emptyCounters();
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as { progress?: unknown; supply?: unknown };
  const out = emptyCounters();
  if (raw.progress !== undefined) {
    if (!raw.progress || typeof raw.progress !== "object" || Array.isArray(raw.progress)) return null;
    const entries = Object.entries(raw.progress as Record<string, unknown>);
    if (entries.length > SYNC_LIMITS.progressRows) return null;
    for (const [id, item] of entries) {
      if (!id || id.length > SYNC_LIMITS.idLength || !item || typeof item !== "object") return null;
      const c = item as Partial<ProgressCounters>;
      const columns = (c.columns ?? {}) as Partial<ProgressCounters["columns"]>;
      const counts = [c.seen, c.correct, ...COLUMNS.map((column) => columns[column])];
      if (counts.some((n) => n !== undefined && (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > SYNC_LIMITS.counter))) return null;
      // `latest` é um instante em milissegundos (1,79 × 10¹² hoje), não um contador: o limite é outro
      if (c.latest !== undefined && (typeof c.latest !== "number" || !Number.isFinite(c.latest) || c.latest < 0 || c.latest > SYNC_LIMITS.timestamp)) return null;
      out.progress[id] = {
        ...(typeof c.entityId === "string" && c.entityId.length <= SYNC_LIMITS.idLength ? { entityId: c.entityId } : {}),
        source: typeof c.source === "string" && c.source.length <= 40 ? c.source : "current-v2",
        seen: int(c.seen), correct: int(c.correct), latest: int(c.latest),
        columns: Object.fromEntries(COLUMNS.map((column) => [column, int(columns[column])])) as ProgressCounters["columns"],
      };
    }
  }
  if (raw.supply !== undefined) {
    if (!raw.supply || typeof raw.supply !== "object" || Array.isArray(raw.supply)) return null;
    const entries = Object.entries(raw.supply as Record<string, unknown>);
    if (entries.length > SYNC_LIMITS.supplyIds) return null;
    for (const [id, amount] of entries) {
      if (!id || id.length > 40 || typeof amount !== "number" || !Number.isFinite(amount) || Math.abs(amount) > SYNC_LIMITS.counter) return null;
      out.supply[id] = Math.round(amount);
    }
  }
  return out;
}

/** A linha de `progress` a gravar para uns contadores: mantém os outros campos da linha que já existe (`base`) e recalcula a maestria. */
export function progressRowFrom(id: string, counters: ProgressCounters, base?: ProgressRecord): ProgressRecord {
  const columns: ProgressRecord["columns"] = {
    bandeiras: counters.columns.bandeiras, mapa: counters.columns.mapa, capitais: counters.columns.capitais,
    // "escrita" só aparece se já existia ou se tem valor (as cartas antigas não tinham essa coluna)
    ...(counters.columns.escrita > 0 || base?.columns?.escrita !== undefined ? { escrita: counters.columns.escrita } : {}),
  };
  const row: ProgressRecord = {
    ...(base ?? { id, source: counters.source }),
    id,
    ...(counters.entityId !== undefined ? { entityId: counters.entityId } : {}),
    seen: counters.seen,
    correct: counters.correct,
    columns,
    latest: Math.max(counters.latest, base?.latest ?? 0),
    mastery: 0,
  };
  row.mastery = masteryForProgress(row);
  return row;
}
