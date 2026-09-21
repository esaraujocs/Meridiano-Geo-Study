// Gera src/data/small-entity-markers.json a partir dos MESMOS tiles que o mapa desenha
// (public/maps/carta-boundary-candidate.pmtiles), não da geometria legada.
//
// Critério: um marcador por entidade jogável cuja MAIOR parte, no zoom 2, mede menos de
// THRESHOLD_PX na maior dimensão. switchZoom é o zoom em que essa maior parte chega a
// THRESHOLD_PX; acima dele o contorno já é visível e o marcador some (ver small-entities.ts).
// Os tiles partem polígonos nas bordas; as peças vizinhas que se tocam são costuradas antes
// de medir. Rode com: npm run generate:markers
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PMTiles, tileIdToZxy } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

const THRESHOLD_PX = 28;
const CLASSIFICATION_ZOOM = 2;
const MEASURE_ZOOM = 6;
const VERIFY_ZOOM = 9;
const NEVER_HIDE_ZOOM = 24;
const PLAYABLE_LIMIT = 255;
const MAX_ANCHORS_OUTSIDE = 5;
const EPS = 0.003;
const output = "src/data/small-entity-markers.json";

const catalog = JSON.parse(await readFile("public/data/legacy/catalog.json", "utf8"));
const playableIds = [...new Set(catalog.mapEntityIds.map(String))];
const bytes = await readFile("public/maps/carta-boundary-candidate.pmtiles");
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const archive = new PMTiles({
  getKey: () => "local-markers",
  getBytes: async (offset, length) => ({ data: buffer.slice(offset, offset + length) }),
});
const header = await archive.getHeader();
const directory = (offset, length) =>
  archive.cache.getDirectory(archive.source, offset, length, header);

const rootEntries = await directory(header.rootDirectoryOffset, header.rootDirectoryLength);
const entries = [];
for (const entry of rootEntries) {
  if (entry.runLength === 0) {
    entries.push(...(await directory(header.leafDirectoryOffset + entry.offset, entry.length)));
  } else {
    entries.push(entry);
  }
}

const project0 = ([lon, lat]) => {
  const sin = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180);
  return [((lon + 180) / 360) * 512, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 512];
};
const ringArea = (ring) => {
  const points = ring.map(project0);
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2);
};
const bboxOf = (ring) => {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
};
const intersects = (a, b) =>
  a[0] <= b[2] + EPS && b[0] <= a[2] + EPS && a[1] <= b[3] + EPS && b[1] <= a[3] + EPS;
const polygonsOf = (geometry) =>
  geometry.type === "Polygon" ? [geometry.coordinates]
    : geometry.type === "MultiPolygon" ? geometry.coordinates
      : [];

const pieces = new Map();
const pointsOnly = new Map();
for (const entry of entries) {
  if (!entry.runLength) continue;
  for (let offset = 0; offset < entry.runLength; offset += 1) {
    const [z, x, y] = tileIdToZxy(entry.tileId + offset);
    if (z !== MEASURE_ZOOM) continue;
    const tile = await archive.getZxy(z, x, y);
    if (!tile) continue;
    const layer = new VectorTile(new PbfReader(new Uint8Array(tile.data))).layers.countries;
    if (!layer) continue;
    for (let index = 0; index < layer.length; index += 1) {
      const feature = layer.feature(index);
      const id = String(feature.properties?.carta_id ?? feature.id);
      const geometry = feature.toGeoJSON(x, y, z).geometry;
      if (geometry.type === "Point") {
        if (!pointsOnly.has(id)) pointsOnly.set(id, geometry.coordinates);
        continue;
      }
      for (const polygon of polygonsOf(geometry)) {
        if (!polygon[0] || polygon[0].length < 3) continue;
        const list = pieces.get(id) ?? [];
        list.push({
          tx: x, ty: y, outer: polygon[0], holes: polygon.slice(1),
          bbox: bboxOf(polygon[0]), area: ringArea(polygon[0]),
        });
        pieces.set(id, list);
      }
    }
  }
}

