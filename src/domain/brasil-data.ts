// Carrega os dados da família Brasil (public/data/brasil/) uma vez cada: o catálogo dos estados ao abrir a família (~11 kB, entra nas contagens
// da Mesa), as bandeiras (~210 kB) e as silhuetas (~360 kB) só quando um modo precisa delas. Regras em brasil.ts.
import type { Feature, Geometry } from "geojson";
import { locale } from "./i18n/locale.js";
import type { FlagCatalog } from "./quiz.js";
import { brasilCatalog, type Brasil, type BrasilFlagsFile, type BrasilShapesFile, type BrasilStatesFile } from "./brasil.js";

/** Um pedido por arquivo; se falhar, o próximo uso tenta de novo. */
function once<T>(load: () => Promise<T>) {
  let pending: Promise<T> | null = null;
  return () => (pending ??= load().catch((error) => { pending = null; throw error; }));
}
async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as T;
}

let loaded: Brasil | null = null;
/** O catálogo dos estados, com os nomes no idioma da interface. */
export const loadBrasil = once(async () => {
  loaded = brasilCatalog(await fetchJson<BrasilStatesFile>("/data/brasil/states.json"), locale);
  return loaded;
});
/** O catálogo, se já chegou (as contagens da Mesa esperam o `loadBrasil` da abertura da família). */
export const cachedBrasil = () => loaded;

/** As bandeiras dos estados, no formato do acervo do mapa-múndi (chave = id do estado, o `fl` do catálogo). */
export const loadBrasilFlags = once(async (): Promise<FlagCatalog> => (await fetchJson<BrasilFlagsFile>("/data/brasil/flags.json")).flags);

/** As silhuetas, no formato do índice de geometria do mapa-múndi (`geometryIndex`). */
export const loadBrasilShapes = once(async () => {
  const shapes = await fetchJson<BrasilShapesFile>("/data/brasil/shapes.json");
  return new Map(Object.entries(shapes).map(([id, geometry]) => [id, { type: "Feature", id, properties: {}, geometry } as unknown as Feature<Geometry>]));
});
