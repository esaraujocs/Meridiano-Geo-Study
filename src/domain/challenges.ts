// Desafios (23/10/2026, pedido do Enzo: "as tabelas do JetPunk"): listas digitadas contra o relógio sobre os 195 países soberanos (os 193 da ONU,
// o Vaticano e a Palestina). Escada: só os nomes → nomes e capitais → a ficha inteira (capital, moeda, idioma e gentílico), no mundo e por continente.
// Digitar o nome de um país abre a linha dele; as outras células só aceitam a resposta daquele país. "Não é água com açúcar": a moeda é 1:1 com o
// país ("dólar namibiano", não "dólar"), aceitando só grafias do mesmo nome (os três idiomas e os do catálogo). Lógica pura.
import { answerKey } from "./typed-answer.js";
import { acceptedCapitalAnswers, acceptedWritingAnswers } from "./special-data.js";
import type { Meta } from "./types";
import type { PeoplesFile } from "./peoples.js";

export type ChallengeTier = "paises" | "capitais" | "ficha";
export type Continent = "africa" | "america-do-sul" | "america-do-norte" | "asia" | "europa" | "oceania";
export type ChallengeScope = "mundo" | Continent;
export type ChallengeColumn = "nome" | "capital" | "moeda" | "idioma" | "gentilico";

export const CHALLENGE_TIERS: readonly ChallengeTier[] = ["paises", "capitais", "ficha"];
export const CONTINENTS: readonly Continent[] = ["africa", "america-do-norte", "america-do-sul", "asia", "europa", "oceania"];
export const CHALLENGE_SCOPES: readonly ChallengeScope[] = ["mundo", ...CONTINENTS];
export const TIER_COLUMNS: Record<ChallengeTier, readonly ChallengeColumn[]> = {
  paises: ["nome"],
  capitais: ["nome", "capital"],
  ficha: ["nome", "capital", "moeda", "idioma", "gentilico"],
};
/** Segundos por país em cada degrau (o mundo: 15, 25 e 50 min, perto dos do JetPunk), com um piso por desafio. */
const SECONDS_PER_ROW: Record<ChallengeTier, number> = { paises: 4.6, capitais: 7.7, ficha: 15.35 };
const MIN_MINUTES: Record<ChallengeTier, number> = { paises: 2, capitais: 3, ficha: 5 };

export type ChallengeDef = { id: string; tier: ChallengeTier; scope: ChallengeScope };
export const CHALLENGES: readonly ChallengeDef[] = CHALLENGE_TIERS.flatMap((tier) => CHALLENGE_SCOPES.map((scope) => ({ id: `${tier}-${scope}`, tier, scope })));
export const challengeById = (id: string) => CHALLENGES.find((item) => item.id === id) ?? null;

/** Palestina: observadora da ONU, fica com os soberanos aqui (o filtro "Só países" do resto do jogo segue com os 194). */
const OBSERVERS = new Set(["336", "275"]);
export const isSovereign = (id: string, meta: Meta | undefined) => Boolean(meta && (meta.un || OBSERVERS.has(id)));

/** O continente do JetPunk: as Américas em duas (a Central e o Caribe com a do Norte). */
export function continentOf(meta: Meta): Continent | null {
  switch (meta.reg) {
    case "Africa": return "africa";
    case "Asia": return "asia";
    case "Europe": return "europa";
    case "Oceania": return "oceania";
    case "Americas": return meta.sub === "South America" ? "america-do-sul" : "america-do-norte";
    default: return null;
  }
}

export type ChallengeCell = { column: ChallengeColumn; answer: string; keys: ReadonlySet<string> };
export type ChallengeRow = { id: string; continent: Continent; name: string; cells: readonly ChallengeCell[] };
export type ChallengeBoard = { def: ChallengeDef; columns: readonly ChallengeColumn[]; groups: { continent: Continent; rows: ChallengeRow[] }[]; total: number; seconds: number };

/** "Alemão (Suíça)" também vale como "Alemão". */
const withoutParens = (text: string) => text.replace(/\s*\([^)]*\)\s*/g, " ").trim();
const keysOf = (answers: readonly (string | undefined)[]) => new Set(answers.flatMap((answer) => answer ? [answerKey(answer), answerKey(withoutParens(answer))] : []).filter(Boolean));

