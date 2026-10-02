// O motor da sincronização do progresso com a conta, sem tocar em rede nem em armazenamento: quem chama dá um `LocalStore` (o IndexedDB do aparelho, ou uma versão em memória
// nos testes) e um `SyncTransport` (HTTP para o servidor, ou o servidor direto nos testes). As regras de juntar estão em ./account-sync.ts; o resumo do desenho:
//
//  1. plan:   o aparelho manda o RESUMO (id → carimbo) do que tem; o servidor responde com as linhas que faltam aqui e os ids que ele quer.
//  2. rows:   o aparelho manda essas linhas, em lotes (idempotente: repetir não muda nada).
//  3. commit: o aparelho manda o DELTA dos contadores (o que jogou desde a última vez) com um número de envio (`seq`); o servidor soma uma vez só e devolve os TOTAIS da conta.
//  4. aplicar (uma transação só no aparelho): grava as linhas recebidas, e o contador local vira TOTAL DA CONTA + o que foi jogado enquanto isso e ainda não foi enviado.
//
// O delta é escrito no aparelho ANTES de ir para a rede (`pending`): se a resposta se perde, o reenvio leva o MESMO delta com o MESMO `seq`, e o servidor não soma de novo.
// Nada do que o aparelho tem é apagado: linhas só entram, e o contador de cada carta nunca fica menor que o local (salvo no modo "usar o da conta", escolhido pela pessoa).
import {
  SYNC_ROW_STORES, addCounters, chunkRows, countRows, countersFrom, diffCounters, emptyCounters, emptyRows, isEmptyCounters, manifestOf, mergeRow, progressRowFrom,
  type CounterState, type Manifest, type ProgressCounters, type SyncRow, type SyncRowStore, type SyncRows, SUPPLY_ROW_PREFIX,
} from "./account-sync.js";
import type { ProgressRecord } from "./learning-rules.js";

export const SYNC_STATE_ID = "sync:v1";

export type SyncState = {
  id: typeof SYNC_STATE_ID;
  /** A conta (id do jogador) a que este estado pertence; outra conta no mesmo aparelho recomeça do zero (e a pessoa é avisada antes). */
  owner: string;
  deviceId: string;
  /** Qual "vida" do arquivo da conta no servidor este aparelho conhece; se mudar (arquivo refeito), o aparelho reenvia tudo. */
  epoch: string;
  /** Último número de envio já confirmado. */
  seq: number;
  /** O que o aparelho já sabia da conta (os totais devolvidos no último commit). */
  baseline: CounterState;
  /** O delta que está sendo enviado (gravado antes de ir para a rede), com o número dele. */
  pending: { seq: number; delta: CounterState } | null;
  rev: number;
  lastAt: number;
};

export type SupplyRow = { id: string; count?: unknown } & Record<string, unknown>;
export type SyncSnapshot = { rows: SyncRows; progress: ProgressRecord[]; supply: SupplyRow[]; local: Record<string, string> };

/** O que o passo de aplicar lê, de dentro da transação do aparelho. */
export type CurrentLocal = { progress: ProgressRecord[]; supply: SupplyRow[]; row: (store: SyncRowStore, id: string) => SyncRow | undefined };
export type LocalWrites = { progress: ProgressRecord[]; supply: SupplyRow[]; rows: SyncRows; state: SyncState };

export interface LocalStore {
  snapshot(): Promise<SyncSnapshot>;
  readState(): Promise<SyncState | null>;
  writeState(state: SyncState): Promise<void>;
  /** Numa transação só: lê o estado atual das cartas, do estoque e das linhas `wanted`, chama `compute` e grava o que ele devolver. */
  applyLocal(wanted: Record<SyncRowStore, string[]>, compute: (current: CurrentLocal) => LocalWrites): Promise<void>;
}

export type PlanResponse = { epoch: string; rev: number; hasProgress: boolean; hasData: boolean; need: Record<SyncRowStore, string[]>; rows: SyncRows; local: Record<string, string> };
export type CommitResponse = { epoch: string; rev: number; applied: boolean; totals: CounterState; local: Record<string, string> };
export interface SyncTransport {
  plan(manifest: Manifest): Promise<PlanResponse>;
  pushRows(rows: SyncRows): Promise<void>;
  commit(args: { deviceId: string; seq: number; delta: CounterState; local: Record<string, string> }): Promise<CommitResponse>;
}