function clusterPieces(list) {
  const parent = list.map((_, index) => index);
  const find = (index) => (parent[index] === index ? index : (parent[index] = find(parent[index])));
  const byTile = new Map();
  list.forEach((piece, index) => {
    const key = `${piece.tx},${piece.ty}`;
    if (!byTile.has(key)) byTile.set(key, []);
    byTile.get(key).push(index);
  });
  list.forEach((piece, index) => {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        for (const other of byTile.get(`${piece.tx + dx},${piece.ty + dy}`) ?? []) {
          if (other > index && intersects(piece.bbox, list[other].bbox)) parent[find(other)] = find(index);
        }
      }
    }
  });
  const groups = new Map();
  list.forEach((piece, index) => {
    const root = find(index);
    const group = groups.get(root) ?? { pieces: [], area: 0, bbox: [Infinity, Infinity, -Infinity, -Infinity] };
    group.pieces.push(piece);
    group.area += piece.area;
    group.bbox = [
      Math.min(group.bbox[0], piece.bbox[0]), Math.min(group.bbox[1], piece.bbox[1]),
      Math.max(group.bbox[2], piece.bbox[2]), Math.max(group.bbox[3], piece.bbox[3]),
    ];
    groups.set(root, group);
  });
  return [...groups.values()];
}

const pointInRings = ([px, py], rings) => {
  let inside = false;
  for (const ring of rings) {
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const [xi, yi] = ring[index];
      const [xj, yj] = ring[previous];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
};
// Ponto interno largo e próximo do centro vertical (fora de buracos).
function interiorPoint(outer, holes) {
  const rings = [outer, ...holes];
  const [minX, minY, maxX, maxY] = bboxOf(outer);
  let best = null;
  for (let row = 1; row < 64; row += 1) {
    const t = row / 64;
    const y = minY + (maxY - minY) * t;
    const crossings = [];
    for (const ring of rings) {
      for (let index = 0; index < ring.length; index += 1) {
        const [x1, y1] = ring[index];
        const [x2, y2] = ring[(index + 1) % ring.length];
        if (y1 === y2 || (y1 > y) === (y2 > y)) continue;
        crossings.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const width = crossings[index + 1] - crossings[index];
      const score = width * (1 - Math.abs(t - 0.5));
      const candidate = [(crossings[index] + crossings[index + 1]) / 2, y];
      if (width > 0 && (!best || score > best.score) && pointInRings(candidate, rings)) {
        best = { score, point: candidate };
      }
    }
  }
  return best?.point ?? [(minX + maxX) / 2, (minY + maxY) / 2];
}

const markers = [];
for (const id of playableIds) {
  const meta = catalog.meta[id];
  const un = Boolean(meta?.un);
  const list = pieces.get(id);
  if (!list?.length) {
    const point = pointsOnly.get(id) ?? (meta?.ll ? [meta.ll[1], meta.ll[0]] : null);
    if (point) {
      markers.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: point },
        properties: { carta_id: id, switchZoom: NEVER_HIDE_ZOOM, un },
      });
    }
    continue;
  }
  const largest = clusterPieces(list).sort((a, b) => b.area - a.area)[0];
  const [x0, y0] = project0([largest.bbox[0], largest.bbox[3]]);
  const [x1, y1] = project0([largest.bbox[2], largest.bbox[1]]);
  const size = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const switchZoom = Math.min(NEVER_HIDE_ZOOM, Math.log2(THRESHOLD_PX / Math.max(size, 1e-9)));
  if (switchZoom <= CLASSIFICATION_ZOOM) continue;
  const anchor = largest.pieces.sort((a, b) => b.area - a.area)[0];
  const [lon, lat] = interiorPoint(anchor.outer, anchor.holes);
  markers.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: [Number(lon.toFixed(5)), Number(lat.toFixed(5))] },
    properties: { carta_id: id, switchZoom: Number(switchZoom.toFixed(3)), un },
  });
}

