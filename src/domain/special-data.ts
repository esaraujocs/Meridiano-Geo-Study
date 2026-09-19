import type { Region } from "./types.js";

export type HistoricalEntity = {
  id: string; pt: string; reg?: string; sub?: string; fl?: string;
  ini?: number; fim?: number; tipo?: string; cap?: string;
};
export type LanguageEntry = {
  id: string; idioma: string; script: string; translit?: string;
  paises: string; reg?: string;
};
export type SpecialData = { historical: HistoricalEntity[]; historicalFlags: Record<string, string>; languages: LanguageEntry[] };
let promise: Promise<SpecialData> | null = null;
export function loadSpecialData() {
  promise ??= Promise.all([
    fetch("/data/legacy/historical.json"),
    fetch("/data/legacy/historical-flags.json"),
    fetch("/data/legacy/languages.json"),
  ]).then(async ([historical, flags, languages]) => {
    if (!historical.ok || !flags.ok || !languages.ok) throw new Error("Falha ao carregar acervo especial.");
    const [h, f, l] = await Promise.all([historical.json(), flags.json(), languages.json()]);
    return { historical: h.entities ?? [], historicalFlags: f.flags ?? {}, languages: l.entries ?? [] };
  });
  return promise;
}
export function specialInRegion(item: { reg?: string; sub?: string }, region: Region) {
  if (region === "mundo") return true;
  if (region === "caribe") return item.sub === "Caribbean" || item.reg === "Caribbean";
  return item.reg === "Oceania" || item.sub === "Oceania" || item.sub === "Melanesia" || item.sub === "Micronesia";
}
export function historicalPool(entries: HistoricalEntity[], region: Region) {
  return entries.filter((item) => specialInRegion(item, region));
}
export function languagePool(entries: LanguageEntry[], region: Region) {
  return entries.filter((item) => specialInRegion(item, region));
}
export function normalizeAnswer(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
}
export function acceptedWritingAnswers(value: { pt?: string; en?: string; al?: string | string[] }) {
  return [value.pt, value.en, ...(Array.isArray(value.al) ? value.al : [value.al])]
    .filter((item): item is string => Boolean(item)).map(normalizeAnswer);
}