export type SyncDeps = {
  owner: string;
  store: LocalStore;
  transport: SyncTransport;
  newDeviceId: () => string;
  now?: () => number;
  /** Linhas que o aparelho se recusa a gravar (ex.: estado de ranking de bots inválido); quem chama decide. */
  acceptRow?: (store: SyncRowStore, row: SyncRow) => boolean;
  /** Preferências leves (tema, ritmo…) que a conta tem e o aparelho ainda não tem. */
  applyLocalPrefs?: (missing: Record<string, string>) => void;
  /** Sem "mode", o primeiro envio de um aparelho com progresso para uma conta que também tem devolve "needs-choice" (e não grava nada). "sum": soma o que este aparelho jogou à conta. "adopt": nas cartas que a conta já tem vale o número DELA (o do aparelho é descartado); as que só o aparelho tem sobem normalmente. Os dois são a escolha da pessoa. */
  mode?: "sum" | "adopt";
};

export type SyncResult =
  | { status: "ok"; pushedRows: number; pulledRows: number; changedFromAccount: boolean; rev: number; firstSync: boolean; resent: boolean }
  /** Primeiro envio deste aparelho: ele tem progresso e a conta também. Somar duplica o que já tiver entrado na conta por outro caminho (backup importado), então a pessoa escolhe. */
  | { status: "needs-choice" };

const freshState = (owner: string, deviceId: string): SyncState => ({ id: SYNC_STATE_ID, owner, deviceId, epoch: "", seq: 0, baseline: emptyCounters(), pending: null, rev: 0, lastAt: 0 });

const FIELDS = ["seen", "correct"] as const;
const COLUMNS = ["bandeiras", "mapa", "capitais", "escrita"] as const;

/** Carta: nunca menor que a local (a conta soma o que jogaram; se o servidor perdeu dados, o aparelho não pode "encolher": o próximo envio repõe a conta). */
function atLeast(local: ProgressRecord | undefined, wanted: ProgressCounters): ProgressCounters {
  if (!local) return wanted;
  const columns = { ...wanted.columns };
  for (const column of COLUMNS) columns[column] = Math.max(columns[column], Math.max(0, Math.round(local.columns?.[column] ?? 0)));
  return {
    ...wanted, columns,
    seen: Math.max(wanted.seen, Math.round(local.seen) || 0), correct: Math.max(wanted.correct, Math.round(local.correct) || 0),
    latest: Math.max(wanted.latest, Math.round(local.latest) || 0),
  };
}

const sameCounters = (row: ProgressRecord | undefined, c: ProgressCounters) => Boolean(row)
  && FIELDS.every((field) => row?.[field] === c[field]) && COLUMNS.every((column) => (row?.columns?.[column] ?? 0) === c.columns[column]) && (row?.latest ?? 0) === c.latest;

