// O progresso de cada conta no servidor (sincronização entre aparelhos; as regras puras estão em ../src/domain/account-sync.ts, que o aparelho usa igual). Um arquivo por jogador
// em .pvp-data/sync/<id do jogador>.json (fora do git): as linhas (sessões, livro-caixa, conquistas…) por id, os TOTAIS dos contadores (cartas e estoque) e, por aparelho,
// o último delta aplicado. Cada aparelho manda só o que jogou desde a última vez; o servidor soma, e o delta de um aparelho com o MESMO número (`seq`) nunca é somado duas
// vezes, então repetir um pedido que a rede perdeu é seguro.
//
// `epoch` nasce junto com o arquivo. Se o arquivo se perder (apagado, ilegível), nasce outro com `epoch` novo: o aparelho vê a troca e reenvia TUDO o que tem como se fosse a
// primeira vez, em vez de mandar só um delta pequeno que deixaria a conta menor que o aparelho. Arquivo ilegível é guardado ao lado, nunca sobrescrito.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  SYNC_LIMITS, SYNC_ROW_STORES, addCounters, diffManifests, emptyCounters, emptyRows, isEmptyCounters, manifestOf, mergeRow, parseCounters,
  type CounterState, type Manifest, type SyncRow, type SyncRowStore, type SyncRows,
} from "../src/domain/account-sync.js";
import { isPlayerId } from "./pvp-players.js";
import { PvpError } from "./pvp-rooms.js";

export const ACCOUNT_DATA_VERSION = 1;
export const isDeviceId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
// As mesmas preferências leves que o backup leva (tema, ritmo…): entram na conta só se a conta ainda não tem a chave.
const LOCAL_KEY = /^carta-(theme|pace|round-tier|flag-direction|reduced-motion|timer-late|last-variant:.+)$/;

type Stored = {
  version: number;
  epoch: string;
  rev: number;
  updatedAt: number;
  rows: Record<SyncRowStore, Record<string, SyncRow>>;
  totals: CounterState;
  applied: Record<string, number>;
  local: Record<string, string>;
};
type Entry = { data: Stored; bytes: number; dirty: boolean };

/** `hasProgress`: a conta já tem contadores de cartas (decide se o primeiro envio de um aparelho com progresso precisa perguntar "somar ou usar o da conta"). */
export type SyncPlan = { epoch: string; rev: number; hasProgress: boolean; hasData: boolean; need: Record<SyncRowStore, string[]>; rows: SyncRows; local: Record<string, string> };
export type CommitResult = { epoch: string; rev: number; applied: boolean; totals: CounterState; local: Record<string, string> };

const newStored = (now: number): Stored => ({
  version: ACCOUNT_DATA_VERSION, epoch: randomBytes(8).toString("hex"), rev: 0, updatedAt: now,
  rows: Object.fromEntries(SYNC_ROW_STORES.map((store) => [store, {}])) as Stored["rows"], totals: emptyCounters(), applied: {}, local: {},
});

function readStored(raw: unknown, now: number): Stored | null {
  if (!raw || typeof raw !== "object") return null;
  const file = raw as Partial<Stored>;
  if (file.version !== ACCOUNT_DATA_VERSION || typeof file.epoch !== "string" || !file.epoch || !file.rows || typeof file.rows !== "object") return null;
  const stored = newStored(now);
  stored.epoch = file.epoch;
  stored.rev = typeof file.rev === "number" && Number.isFinite(file.rev) ? file.rev : 0;
  stored.updatedAt = typeof file.updatedAt === "number" ? file.updatedAt : now;
  for (const store of SYNC_ROW_STORES) {
    const map = (file.rows as Record<string, unknown>)[store];
    if (!map || typeof map !== "object") continue;
    for (const [id, row] of Object.entries(map as Record<string, unknown>)) if (row && typeof row === "object" && (row as SyncRow).id === id) stored.rows[store][id] = row as SyncRow;
  }
  const totals = parseCounters(file.totals);
  if (!totals) return null;
  stored.totals = totals;
  for (const [device, seq] of Object.entries((file.applied ?? {}) as Record<string, unknown>)) if (isDeviceId(device) && typeof seq === "number" && Number.isFinite(seq)) stored.applied[device] = seq;
  for (const [key, value] of Object.entries((file.local ?? {}) as Record<string, unknown>)) if (LOCAL_KEY.test(key) && typeof value === "string" && value.length <= 60) stored.local[key] = value;
  return stored;
}

export class AccountData {
  private cache = new Map<string, Entry>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** `dir` guarda um arquivo por jogador entre reinícios; sem ele, tudo fica só na memória (testes). */
  constructor(private dir: string | null = null, private now: () => number = Date.now) {
    if (dir) mkdirSync(dir, { recursive: true });
  }

  private fileOf(playerId: string) { return this.dir ? join(this.dir, `${playerId}.json`) : null; }

