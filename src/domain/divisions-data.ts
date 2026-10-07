// Carrega os pacotes do modo "Estados e províncias" (public/data/divisions/<país>/), um pedido por arquivo e por país: o catálogo ao começar
// a partida (~10–30 kB), as bandeiras e as silhuetas só nos modos que as usam. As regras estão em divisions.ts; o índice dos países, que a Mesa
// usa sem carregar nada, em divisions-index.ts.
import type { Feature, Geometry } from "geojson";
import { locale } from "./i18n/locale.js";
import type { FlagCatalog } from "./quiz.js";
import { divisionCatalog, divisionCountry, type DivisionFlagsFile, type DivisionPack, type DivisionShapesFile, type DivisionUnitsFile } from "./divisions.js";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as T;
}
/** Um pedido por chave; se falhar, o próximo uso tenta de novo. */
function cached<T>(load: (country: string) => Promise<T>) {
  const pending = new Map<string, Promise<T>>();
  return (country: string) => {
    let promise = pending.get(country);
    if (!promise) {
      promise = load(country).catch((error) => { pending.delete(country); throw error; });
      pending.set(country, promise);
    }
    return promise;
  };
}

const loaded = new Map<string, DivisionPack>();
/** O catálogo das unidades do país, com os nomes no idioma da interface. */
export const loadDivision = cached(async (country) => {
  const pack = divisionCatalog(await fetchJson<DivisionUnitsFile>(`/data/divisions/${country}/units.json`), locale);
  loaded.set(country, pack);
  return pack;
});
/** O catálogo, se já chegou. */
export const cachedDivision = (country: string | null | undefined) => (country ? loaded.get(country) ?? null : null);

/** As bandeiras das unidades, no formato do acervo do mapa-múndi (chave = id da unidade, o `fl` do catálogo). País sem bandeiras no índice (os
 *  EUA, por enquanto): catálogo vazio, sem pedir o arquivo (que não existe; o servidor responderia a página do app no lugar dele). */
export const loadDivisionFlags = cached(async (country): Promise<FlagCatalog> =>
  divisionCountry(country)?.flags ? (await fetchJson<DivisionFlagsFile>(`/data/divisions/${country}/flags.json`)).flags : {});

/** As silhuetas, no formato do índice de geometria do mapa-múndi (`geometryIndex`). */
export const loadDivisionShapes = cached(async (country) => {
  const shapes = await fetchJson<DivisionShapesFile>(`/data/divisions/${country}/shapes.json`);
  return new Map(Object.entries(shapes).map(([id, geometry]) => [id, { type: "Feature", id, properties: {}, geometry } as unknown as Feature<Geometry>]));
});
