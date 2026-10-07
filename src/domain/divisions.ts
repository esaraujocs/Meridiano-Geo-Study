// Modo "Estados e províncias": as divisões de primeiro nível de cada país (os estados do Brasil, os dos EUA…) num modo só, com o país como opção.
// Regras puras. Cada país é um pacote de dados, sem código próprio: public/data/divisions/<país>/ (units.json e shapes.json de
// scripts/divisions/build-division.py, flags.json de flags.mjs) e public/maps/divisions-<país>.pmtiles, carregados por divisions-data.ts; o índice
// dos países (nomes, palavra da unidade, regiões e contagens, se há bandeiras, enquadramento, mapa) é gerado em divisions-index.ts.
// As unidades viram um catálogo no formato do acervo do mapa-múndi (`Legacy`), então os motores de partida jogam com elas como com os países;
// cada modo segue as regras de uma variante do mapa-múndi (DIVISION_BASE: motor, cronômetro, suprimentos). As sessões ficam com a família
// "divisoes": fora da coleção, do domínio, dos pilares e do duelo. Um modo comprado vale para todos os países.
import type { AnyQuizVariant, DivisionRegion, Legacy, Meta, Region, RegionSelection } from "./types.js";
import { DIVISION_INDEX } from "./divisions-index.js";
import { locale as uiLocale } from "./i18n/locale.js";

export type Names = { pt: string; en: string; es: string };
type Locale = keyof Names;
/** A palavra da unidade num idioma (estado, província…), com o gênero para os artigos do português e do espanhol. */
export type UnitWord = { one: string; many: string; g?: "m" | "f" };
export type DivisionCountry = {
  id: string;
  /** A entidade do mapa-múndi que o pacote detalha (o mapa de fundo a esconde). */
  carta: string;
  name: Names;
  unit: Record<Locale, UnitWord>;
  /** Cada região com as contagens de unidades e de unidades com capital. */
  regions: { key: string; name: Names; count: number; capitals: number }[];
  count: number;
  flags: boolean;
  /** Quantas unidades têm capital (na China, as 4 municipalidades não têm: os modos de capital jogam com as outras 27). */
  capitals: number;
  /** [oeste, sul, leste, norte] do país inteiro na câmera (nos EUA, os 48 estados contíguos; o Alasca e o Havaí ficam a um zoom de distância). */
  frame: [number, number, number, number];
  attribution: string;
  map: { url: string; bytes: number; sha256: string };
};

export const DIVISION_COUNTRIES: readonly DivisionCountry[] = DIVISION_INDEX;
export const divisionCountry = (id: string | null | undefined): DivisionCountry | null => DIVISION_COUNTRIES.find((country) => country.id === id) ?? null;
export const unitWord = (country: DivisionCountry | null, locale: Locale = uiLocale): UnitWord => country?.unit[locale] ?? { one: "estado", many: "estados", g: "m" };

// ---- variantes: um modo vale para todos os países
export const DIVISION_VARIANTS = [
  "dv-mapa", "dv-capital-mapa", "dv-silhueta-opcoes", "dv-silhueta", "dv-nome-bandeira", "dv-bandeira-nome", "dv-capital", "dv-escrita-nome", "dv-escrita-capital",
] as const;
export type DivisionVariant = (typeof DIVISION_VARIANTS)[number];
/** A variante do mapa-múndi que dá as regras de cada modo. */
export const DIVISION_BASE = {
  "dv-mapa": "mapa",
  "dv-capital-mapa": "capital-pais",
  "dv-silhueta-opcoes": "silhueta-opcoes",
  "dv-silhueta": "silhueta",
  "dv-nome-bandeira": "nome-bandeira",
  "dv-bandeira-nome": "bandeira-nome",
  "dv-capital": "pais-capital",
  "dv-escrita-nome": "escrita-pais",
  "dv-escrita-capital": "escrita-capital",
} as const satisfies Record<DivisionVariant, AnyQuizVariant>;
export type DivisionBase = (typeof DIVISION_BASE)[DivisionVariant];
export const isDivisionVariant = (variant: string): variant is DivisionVariant => (DIVISION_VARIANTS as readonly string[]).includes(variant);
/** A regra do mapa-múndi por trás da variante: a de um modo de Estados e províncias vira a do modo equivalente, as outras ficam como estão. */
export function baseVariant<V extends AnyQuizVariant>(variant: V): Exclude<V, DivisionVariant> | DivisionBase {
  return isDivisionVariant(variant) ? DIVISION_BASE[variant] : (variant as Exclude<V, DivisionVariant>);
}
const FLAG_VARIANTS: readonly DivisionVariant[] = ["dv-nome-bandeira", "dv-bandeira-nome", "dv-escrita-nome"];
const CAPITAL_VARIANTS: readonly DivisionVariant[] = ["dv-capital-mapa", "dv-capital", "dv-escrita-capital"];
/** Modo que pergunta pela capital: joga só com as unidades que têm uma. */
export const isCapitalVariant = (variant: string | undefined) => (CAPITAL_VARIANTS as readonly string[]).includes(variant ?? "");
/** O modo dá para jogar com o país? Os de bandeira pedem as bandeiras do pacote; os de capital, ao menos 4 unidades com capital (as alternativas). */
export function variantPlayable(country: DivisionCountry | null, variant: string): boolean {
  if (!country || !isDivisionVariant(variant)) return false;
  if (FLAG_VARIANTS.includes(variant)) return country.flags;
  if (CAPITAL_VARIANTS.includes(variant)) return country.capitals >= 4;
  return true;
}

