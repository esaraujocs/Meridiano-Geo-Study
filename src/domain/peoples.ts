// Gentílicos e Moedas: os dados (public/data/peoples.json, gerado por scripts/data/build-peoples.mjs) e as regras das alternativas. Lógica pura.
// Os dois modos perguntam sobre países do catálogo, mas não mexem na coleção nem no domínio (como Idiomas): ver persistProgress no QuizGame
// e OUTSIDE_DOMAIN_FAMILIES em dominated.ts.
import type { AnyQuizVariant, Family } from "./types";
import type { Locale } from "./i18n/locale.js";

export type PeoplesFamily = Extract<Family, "gentilicos" | "moedas">;
export type PeoplesVariant = Extract<AnyQuizVariant, "gentilico-pais" | "pais-gentilico" | "moeda-pais" | "pais-moeda">;
type Names = Record<Locale, string>;
export type PeoplesFile = {
  version: number;
  currencies: Record<string, Names>;
  entries: Record<string, { dem?: Names; cur?: string[] }>;
};
/** Os dados no idioma da interface: gentílico por país, moedas por país (a primeira é a principal) e nome de cada moeda. */
export type Peoples = {
  demonym: Readonly<Record<string, string>>;
  currencies: Readonly<Record<string, readonly string[]>>;
  currencyName: Readonly<Record<string, string>>;
};

export const PEOPLES_FAMILIES: readonly PeoplesFamily[] = ["gentilicos", "moedas"];
export const isPeoplesFamily = (family: string): family is PeoplesFamily => (PEOPLES_FAMILIES as readonly string[]).includes(family);
export const isPeoplesVariant = (variant: string): variant is PeoplesVariant =>
  variant === "gentilico-pais" || variant === "pais-gentilico" || variant === "moeda-pais" || variant === "pais-moeda";
export const familyOfPeoplesVariant = (variant: PeoplesVariant): PeoplesFamily => variant.includes("gentilico") ? "gentilicos" : "moedas";

export function localizePeoples(file: PeoplesFile, locale: Locale): Peoples {
  const demonym: Record<string, string> = {};
  const currencies: Record<string, string[]> = {};
  for (const [id, entry] of Object.entries(file.entries)) {
    if (entry.dem?.[locale]) demonym[id] = entry.dem[locale];
    if (entry.cur?.length) currencies[id] = entry.cur.filter((code) => file.currencies[code]);
  }
  const currencyName = Object.fromEntries(Object.entries(file.currencies).map(([code, names]) => [code, names[locale]]));
  return { demonym, currencies, currencyName };
}

/** A moeda principal do país (a primeira do anexo, ou a escolhida à mão em overrides.json). */
export const mainCurrency = (peoples: Peoples, id: string) => peoples.currencies[id]?.[0] ?? null;
const key = (text: string | null | undefined) => (text ?? "").toLocaleLowerCase();

/** Os ids que o modo pode perguntar (dentro de `ids`, já filtrados por recorte e filtro ONU). */
export function peoplesPool(ids: readonly string[], peoples: Peoples, family: PeoplesFamily) {
  return ids.filter((id) => family === "gentilicos" ? Boolean(peoples.demonym[id]) : Boolean(mainCurrency(peoples, id)));
}

// hash simples e estável (FNV-1a), para escolher o representante de cada moeda de forma reprodutível
function hash(text: string) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) { value ^= text.charCodeAt(index); value = Math.imul(value, 16777619); }
  return value >>> 0;
}

/**
 * O baralho do modo. Em "Moeda → país" cada moeda aparece uma vez só (o euro não pode virar 20 rodadas no recorte Europa): fica um país por moeda
 * principal, sorteado pela semente; os outros que usam a mesma moeda nunca aparecem como alternativa errada (ver `peoplesOptions`).
 */
