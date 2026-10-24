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
/** Segundos por país em cada degrau (o mundo: 15, 25,5 e 50 min; o Países do mundo é o do JetPunk), arredondados para cima de 30 em 30 s, no mínimo
 *  1 min (23/10/2026: com um piso de 3 min por degrau, as Capitais da América do Sul, 12 países, empatavam com as da do Norte, 23). */
const SECONDS_PER_ROW: Record<ChallengeTier, number> = { paises: 4.6, capitais: 7.7, ficha: 15.35 };

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

const secondsFor = (def: ChallengeDef, rows: number) => Math.max(60, Math.ceil((rows * SECONDS_PER_ROW[def.tier]) / 30) * 30);
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
    // o próprio país não conta ("Estados Unidos" não espera por "Estados Unidos da America", 23/10/2026: o Enzo teve de escrever o nome longo)
    if (found.has(row.id) || row.cells[0].keys.has(key)) continue;
    for (const candidate of row.cells[0].keys) if (candidate.length > key.length && candidate.startsWith(key)) return true;
  }
  return false;
}

/** As respostas mais longas da mesma linha ou célula que começam com o que foi aceito ("estadosunidos" → "estadosunidosdaamerica"): quem continua
 *  escrevendo a forma longa depois de a resposta já ter fechado tem o resto engolido (`spillOf`), em vez de escorrer para a célula seguinte. */
export function longerKeys(keys: ReadonlySet<string>, typed: string): string[] {
  const key = answerKey(typed);
  return key ? [...keys].filter((candidate) => candidate.length > key.length && candidate.startsWith(key)) : [];
}
/** Continuando a forma longa: o novo começo (para engolir a tecla), ou nulo quando o que veio já é outra coisa. */
export function spillOf(spill: { base: string; longer: readonly string[] }, typed: string): string | null {
  const combined = spill.base + answerKey(typed);
  return spill.longer.some((candidate) => candidate.startsWith(combined)) ? combined : null;
}

/** A resposta de uma célula está certa? */
export const cellAccepts = (cell: ChallengeCell, typed: string) => cell.keys.has(answerKey(typed));
export const cellId = (rowId: string, column: ChallengeColumn) => `${rowId}:${column}`;

export type ChallengeEnd = "complete" | "time" | "gaveup";
/** Uma tentativa terminada: linha imutável na loja `preferences` (`challenge-run:<desafio>:<instante>`), então sincroniza com a conta e entra no
 *  backup sem carimbo; o recorde sai delas. */
export type ChallengeRun = {
  id: string; challenge: string; correct: number; total: number; ms: number; end: ChallengeEnd; at: number;
  /** Desde 23/10/2026 (as tentativas de antes não pagaram nada): moedas e XP da tentativa, se foi o desafio do dia pago em dobro, o bônus das
   *  medalhas novas e as células que faltaram (`<país>:<coluna>`, para o Histórico). */
  coins?: number; xp?: number; daily?: boolean; medalBonus?: number; missed?: string[];
};
export const CHALLENGE_RUN_PREFIX = "challenge-run:";

