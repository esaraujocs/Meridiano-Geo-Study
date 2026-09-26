// Idioma da interface. Fica neste aparelho (localStorage) e vale a partir do carregamento: trocar recarrega o app,
// porque os textos e os dados traduzidos (nomes, capitais, fatos) são montados uma vez só, na abertura.
export type Locale = "pt" | "en" | "es";
export const LOCALES: readonly Locale[] = ["pt", "en", "es"];
export const LOCALE_STORAGE_KEY = "carta-locale";
/** Nome de cada idioma escrito nele mesmo (é assim que aparece no seletor). */
export const LOCALE_NAMES: Record<Locale, string> = { pt: "Português", en: "English", es: "Español" };
/** Código BCP 47 para Intl (números, ordem alfabética) e para o atributo lang da página. */
export const INTL_LOCALE: Record<Locale, string> = { pt: "pt-BR", en: "en-US", es: "es-ES" };

export const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale);

/** Primeira abertura: segue o idioma do aparelho (espanhol e inglês); o resto fica em português. */
export function localeFromNavigator(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return "pt";
}

/**
 * Liberado em 25/09/2026 com a tradução completa (interface e conteúdo em inglês e espanhol): o seletor aparece em Opções
 * e, na primeira abertura, o jogo segue o idioma do aparelho. Com false, o seletor só aparece no debug e tudo abre em português.
 */
export const LOCALE_RELEASED = true;

function readLocale(): Locale {
  try {
    const saved = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(saved)) return saved;
    // fora do navegador (testes em Node, que também tem navigator.language) fica sempre em português
    if (!LOCALE_RELEASED || typeof document === "undefined") return "pt";
    const nav = globalThis.navigator;
    return nav ? localeFromNavigator(nav.languages?.length ? nav.languages : [nav.language]) : "pt";
  } catch { return "pt"; }
}

export const locale: Locale = readLocale();
export const intlLocale = INTL_LOCALE[locale];

export function changeLocale(next: Locale) {
  try { localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch { /* sem armazenamento: fica no idioma atual */ }
  location.reload();
}

/** Número no formato do idioma (1.234 / 1,234). */
export const formatNumber = (value: number) => value.toLocaleString(intlLocale);
/** Comparação alfabética no idioma atual (para ordenar listas de nomes). */
export const compareText = (a: string, b: string) => a.localeCompare(b, intlLocale);
