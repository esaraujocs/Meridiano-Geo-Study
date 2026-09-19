import type { GeoFeature, Legacy } from "./types.js";

type Point = [number, number];
type GeoJsonFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: Point };
  properties: { carta_id: string };
};

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
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function outerRings(feature: GeoFeature): Point[][] {
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return [];
  if (feature.geometry?.type === "Polygon") {
    return [coordinates[0] as Point[]].filter((ring) => Array.isArray(ring));
  }
  if (feature.geometry?.type === "MultiPolygon") {
    return (coordinates as Point[][][]).map((polygon) => polygon[0]).filter(Array.isArray);
  }
  return [];
}

/**
 * Generates neutral runtime markers for true points and entities whose total
 * polygon area is below 0.25 square degrees. The marker uses an interior
 * centroid of the largest outer ring and falls back to a boundary vertex.
 */
export function smallEntityPoints(
  features: GeoFeature[],
  data: Legacy,
): { type: "FeatureCollection"; features: GeoJsonFeature[] } {
  return {
    type: "FeatureCollection",
    features: features.flatMap((feature) => {
      const meta = data.meta[feature.id];
      if (!meta) return [];
      if (!feature.geometry && LEGACY_POINT_ENTITY_IDS.has(feature.id) && meta.ll) {
        return [{
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [meta.ll[1], meta.ll[0]] as Point },
          properties: { carta_id: feature.id },
        }];
      }
      if (!feature.geometry) return [];
      if (feature.geometry.type === "Point") {
        const coordinates = feature.geometry.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
        return [{
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [Number(coordinates[0]), Number(coordinates[1])] as Point },
          properties: { carta_id: feature.id },
        }];
      }
      const rings = outerRings(feature).filter((ring) => ring.length >= 3);
      if (!rings.length) return [];
      const areas = rings.map((ring) => Math.abs(signedRingArea(ring)));
      const totalArea = areas.reduce((sum, area) => sum + area, 0);
      if (totalArea >= 0.25) return [];
      const largest = rings[areas.indexOf(Math.max(...areas))];
      const centroid = ringCentroid(largest);
      const center = pointInRing(centroid, largest) ? centroid : largest[0];
      return [{
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: center },
        properties: { carta_id: feature.id },
      }];
    }),
  };
}