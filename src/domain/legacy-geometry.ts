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

export function boundsOf(features: Feature<Geometry>[]) {
  const pieces = unwrapPieces(features);
  if (!pieces.length) return [-180, -90, 180, 90] as [number, number, number, number];
  return unionBounds(pieces);
}

function ringPath(ring: Position[], project: (p: Position) => [number, number]) {
  return ring.map((point, index) => {
    const [x, y] = project(point);
    return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ") + " Z";
}

type Piece = { outer: Position[]; holes: Position[][]; bounds: [number, number, number, number]; area: number };

function ringBounds(ring: readonly Position[]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function ringArea(ring: readonly Position[]) {
  let sum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    sum += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return Math.abs(sum / 2);
}

/** Some rings cross the antimeridian (180°/-180°: eastern Siberia in Russia, Fiji): naively, min/max longitude then spans the whole globe
 *  instead of the shape's real width. Unwraps the ring into a continuous coordinate sequence, adding/subtracting 360° whenever a jump is
 *  bigger than 180° between consecutive points. */
function unwrapRing(ring: readonly Position[]): Position[] {
  const out: Position[] = [ring[0]];
  let shift = 0;
  for (let index = 1; index < ring.length; index += 1) {
    const delta = ring[index][0] - ring[index - 1][0];
    if (delta > 180) shift -= 360;
    else if (delta < -180) shift += 360;
    out.push([ring[index][0] + shift, ring[index][1]]);
  }
  return out;
}

function boxGap(a: readonly number[], b: readonly number[]) {
  const dx = Math.max(0, a[0] - b[2], b[0] - a[2]);
  const dy = Math.max(0, a[1] - b[3], b[1] - a[3]);
  return Math.hypot(dx, dy);
}

/** Splits every feature into its polygon pieces (outer ring + holes), unwrapping each ring at the antimeridian. When an entity has more than
 *  one piece (islands, exclaves), the smaller ones are re-aligned (shifted by -360/0/+360, whichever lands closer) to the biggest piece's
 *  coordinate frame, so a country split across the dateline (Russia, Fiji) still gets one consistent, correctly-sized bounding box instead of
 *  each piece pulling the span toward ±180° independently. Nothing is dropped here — that's `mainlandOnly`, for specific ids only. */
function unwrapPieces(features: readonly Feature<Geometry>[]): Piece[] {
  const pieces: Piece[] = [];
  for (const item of features) {
    const geometry = item.geometry;
    if (!geometry) continue;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates]
      : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    for (const polygon of polygons) {
      const outer = unwrapRing(polygon[0]);
      pieces.push({ outer, holes: polygon.slice(1).map(unwrapRing), bounds: ringBounds(outer), area: ringArea(outer) });
    }
  }
  if (pieces.length <= 1) return pieces;
  const ordered = [...pieces].sort((a, b) => b.area - a.area);
  let reference = ordered[0].bounds;
  for (const piece of ordered.slice(1)) {
    let bestShift = 0;
    let bestGap = Infinity;
    for (const shift of [-360, 0, 360]) {
      const shifted: [number, number, number, number] = [piece.bounds[0] + shift, piece.bounds[1], piece.bounds[2] + shift, piece.bounds[3]];
      const gap = boxGap(reference, shifted);
      if (gap < bestGap) { bestGap = gap; bestShift = shift; }
    }
    if (bestShift !== 0) {
      piece.outer = piece.outer.map(([x, y]) => [x + bestShift, y]);
      piece.holes = piece.holes.map((hole) => hole.map(([x, y]) => [x + bestShift, y]));
      piece.bounds = [piece.bounds[0] + bestShift, piece.bounds[1], piece.bounds[2] + bestShift, piece.bounds[3]];
    }
    reference = [
      Math.min(reference[0], piece.bounds[0]), Math.min(reference[1], piece.bounds[1]),
      Math.max(reference[2], piece.bounds[2]), Math.max(reference[3], piece.bounds[3]),
    ];
  }
  return pieces;
}

function unionBounds(pieces: readonly Piece[]): [number, number, number, number] {
  let bounds: [number, number, number, number] = [...pieces[0].bounds];
  for (const piece of pieces.slice(1)) {
    bounds = [
      Math.min(bounds[0], piece.bounds[0]), Math.min(bounds[1], piece.bounds[1]),
      Math.max(bounds[2], piece.bounds[2]), Math.max(bounds[3], piece.bounds[3]),
    ];
  }
  return bounds;
}

export function pathForFeatures(features: Feature<Geometry>[], width = 320, height = 220) {
  const pieces = unwrapPieces(features);
  if (!pieces.length) return { d: "", width, height };
  const rawBounds = unionBounds(pieces);
  // Latitude correction: a degree of longitude covers less real distance than a degree of latitude away from the equator, so plotting raw
  // lon/lat with a single uniform scale stretches mid/high-latitude countries (Canada, Sweden…) wide and flat. Multiplying X by cos(mid
  // latitude) approximates the true proportions (a simple locally-corrected equirectangular projection). Floor avoids extreme scaling near
  // the poles (Antarctica).
  const midLatRad = ((rawBounds[1] + rawBounds[3]) / 2) * Math.PI / 180;
  const lonScale = Math.max(Math.cos(midLatRad), 0.15);
  const minX = rawBounds[0] * lonScale;
  const maxX = rawBounds[2] * lonScale;
  const [, minY, , maxY] = rawBounds;
  const spanX = Math.max(maxX - minX, 0.01);
  const spanY = Math.max(maxY - minY, 0.01);
  const scale = Math.min((width - 24) / spanX, (height - 24) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const project = ([x, y]: Position): [number, number] => [
    offsetX + (x * lonScale - minX) * scale,
    height - offsetY - (y - minY) * scale,
  ];
  const paths: string[] = [];
  for (const piece of pieces) {
    paths.push(ringPath(piece.outer, project));
    for (const hole of piece.holes) paths.push(ringPath(hole, project));
  }
  return { d: paths.join(" "), width, height };
}

/** Some countries carry a distant overseas dependency in the SAME map entity, far enough from the main territory that it inflates the
 *  silhouette's bounding box and shrinks the "recognizable country" to a speck in the corner (the reported "totalmente bugado" cases). List
 *  reviewed by hand, one ratio (relative to the entity's biggest piece) per id — not a generic distance/area rule: tried one across all ~250
 *  entities and it also cut islands that are part of other countries' recognizable shape (Sicily, the Greek islands, Croatia's coast), or, for a
 *  country with no single dominant piece (Kiribati's scattered atolls), collapsed it to almost nothing. Verified visually one by one:
 *  - frança (250) / holanda (528) / estados unidos (840), 15%: keeps just the mainland (France, Netherlands) or mainland+Alaska (USA, 32% of
 *    the mainland, close enough); French Guiana, Aruba/Curaçao/Sint Maarten, Hawaii and the Pacific/Caribbean territories (each well under 15%)
 *    drop out.
 *  - noruega (578), 0.1%: keeps the mainland and all of Svalbard's islands (smallest kept piece is ~0.45%); only drops Bouvet Island, a speck
 *    near Antarctica (~54°S, 0.013% of the mainland) that was stretching the box across more than 100° of latitude.
 *  Ver CLAUDE.md. */
const MAINLAND_ONLY_RATIO: Record<string, number> = { "250": 0.15, "528": 0.15, "840": 0.15, "578": 0.001 };

function mainlandOnly(item: Feature<Geometry>): Feature<Geometry> {
  const ratio = MAINLAND_ONLY_RATIO[String(item.id)];
  if (!ratio || item.geometry?.type !== "MultiPolygon") return item;
  const areas = item.geometry.coordinates.map((polygon) => ringArea(unwrapRing(polygon[0])));
  const maxArea = Math.max(...areas);
  const kept = item.geometry.coordinates.filter((_, index) => areas[index] >= maxArea * ratio);
  return { ...item, geometry: { ...item.geometry, coordinates: kept } };
}

export function featurePath(item: Feature<Geometry> | undefined) {
  return item ? pathForFeatures([mainlandOnly(item)]) : { d: "", width: 320, height: 220 };
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