export function parseRun(value: unknown): ChallengeRun | null {
  const row = value as Partial<ChallengeRun> | null;
  if (!row || typeof row.id !== "string" || !row.id.startsWith(CHALLENGE_RUN_PREFIX) || typeof row.challenge !== "string") return null;
  const num = (item: unknown) => (typeof item === "number" && Number.isFinite(item) && item >= 0 ? item : null);
  const correct = num(row.correct), total = num(row.total), ms = num(row.ms), at = num(row.at);
  if (correct === null || total === null || !total || ms === null || at === null) return null;
  const end = row.end === "complete" || row.end === "time" || row.end === "gaveup" ? row.end : "gaveup";
  const optional = {
    ...(num(row.coins) !== null ? { coins: num(row.coins)! } : {}),
    ...(num(row.xp) !== null ? { xp: num(row.xp)! } : {}),
    ...(row.daily === true ? { daily: true } : {}),
    ...(num(row.medalBonus) !== null ? { medalBonus: num(row.medalBonus)! } : {}),
    ...(Array.isArray(row.missed) ? { missed: row.missed.filter((item): item is string => typeof item === "string") } : {}),
  };
  return { id: row.id, challenge: row.challenge, correct: Math.min(correct, total), total, ms, end, at, ...optional };
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

// ---- recompensas (23/10/2026, pedido do Enzo: "histórico, XP, moedas")
/** Por resposta certa: 40 moedas (o ritmo por minuto dos modos de escrita) e 2 XP (o de uma rodada). Desistir também paga o que foi acertado
 *  (desistir aqui é terminar antes, como no JetPunk). */
export const CHALLENGE_COINS_PER_ANSWER = 40;
export const CHALLENGE_XP_PER_ANSWER = 2;
/** A primeira tentativa do dia no desafio do dia paga as moedas em dobro. */
export const DAILY_FACTOR = 2;
/** Bônus único por desafio na primeira vez que se alcança cada medalha, por resposta do desafio (prata no Países do mundo: 1.950). */
export const MEDAL_BONUS_PER_ANSWER: Record<NonNullable<Medal>, number> = { bronze: 5, prata: 10, ouro: 20 };
export const MEDALS: readonly NonNullable<Medal>[] = ["bronze", "prata", "ouro"];
export const medalGrantId = (challenge: string, medal: NonNullable<Medal>) => `grant:challenge:${challenge}:${medal}`;
export const challengeLedgerId = (runId: string) => `challenge:${runId}`;
const dayOf = (at: number) => Math.floor(at / 86_400_000);

/** A recompensa de uma tentativa: as moedas e o XP pelos acertos, o dobro do desafio do dia (só a primeira tentativa do dia nele) e as medalhas
 *  alcançadas que ainda não deram bônus. */
export function challengeReward({ challenge, correct, total, at, earlier, granted }: {
  challenge: string; correct: number; total: number; at: number;
  /** As tentativas anteriores neste desafio. */
  earlier: readonly Pick<ChallengeRun, "at">[];
  /** As medalhas deste desafio que já deram bônus. */
  granted: ReadonlySet<NonNullable<Medal>>;
}) {
  const daily = dailyChallenge(at).id === challenge && !earlier.some((run) => dayOf(run.at) === dayOf(at));
  const coins = correct * CHALLENGE_COINS_PER_ANSWER * (daily ? DAILY_FACTOR : 1);
  const reached = medalOf({ correct, total });
  const medals = reached ? MEDALS.slice(0, MEDALS.indexOf(reached) + 1).filter((medal) => !granted.has(medal)) : [];
  const medalBonus = medals.reduce((sum, medal) => sum + total * MEDAL_BONUS_PER_ANSWER[medal], 0);
  return { coins, xp: correct * CHALLENGE_XP_PER_ANSWER, daily, medals, medalBonus };
}
/** O XP de uma tentativa (as de antes de 23/10 não tinham o campo: valem pelos acertos, como as outras). */
export const runXp = (run: Pick<ChallengeRun, "correct" | "xp">) => run.xp ?? run.correct * CHALLENGE_XP_PER_ANSWER;

/** O desafio do dia (UTC): roda pelos desafios de continente e pelos países do mundo (os dois maiores do mundo, 25 e 50 min, ficam de fora). */
export const DAILY_POOL: readonly ChallengeDef[] = CHALLENGES.filter((item) => item.scope !== "mundo" || item.tier === "paises");
export function dailyChallenge(now = Date.now()): ChallengeDef {
  const day = Math.floor(now / 86_400_000);
  // salto primo para os vizinhos do dia não serem o mesmo degrau seguido
  return DAILY_POOL[(day * 7) % DAILY_POOL.length];
}