// ---- legado: a família "brasil" (06/10/2026, antes deste modo) gravou sessões e compras com as variantes br-* e os recortes do Brasil; elas
// valem como os modos e recortes daqui (as sessões não são regravadas: só são lidas assim)
export const LEGACY_FAMILY = "brasil";
export const LEGACY_VARIANT: Readonly<Record<string, DivisionVariant>> = {
  "br-mapa": "dv-mapa", "br-capital-mapa": "dv-capital-mapa", "br-silhueta-opcoes": "dv-silhueta-opcoes", "br-silhueta": "dv-silhueta",
  "br-nome-bandeira": "dv-nome-bandeira", "br-bandeira-nome": "dv-bandeira-nome", "br-estado-capital": "dv-capital", "br-escrita-estado": "dv-escrita-nome",
  "br-escrita-capital": "dv-escrita-capital",
};
const LEGACY_REGION: Readonly<Record<string, DivisionRegion>> = {
  brasil: "dv:br", norte: "dv:br:norte", nordeste: "dv:br:nordeste", "centro-oeste": "dv:br:centro-oeste", sudeste: "dv:br:sudeste", sul: "dv:br:sul",
};
/** Uma sessão como este modo a entende: a da família "brasil" vira a de "divisoes" no país br. */
export function asDivisionSession<S extends { family?: string; variant?: string; mode?: string; region?: string; regions?: string[] }>(session: S): S {
  if (session.family !== LEGACY_FAMILY) return session;
  const variant = LEGACY_VARIANT[session.variant ?? ""] ?? session.variant;
  const map = (key: string) => LEGACY_REGION[key] ?? key;
  return { ...session, family: "divisoes", variant, mode: variant, region: map(session.region ?? "brasil"), ...(session.regions ? { regions: session.regions.map(map) } : {}) };
}
export const isDivisionFamily = (family: string | undefined) => family === "divisoes" || family === LEGACY_FAMILY;

// ---- recortes: "dv:<país>" é o país inteiro e "dv:<país>:<região>" uma região dele
export const divisionRegion = (country: string, region?: string): DivisionRegion => (region ? `dv:${country}:${region}` : `dv:${country}`);
export const isDivisionRegion = (key: unknown): key is DivisionRegion => typeof key === "string" && key.startsWith("dv:");
export function parseDivisionRegion(key: string): { country: string; region: string | null } | null {
  if (!isDivisionRegion(key)) return null;
  const [, country, region] = key.split(":");
  return country ? { country, region: region ?? null } : null;
}
/** O país de um recorte (o primeiro recorte de Estados e províncias da seleção); nulo fora deste modo. */
export function divisionCountryOf(selection: RegionSelection | readonly string[] | string | undefined | null): string | null {
  const values = selection == null ? [] : Array.isArray(selection) ? selection : [selection as string];
  for (const value of values) {
    const parsed = parseDivisionRegion(String(LEGACY_REGION[value as string] ?? value));
    if (parsed) return parsed.country;
  }
  return null;
}
/** O recorte normalizado: um país só (o primeiro); o país inteiro, ou as regiões dele na ordem do índice (todas marcadas = o país inteiro). */
export function normalizeDivisionSelection(values: readonly string[]): Region[] {
  const country = divisionCountryOf(values);
  const info = divisionCountry(country);
  if (!country || !info) return [];
  const keys = new Set(values.map((value) => parseDivisionRegion(value)).filter((parsed) => parsed?.country === country).map((parsed) => parsed!.region));
  if (keys.has(null)) return [divisionRegion(country)];
  const picked = info.regions.filter((region) => keys.has(region.key)).map((region) => divisionRegion(country, region.key));
  return picked.length === 0 || picked.length === info.regions.length ? [divisionRegion(country)] : picked;
}
/** O nome de um recorte no idioma da interface: o país ("Brasil") ou a região ("Nordeste"). Aceita também a região de uma unidade ("br:nordeste"). */
export function divisionRegionLabel(key: string, locale: Locale = uiLocale): string {
  const parsed = parseDivisionRegion(key.startsWith("dv:") ? key : `dv:${key}`);
  const country = divisionCountry(parsed?.country);
  if (!parsed || !country) return key;
  if (!parsed.region) return country.name[locale];
  return country.regions.find((region) => region.key === parsed.region)?.name[locale] ?? parsed.region;
}
/** Os recortes de um país para a Mesa: o país inteiro e as regiões, como os do mapa-múndi ([chave, nome, descrição]). */
export function divisionRegionItems(countryId: string, locale: Locale = uiLocale): [Region, string, string][] {
  const country = divisionCountry(countryId);
  if (!country) return [];
  return [[divisionRegion(country.id), country.name[locale], ""], ...country.regions.map((region): [Region, string, string] => [divisionRegion(country.id, region.key), region.name[locale], ""])];
}
/** Quantas unidades cada recorte de cada país tem no modo (a Mesa conta sem carregar o pacote; nos modos de capital, só as que têm capital). */
export function divisionCounts(variant?: string): Record<string, number> {
  const capital = isCapitalVariant(variant);
  const counts: Record<string, number> = {};
  for (const country of DIVISION_COUNTRIES) {
    counts[divisionRegion(country.id)] = capital ? country.capitals : country.count;
    for (const region of country.regions) counts[divisionRegion(country.id, region.key)] = capital ? region.capitals : region.count;
  }
  return counts;
}
export function divisionSelectedCount(selection: RegionSelection, variant?: string): number {
  const counts = divisionCounts(variant);
  return normalizeDivisionSelection(Array.isArray(selection) ? selection : [selection]).reduce((total, key) => total + (counts[key] ?? 0), 0);
}

