import type { Legacy, Region } from "./types";

export const REGION_CAMERA: Record<
  Region,
  { center: [number, number]; zoom: number }
> = {
  mundo: { center: [0, 18], zoom: 1.35 },
  caribe: { center: [-72, 16], zoom: 3.35 },
  pacifico: { center: [158, -12], zoom: 2.15 },
};

export function inRegion(id: string, region: Region, data: Legacy) {
  if (region === "mundo") return true;
  const meta = data.meta[id];
  return region === "caribe"
    ? meta?.sub === "Caribbean"
    : meta?.reg === "Oceania";
}

export const REGION_ITEMS: [Region, string, string][] = [
  ["mundo", "Mundo", "A extensão completa do atlas"],
  ["caribe", "Caribe", "Ilhas, istmos e mares próximos"],
  ["pacifico", "Pacífico", "Oceania, Melanésia e Micronésia"],
];