  private entry(playerId: string): Entry {
    if (!isPlayerId(playerId)) throw new PvpError("bad_request", "Jogador inválido.");
    const cached = this.cache.get(playerId);
    if (cached) return cached;
    let data: Stored | null = null;
    const file = this.fileOf(playerId);
    if (file && existsSync(file)) {
      try { data = readStored(JSON.parse(readFileSync(file, "utf8")), this.now()); } catch { data = null; }
      if (!data) {
        const aside = `${file}.ilegivel-${this.now()}.json`;
        try { renameSync(file, aside); console.error(`[pvp] ${file} ilegível; guardado em ${aside}`); } catch { /* sem permissão: segue como se fosse novo */ }
      }
    }
    const fresh = !data;
    const entry: Entry = { data: data ?? newStored(this.now()), bytes: 0, dirty: false };
    entry.bytes = JSON.stringify(entry.data).length;
    entry.dirty = fresh && Boolean(file); // um arquivo novo (ou refeito) é gravado na hora certa, junto da primeira mudança
    this.cache.set(playerId, entry);
    return entry;
  }

  /** O resumo do que a conta tem (para o aparelho decidir o que mandar e o que receber). */
  manifestOf(playerId: string): Manifest {
    const { data } = this.entry(playerId);
    return manifestOf(Object.fromEntries(SYNC_ROW_STORES.map((store) => [store, Object.values(data.rows[store])])) as unknown as SyncRows);
  }

  /** Compara o resumo do aparelho com o da conta: o que a conta pede (`need`) e as linhas que o aparelho não tem (`rows`). */
  plan(playerId: string, device: Manifest): SyncPlan {
    const { data } = this.entry(playerId);
    const mine = this.manifestOf(playerId);
    const { send, receive } = diffManifests(mine, device); // "send" = o que a conta tem a mais; "receive" = o que o aparelho tem a mais
    const rows = emptyRows();
    for (const store of SYNC_ROW_STORES) for (const id of send[store]) rows[store].push(data.rows[store][id]);
    const hasProgress = Object.keys(data.totals.progress).length > 0;
    return { epoch: data.epoch, rev: data.rev, hasProgress, hasData: hasProgress || SYNC_ROW_STORES.some((store) => Object.keys(data.rows[store]).length > 0), need: receive, rows, local: { ...data.local } };
  }

  /** Junta linhas do aparelho às da conta (união por id; só vence a de maior carimbo). Devolve quantas entraram ou foram atualizadas. */
  pushRows(playerId: string, rows: SyncRows): { rev: number; changed: number } {
    const entry = this.entry(playerId);
    const incomingBytes = SYNC_ROW_STORES.reduce((sum, store) => sum + rows[store].reduce((s, row) => s + JSON.stringify(row).length, 0), 0);
    if (entry.bytes + incomingBytes > SYNC_LIMITS.accountBytes) throw new PvpError("too_many", "A conta atingiu o limite de dados guardados.");
    let changed = 0;
    for (const store of SYNC_ROW_STORES) for (const row of rows[store]) {
      const winner = mergeRow(store, entry.data.rows[store][row.id], row);
      if (!winner) continue;
      entry.data.rows[store][row.id] = winner;
      changed += 1;
    }
    if (changed) { entry.bytes += incomingBytes; this.touch(entry); }
    return { rev: entry.data.rev, changed };
  }

  /** Soma o delta de um aparelho (uma vez por `seq`) e devolve os totais da conta. `seq` 0 / delta vazio só lê os totais. */
  commit(playerId: string, deviceId: string, seq: number, delta: CounterState, local: Record<string, string> = {}): CommitResult {
    const entry = this.entry(playerId);
    if (!isDeviceId(deviceId)) throw new PvpError("bad_request", "Aparelho inválido.");
    let applied = false;
    if (!Number.isInteger(seq) || seq < 0) throw new PvpError("bad_request", "Número de envio inválido.");
    if (seq > (entry.data.applied[deviceId] ?? 0)) {
      if (!isEmptyCounters(delta)) {
        entry.data.totals = addCounters(entry.data.totals, delta);
        applied = true;
      }
      entry.data.applied[deviceId] = seq;
      this.touch(entry);
    }
    let localChanged = false;
    for (const [key, value] of Object.entries(local)) {
      if (LOCAL_KEY.test(key) && typeof value === "string" && value.length <= 60 && entry.data.local[key] === undefined) { entry.data.local[key] = value; localChanged = true; }
    }
    if (localChanged) this.touch(entry);
    return { epoch: entry.data.epoch, rev: entry.data.rev, applied, totals: entry.data.totals, local: { ...entry.data.local } };
  }

  private touch(entry: Entry) {
    entry.data.rev += 1;
    entry.data.updatedAt = this.now();
    entry.dirty = true;
    this.scheduleSave();
  }

  /** Grava agora tudo o que mudou (o desligamento do servidor chama isto). */
  flush() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (!this.dir) return;
    for (const [playerId, entry] of this.cache) {
      if (!entry.dirty) continue;
      mkdirSync(this.dir, { recursive: true }); // a pasta pode ter sido apagada com o servidor de pé
      const file = this.fileOf(playerId) as string;
      const temporary = `${file}.tmp`;
      writeFileSync(temporary, JSON.stringify(entry.data), "utf8");
      renameSync(temporary, file);
      entry.dirty = false;
    }
  }

  private scheduleSave() {
    if (!this.dir || this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; try { this.flush(); } catch { /* disco cheio ou sem permissão: segue na memória */ } }, 3000);
    this.saveTimer.unref?.();
  }
}
