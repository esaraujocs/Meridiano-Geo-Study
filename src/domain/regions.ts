import type { Legacy, Region, RegionSelection, WorldRegion } from "./types";
import { t } from "./i18n/index.js";
import { divisionRegionLabel, isDivisionRegion, normalizeDivisionSelection, parseDivisionRegion } from "./divisions.js";
const REGION_KEYS: WorldRegion[] = ["caribe", "pacifico", "europa", "africa", "asia", "america-do-sul", "america-do-norte-central"];
export function normalizeRegionSelection(selection: RegionSelection): Region[] {
  const values = Array.isArray(selection) ? selection : [selection];
  // Estados e províncias: um país só, o inteiro ou as regiões dele (divisions.ts)
  if (values.some(isDivisionRegion)) return normalizeDivisionSelection(values);
  if (values.includes("mundo") || REGION_KEYS.every((key) => values.includes(key))) return ["mundo"];
  return REGION_KEYS.filter((key) => values.includes(key));
}
export function regionSelectionIncludes(selection: RegionSelection, region: Region) {
  const normalized = normalizeRegionSelection(selection);
  if (normalized.includes("mundo") || normalized.includes(region)) return true;
  const parsed = isDivisionRegion(region) ? parseDivisionRegion(region) : null;
  return Boolean(parsed?.region && normalized.includes(`dv:${parsed.country}`));
}
export function idsInRegionSelection(ids: Iterable<string>, selection: RegionSelection, data: Legacy) {
  return [...ids].filter((id) => inRegion(id, selection, data));
}

/** Câmera inicial de cada recorte do mapa-múndi (em Estados e províncias a câmera enquadra a caixa das unidades, `divisionBounds`). */
export const REGION_CAMERA: Record<WorldRegion, { center: [number, number]; zoom: number }> = {
  mundo: { center: [0, 18], zoom: 1.35 },
  caribe: { center: [-72, 16], zoom: 3.35 },
  pacifico: { center: [158, -12], zoom: 2.15 },
  europa: { center: [15, 50], zoom: 2.25 },
  africa: { center: [20, 5], zoom: 2.05 },
  asia: { center: [90, 35], zoom: 1.8 },
  "america-do-sul": { center: [-60, -18], zoom: 2.25 },
  "america-do-norte-central": { center: [-100, 28], zoom: 2.05 },
};
export const cameraFor = (region: Region) => REGION_CAMERA[isDivisionRegion(region) ? "mundo" : region];

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
  // unidades de Estados e províncias: `reg` é "<país>:<região>"
  if (isDivisionRegion(region)) {
    const parsed = parseDivisionRegion(region);
    if (!parsed) return false;
    return parsed.region ? meta.reg === `${parsed.country}:${parsed.region}` : Boolean(meta.reg?.startsWith(`${parsed.country}:`));
  }
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

const REGION_ORDER: WorldRegion[] = ["mundo", "caribe", "pacifico", "europa", "africa", "asia", "america-do-sul", "america-do-norte-central"];
/** [chave, nome, descrição] de cada recorte do mapa-múndi, no idioma da interface (os de Estados e províncias: `divisionRegionItems`). */
export const REGION_ITEMS: [Region, string, string][] = REGION_ORDER.map((key) => [key, t.regions[key][0], t.regions[key][1]]);

export function regionLabel(region: RegionSelection) {
  const normalized = normalizeRegionSelection(region);
  if (normalized.length === 1) {
    const [key] = normalized;
    return isDivisionRegion(key) ? divisionRegionLabel(key) : REGION_ITEMS.find(([item]) => item === key)?.[1] ?? key;
  }
  return t.regions.many(normalized.length);
}