// ---- pacote de um país
export type DivisionUnitRow = {
  code: string;
  ref: string;
  name: Names;
  alias?: string[];
  capital?: string;
  capAl?: string[];
  region: string;
  area: number;
  /** Ponto do rótulo, dentro da unidade: [lat, lon] (como o `ll` do catálogo). */
  ll: [number, number];
  /** Caixa sem as ilhas distantes, [oeste, sul, leste, norte]. */
  bbox: [number, number, number, number];
  /** Vizinhos pelas divisas (ids). */
  borders: string[];
};
export type DivisionUnitsFile = { source: string; country: string; regions: Record<string, Names>; units: Record<string, DivisionUnitRow> };
export type DivisionFlagsFile = { source: string; flags: Record<string, string>; ratio: Record<string, number>; sources: Record<string, { file: string; url: string; license: string }> };
export type DivisionShapesFile = Record<string, { type: string; coordinates: unknown }>;
export type DivisionPack = {
  country: string;
  /** O catálogo no formato do mapa-múndi: `meta` por id de unidade ("br-sp", "us-ca"), com `pt` no idioma da interface. */
  data: Legacy;
  /** Caixa de cada unidade (a câmera do mapa enquadra o recorte por ela). */
  bbox: Readonly<Record<string, readonly [number, number, number, number]>>;
};

/** O catálogo das unidades no formato que os motores leem. `pt` traz o nome no idioma da interface (como no acervo traduzido); os nomes nos
 *  outros idiomas e os apelidos valem na escrita (`en` e `al`). O código é o `cca3` e as divisas são os `borders` (a Pista de vizinhos funciona
 *  igual à dos países); a região é "<país>:<região>" (o recorte e a Bússola); a bandeira é o próprio id (`fl`), a chave de flags.json. */
export function divisionCatalog(file: DivisionUnitsFile, locale: Locale = uiLocale): DivisionPack {
  const meta: Record<string, Meta> = {};
  const bbox: Record<string, readonly [number, number, number, number]> = {};
  for (const [id, row] of Object.entries(file.units)) {
    const shown = row.name[locale] ?? row.name.pt;
    const others = [...new Set([row.name.pt, row.name.es, row.name.en, ...(row.alias ?? [])])].filter((name) => name !== shown && name !== row.name.en);
    meta[id] = {
      pt: shown,
      en: row.name.en,
      ...(others.length ? { al: others } : {}),
      ...(row.capital ? { cap: row.capital } : {}),
      ...(row.capAl?.length ? { capAl: [...row.capAl] } : {}),
      fl: id,
      reg: `${file.country}:${row.region}`,
      ll: row.ll,
      cca3: row.code,
      borders: row.borders.map((neighbor) => file.units[neighbor]?.code ?? neighbor),
      area: row.area,
      un: true,
    };
    bbox[id] = row.bbox;
  }
  return { country: file.country, data: { sourceVersion: `divisions-${file.country}`, sourceHash: file.source, meta, mapEntityIds: Object.keys(meta) }, bbox };
}

