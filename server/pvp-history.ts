// Histórico dos duelos entre pessoas no servidor: um registro só de acréscimo (.pvp-data/matches.jsonl, uma linha JSON por duelo terminado). A força do
// valendo de cada jogador NUNCA é gravada à parte: sai de reler o registro na ordem, com a mesma conta do app (src/domain/pvp-rating.ts) — o mesmo
// princípio dos troféus do duelo contra bot (tudo derivado do histórico). Uma linha cortada no meio (o servidor caiu gravando) é ignorada na leitura.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { isLadder, type Ladder } from "../src/domain/duel-modes.js";
import { isPvpMode, type PvpMatchSide, type PvpMode, type PvpOutcome, type PvpProfileView, type PvpRoomOrigin, type PvpServerMatch, type PvpTally, type RatingChange, type SideTotals } from "../src/domain/pvp.js";
import { PVP_RATING_BASE, pvpRatingChange } from "../src/domain/pvp-rating.js";

/** Formato de cada linha do registro (sobe se a linha mudar de forma; a força continua vindo de reler tudo). */
export const HISTORY_VERSION = 1;

export type SettledSide = { id: string; name: string; trophies: number; outcome: PvpOutcome; totals: SideTotals };
/** Um duelo terminado, como a sala o entrega ao histórico. `a` é o anfitrião (na fila, quem esperava há mais tempo). */
export type SettledMatch = { code: string; at: number; origin: PvpRoomOrigin; ladder: Ladder; mode: PvpMode; seed: string; tiebreak: boolean; a: SettledSide; b: SettledSide };
type Entry = SettledMatch & { v: number; ratingA: RatingChange | null; ratingB: RatingChange | null };
type Stats = { rating: number; ranked: PvpTally; friendly: PvpTally; entries: Entry[] };

const OUTCOMES: ReadonlySet<string> = new Set(["win", "loss", "draw"]);
const emptyTally = (): PvpTally => ({ wins: 0, losses: 0, draws: 0 });
const addOutcome = (target: PvpTally, outcome: PvpOutcome) => {
  if (outcome === "win") target.wins += 1;
  else if (outcome === "loss") target.losses += 1;
  else target.draws += 1;
};
const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function parseTotals(input: unknown): SideTotals | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const correct = finite(raw.correct);
  if (correct === null || !Array.isArray(raw.legs)) return null;
  const legs = raw.legs.map((leg: unknown) => {
    const item = (leg && typeof leg === "object" ? leg : {}) as Record<string, unknown>;
    return { correct: finite(item.correct) ?? 0, ms: finite(item.ms), answered: finite(item.answered) ?? 0 };
  });
  return { correct, ms: finite(raw.ms), legs, forfeited: raw.forfeited === true };
}

function parseSide(input: unknown): SettledSide | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const totals = parseTotals(raw.totals);
  if (typeof raw.id !== "string" || !raw.id || typeof raw.outcome !== "string" || !OUTCOMES.has(raw.outcome) || !totals) return null;
  return { id: raw.id, name: typeof raw.name === "string" ? raw.name : "", trophies: finite(raw.trophies) ?? 0, outcome: raw.outcome as PvpOutcome, totals };
}

/** Confere uma linha do registro; null se ela não for um duelo válido. */
export function parseHistoryLine(input: unknown): SettledMatch | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const a = parseSide(raw.a), b = parseSide(raw.b);
  const at = finite(raw.at);
  if (typeof raw.code !== "string" || at === null || !isLadder(raw.ladder) || !isPvpMode(raw.mode) || !a || !b || a.id === b.id) return null;
  return { code: raw.code, at, origin: raw.origin === "queue" ? "queue" : "invite", ladder: raw.ladder, mode: raw.mode, seed: typeof raw.seed === "string" ? raw.seed : "", tiebreak: raw.tiebreak === true, a, b };
}

export class PvpHistory {
  private stats = new Map<string, Stats>();
  private seen = new Set<string>();
  private count = 0;
  /** O arquivo terminou no meio de uma linha (queda durante a gravação): a próxima gravação começa numa linha nova, senão ela colaria na cortada. */
  private brokenTail = false;