export function peoplesDeckPool(pool: readonly string[], peoples: Peoples, variant: PeoplesVariant, seed = "") {
  if (variant !== "moeda-pais") return [...pool];
  const pick = new Map<string, string>();
  for (const id of pool) {
    const code = mainCurrency(peoples, id);
    if (!code) continue;
    const current = pick.get(code);
    if (!current || hash(`${seed}:${id}`) < hash(`${seed}:${current}`)) pick.set(code, id);
  }
  return pool.filter((id) => pick.get(mainCurrency(peoples, id) ?? "") === id);
}

/** Quantas rodadas o recorte rende (o tamanho do baralho), para as contagens da configuração. */
export const peoplesDeckSize = (pool: readonly string[], peoples: Peoples, variant: PeoplesVariant) =>
  variant === "moeda-pais" ? new Set(pool.map((id) => mainCurrency(peoples, id))).size : pool.length;

/**
 * As 4 alternativas (ids de país): o alvo e 3 erradas que não podem também estar certas nem repetir o texto de outra.
 * - Gentílico → país: o gentílico da errada é outro (os dois Congos são "congolês": um nunca é a errada do outro).
 * - País → gentílico: os gentílicos mostrados são todos diferentes.
 * - País → moeda: a moeda mostrada da errada não é nenhuma das moedas do alvo (o Panamá também usa o dólar) e não repete.
 * - Moeda → país: a errada não usa a moeda perguntada (nem como segunda moeda, como o rand no Lesoto).
 * `candidates` vem embaralhado de fora (o motor usa o mesmo embaralhador das outras alternativas).
 */
export function peoplesOptions(target: string, candidates: readonly string[], peoples: Peoples, variant: PeoplesVariant, count = 3): string[] {
  const chosen: string[] = [];
  const shown = new Set<string>([key(optionText(peoples, variant, target))]);
  const targetCurrencies = new Set(peoples.currencies[target] ?? []);
  const asked = mainCurrency(peoples, target);
  for (const id of candidates) {
    if (chosen.length >= count) break;
    if (id === target) continue;
    if (variant === "gentilico-pais" && key(peoples.demonym[id]) === key(peoples.demonym[target])) continue;
    if (variant === "pais-gentilico" && (!peoples.demonym[id] || shown.has(key(peoples.demonym[id])))) continue;
    if (variant === "pais-moeda") { const code = mainCurrency(peoples, id); if (!code || targetCurrencies.has(code) || shown.has(key(peoples.currencyName[code]))) continue; }
    if (variant === "moeda-pais" && (!asked || (peoples.currencies[id] ?? []).includes(asked))) continue;
    if (variant === "gentilico-pais" && !peoples.demonym[id]) continue;
    if (variant === "moeda-pais" && !mainCurrency(peoples, id)) continue;
    chosen.push(id);
    if (variant === "pais-gentilico" || variant === "pais-moeda") shown.add(key(optionText(peoples, variant, id)));
  }
  return chosen;
}

const capitalize = (text: string) => text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;
/** Texto da pergunta quando ela não é o nome do país (gentílico ou moeda); null nos sentidos que perguntam pelo país. */
export function promptText(peoples: Peoples, variant: PeoplesVariant, target: string): string | null {
  if (variant === "gentilico-pais") return capitalize(peoples.demonym[target] ?? "");
  if (variant === "moeda-pais") { const code = mainCurrency(peoples, target); return code ? capitalize(peoples.currencyName[code] ?? "") : ""; }
  return null;
}
/** Texto da alternativa quando ela não é o nome do país; null nos sentidos em que a alternativa é o país. */
export function optionText(peoples: Peoples, variant: PeoplesVariant, id: string): string | null {
  if (variant === "pais-gentilico") return capitalize(peoples.demonym[id] ?? "");
  if (variant === "pais-moeda") { const code = mainCurrency(peoples, id); return code ? capitalize(peoples.currencyName[code] ?? "") : ""; }
  return null;
}