// Territórios absorvidos (Guadalupe, Martinica, Reunião...): não são alvo nem estão nos tiles;
// vêm de public/data/absorbed-territories.geojson (npm run build:absorbed). O clique vale pelo
// soberano (answer_id) e o marcador segue o mesmo critério de tamanho das demais entidades.
const absorbedData = JSON.parse(await readFile("public/data/absorbed-territories.geojson", "utf8"));
const absorbedMarkers = [];
for (const feature of absorbedData.features) {
  const { carta_id: id, answer_id: answerId } = feature.properties;
  const base = { carta_id: id, answer_id: answerId, absorbed: true, un: false };
  if (feature.geometry.type === "Point") {
    absorbedMarkers.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: feature.geometry.coordinates },
      properties: { ...base, switchZoom: NEVER_HIDE_ZOOM },
    });
    continue;
  }
  const polygons = polygonsOf(feature.geometry)
    .filter((polygon) => polygon[0]?.length >= 3)
    .map((polygon) => ({ outer: polygon[0], holes: polygon.slice(1), bbox: bboxOf(polygon[0]), area: ringArea(polygon[0]) }))
    .sort((a, b) => b.area - a.area);
  const part = polygons[0];
  if (!part) throw new Error(`${id}: território absorvido sem polígono válido.`);
  const [ax0, ay0] = project0([part.bbox[0], part.bbox[3]]);
  const [ax1, ay1] = project0([part.bbox[2], part.bbox[1]]);
  const partSize = Math.max(Math.abs(ax1 - ax0), Math.abs(ay1 - ay0));
  const partSwitchZoom = Math.min(NEVER_HIDE_ZOOM, Math.log2(THRESHOLD_PX / Math.max(partSize, 1e-9)));
  if (partSwitchZoom <= CLASSIFICATION_ZOOM) continue;
  const [alon, alat] = interiorPoint(part.outer, part.holes);
  if (!pointInRings([alon, alat], [part.outer, ...part.holes])) {
    throw new Error(`${id}: âncora fora do polígono do território absorvido.`);
  }
  absorbedMarkers.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: [Number(alon.toFixed(5)), Number(alat.toFixed(5))] },
    properties: { ...base, switchZoom: Number(partSwitchZoom.toFixed(3)) },
  });
}

// Prova de contenção no zoom mais detalhado: a âncora tem que cair dentro do polígono desenhado.
const tileXY = (lon, lat, zoom) => {
  const n = 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return [Math.floor(((lon + 180) / 360) * n), Math.floor((0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n)];
};
const outside = [];
for (const marker of markers) {
  const id = marker.properties.carta_id;
  if (!pieces.has(id)) continue;
  const [lon, lat] = marker.geometry.coordinates;
  const [tx, ty] = tileXY(lon, lat, VERIFY_ZOOM);
  const tile = await archive.getZxy(VERIFY_ZOOM, tx, ty);
  let inside = false;
  const layer = tile ? new VectorTile(new PbfReader(new Uint8Array(tile.data))).layers.countries : null;
  for (let index = 0; layer && index < layer.length && !inside; index += 1) {
    const feature = layer.feature(index);
    if (String(feature.properties?.carta_id ?? feature.id) !== id) continue;
    inside = polygonsOf(feature.toGeoJSON(tx, ty, VERIFY_ZOOM).geometry)
      .some((polygon) => pointInRings([lon, lat], polygon));
  }
  if (!inside) outside.push(catalog.meta[id]?.pt ?? id);
}

if (markers.length > playableIds.length || markers.length > PLAYABLE_LIMIT) {
  throw new Error(`${markers.length} marcadores excedem ${playableIds.length} entidades jogáveis.`);
}
if (new Set(markers.map((item) => item.properties.carta_id)).size !== markers.length) {
  throw new Error("Mais de um marcador gerado para a mesma entidade.");
}
if (outside.length > MAX_ANCHORS_OUTSIDE) {
  throw new Error(`${outside.length} âncoras fora do polígono no zoom ${VERIFY_ZOOM}: ${outside.join(", ")}`);
}
markers.push(...absorbedMarkers);
if (new Set(markers.map((item) => item.properties.carta_id)).size !== markers.length) {
  throw new Error("Marcador duplicado entre entidades jogáveis e absorvidas.");
}
await mkdir("src/data", { recursive: true });
await writeFile(output, `${JSON.stringify({ type: "FeatureCollection", features: markers }, null, 2)}\n`);
console.log(`small entity source: ${markers.length - absorbedMarkers.length}/${playableIds.length} entities + ${absorbedMarkers.length} absorbed`);
if (outside.length) console.log(`âncoras fora do polígono no z${VERIFY_ZOOM} (toleradas): ${outside.join(", ")}`);
