import type { GeoFeature, Legacy } from "./types.js";

type Point = [number, number];
type ProjectedPoint = [number, number];
type GeoJsonFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: Point };
  properties: { carta_id: string; part?: number; switchZoom?: number; opacity?: number };
};
type PolygonPart = { outer: Point[]; holes: Point[][] };

export const LEGACY_POINT_ENTITY_IDS = new Set(["744", "772"]);

function signedRingArea(ring: Point[]) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function ringCentroid(ring: Point[]): Point {
  const area = signedRingArea(ring);
  if (!area) return ring[0] ?? [0, 0];
  let x = 0;
  let y = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    const cross = x1 * y2 - x2 * y1;
    x += (x1 + x2) * cross;
    y += (y1 + y2) * cross;
  }
  return [x / (6 * area), y / (6 * area)];
}

function pointInRing([x, y]: Point, ring: Point[]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonParts(feature: GeoFeature): PolygonPart[] {
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return [];
  if (feature.geometry?.type === "Polygon") {
    const polygon = coordinates as Point[][];
    return polygon.length ? [{ outer: polygon[0], holes: polygon.slice(1) }] : [];
  }
  if (feature.geometry?.type === "MultiPolygon") {
    return (coordinates as Point[][][]).filter((polygon) => polygon.length).map((polygon) => ({
      outer: polygon[0],
      holes: polygon.slice(1),
    }));
  }
  return [];
}

function insidePart(point: Point, part: PolygonPart) {
  return pointInRing(point, part.outer) && !part.holes.some((hole) => pointInRing(point, hole));
}

/** Deterministic interior point, never a boundary fallback. */
function pointOnSurface(part: PolygonPart): Point {
  const outer = part.outer;
  const centroid = ringCentroid(outer);
  const candidates: Point[] = [centroid];
  const xs = outer.map(([x]) => x);
  const ys = outer.map(([, y]) => y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  candidates.push([(minX + maxX) / 2, (minY + maxY) / 2]);
  for (let index = 0; index < outer.length; index += 1) {
    const a = outer[index]; const b = outer[(index + 1) % outer.length];
    candidates.push([
      a[0] * 0.49 + b[0] * 0.49 + centroid[0] * 0.02,
      a[1] * 0.49 + b[1] * 0.49 + centroid[1] * 0.02,
    ]);
  }
  for (let row = 1; row < 32; row += 1) for (let column = 1; column < 32; column += 1) {
    candidates.push([minX + ((maxX - minX) * column) / 32, minY + ((maxY - minY) * row) / 32]);
  }
  // Scanlines handle narrow/concave islands where a regular grid misses the shell.
  for (let row = 1; row < 128; row += 1) {
    const y = minY + ((maxY - minY) * row) / 128;
    const intersections: number[] = [];
    for (let index = 0; index < outer.length; index += 1) {
      const [x1, y1] = outer[index]; const [x2, y2] = outer[(index + 1) % outer.length];
      if ((y1 > y) === (y2 > y) || y1 === y2) continue;
      intersections.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    }
    intersections.sort((a, b) => a - b);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      candidates.push([(intersections[index] + intersections[index + 1]) / 2, y]);
    }
  }
  const valid = candidates.find((candidate) => insidePart(candidate, part));
  if (!valid) throw new Error("Não foi possível encontrar ponto interno para parte cartográfica.");
  return valid;
}

function featurePoint(feature: GeoFeature, data: Legacy): Point | null {
  if (!feature.geometry && LEGACY_POINT_ENTITY_IDS.has(feature.id) && data.meta[feature.id]?.ll) {
    const ll = data.meta[feature.id]!.ll!;
    return [ll[1], ll[0]];
  }
  if (feature.geometry?.type === "Point" && Array.isArray(feature.geometry.coordinates)) {
    const coordinates = feature.geometry.coordinates as number[];
    return Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])
      ? [coordinates[0], coordinates[1]]
      : null;
  }
  return null;
}