export async function syncAccount(deps: SyncDeps): Promise<SyncResult> {
  const { owner, store, transport, mode } = deps;
  const now = deps.now ?? Date.now;
  const snapshot = await store.snapshot();
  const localCounters = countersFrom(snapshot.progress, snapshot.supply);
  const plan = await transport.plan(manifestOf(snapshot.rows));

  let state = await store.readState();
  let first = false; // primeira vez deste aparelho NESTA conta
  if (!state || state.owner !== owner) { state = freshState(owner, state?.deviceId ?? deps.newDeviceId()); first = true; }
  // o arquivo da conta no servidor foi refeito (epoch novo): o que o aparelho "sabia" da conta não vale mais, então ele reenvia tudo o que tem (sem perguntar: não é a primeira vez)
  else if (state.epoch !== "" && state.epoch !== plan.epoch) state = { ...state, baseline: emptyCounters(), pending: null };
  const hasLocalProgress = Object.keys(localCounters.progress).length > 0;
  if (first && mode === undefined && plan.hasProgress && hasLocalProgress) return { status: "needs-choice" };

  // 1) o delta, gravado antes de ir para a rede
  let pending = state.pending;
  const resent = pending !== null; // reenvio de um envio que não chegou a fechar: o que foi jogado depois só sobe no ciclo seguinte (ver syncUntilSettled)
  if (!pending) {
    const delta = mode === "adopt" ? emptyCounters() : diffCounters(localCounters, state.baseline);
    pending = isEmptyCounters(delta) ? null : { seq: state.seq + 1, delta };
    if (pending) { state = { ...state, pending }; await store.writeState(state); }
  }

  // 2) as linhas que a conta pediu
  const wanted = emptyRows();
  const byId = (store: SyncRowStore) => new Map(snapshot.rows[store].map((row) => [row.id, row]));
  let pushedRows = 0;
  for (const name of SYNC_ROW_STORES) {
    const rows = byId(name);
    for (const id of plan.need[name]) { const row = rows.get(id); if (row) wanted[name].push(row); }
  }
  for (const chunk of chunkRows(wanted)) { await transport.pushRows(chunk); pushedRows += countRows(chunk); }

  // 3) somar o delta na conta e ler os totais
  const commit = await transport.commit({ deviceId: state.deviceId, seq: pending?.seq ?? 0, delta: pending?.delta ?? emptyCounters(), local: snapshot.local });

  // 4) aplicar no aparelho, numa transação só
  const incoming = emptyRows();
  const pullWanted = Object.fromEntries(SYNC_ROW_STORES.map((name) => [name, plan.rows[name].map((row) => row.id)])) as Record<SyncRowStore, string[]>;
  let changedFromAccount = false;
  let pulledRows = 0;
  const sent = pending?.delta ?? emptyCounters();
  const baselineBefore = state.baseline;
  await store.applyLocal(pullWanted, (current) => {
    const progress: ProgressRecord[] = [];
    const supply: SupplyRow[] = [];
    const rows = emptyRows();
    // linhas recebidas: só entram se não existem ou se o carimbo é maior
    for (const name of SYNC_ROW_STORES) for (const row of plan.rows[name]) {
      if (deps.acceptRow && !deps.acceptRow(name, row)) continue;
      const winner = mergeRow(name, current.row(name, row.id), row);
      if (winner) { rows[name].push(winner); incoming[name].push(winner); pulledRows += 1; }
    }
    // contadores: total da conta + o que foi jogado depois do envio
    const unsent = mode === "adopt" ? emptyCounters() : diffCounters(countersFrom(current.progress, current.supply), addCounters(baselineBefore, sent));
    const next = addCounters(commit.totals, unsent);
    const localById = new Map(current.progress.map((row) => [row.id, row]));
    for (const [id, counters] of Object.entries(next.progress)) {
      const local = localById.get(id);
      const target = mode === "adopt" ? counters : atLeast(local, counters);
      if (sameCounters(local, target)) continue;
      progress.push(progressRowFrom(id, target, local));
      if (!local || target.seen > Math.round(local.seen) || target.correct > Math.round(local.correct)) changedFromAccount = true;
    }
    const supplyById = new Map(current.supply.map((row) => [row.id, row]));
    for (const [key, total] of Object.entries(next.supply)) {
      const id = `${SUPPLY_ROW_PREFIX}${key}`;
      const existing = supplyById.get(id);
      const count = Math.max(0, total);
      if (existing && Math.round(Number(existing.count) || 0) === count) continue;
      supply.push({ ...(existing ?? { source: "supply-v1" }), id, count });
      changedFromAccount = true;
    }
    if (pulledRows > 0) changedFromAccount = true;
    const state2: SyncState = { ...state, epoch: commit.epoch, seq: pending ? pending.seq : state.seq, baseline: commit.totals, pending: null, rev: commit.rev, lastAt: now() };
    return { progress, supply, rows, state: state2 };
  });
  if (deps.applyLocalPrefs) {
    const missing = Object.fromEntries(Object.entries(commit.local).filter(([key]) => snapshot.local[key] === undefined));
    if (Object.keys(missing).length) deps.applyLocalPrefs(missing);
  }
  return { status: "ok", pushedRows, pulledRows, changedFromAccount, rev: commit.rev, firstSync: first, resent };
}

/** Sincroniza e repete uma vez quando ficou algo por enviar: o reenvio de um envio antigo leva só o delta já gravado (o que foi jogado depois sobe no ciclo seguinte), e no modo
 *  "adopt" o primeiro ciclo só adota o que a conta tem (as cartas que só este aparelho tem sobem no segundo). */
export async function syncUntilSettled(deps: SyncDeps): Promise<SyncResult> {
  let result = await syncAccount(deps);
  if (result.status === "ok" && (result.resent || deps.mode === "adopt")) {
    const second = await syncAccount({ ...deps, mode: "sum" });
    if (second.status === "ok") result = { ...second, pushedRows: result.pushedRows + second.pushedRows, pulledRows: result.pulledRows + second.pulledRows, changedFromAccount: result.changedFromAccount || second.changedFromAccount, firstSync: result.firstSync };
  }
  return result;
}