  /** `file` (JSONL) guarda os duelos entre reinícios; sem ele, tudo fica só na memória (testes). */
  constructor(private file: string | null = null) {
    if (!file || !existsSync(file)) return;
    let text = "";
    try { text = readFileSync(file, "utf8"); } catch (error) { console.error("[pvp] não deu para ler o histórico:", error); return; }
    this.brokenTail = text.length > 0 && !text.endsWith("\n");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let raw: unknown;
      try { raw = JSON.parse(line); } catch { continue; } // linha cortada no meio: fica de fora
      const match = parseHistoryLine(raw);
      if (match) this.apply(match);
    }
  }

  /** Quantos duelos o registro tem. */
  get size() { return this.count; }

  /** Força atual do valendo (1000 para quem ainda não jogou nenhum). */
  ratingOf(id: string) { return this.stats.get(id)?.rating ?? PVP_RATING_BASE; }

  profileOf(id: string, name: string, since: number): PvpProfileView {
    const stats = this.stats.get(id);
    return { name, rating: stats?.rating ?? PVP_RATING_BASE, ranked: { ...(stats?.ranked ?? emptyTally()) }, friendly: { ...(stats?.friendly ?? emptyTally()) }, since };
  }

  /** Os duelos de um jogador, do mais novo para o mais velho, do ponto de vista dele (sem o id do adversário; `codeOf` dá o código de amigo de cada lado). */
  matchesOf(id: string, limit = 50, codeOf: (id: string) => string = () => ""): PvpServerMatch[] {
    const entries = this.stats.get(id)?.entries ?? [];
    return entries.slice(-Math.max(0, limit)).reverse().map((entry) => matchView(entry, id, codeOf));
  }

  /** Os duelos entre dois jogadores, do mais novo para o mais velho, do ponto de vista de `me`. */
  between(me: string, other: string, limit = 1000, codeOf: (id: string) => string = () => ""): PvpServerMatch[] {
    const entries = (this.stats.get(me)?.entries ?? []).filter((entry) => entry.a.id === other || entry.b.id === other);
    return entries.slice(-Math.max(0, limit)).reverse().map((entry) => matchView(entry, me, codeOf));
  }

  /** Grava um duelo terminado e devolve a força antes/depois dos dois lados (null no amistoso). A sala chama uma vez, ao fechar o placar. */
  record(match: SettledMatch): { a: RatingChange | null; b: RatingChange | null } {
    const entry = this.apply(match);
    if (!entry) return { a: null, b: null };
    if (this.file) {
      try {
        mkdirSync(dirname(this.file), { recursive: true });
        appendFileSync(this.file, `${this.brokenTail ? "\n" : ""}${JSON.stringify(entry)}\n`, "utf8");
        this.brokenTail = false;
      } catch (error) { console.error("[pvp] não deu para gravar o histórico (segue na memória):", error); }
    }
    return { a: entry.ratingA, b: entry.ratingB };
  }

  private statsOf(id: string): Stats {
    let stats = this.stats.get(id);
    if (!stats) { stats = { rating: PVP_RATING_BASE, ranked: emptyTally(), friendly: emptyTally(), entries: [] }; this.stats.set(id, stats); }
    return stats;
  }

  private apply(match: SettledMatch): Entry | null {
    const key = `${match.code}:${match.at}`;
    if (this.seen.has(key) || match.a.id === match.b.id) return null;
    this.seen.add(key);
    const a = this.statsOf(match.a.id), b = this.statsOf(match.b.id);
    let ratingA: RatingChange | null = null, ratingB: RatingChange | null = null;
    if (match.mode === "ranked") {
      // as duas contas usam a força de ANTES do duelo (o Elo é simétrico só assim)
      ratingA = { before: a.rating, after: Math.max(0, a.rating + pvpRatingChange(a.rating, b.rating, match.a.outcome)) };
      ratingB = { before: b.rating, after: Math.max(0, b.rating + pvpRatingChange(b.rating, a.rating, match.b.outcome)) };
      a.rating = ratingA.after;
      b.rating = ratingB.after;
    }
    addOutcome(match.mode === "ranked" ? a.ranked : a.friendly, match.a.outcome);
    addOutcome(match.mode === "ranked" ? b.ranked : b.friendly, match.b.outcome);
    const entry: Entry = { v: HISTORY_VERSION, ...match, ratingA, ratingB };
    a.entries.push(entry);
    b.entries.push(entry);
    this.count += 1;
    return entry;
  }
}

function matchView(entry: Entry, id: string, codeOf: (id: string) => string = () => ""): PvpServerMatch {
  const mine = entry.a.id === id;
  const side = (value: SettledSide, rating: RatingChange | null): PvpMatchSide => {
    const code = codeOf(value.id);
    return { name: value.name, totals: value.totals, outcome: value.outcome, rating, ...(code ? { code } : {}) };
  };
  const a = side(entry.a, entry.ratingA), b = side(entry.b, entry.ratingB);
  return { code: entry.code, at: entry.at, origin: entry.origin, ladder: entry.ladder, mode: entry.mode, seed: entry.seed, tiebreak: entry.tiebreak, you: mine ? a : b, opponent: mine ? b : a };
}