/** O idioma mostrado no gabarito: dos oficiais do país, o que é oficial em mais países (o espanhol na Argentina, não o guarani; o inglês na África
 *  do Sul). Qualquer um dos oficiais vale como resposta. */
function shownLanguage(languages: readonly string[], count: ReadonlyMap<string, number>) {
  return [...languages].sort((a, b) => (count.get(answerKey(withoutParens(b))) ?? 0) - (count.get(answerKey(withoutParens(a))) ?? 0))[0];
}

/** As células de um país (a que falta no dado não entra: o Vaticano não tem gentílico, a Palestina não tem moeda própria). */
function cellsOf(id: string, meta: Meta, columns: readonly ChallengeColumn[], peoples: PeoplesFile, locale: "pt" | "en" | "es", languageCount: ReadonlyMap<string, number>): ChallengeCell[] {
  const cells: ChallengeCell[] = [];
  const entry = peoples.entries[id];
  for (const column of columns) {
    if (column === "nome") cells.push({ column, answer: meta.pt ?? id, keys: keysOf(acceptedWritingAnswers(meta)) });
    else if (column === "capital" && meta.cap) cells.push({ column, answer: meta.cap, keys: keysOf(acceptedCapitalAnswers(meta)) });
    else if (column === "moeda" && entry?.cur?.length) {
      const names = entry.cur.flatMap((code) => Object.values(peoples.currencies[code] ?? {}));
      const main = peoples.currencies[entry.cur[0]]?.[locale];
      if (main) cells.push({ column, answer: main, keys: keysOf([...names, ...(meta.cur ?? [])]) });
    } else if (column === "idioma" && meta.lang?.length) cells.push({ column, answer: shownLanguage(meta.lang, languageCount), keys: keysOf(meta.lang) });
    else if (column === "gentilico" && entry?.dem?.[locale]) cells.push({ column, answer: entry.dem[locale], keys: keysOf(Object.values(entry.dem)) });
  }
  return cells;
}

export function buildChallenge(def: ChallengeDef, meta: Readonly<Record<string, Meta>>, peoples: PeoplesFile, locale: "pt" | "en" | "es", compare: (a: string, b: string) => number): ChallengeBoard {
  const columns = TIER_COLUMNS[def.tier];
  const groups = new Map<Continent, ChallengeRow[]>();
  const languageCount = new Map<string, number>();
  for (const [id, item] of Object.entries(meta)) {
    if (!isSovereign(id, item)) continue;
    for (const language of new Set((item.lang ?? []).map((name) => answerKey(withoutParens(name))))) languageCount.set(language, (languageCount.get(language) ?? 0) + 1);
  }
  for (const [id, item] of Object.entries(meta)) {
    if (!isSovereign(id, item)) continue;
    const continent = continentOf(item);
    if (!continent || (def.scope !== "mundo" && def.scope !== continent)) continue;
    const row: ChallengeRow = { id, continent, name: item.pt ?? id, cells: cellsOf(id, item, columns, peoples, locale, languageCount) };
    groups.set(continent, [...(groups.get(continent) ?? []), row]);
  }
  const ordered = CONTINENTS.filter((continent) => groups.has(continent)).map((continent) => ({ continent, rows: groups.get(continent)!.sort((a, b) => compare(a.name, b.name)) }));
  const rows = ordered.reduce((sum, group) => sum + group.rows.length, 0);
  const total = ordered.reduce((sum, group) => sum + group.rows.reduce((cells, row) => cells + row.cells.length, 0), 0);
  return { def, columns, groups: ordered, total, seconds: secondsFor(def, rows) };
}

const secondsFor = (def: ChallengeDef, rows: number) => Math.max(MIN_MINUTES[def.tier], Math.ceil((rows * SECONDS_PER_ROW[def.tier]) / 60)) * 60;
/** O tempo do desafio só pelo catálogo (o cartão do Hub mostra antes de carregar as moedas e os gentílicos). */
export function challengeSeconds(def: ChallengeDef, meta: Readonly<Record<string, Meta>>) {
  const rows = Object.entries(meta).filter(([id, item]) => isSovereign(id, item) && (def.scope === "mundo" || continentOf(item) === def.scope)).length;
  return secondsFor(def, rows);
}

