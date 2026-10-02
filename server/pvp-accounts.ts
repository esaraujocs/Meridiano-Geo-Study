// Contas (usuário + senha) do PvP: o que faltava para a mesma pessoa jogar de vários aparelhos. A conta é só uma ligação "usuário → id de jogador"; a identidade em si
// (id + segredo por aparelho) continua em ./pvp-players.ts. Quem entra com usuário e senha ganha um segredo NOVO daquele aparelho (sorteado por ele, ver
// PlayerRegistry.addDevice), então sair num aparelho revoga só o segredo dele.
//
// Senha: nunca guardada nem registrada; fica só o hash `scrypt` (do próprio Node, sem dependência) com sal próprio. Contas em .pvp-data/accounts.json (fora do git),
// versão 1: { "version": 1, "accounts": { "<usuário em minúsculas>": { username, salt, hash, playerId, createdAt, lastLogin } } }, gravado como os outros arquivos
// (temporário + rename, 2 s depois da última mudança). Arquivo ilegível é guardado ao lado e o servidor começa sem contas, em vez de sobrescrevê-lo.
//
// Tentativas: o servidor está aberto na internet (Tailscale Funnel), então erro de senha é contado por USUÁRIO (vale mesmo que o atacante troque de IP) e por IP
// (do cabeçalho do proxy, melhor esforço); passou do limite, trava por uma janela de tempo. Custo conhecido: quem digita o usuário de outra pessoa errando a senha
// seis vezes trava esse usuário por alguns minutos. Aceito para um jogo de amigos; sem e-mail não há outro jeito de reabrir a conta, então a trava expira sozinha.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isPlayerId } from "./pvp-players.js";
import { usernameKey, usernameProblem } from "../src/domain/pvp-account.js";

export const ACCOUNTS_FILE_VERSION = 1;
export type AccountRow = { username: string; salt: string; hash: string; playerId: string; createdAt: number; lastLogin: number };

const KEY_LENGTH = 64;
// N=16384 (o padrão do Node) usa uns 16 MB e leva algumas dezenas de ms: barato para entrar, caro para quem tenta milhões de senhas.
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const hashPassword = (password: string, salt: Buffer) => new Promise<Buffer>((resolve, reject) => {
  // NFKC: o mesmo texto digitado de dois teclados/aparelhos (acento composto ou decomposto) dá a mesma senha.
  scryptCallback(password.normalize("NFKC"), salt, KEY_LENGTH, SCRYPT, (error, key) => (error ? reject(error) : resolve(key)));
});

export const USER_ATTEMPTS = 6; // erros de senha por usuário…
export const IP_ATTEMPTS = 30; // …e por IP (mais folgado: vários amigos podem sair do mesmo Wi-Fi)
export const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
export const REGISTER_PER_HOUR = 10; // contas criadas por IP

/** Contador de eventos por chave dentro de uma janela de tempo (tudo em memória: reiniciar o servidor zera, o que só ajuda quem errou). */
class Window {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number, private now: () => number) {}
  private fresh(key: string) {
    const cutoff = this.now() - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((at) => at > cutoff);
    if (list.length) this.hits.set(key, list); else this.hits.delete(key);
    return list;
  }
  /** Quanto falta para a chave sair da trava (0 se não está travada). */
  lockedFor(key: string): number {
    const list = this.fresh(key);
    return list.length >= this.max ? Math.max(1, list[list.length - this.max] + this.windowMs - this.now()) : 0;
  }
  hit(key: string) {
    const list = this.fresh(key);
    list.push(this.now());
    this.hits.set(key, list);
    if (this.hits.size > 5000) for (const other of [...this.hits.keys()].slice(0, 1000)) this.fresh(other); // varre as mais antigas: a memória não cresce sem fim
  }
  clear(key: string) { this.hits.delete(key); }
}

export type RegisterResult = "ok" | "taken" | "has_account";

export class AccountRegistry {
  private accounts = new Map<string, AccountRow>(); // chave: usuário em minúsculas
  private byPlayer = new Map<string, string>(); // id do jogador → chave
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private failedByUser: Window;
  private failedByIp: Window;
  private registered: Window;
  // Hash de uma senha qualquer, para o login de usuário que não existe gastar o mesmo tempo de um que existe (sem isso o tempo de resposta entregaria quais usuários existem).
  private decoy: Promise<Buffer>;

