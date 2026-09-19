import type { GeoFeature, Legacy } from "./types";

export async function loadLegacy(): Promise<Legacy> {
  const response = await fetch("/data/legacy/catalog.json");
  if (!response.ok) throw new Error("Falha ao carregar catálogo");
  return response.json();
}

export function buildFeatures(data: Legacy): GeoFeature[] {
  return data.mapEntityIds.map((id) => ({ id }));
}

export function eligible(features: GeoFeature[]) {
  return features;
}