/** As unidades do recorte (o país inteiro ou as regiões escolhidas); nos modos de capital, só as que têm capital. */
export function divisionIdsIn(pack: DivisionPack, selection: RegionSelection, variant?: string): string[] {
  const capital = isCapitalVariant(variant);
  const keys = normalizeDivisionSelection(Array.isArray(selection) ? selection : [selection]);
  const whole = keys.length === 0 || keys.includes(divisionRegion(pack.country));
  const regions = new Set(keys.map((key) => parseDivisionRegion(key)?.region).filter(Boolean).map((region) => `${pack.country}:${region}`));
  return Object.entries(pack.data.meta).filter(([, meta]) => (whole || regions.has(meta.reg ?? "")) && (!capital || Boolean(meta.cap))).map(([id]) => id);
}

/** Caixa [oeste, sul, leste, norte] do enquadramento da câmera: o quadro do país inteiro, ou a caixa das unidades do recorte. */
export function divisionBounds(pack: DivisionPack, ids: readonly string[], selection: RegionSelection): [number, number, number, number] {
  const keys = normalizeDivisionSelection(Array.isArray(selection) ? selection : [selection]);
  const country = divisionCountry(pack.country);
  if (country && (keys.length === 0 || keys.includes(divisionRegion(pack.country)))) return [...country.frame];
  const boxes = ids.map((id) => pack.bbox[id]).filter(Boolean);
  if (!boxes.length) return country ? [...country.frame] : [-180, -60, 180, 75];
  return [
    Math.min(...boxes.map((box) => box[0])), Math.min(...boxes.map((box) => box[1])),
    Math.max(...boxes.map((box) => box[2])), Math.max(...boxes.map((box) => box[3])),
  ];
}

// ---- seletor de países da Mesa (07/10/2026, opção A do mock): o continente vem do mapa-múndi (o `reg` da entidade `carta`), os países jogados por
// último e a precisão de cada um saem das sessões, e a busca ignora acento e caixa nos três idiomas
export const DIVISION_CONTINENTS = ["Americas", "Europe", "Asia", "Africa", "Oceania"] as const;
export type DivisionContinent = (typeof DIVISION_CONTINENTS)[number];
export function divisionContinent(country: DivisionCountry, worldMeta: Readonly<Record<string, { reg?: string } | undefined>>): DivisionContinent | null {
  const reg = worldMeta[country.carta]?.reg;
  return (DIVISION_CONTINENTS as readonly string[]).includes(reg ?? "") ? (reg as DivisionContinent) : null;
}
export type DivisionCountryPlay = { last: number; matches: number; accuracy: number };
type PlaySession = { family?: string; variant?: string; region?: string; regions?: string[]; complete?: boolean; roundCount?: number; correct?: number; startedAt?: number | null };
/** Por país: as partidas completas, a precisão de todas as rodadas delas (0 a 100) e quando foi a última (as da família "brasil" contam no Brasil). */
export function divisionCountryPlays(sessions: readonly PlaySession[]): Record<string, DivisionCountryPlay> {
  const plays: Record<string, { last: number; matches: number; rounds: number; correct: number }> = {};
  for (const raw of sessions) {
    if (!isDivisionFamily(raw.family) || !raw.complete || !raw.roundCount) continue;
    const session = asDivisionSession(raw);
    const country = divisionCountryOf(session.regions?.length ? session.regions : session.region);
    if (!country) continue;
    const entry = plays[country] ??= { last: 0, matches: 0, rounds: 0, correct: 0 };
    entry.last = Math.max(entry.last, session.startedAt ?? 0);
    entry.matches += 1;
    entry.rounds += session.roundCount ?? 0;
    entry.correct += session.correct ?? 0;
  }
  return Object.fromEntries(Object.entries(plays).map(([country, entry]) => [country, { last: entry.last, matches: entry.matches, accuracy: Math.round((entry.correct / entry.rounds) * 100) }]));
}
/** Os países jogados por último, do mais recente (até `limit`). */
export function recentDivisionCountries(plays: Readonly<Record<string, DivisionCountryPlay>>, limit = 3): string[] {
  return Object.entries(plays).filter(([country]) => divisionCountry(country)).sort((a, b) => b[1].last - a[1].last).slice(0, limit).map(([country]) => country);
}
const fold = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
/** O país casa com a busca pelo nome em qualquer um dos três idiomas, ou por outros nomes dele (`extra`: os do mapa-múndi, "Estados Unidos"),
 *  sem acento nem caixa. */
export function divisionCountryMatches(country: DivisionCountry, query: string, extra: readonly (string | undefined)[] = []): boolean {
  const wanted = fold(query);
  return !wanted || [...Object.values(country.name), ...extra].some((name) => Boolean(name) && fold(name as string).includes(wanted));
}