  /** `file` (JSON) guarda as contas entre reinícios; sem ele, tudo fica só na memória (testes). */
  constructor(private file: string | null = null, private now: () => number = Date.now) {
    this.failedByUser = new Window(USER_ATTEMPTS, ATTEMPT_WINDOW_MS, now);
    this.failedByIp = new Window(IP_ATTEMPTS, ATTEMPT_WINDOW_MS, now);
    this.registered = new Window(REGISTER_PER_HOUR, 60 * 60 * 1000, now);
    this.decoy = hashPassword("decoy", Buffer.alloc(16, 1));
    this.decoy.catch(() => undefined);
    if (!file || !existsSync(file)) return;
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(file, "utf8")); }
    catch (error) {
      const aside = `${file}.ilegivel-${this.now()}.json`;
      try { renameSync(file, aside); console.error(`[pvp] accounts.json ilegível; guardado em ${aside}:`, error); } catch { /* sem permissão: segue sem arquivo */ }
      return;
    }
    for (const [key, row] of readAccountsFile(raw, this.now())) {
      if (this.byPlayer.has(row.playerId)) continue; // dois usuários para o mesmo jogador (arquivo mexido à mão): vale o primeiro
      this.accounts.set(key, row);
      this.byPlayer.set(row.playerId, key);
    }
  }

  get size() { return this.accounts.size; }
  /** O usuário (como foi escrito) da conta deste jogador, ou null. */
  usernameOf(playerId: string): string | null {
    const key = this.byPlayer.get(playerId);
    return key ? this.accounts.get(key)?.username ?? null : null;
  }

  // ---- Limites ----
  /** Milissegundos até poder tentar entrar de novo (0 = pode). */
  loginLockedFor(username: string, ip: string): number {
    return Math.max(this.failedByUser.lockedFor(usernameKey(username)), this.failedByIp.lockedFor(ip));
  }
  noteLoginFailure(username: string, ip: string) { this.failedByUser.hit(usernameKey(username)); this.failedByIp.hit(ip); }
  noteLoginSuccess(username: string) { this.failedByUser.clear(usernameKey(username)); }
  registerLockedFor(ip: string): number { return this.registered.lockedFor(ip); }
  noteRegister(ip: string) { this.registered.hit(ip); }

  // ---- Operações (o chamador valida o formato do usuário e da senha antes: ver ../src/domain/pvp-account.ts) ----
  async register(playerId: string, username: string, password: string): Promise<RegisterResult> {
    const key = usernameKey(username);
    if (this.byPlayer.has(playerId)) return "has_account";
    if (this.accounts.has(key)) return "taken";
    const salt = randomBytes(16);
    const hash = await hashPassword(password, salt);
    // o hash é assíncrono: dois pedidos iguais podem ter passado pelo teste acima ao mesmo tempo
    if (this.byPlayer.has(playerId)) return "has_account";
    if (this.accounts.has(key)) return "taken";
    const now = this.now();
    this.accounts.set(key, { username, salt: salt.toString("hex"), hash: hash.toString("hex"), playerId, createdAt: now, lastLogin: now });
    this.byPlayer.set(playerId, key);
    this.scheduleSave();
    return "ok";
  }

  /** O id do jogador da conta, se usuário e senha batem (null senão; não diz qual dos dois errou). */
  async login(username: string, password: string): Promise<string | null> {
    const row = this.accounts.get(usernameKey(username));
    const expected = row ? Buffer.from(row.hash, "hex") : await this.decoy;
    const given = await hashPassword(password, row ? Buffer.from(row.salt, "hex") : Buffer.alloc(16, 1));
    const match = expected.length === given.length && timingSafeEqual(expected, given);
    if (!row || !match) return null;
    row.lastLogin = this.now();
    this.scheduleSave();
    return row.playerId;
  }

  /** Troca a senha de quem já está identificado (o chamador confere o id/segredo antes). Falso se a senha atual não bate. */
  async changePassword(playerId: string, current: string, next: string): Promise<boolean> {
    const key = this.byPlayer.get(playerId);
    const row = key ? this.accounts.get(key) : undefined;
    if (!row) return false;
    const given = await hashPassword(current, Buffer.from(row.salt, "hex"));
    const expected = Buffer.from(row.hash, "hex");
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    const salt = randomBytes(16);
    row.salt = salt.toString("hex");
    row.hash = (await hashPassword(next, salt)).toString("hex");
    this.scheduleSave();
    return true;
  }

  /** Grava agora (o desligamento do servidor chama isto). */
  flush() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify({ version: ACCOUNTS_FILE_VERSION, accounts: Object.fromEntries(this.accounts) }), "utf8");
    renameSync(temporary, this.file);
  }

  private scheduleSave() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; try { this.flush(); } catch { /* disco cheio ou sem permissão: segue na memória */ } }, 2000);
    this.saveTimer.unref?.();
  }
}

const isHex = (value: unknown, bytes: number): value is string => typeof value === "string" && new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value);

/** Lê o conteúdo do arquivo de contas e devolve só as linhas válidas (formato do usuário, sal e hash do tamanho certo, id de jogador plausível). */
export function readAccountsFile(raw: unknown, now = Date.now()): [string, AccountRow][] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const top = raw as Record<string, unknown>;
  if (top.version !== ACCOUNTS_FILE_VERSION || !top.accounts || typeof top.accounts !== "object") return [];
  const rows: [string, AccountRow][] = [];
  for (const value of Object.values(top.accounts as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    if (typeof row.username !== "string" || usernameProblem(row.username) || !isHex(row.salt, 16) || !isHex(row.hash, KEY_LENGTH) || !isPlayerId(row.playerId)) continue;
    const at = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : now);
    rows.push([usernameKey(row.username), { username: row.username, salt: row.salt, hash: row.hash, playerId: row.playerId, createdAt: at(row.createdAt), lastLogin: at(row.lastLogin) }]);
  }
  return rows;
}
