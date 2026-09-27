// Identidade dos jogadores do PvP, sem login: cada aparelho sorteia um id e um segredo; o servidor guarda só o hash do segredo (na primeira vez que vê o id, registra).
// Depois, quem apresenta o segredo certo é a mesma pessoa. É o ponto de partida do login opcional: uma conta (Google, e-mail...) poderá ser ligada a este id, e
// "recuperar a conta" num aparelho novo será receber de volta o segredo do id ligado. Por ora, perdeu o segredo (dados apagados), perdeu a identidade.
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const isPlayerId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(value);
export const isPlayerSecret = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{24,128}$/.test(value);
const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");

type Row = { hash: string; createdAt: number; lastSeen: number };

export class PlayerRegistry {
  private players = new Map<string, Row>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** `file` (JSON) guarda os jogadores entre reinícios; sem ele, tudo fica só na memória (testes). */
  constructor(private file: string | null = null, private now: () => number = Date.now) {
    if (file && existsSync(file)) {
      try {
        const rows = JSON.parse(readFileSync(file, "utf8")) as Record<string, Row>;
        for (const [id, row] of Object.entries(rows)) if (isPlayerId(id) && row && typeof row.hash === "string") this.players.set(id, row);
      } catch { /* arquivo ilegível: começa vazio */ }
    }
  }

  get size() { return this.players.size; }

  /** Confere a identidade. Id novo é registrado com o segredo apresentado; id conhecido exige o mesmo segredo. */
  authenticate(id: unknown, secret: unknown): boolean {
    if (!isPlayerId(id) || !isPlayerSecret(secret)) return false;
    const hash = hashSecret(secret);
    const known = this.players.get(id);
    if (!known) {
      const now = this.now();
      this.players.set(id, { hash, createdAt: now, lastSeen: now });
      this.scheduleSave();
      return true;
    }
    const a = Buffer.from(known.hash, "hex"), b = Buffer.from(hash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    if (this.now() - known.lastSeen > 60 * 60 * 1000) { known.lastSeen = this.now(); this.scheduleSave(); }
    return true;
  }

  /** Grava agora (o desligamento do servidor chama isto). */
  flush() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(Object.fromEntries(this.players)), "utf8");
    renameSync(temporary, this.file);
  }

  private scheduleSave() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; try { this.flush(); } catch { /* disco cheio ou sem permissão: segue na memória */ } }, 2000);
    this.saveTimer.unref?.();
  }
}
