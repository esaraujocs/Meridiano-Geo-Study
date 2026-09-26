import type { GeoFeature, Legacy } from "./types";
import { t } from "./i18n/index.js";
import { localizeCatalog } from "./i18n/content.js";

export async function loadLegacy(): Promise<Legacy> {
  const response = await fetch("/data/legacy/catalog.json");
  if (!response.ok) throw new Error(t.app.catalogFailed);
  return localizeCatalog(await response.json());
}

export function buildFeatures(data: Legacy): GeoFeature[] {
  return data.mapEntityIds.map((id) => ({ id }));
}

export function eligible(features: GeoFeature[]) {
  return features;
}