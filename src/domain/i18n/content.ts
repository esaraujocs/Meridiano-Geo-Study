// Conteúdo traduzido (nomes, capitais, fichas, históricas, idiomas) sobreposto ao acervo em português na hora de carregar.
// Os arquivos saem de scripts/i18n/build-i18n.mjs em public/data/i18n/<locale>/. Em português nada é baixado.
// O campo `pt` do catálogo passa a guardar o nome no idioma da interface (é o nome que o jogo mostra e confere);
// `en` continua em inglês e vale como resposta digitada em qualquer idioma.
import { locale } from "./locale.js";
import type { Legacy, Meta } from "../types";

type CatalogOverlay = { name: string; cap?: string; capAl?: string[]; al?: string[]; fato?: string; lang?: string[]; cur?: string[] };
type HistoricalOverlay = { name: string; cap?: string; sucessor?: string; fato?: string };
type LanguageOverlay = { idioma: string; paises: string; tambem?: string; significado?: string; falantes?: string; ranking?: string };

async function fetchOverlay<T>(file: string): Promise<T | null> {
  if (locale === "pt") return null;
  try {
    const response = await fetch(`/data/i18n/${locale}/${file}`);
    return response.ok ? await response.json() as T : null;
  } catch { return null; }
}

export function applyCatalogOverlay(data: Legacy, overlay: Record<string, CatalogOverlay>): Legacy {
  const meta: Record<string, Meta> = {};
  for (const [id, source] of Object.entries(data.meta)) {
    const own = overlay[id];
    meta[id] = own
      ? { ...source, pt: own.name, cap: own.cap ?? source.cap, capAl: own.capAl, al: own.al ?? [], fato: own.fato ?? source.fato, lang: own.lang ?? source.lang, cur: own.cur ?? source.cur }
      : source;
  }
  // vizinhos na carta da Coleção: nome por código de 3 letras, no idioma da interface
  const names3 = { ...(data.names3 ?? {}) };
  for (const item of Object.values(meta)) if (item.cca3 && names3[item.cca3] !== undefined) names3[item.cca3] = item.pt ?? names3[item.cca3];
  return { ...data, meta, names3 };
}

export async function localizeCatalog(data: Legacy): Promise<Legacy> {
  const overlay = await fetchOverlay<{ meta: Record<string, CatalogOverlay> }>("catalog.json");
  return overlay ? applyCatalogOverlay(data, overlay.meta) : data;
}

export async function localizeSpecial<H extends { id: string; pt: string; cap?: string; sucessor?: string; fato?: string }, L extends { id: string; idioma: string; paises: string; tambem?: string; significado?: string; falantes?: string; ranking?: string }>(
  historical: H[], languages: L[],
): Promise<{ historical: H[]; languages: L[] }> {
  const [hist, langs] = await Promise.all([
    fetchOverlay<{ entities: Record<string, HistoricalOverlay> }>("historical.json"),
    fetchOverlay<{ entries: Record<string, LanguageOverlay> }>("languages.json"),
  ]);
  return {
    historical: hist ? historical.map((item) => {
      const own = hist.entities[item.id];
      return own ? { ...item, pt: own.name, cap: own.cap ?? item.cap, sucessor: own.sucessor ?? item.sucessor, fato: own.fato ?? item.fato } : item;
    }) : historical,
    languages: langs ? languages.map((item) => {
      const own = langs.entries[item.id];
      return own ? { ...item, ...own } : item;
    }) : languages,
  };
}
