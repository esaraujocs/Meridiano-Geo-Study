// Conta ao vivo (22/10/2026, pedido do Enzo: "o conceito de conta era para ser centralizado no servidor; quando eu logo no celular a conta tem que
// carregar os dados ao vivo; não existe isso de ficar apertando botão para sincronizar"). O servidor é a fonte da verdade e o aparelho é o cache:
//  - toda gravação local que importa (partida, compra, conquista, preferência) agenda uma sincronização logo depois (`requestAccountSync`);
//  - o servidor avisa pelo canal do jogador quando a conta muda (evento "account", de outro aparelho) e o aparelho busca a diferença na hora;
//  - ao abrir, ao voltar para a aba e quando a internet volta, sincroniza também;
//  - durante uma partida espera (uma partida pela metade não sobe) e sincroniza ao terminar;
//  - sem internet, o solo continua e fica tudo guardado; duelo valendo e compras pedem conexão (`requireConnection`).
// O motor e as regras de juntar continuam em account-sync-engine.ts / account-sync.ts.
import { runAccountSync, syncStatus } from "./account-sync-client.js";
import { hasPvpIdentity, pvpAccountName, pvpIdentity } from "./pvp-client.js";
import { deviceId } from "./progress-backup.js";

/** As lojas que vão para a conta: uma gravação nelas agenda a sincronização. */
const SYNCED_STORES = new Set(["sessions", "progress", "ledger", "unlocks", "achievements", "historicalCollection", "preferences"]);
/** Espera depois de uma gravação (junta várias gravações seguidas num envio só). */
export const WRITE_DELAY_MS = 1200;
/** Sem resposta da conta: tenta de novo com espera crescente até este teto. */
export const RETRY_MAX_MS = 60_000;

export type LiveState = "off" | "saved" | "saving" | "offline" | "error";
let state: LiveState = "off";
let detail = "";
const setState = (next: LiveState, message = "") => {
  if (next === state && message === detail) return;
  state = next; detail = message;
  window.dispatchEvent(new CustomEvent("carta-live", { detail: { state, detail } }));
};
export const liveState = () => ({ state, detail });

/** Marca a conexão do IndexedDB que a própria sincronização usa: as gravações dela não agendam outra sincronização. */
export const markSyncConnection = (db: IDBDatabase) => { (db as IDBDatabase & { __cartaSync?: boolean }).__cartaSync = true; return db; };

let watching = false;
/** Ouve as gravações locais: toda transação de escrita numa loja da conta que termina dispara "carta-local-write". Uma vez só, no navegador. */
export function watchLocalWrites() {
  if (watching || typeof IDBDatabase === "undefined") return;
  watching = true;
  const proto = IDBDatabase.prototype;
  const original = proto.transaction;
  proto.transaction = function patched(this: IDBDatabase & { __cartaSync?: boolean }, stores: string | string[], mode?: IDBTransactionMode, options?: IDBTransactionOptions) {
    const tx = original.call(this, stores, mode, options);
    if (mode === "readwrite" && !this.__cartaSync) {
      const names = typeof stores === "string" ? [stores] : [...stores];
      if (names.some((name) => SYNCED_STORES.has(name))) tx.addEventListener("complete", () => window.dispatchEvent(new Event("carta-local-write")));
    }
    return tx;
  } as typeof proto.transaction;
}

// Uma partida (ou a tela dela) aberta: a sincronização espera (a partida sobe inteira ao terminar).
const inGame = () => typeof document !== "undefined" && Boolean(document.querySelector(".gs, .gs-app, .rv-page"));
const connected = () => typeof navigator === "undefined" || navigator.onLine !== false;

let timer: number | undefined;
let running = false;
let again = false;
let failures = 0;
let lastRev = 0;

/** Agenda uma sincronização (as próximas chamadas antes dela só a antecipam). Sem conta, nada. */
export function requestAccountSync(delayMs = WRITE_DELAY_MS) {
  if (!pvpAccountName() || !hasPvpIdentity()) { setState("off"); return; }
  if (running) { again = true; return; }
  if (timer !== undefined) window.clearTimeout(timer);
  timer = window.setTimeout(() => { timer = undefined; void tick(); }, Math.max(0, delayMs));
}

async function tick() {
  if (!pvpAccountName() || !hasPvpIdentity()) { setState("off"); return; }
  if (inGame()) { requestAccountSync(4000); return; }
  if (!connected()) { setState("offline"); return; }
  running = true;
  setState("saving");
  const outcome = await runAccountSync();
  running = false;
  if (outcome.status === "ok") {
    failures = 0;
    lastRev = Math.max(lastRev, outcome.rev);
    setState("saved");
    if (outcome.changedFromAccount) window.dispatchEvent(new CustomEvent("carta-account-updated", { detail: outcome }));
  } else if (outcome.status === "busy") {
    again = true;
  } else if (outcome.status === "error") {
    failures += 1;
    setState(outcome.network ? "offline" : "error", outcome.network ? "" : outcome.message);
    if (timer === undefined) timer = window.setTimeout(() => { timer = undefined; void tick(); }, Math.min(RETRY_MAX_MS, 4000 * 2 ** Math.min(failures, 4)));
  } else if (outcome.status === "skipped") {
    setState("off");
  }
  if (again) { again = false; requestAccountSync(600); }
}

/** O servidor avisou que a conta mudou (revisão `rev`): busca se for mais nova que a última que este aparelho viu. */
export function onRemoteChange(rev: number) {
  const known = Math.max(lastRev, syncStatus()?.rev ?? 0);
  if (rev > known) requestAccountSync(150);
}

/** Duelo valendo e compras pedem conexão quando há conta (o servidor confere o saldo e reserva o duelo). */
export class NeedsConnectionError extends Error {
  readonly offline = true;
  constructor(message: string) { super(message); this.name = "NeedsConnectionError"; }
}
export const hasAccount = () => Boolean(pvpAccountName() && hasPvpIdentity());
export const isOnline = connected;

/** Antes de gastar moedas com conta: pede conexão e traz o que a conta tem (outro aparelho pode ter gastado). Depois da compra, `requestAccountSync(0)`. */
export async function freshAccountBeforeSpending(offlineMessage: string) {
  if (!hasAccount()) return;
  if (!connected()) throw new NeedsConnectionError(offlineMessage);
  const outcome = await runAccountSync();
  if (outcome.status === "error" && outcome.network) throw new NeedsConnectionError(offlineMessage);
}

/** Este aparelho, para a reserva do duelo (um por vez por conta). */
export const thisDevice = () => deviceId() ?? pvpIdentity()?.id ?? "aparelho";