/** O país cujo nome foi digitado (só entre os que ainda não abriram), ou nulo. */
export function matchCountry(board: ChallengeBoard, typed: string, found: ReadonlySet<string>): string | null {
  const key = answerKey(typed);
  if (!key) return null;
  for (const group of board.groups) for (const row of group.rows) if (!found.has(row.id) && row.cells[0].keys.has(key)) return row.id;
  return null;
}

/** O nome digitado é o começo do nome de outro país ainda fechado ("Niger" de "Nigeria", "Guine" de "Guine-Bissau")? Então o país não abre sozinho:
 *  espera o Enter, para a pessoa poder continuar escrevendo. */
export function countryWaits(board: ChallengeBoard, typed: string, found: ReadonlySet<string>) {
  const key = answerKey(typed);
  if (!key) return false;
  for (const group of board.groups) for (const row of group.rows) {
    if (found.has(row.id)) continue;
    for (const candidate of row.cells[0].keys) if (candidate.length > key.length && candidate.startsWith(key)) return true;
  }
  return false;
}

/** A resposta de uma célula está certa? */
export const cellAccepts = (cell: ChallengeCell, typed: string) => cell.keys.has(answerKey(typed));
/** Certa, mas também o começo de outra resposta da mesma célula ("real" de "real brasileiro"): fecha só com Enter, Tab ou ao sair da célula. */
export function cellWaits(cell: ChallengeCell, typed: string) {
  const key = answerKey(typed);
  return [...cell.keys].some((candidate) => candidate.length > key.length && candidate.startsWith(key));
}
export const cellId = (rowId: string, column: ChallengeColumn) => `${rowId}:${column}`;

export type ChallengeEnd = "complete" | "time" | "gaveup";
/** Uma tentativa terminada: linha imutável na loja `preferences` (`challenge-run:<desafio>:<instante>`), então sincroniza com a conta e entra no
 *  backup sem carimbo; o recorde sai delas. */
export type ChallengeRun = { id: string; challenge: string; correct: number; total: number; ms: number; end: ChallengeEnd; at: number };
export const CHALLENGE_RUN_PREFIX = "challenge-run:";

export function parseRun(value: unknown): ChallengeRun | null {
  const row = value as Partial<ChallengeRun> | null;
  if (!row || typeof row.id !== "string" || !row.id.startsWith(CHALLENGE_RUN_PREFIX) || typeof row.challenge !== "string") return null;
  const num = (item: unknown) => (typeof item === "number" && Number.isFinite(item) && item >= 0 ? item : null);
  const correct = num(row.correct), total = num(row.total), ms = num(row.ms), at = num(row.at);
  if (correct === null || total === null || !total || ms === null || at === null) return null;
  const end = row.end === "complete" || row.end === "time" || row.end === "gaveup" ? row.end : "gaveup";
  return { id: row.id, challenge: row.challenge, correct: Math.min(correct, total), total, ms, end, at };
}

/** O recorde: mais acertos (pela fração, se o total mudou) e, empatado, o menor tempo. */
export function bestRun(runs: readonly ChallengeRun[]): ChallengeRun | null {
  let best: ChallengeRun | null = null;
  for (const run of runs) {
    if (!best) { best = run; continue; }
    const a = run.correct / run.total, b = best.correct / best.total;
    if (a > b || (a === b && run.ms < best.ms)) best = run;
  }
  return best;
}

export type Medal = "ouro" | "prata" | "bronze" | null;
/** Ouro com tudo, prata com 80% e bronze com metade. */
export function medalOf(run: Pick<ChallengeRun, "correct" | "total"> | null): Medal {
  if (!run || !run.total) return null;
  const share = run.correct / run.total;
  return share >= 1 ? "ouro" : share >= 0.8 ? "prata" : share >= 0.5 ? "bronze" : null;
}

/** O desafio do dia (UTC): roda pelos desafios de continente e pelos países do mundo (os dois maiores do mundo, 25 e 50 min, ficam de fora). */
export const DAILY_POOL: readonly ChallengeDef[] = CHALLENGES.filter((item) => item.scope !== "mundo" || item.tier === "paises");
export function dailyChallenge(now = Date.now()): ChallengeDef {
  const day = Math.floor(now / 86_400_000);
  // salto primo para os vizinhos do dia não serem o mesmo degrau seguido
  return DAILY_POOL[(day * 7) % DAILY_POOL.length];
}
