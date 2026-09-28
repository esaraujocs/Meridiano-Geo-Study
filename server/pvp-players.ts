// Identidade dos jogadores do PvP, sem login: cada aparelho sorteia um id e um segredo; o servidor guarda só o hash do segredo (na primeira vez que vê o id, registra).
// Depois, quem apresenta o segredo certo é a mesma pessoa. É o ponto de partida do login opcional: uma conta (Google, e-mail...) poderá ser ligada a este id, e
// "recuperar a conta" num aparelho novo será receber de volta o segredo do id ligado. Por ora, perdeu o segredo (dados apagados), perdeu a identidade.
//
// Arquivo (.pvp-data/players.json), versão 2: { "version": 2, "players": { "<id>": { hash, createdAt, lastSeen, name } } }. A versão 1 (a primeira, sem
// "version") era o objeto { "<id>": { hash, createdAt, lastSeen } } direto: é lida e convertida (id e hash intactos, nome vazio), e o arquivo original fica
// copiado ao lado (players.v1.bak.json) antes da primeira gravação no formato novo. A força e o histórico NÃO moram aqui: vêm do registro de duelos
// (pvp-history.ts), relido a cada abertura. Desde 28/09 cada linha pode ter `ladders` (troféus e MMR por escada, o último que o aparelho informou) e
// `ladderAt` (quando): é de onde sai o ranking, só com gente de verdade. E `code` (o código de amigo, sorteado na primeira vez que alguém precisa dele: é
// como os outros acham a pessoa, nunca pelo id) e `summary` + `summaryAt` (o resumo do perfil que o aparelho informa).
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { LADDERS, type Ladder } from "../src/domain/duel-modes.js";
import { ROOM_CODE_ALPHABET, cleanPlayerName, parseStandings, type LadderStandings, type LeaderboardRow } from "../src/domain/pvp.js";
import { FRIEND_CODE_LENGTH, isFriendCode, parseSummary, type PlayerSummary } from "../src/domain/pvp-social.js";

export const isPlayerId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(value);
export const isPlayerSecret = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{24,128}$/.test(value);
const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");

export const PLAYERS_FILE_VERSION = 2;
export type PlayerRow = { hash: string; createdAt: number; lastSeen: number; name: string; ladders?: LadderStandings; ladderAt?: number; code?: string; summary?: PlayerSummary; summaryAt?: number };

const finiteOr = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

