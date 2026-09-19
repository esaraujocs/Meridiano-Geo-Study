import { mkdir, readFile, writeFile } from "node:fs/promises";
import { feature } from "topojson-client";

const THRESHOLD_PX = 28;
const CLASSIFICATION_ZOOM = 2;
const PLAYABLE_LIMIT = 255;
const output = "src/data/small-entity-markers.json";

const [geometryData, catalog] = await Promise.all([
  readFile("public/data/legacy-map.json", "utf8").then(JSON.parse),
  readFile("public/data/legacy/catalog.json", "utf8").then(JSON.parse),
]);
const collection = feature(geometryData.topo, geometryData.topo.objects.countries);
const geometryById = new Map(collection.features.map((item) => [String(item.id), item.geometry]));
const playableIds = [...new Set(catalog.mapEntityIds.map(String))];

const ringArea = (ring) => Math.abs(ring.reduce((sum, [x1, y1], index) => {
  const [x2, y2] = ring[(index + 1) % ring.length];
  return sum + x1 * y2 - x2 * y1;
}, 0) / 2);
const pointInRing = ([x, y], ring) => {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const parts = (geometry) => {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
};
const project = ([longitude, latitude], zoom) => {
  const scale = 512 * 2 ** zoom;
  const sin = Math.sin((latitude * Math.PI) / 180);
  return [
    ((longitude + 180) / 360) * scale,
    (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  ];
};
const projectedSize = (ring, zoom) => {
  const points = ring.map((point) => project(point, zoom));
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};
const interiorPoint = (polygon) => {
  const outer = polygon[0];
  const holes = polygon.slice(1);
  const xs = outer.map(([x]) => x);
  const ys = outer.map(([, y]) => y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const valid = (point) => pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole));
  for (let row = 1; row < 256; row += 1) {
    const y = minY + ((maxY - minY) * row) / 256;
    const intersections = [];
    for (let index = 0; index < outer.length; index += 1) {
      const [x1, y1] = outer[index]; const [x2, y2] = outer[(index + 1) % outer.length];
      if ((y1 > y) === (y2 > y) || y1 === y2) continue;
      intersections.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    }
    intersections.sort((a, b) => a - b);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const candidate = [(intersections[index] + intersections[index + 1]) / 2, y];
      if (valid(candidate)) return candidate;
    }
  }
  throw new Error("Sem âncora interna para a maior parte.");
};
const switchZoom = (ring) => {
  let low = 0; let high = 12;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const middle = (low + high) / 2;
    if (projectedSize(ring, middle) >= THRESHOLD_PX) high = middle;
    else low = middle;
  }
  return high;
};

const markers = [];
for (const id of playableIds) {
  const meta = catalog.meta[id];
  const geometry = geometryById.get(id);
  const entityParts = parts(geometry).filter((polygon) => polygon[0]?.length >= 3);
  const largest = entityParts.sort((a, b) => ringArea(b[0]) - ringArea(a[0]))[0];
  if (!largest) {
    if (meta?.ll) {
      markers.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [meta.ll[1], meta.ll[0]] },
        properties: { carta_id: id, switchZoom: 9, un: Boolean(meta.un) },
      });
    }
    continue;
  }
  if (projectedSize(largest[0], CLASSIFICATION_ZOOM) >= THRESHOLD_PX) continue;
  markers.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: interiorPoint(largest) },
    properties: { carta_id: id, switchZoom: switchZoom(largest[0]), un: Boolean(meta?.un) },
  });
}

if (markers.length > playableIds.length || markers.length > PLAYABLE_LIMIT) {
  throw new Error(`${markers.length} marcadores excedem ${playableIds.length} entidades jogáveis.`);
}
if (new Set(markers.map((item) => item.properties.carta_id)).size !== markers.length) {
  throw new Error("Mais de um marcador gerado para a mesma entidade.");
}
await mkdir("src/data", { recursive: true });
await writeFile(output, `${JSON.stringify({ type: "FeatureCollection", features: markers }, null, 2)}\n`);
console.log(`small entity source: ${markers.length}/${playableIds.length} entities`);