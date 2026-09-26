import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import type { Legacy } from "./types";
import { t } from "./i18n/index.js";

type GeometryData = {
  topo: any;
  meta: Legacy["meta"];
};

let pending: Promise<GeometryData> | null = null;
let featureCache: Map<string, Feature<Geometry>> | null = null;

export function loadLegacyGeometry() {
  pending ??= fetch("/data/legacy-map.json").then(async (response) => {
    if (!response.ok) throw new Error(t.errors.geometryFailed);
    return response.json();
  });
  return pending;
}

export async function geometryIndex() {
  const data = await loadLegacyGeometry();
  if (!featureCache) {
    const collection = feature(data.topo, data.topo.objects.countries) as unknown as FeatureCollection;
    featureCache = new Map(
      collection.features
        .filter((item) => item.geometry)
        .map((item) => [String(item.id), item as Feature<Geometry>]),
    );
  }
  return { data, features: featureCache };
}

function walkCoordinates(geometry: Geometry, visit: (point: Position) => void) {
  if (geometry.type === "Point") visit(geometry.coordinates);
  else if (geometry.type === "MultiPoint" || geometry.type === "LineString") {
    geometry.coordinates.forEach(visit);
  } else if (geometry.type === "MultiLineString" || geometry.type === "Polygon") {
    geometry.coordinates.flat().forEach(visit);
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates.flat(2).forEach(visit);
  }
}

export function boundsOf(features: Feature<Geometry>[]) {
  const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  features.forEach((item) => walkCoordinates(item.geometry!, ([x, y]) => {
    bounds[0] = Math.min(bounds[0], x);
    bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x);
    bounds[3] = Math.max(bounds[3], y);
  }));
  if (!Number.isFinite(bounds[0])) return [-180, -90, 180, 90] as [number, number, number, number];
  return bounds;
}

function ringPath(ring: Position[], project: (p: Position) => [number, number]) {
  return ring.map((point, index) => {
    const [x, y] = project(point);
    return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ") + " Z";
}

export function pathForFeatures(features: Feature<Geometry>[], width = 320, height = 220) {
  const [minX, minY, maxX, maxY] = boundsOf(features);
  const spanX = Math.max(maxX - minX, 0.01);
  const spanY = Math.max(maxY - minY, 0.01);
  const scale = Math.min((width - 24) / spanX, (height - 24) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const project = ([x, y]: Position): [number, number] => [
    offsetX + (x - minX) * scale,
    height - offsetY - (y - minY) * scale,
  ];
  const paths: string[] = [];
  for (const item of features) {
    const geometry = item.geometry;
    if (!geometry) continue;
    if (geometry.type === "Polygon") paths.push(...geometry.coordinates.map((ring) => ringPath(ring, project)));
    if (geometry.type === "MultiPolygon") {
      geometry.coordinates.forEach((polygon) => polygon.forEach((ring) => paths.push(ringPath(ring, project))));
    }
  }
  return { d: paths.join(" "), width, height };
}

export function featurePath(item: Feature<Geometry> | undefined) {
  return item ? pathForFeatures([item]) : { d: "", width: 320, height: 220 };
}

export function aliases(meta: Legacy["meta"][string] | undefined) {
  return [meta?.pt, meta?.en, (meta as { al?: string[] } | undefined)?.al]
    .flat()
    .filter((value): value is string => typeof value === "string" && Boolean(value))
    .map(normalizeName);
}

export function normalizeName(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export function evaluateTravelGuess(
  meta: Legacy["meta"],
  intermediates: string[],
  accepted: string[],
  rawAnswer: string,
) {
  const answer = normalizeName(rawAnswer);
  const guessedId = intermediates.find((id) => aliases(meta[id]).includes(answer));
  if (guessedId && accepted.includes(guessedId)) {
    return { kind: "duplicate" as const, guessedId };
  }
  const expectedId = intermediates[accepted.length];
  if (guessedId === expectedId) {
    return { kind: "correct" as const, guessedId };
  }
  return { kind: "wrong" as const, guessedId };
}

export function solveTravelRoute(meta: Legacy["meta"], ids: string[], seed = 0) {
  const byCca3 = new Map(
    Object.entries(meta)
      .filter(([, value]) => value.cca3)
      .map(([id, value]) => [value.cca3!.toUpperCase(), id]),
  );
  const ordered = ids.filter((id) => meta[id]?.borders?.length).sort();
  for (let index = seed % Math.max(ordered.length, 1); index < ordered.length; index += 1) {
    const origin = ordered[index];
    const queue: string[][] = [[origin]];
    const visited = new Set([origin]);
    while (queue.length) {
      const route = queue.shift()!;
      if (route.length >= 3 && route.length <= 5) return route;
      if (route.length === 5) continue;
      const current = route[route.length - 1];
      const neighbors = (meta[current]?.borders ?? [])
        .map((id) => byCca3.get(String(id).toUpperCase()) ?? String(id))
        .filter((id) => meta[id] && !visited.has(id)).sort();
      for (const neighbor of neighbors) {
        visited.add(neighbor);
        queue.push([...route, neighbor]);
      }
    }
  }
  return null;
}

/** Finds a deterministic short route whose final node is the drawn destination. */
export function solveTravelRouteToDestination(meta: Legacy["meta"], ids: string[], destination: string, seed = 0) {
  const byCca3 = new Map(Object.entries(meta).filter(([, value]) => value.cca3).map(([id, value]) => [value.cca3!.toUpperCase(), id]));
  const origins = ids.filter((id) => id !== destination && meta[id]?.borders?.length).sort();
  const start = origins.length ? seed % origins.length : 0;
  for (let offset = 0; offset < origins.length; offset += 1) {
    const origin = origins[(start + offset) % origins.length];
    const queue: string[][] = [[origin]];
    const visited = new Set([origin]);
    while (queue.length) {
      const route = queue.shift()!;
      const current = route.at(-1)!;
      if (current === destination && route.length >= 3 && route.length <= 5) return route;
      if (route.length >= 5) continue;
      for (const neighbor of (meta[current]?.borders ?? []).map((id) => byCca3.get(String(id).toUpperCase()) ?? String(id)).filter((id) => meta[id] && !visited.has(id)).sort()) {
        visited.add(neighbor);
        queue.push([...route, neighbor]);
      }
    }
  }
  return null;
}

export function travelDestinationIds(meta: Legacy["meta"], ids: string[]) {
  return ids.filter((destination) => Boolean(solveTravelRouteToDestination(meta, ids, destination)));
}