/** Lê o conteúdo do arquivo de jogadores (qualquer versão conhecida) e devolve as linhas válidas e a versão encontrada (0 se não reconheceu nada). */
export function readPlayersFile(raw: unknown, now = Date.now()): { version: number; rows: [string, PlayerRow][] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { version: 0, rows: [] };
  const top = raw as Record<string, unknown>;
  const isV2 = top.version === PLAYERS_FILE_VERSION && Boolean(top.players) && typeof top.players === "object";
  const source = (isV2 ? top.players : top) as Record<string, unknown>;
  const rows: [string, PlayerRow][] = [];
  for (const [id, value] of Object.entries(source)) {
    if (!isPlayerId(id) || !value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    if (typeof row.hash !== "string" || !row.hash) continue;
    const createdAt = finiteOr(row.createdAt, now);
    const ladders = row.ladders && typeof row.ladders === "object" ? { ladders: parseStandings({ ladders: row.ladders }), ladderAt: finiteOr(row.ladderAt, createdAt) } : {};
    const code = isFriendCode(row.code) ? { code: row.code } : {};
    const summary = parseSummary(row.summary);
    const profile = summary ? { summary, summaryAt: finiteOr(row.summaryAt, createdAt) } : {};
    rows.push([id, { hash: row.hash, createdAt, lastSeen: finiteOr(row.lastSeen, createdAt), name: typeof row.name === "string" ? cleanPlayerName(row.name) : "", ...ladders, ...code, ...profile }]);
  }
  return { version: isV2 ? PLAYERS_FILE_VERSION : 1, rows };
}

export class PlayerRegistry {
  private players = new Map<string, PlayerRow>();
  private byCode = new Map<string, string>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Versão do arquivo lido na abertura (1 = migrado agora; 2 = já estava no formato novo; 0 = sem arquivo). */
  readonly loadedVersion: number = 0;

  /** `file` (JSON) guarda os jogadores entre reinícios; sem ele, tudo fica só na memória (testes). */
  constructor(private file: string | null = null, private now: () => number = Date.now) {
    if (!file || !existsSync(file)) return;
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(file, "utf8")); }
    catch (error) {
      // Arquivo ilegível: não pode ser sobrescrito na próxima gravação (perderia as identidades de verdade). Fica guardado ao lado e o servidor começa vazio.
      const aside = `${file}.ilegivel-${this.now()}.json`;
      try { renameSync(file, aside); console.error(`[pvp] players.json ilegível; guardado em ${aside}:`, error); } catch { /* sem permissão: segue sem arquivo */ }
      return;
    }
    const { version, rows } = readPlayersFile(raw, this.now());
    for (const [id, row] of rows) {
      if (row.code && this.byCode.has(row.code)) delete row.code; // código repetido (arquivo mexido à mão): sorteia outro quando precisar
      this.players.set(id, row);
      if (row.code) this.byCode.set(row.code, id);
    }
    this.loadedVersion = version;
    if (version === 1) {
      // migração v1 → v2: cópia do original antes de reescrever (uma vez só: se a cópia já existe, é de uma migração anterior e não é tocada)
      const backup = file.replace(/\.json$/i, "") + ".v1.bak.json";
      try { if (!existsSync(backup)) copyFileSync(file, backup); this.flush(); }
      catch (error) { console.error("[pvp] não deu para migrar players.json para a versão 2 (segue na memória):", error); }
    }
  }

  get size() { return this.players.size; }
  has(id: string) { return this.players.has(id); }
  /** Quando o id apareceu pela primeira vez (0 se desconhecido). */
  createdAtOf(id: string) { return this.players.get(id)?.createdAt ?? 0; }
  /** O último nome que a pessoa usou ("" se nunca informou). */
  nameOf(id: string) { return this.players.get(id)?.name ?? ""; }

  /** Guarda o nome mais recente do jogador (vale para o perfil e para quem pede /me). */
  setName(id: string, name: string) {
    const row = this.players.get(id);
    const clean = cleanPlayerName(name);
    if (!row || !clean || row.name === clean) return;
    row.name = clean;
    this.scheduleSave();
  }

  /** O código de amigo do jogador (sorteado e guardado na primeira vez; "" se o id é desconhecido). */
  codeOf(id: string): string {
    const row = this.players.get(id);
    if (!row) return "";
    if (row.code) return row.code;
    let code = "";
    do code = Array.from({ length: FRIEND_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]).join("");
    while (this.byCode.has(code));
    row.code = code;
    this.byCode.set(code, id);
    this.scheduleSave();
    return code;
  }
  /** Quem tem esse código de amigo (null se ninguém). */
  idOfCode(code: string): string | null { return this.byCode.get(code) ?? null; }
  /** O resumo do perfil que o aparelho informou por último. */
  summaryOf(id: string): { summary: PlayerSummary; at: number } | null {
    const row = this.players.get(id);
    return row?.summary ? { summary: row.summary, at: row.summaryAt ?? 0 } : null;
  }
  setSummary(id: string, summary: PlayerSummary) {
    const row = this.players.get(id);
    if (!row) return;
    if (row.summary && JSON.stringify(row.summary) === JSON.stringify(summary)) return;
    row.summary = summary;
    row.summaryAt = this.now();
    this.scheduleSave();
  }

  /** Troféus e MMR por escada que o aparelho informou por último (null se nunca informou). */
  standingsOf(id: string): LadderStandings | null { return this.players.get(id)?.ladders ?? null; }
  /** Guarda o que o aparelho informou (grava só se mudou). */
  setStandings(id: string, ladders: LadderStandings) {
    const row = this.players.get(id);
    if (!row) return;
    const same = row.ladders && LADDERS.every((ladder) => row.ladders?.[ladder].trophies === ladders[ladder].trophies && row.ladders?.[ladder].mmr === ladders[ladder].mmr);
    if (same) return;
    row.ladders = ladders;
    row.ladderAt = this.now();
    this.scheduleSave();
  }
  /** O ranking de uma escada: quem já informou os troféus, do mais alto para o mais baixo (empate: quem chegou antes). `viewer` sai marcado como "você". */
  leaderboard(ladder: Ladder, limit: number, viewer: string | null = null): LeaderboardRow[] {
    return [...this.players.entries()]
      .filter(([, row]) => row.ladders)
      .sort(([, a], [, b]) => (b.ladders as LadderStandings)[ladder].trophies - (a.ladders as LadderStandings)[ladder].trophies || a.createdAt - b.createdAt)
      .slice(0, Math.max(1, limit))
      .map(([id, row]) => ({ name: row.name || "Jogador", trophies: (row.ladders as LadderStandings)[ladder].trophies, you: id === viewer, code: this.codeOf(id) }));
  }

  /** Confere a identidade. Id novo é registrado com o segredo apresentado; id conhecido exige o mesmo segredo. */
  authenticate(id: unknown, secret: unknown): boolean {
    if (!isPlayerId(id) || !isPlayerSecret(secret)) return false;
    const hash = hashSecret(secret);
    const known = this.players.get(id);
    if (!known) {
      const now = this.now();
      this.players.set(id, { hash, createdAt: now, lastSeen: now, name: "" });
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
    writeFileSync(temporary, JSON.stringify({ version: PLAYERS_FILE_VERSION, players: Object.fromEntries(this.players) }), "utf8");
    renameSync(temporary, this.file);
  }

  private scheduleSave() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; try { this.flush(); } catch { /* disco cheio ou sem permissão: segue na memória */ } }, 2000);
    this.saveTimer.unref?.();
  }
}