function sizeAtZoom(ring: Point[], zoom: number, project: (point: Point, zoom: number) => ProjectedPoint) {
  const projected = ring.map((point) => project(point, zoom));
  const xs = projected.map(([x]) => x);
  const ys = projected.map(([, y]) => y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

function partSizeAtZoom(part: PolygonPart, zoom: number, project: (point: Point, zoom: number) => ProjectedPoint) {
  return sizeAtZoom(part.outer, zoom, project);
}

function switchZoom(part: PolygonPart, project: (point: Point, zoom: number) => ProjectedPoint) {
  let low = 0; let high = 12;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const middle = (low + high) / 2;
    if (partSizeAtZoom(part, middle, project) >= 28) high = middle;
    else low = middle;
  }
  return high;
}

/**
 * Returns one point per polygon part whose projected screen box is small.
 * `project` is deliberately injected so this remains deterministic and testable
 * without coupling the domain to MapLibre.
 */
export function runtimeSmallEntityPoints(
  features: GeoFeature[],
  data: Legacy,
  zoom: number,
  project: (point: Point, zoom: number) => ProjectedPoint,
): { type: "FeatureCollection"; features: GeoJsonFeature[] } {
  return {
    type: "FeatureCollection",
    features: features.flatMap((feature) => {
      const meta = data.meta[feature.id];
      if (!meta) return [];
      const direct = featurePoint(feature, data);
      if (direct) {
        return [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: direct }, properties: { carta_id: feature.id, part: 0, switchZoom: 9, opacity: 0.9 } }];
      }
      const parts = polygonParts(feature).filter((part) =>
        part.outer.length >= 3 && Math.abs(signedRingArea(part.outer)) > 1e-12,
      );
      return parts.flatMap((partGeometry, part) => {
        const size = partSizeAtZoom(partGeometry, zoom, project);
        if (size >= 28) return [];
        const thresholdZoom = switchZoom(partGeometry, project);
        const opacity = Math.max(0.05, Math.min(0.9, (28 - size) / 14));
        return [{
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: pointOnSurface(partGeometry) },
          properties: { carta_id: feature.id, part, switchZoom: thresholdZoom, opacity },
        }];
      });
    }),
  };
}

export function smallEntityCoverageReport(
  features: GeoFeature[],
  data: Legacy,
  project: (point: Point, zoom: number) => ProjectedPoint,
) {
  return {
    thresholdPx: 28,
    zooms: [2, 3, 4, 5, 6, 7, 8],
    entities: features.map((feature) => {
      if (featurePoint(feature, data)) {
        return {
          id: feature.id,
          name: data.meta[feature.id]?.pt ?? feature.id,
          parts: 1,
          markedParts: [{ part: 0, switchZoom: 99, zooms: [2, 3, 4, 5, 6, 7, 8].map((zoom) => ({
            zoom, sizePx: 0, marker: true, contour: false,
          })) }],
          switchZoom: 99,
        };
      }
      const parts = polygonParts(feature).filter((part) =>
        part.outer.length >= 3 && Math.abs(signedRingArea(part.outer)) > 1e-12,
      );
      const markedParts = parts.map((partGeometry, part) => {
        const threshold = switchZoom(partGeometry, project);
        const zooms = [2, 3, 4, 5, 6, 7, 8].map((zoom) => ({
          zoom,
          sizePx: partSizeAtZoom(partGeometry, zoom, project),
          marker: partSizeAtZoom(partGeometry, zoom, project) < 28,
          contour: partSizeAtZoom(partGeometry, zoom, project) >= 28,
        }));
        return {
        part,
        switchZoom: threshold,
        zooms,
      };
      });
      return {
        id: feature.id,
        name: data.meta[feature.id]?.pt ?? feature.id,
        parts: parts.length,
        markedParts,
        switchZoom: markedParts.length ? Math.min(...markedParts.map((part) => part.switchZoom)) : 2,
      };
    }),
  };
}

/** Compatibility view used by data tests and non-map consumers. */
export function smallEntityPoints(features: GeoFeature[], data: Legacy) {
  const points = runtimeSmallEntityPoints(features, data, 2, (point) => point);
  const seen = new Set<string>();
  return {
    ...points,
    features: points.features.filter((item) => {
      if (seen.has(item.properties.carta_id)) return false;
      seen.add(item.properties.carta_id);
      return true;
    }),
  };
}