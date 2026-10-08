import { regionMatches } from "./regions.js";
import type { RegionSelection } from "./types.js";
import { t } from "./i18n/index.js";
import { localizeSpecial } from "./i18n/content.js";

export type HistoricalEntity = {
  id: string; pt: string; reg?: string; sub?: string; fl?: string;
  ini?: number; fim?: number; tipo?: string; cap?: string; sucessor?: string; fato?: string;
};
export type LanguageEntry = {
  id: string; idioma: string; script: string; translit?: string;
  paises: string; reg?: string;
  /** Outros países onde o idioma é oficial (ou de uso oficial): aparece só no cartão, não nas alternativas do quiz. */
  tambem?: string;
  /** Tradução do provérbio, quantos falam e a posição do idioma no mundo (vêm do acervo do modo clássico). */
  significado?: string; falantes?: string; ranking?: string;
};
export type SpecialData = { historical: HistoricalEntity[]; historicalFlags: Record<string, string>; languages: LanguageEntry[] };
let promise: Promise<SpecialData> | null = null;
export function loadSpecialData() {
  promise ??= Promise.all([
    fetch("/data/legacy/historical.json"),
    fetch("/data/legacy/historical-flags.json"),
    fetch("/data/legacy/languages.json"),
  ]).then(async ([historical, flags, languages]) => {
    if (!historical.ok || !flags.ok || !languages.ok) throw new Error(t.app.specialFailed);
    const [h, f, l] = await Promise.all([historical.json(), flags.json(), languages.json()]);
    const historicalFlags = { ...(f.flags ?? {}) };
    const overrideResponse = await fetch("/data/flag-overrides/manifest.json").catch(() => null); // opcional: sem rede, segue sem as trocas
    const overrides = overrideResponse?.ok
      ? await overrideResponse.json() as Record<string, { src: string }>
      : {};
    for (const [id, override] of Object.entries(overrides)) {
      if (historicalFlags[id] && override.src) historicalFlags[id] = override.src;
    }
    const localized = await localizeSpecial<HistoricalEntity, LanguageEntry>(h.entities ?? [], l.entries ?? []);
    return { historical: localized.historical, historicalFlags, languages: localized.languages };
  });
  return promise;
}
export function specialInRegion(item: { reg?: string; sub?: string }, region: RegionSelection) {
  return regionMatches(item, region);
}
export function historicalPool(entries: HistoricalEntity[], region: RegionSelection) {
  return entries.filter((item) => specialInRegion(item, region));
}
export function languagePool(entries: LanguageEntry[], region: RegionSelection) {
  return entries.filter((item) => specialInRegion(item, region));
}
export function normalizeAnswer(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
}
/** Respostas aceitas para a capital: a do idioma da interface e as variantes (ex.: Kyiv/Kiev). */
export function acceptedCapitalAnswers(value: { cap?: string; capAl?: string[] }) {
  return [value.cap, ...(value.capAl ?? [])].filter((item): item is string => Boolean(item)).map(normalizeAnswer);
}
export function acceptedWritingAnswers(value: { pt?: string; en?: string; al?: string | string[] }) {
  return [value.pt, value.en, ...(Array.isArray(value.al) ? value.al : [value.al])]
    .filter((item): item is string => Boolean(item)).map(normalizeAnswer);
}