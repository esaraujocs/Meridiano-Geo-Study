import type { Legacy, Region, RegionSelection } from "./types";
import { t } from "./i18n/index.js";
const REGION_KEYS: Region[] = ["caribe", "pacifico", "europa", "africa", "asia", "america-do-sul", "america-do-norte-central"];
/** Família Brasil: as 5 regiões do IBGE; "brasil" é o país inteiro (o "mundo" desta família). */
export const BR_REGION_KEYS = ["norte", "nordeste", "centro-oeste", "sudeste", "sul"] as const satisfies readonly Region[];
export type BrRegion = (typeof BR_REGION_KEYS)[number];
export const isBrRegion = (key: unknown): key is BrRegion => (BR_REGION_KEYS as readonly unknown[]).includes(key);
const isBrasilKey = (key: Region) => key === "brasil" || isBrRegion(key);
export function normalizeRegionSelection(selection: RegionSelection): Region[] {
  const values = Array.isArray(selection) ? selection : [selection];
  if (values.some(isBrasilKey)) {
    if (values.includes("brasil") || BR_REGION_KEYS.every((key) => values.includes(key))) return ["brasil"];
    return BR_REGION_KEYS.filter((key) => values.includes(key));
  }
  if (values.includes("mundo") || REGION_KEYS.every((key) => values.includes(key))) return ["mundo"];
  return REGION_KEYS.filter((key) => values.includes(key));
}
export function regionSelectionIncludes(selection: RegionSelection, region: Region) {
  const normalized = normalizeRegionSelection(selection);
  return normalized.includes("mundo") || normalized.includes(region) || (normalized.includes("brasil") && isBrRegion(region));
}
export function idsInRegionSelection(ids: Iterable<string>, selection: RegionSelection, data: Legacy) {
  return [...ids].filter((id) => inRegion(id, selection, data));
}

export const REGION_CAMERA: Record<
  Region,
  { center: [number, number]; zoom: number }
> = {
  mundo: { center: [0, 18], zoom: 1.35 },
  caribe: { center: [-72, 16], zoom: 3.35 },
  pacifico: { center: [158, -12], zoom: 2.15 },
  europa: { center: [15, 50], zoom: 2.25 },
  africa: { center: [20, 5], zoom: 2.05 },
  asia: { center: [90, 35], zoom: 1.8 },
  "america-do-sul": { center: [-60, -18], zoom: 2.25 },
  "america-do-norte-central": { center: [-100, 28], zoom: 2.05 },
  // no Brasil a câmera enquadra a caixa dos estados (brasilBounds); estes valem só de reserva
  brasil: { center: [-53, -14.5], zoom: 3 },
  norte: { center: [-61, -4], zoom: 3.6 },
  nordeste: { center: [-40.5, -9], zoom: 4 },
  "centro-oeste": { center: [-53.5, -15.5], zoom: 4 },
  sudeste: { center: [-46, -20.5], zoom: 4.6 },
  sul: { center: [-52, -27.5], zoom: 4.8 },
};

export function regionMatches(
  meta: { reg?: string; sub?: string } | undefined,
  region: RegionSelection,
) {
  if (normalizeRegionSelection(region).includes("mundo")) return true;
  return normalizeRegionSelection(region).some((item) => regionMatchesSingle(meta, item));
}
function regionMatchesSingle(
  meta: { reg?: string; sub?: string } | undefined,
  region: Region,
) {
  if (region === "mundo") return true;
  if (!meta) return false;
  // estados do Brasil: `reg` é a chave da região do IBGE
  if (region === "brasil") return isBrRegion(meta.reg);
  if (isBrRegion(region)) return meta.reg === region;
  if (region === "caribe") {
    return meta.reg === "Caribbean" || meta.sub === "Caribbean" ||
      (meta.reg === "Americas" && meta.sub === "Caribbean");
  }
  if (region === "pacifico") return meta.reg === "Oceania";
  if (region === "europa") return meta.reg === "Europe";
  if (region === "africa") return meta.reg === "Africa";
  if (region === "asia") return meta.reg === "Asia";
  if (region === "america-do-sul") {
    return meta.sub === "South America" || meta.reg === "South America";
  }
  return meta.sub === "North America" || meta.sub === "Central America" ||
    meta.reg === "North America" || meta.reg === "Central America";
}

export function inRegion(id: string, region: RegionSelection, data: Legacy) {
  return regionMatches(data.meta[id], region);
}

const REGION_ORDER: Region[] = ["mundo", "caribe", "pacifico", "europa", "africa", "asia", "america-do-sul", "america-do-norte-central"];
/** [chave, nome, descrição] de cada recorte, no idioma da interface. */
export const REGION_ITEMS: [Region, string, string][] = REGION_ORDER.map((key) => [key, t.regions[key][0], t.regions[key][1]]);
/** Os recortes da família Brasil: o país inteiro e as 5 regiões. */
export const BR_REGION_ITEMS: [Region, string, string][] = (["brasil", ...BR_REGION_KEYS] as Region[]).map((key) => [key, t.regions[key][0], t.regions[key][1]]);

export function regionLabel(region: RegionSelection) {
  const normalized = normalizeRegionSelection(region);
  if (normalized.length === 1) return [...REGION_ITEMS, ...BR_REGION_ITEMS].find(([key]) => key === normalized[0])?.[1] ?? normalized[0];
  return t.regions.many(normalized.length);
}