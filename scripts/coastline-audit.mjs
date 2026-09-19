const PRECISION = 1e6;
const RADIUS_KM = 6371.0088;
const radians = Math.PI / 180;

export function coordinateKey(point) {
  return `${Math.round(point[0] * PRECISION)},${Math.round(point[1] * PRECISION)}`;
}

export function segmentKey(a, b) {
  const first = coordinateKey(a);
  const second = coordinateKey(b);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

export function exteriorRings(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates[0] ?? []];
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((polygon) => polygon[0] ?? []);
  }
  return [];
}

function haversineKm(a, b) {
  const dLat = (b[1] - a[1]) * radians;
  const dLon = (b[0] - a[0]) * radians;
  const latA = a[1] * radians;
  const latB = b[1] * radians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function auditCoastlines(features) {
  const segments = new Map();
  const entitySegments = new Map();
  for (const feature of features) {
    const id = String(feature.properties.carta_id);
    const rows = [];
    for (const ring of exteriorRings(feature.geometry)) {
      if (ring.length < 2) continue;
      for (let index = 1; index < ring.length; index += 1) {
        const a = ring[index - 1];
        const b = ring[index];
        rows.push({ key: segmentKey(a, b), a, b });
      }
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (coordinateKey(first) !== coordinateKey(last)) {
        rows.push({ key: segmentKey(last, first), a: last, b: first });
      }
    }
    entitySegments.set(id, rows);
    for (const row of rows) {
      const owners = segments.get(row.key) ?? new Set();
      owners.add(id);
      segments.set(row.key, owners);
    }
  }
  return new Map(
    [...entitySegments].map(([id, rows]) => {
      const coast = rows.filter((row) => segments.get(row.key).size === 1);
      const keys = new Set(coast.flatMap((row) => [coordinateKey(row.a), coordinateKey(row.b)]));
      const coastlineKm = coast.reduce((sum, row) => sum + haversineKm(row.a, row.b), 0);
      return [
        id,
        {
          coastlineKm,
          coastlineVertices: keys.size,
          verticesPerCoastlineKm: coastlineKm > 0 ? keys.size / coastlineKm : null,
          sharedLandBorderSegments: rows.length - coast.length,
        },
      ];
    }),
  );
}

export const COASTLINE_AUDIT_PRECISION = PRECISION;