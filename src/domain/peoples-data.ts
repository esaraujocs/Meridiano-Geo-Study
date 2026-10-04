// Carrega public/data/peoples.json uma vez e entrega no idioma da interface (ver peoples.ts).
import { locale } from "./i18n/locale.js";
import { localizePeoples, type Peoples, type PeoplesFile } from "./peoples.js";

let peoplesPromise: Promise<Peoples> | null = null;
let loaded: Peoples | null = null;

export function loadPeoples(): Promise<Peoples> {
  peoplesPromise ??= fetch("/data/peoples.json").then(async (response) => {
    if (!response.ok) throw new Error(`peoples.json: ${response.status}`);
    loaded = localizePeoples((await response.json()) as PeoplesFile, locale);
    return loaded;
  }).catch((error) => { peoplesPromise = null; throw error; });
  return peoplesPromise;
}

/** Os dados, se já chegaram (as contagens da configuração esperam o `loadPeoples` da abertura da família). */
export const cachedPeoples = () => loaded;
