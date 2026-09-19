import type { Legacy, Region, RegionSelection } from "./types";
const REGION_KEYS: Region[] = ["caribe", "pacifico", "europa", "africa", "asia", "america-do-sul", "america-do-norte-central"];
export function normalizeRegionSelection(selection: RegionSelection): Region[] {
  const values = Array.isArray(selection) ? selection : [selection];
  if (values.includes("mundo") || REGION_KEYS.every((key) => values.includes(key))) return ["mundo"];
  return REGION_KEYS.filter((key) => values.includes(key));
}
export function regionSelectionIncludes(selection: RegionSelection, region: Region) {
  const normalized = normalizeRegionSelection(selection);
  return normalized.includes("mundo") || normalized.includes(region);
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

export const REGION_ITEMS: [Region, string, string][] = [
  ["mundo", "Mundo", "A extensão completa do atlas"],
  ["caribe", "Caribe", "Ilhas, istmos e mares próximos"],
  ["pacifico", "Pacífico", "Oceania, Melanésia e Micronésia"],
  ["europa", "Europa", "Do Atlântico aos Urais"],
  ["africa", "África", "Norte, Sahel e África subsaariana"],
  ["asia", "Ásia", "Do Levante ao Pacífico"],
  ["america-do-sul", "América do Sul", "Andes, Cone Sul e Amazônia"],
  ["america-do-norte-central", "América do Norte e Central", "Do Ártico ao istmo"],
];

export function regionLabel(region: RegionSelection) {
  const normalized = normalizeRegionSelection(region);
  if (normalized.length === 1) return REGION_ITEMS.find(([key]) => key === normalized[0])?.[1] ?? normalized[0];
  return `${normalized.length} recortes`;
}