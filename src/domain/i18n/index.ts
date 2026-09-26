// Ponto único de acesso aos textos: `t.secao.chave`. O idioma é lido uma vez, na abertura (ver locale.ts).
import { locale, type Locale } from "./locale.js";
import { pt, type Messages } from "./pt.js";
import { en } from "./en.js";
import { es } from "./es.js";

export const MESSAGES: Record<Locale, Messages> = { pt, en, es };
export const t: Messages = MESSAGES[locale];
export type { Messages };
export * from "./locale.js";
