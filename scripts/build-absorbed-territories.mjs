// Gera public/data/absorbed-territories.geojson: os territórios "absorvidos" (que nunca são alvo e
// valem pelo soberano no clique: Guadalupe, Martinica, Reunião etc.) não estão nos tiles jogáveis.
// Os que existem na geoBoundaries ganham contorno; os demais (Svalbard, Bouvet, Heard, Ilhas Menores)
// entram só como ponto, a partir de meta.ll, como no clássico.
// Fonte dos contornos: geoBoundaries gbOpen ADM0 simplificado, CC BY 4.0. Rode: npm run build:absorbed
import { readFile, writeFile } from "node:fs/promises";

const ISO_BY_ID = { "312": "GLP", "474": "MTQ", "638": "REU" };
const catalog = JSON.parse(await readFile("public/data/legacy/catalog.json", "utf8"));
const absorbed = Object.entries(catalog.meta).filter(([, meta]) => meta.absorvido);
const round = (value) => Number(value.toFixed(5));
const roundRings = (polygon) => polygon.map((ring) => ring.map(([x, y]) => [round(x), round(y)]));

const features = [];
const sources = [];
for (const [id, meta] of absorbed) {
  const answerId = String(meta.mapaPara);
  if (!catalog.mapEntityIds.map(String).includes(answerId)) {
    throw new Error(`${meta.pt}: soberano ${answerId} não é jogável.`);
  }
  const properties = { carta_id: id, answer_id: answerId, name: meta.pt };
  const iso = ISO_BY_ID[id];
  if (!iso) {
    features.push({
      type: "Feature",
      properties,
      geometry: { type: "Point", coordinates: [round(meta.ll[1]), round(meta.ll[0])] },
    });
    sources.push({ cartaId: id, name: meta.pt, kind: "point", source: "catalog meta.ll (sem contorno na geoBoundaries)" });
    continue;
  }
  const info = await fetch(`https://www.geoboundaries.org/api/current/gbOpen/${iso}/ADM0/`).then((r) => r.json());
  const record = Array.isArray(info) ? info[0] : info;
  const geojson = await fetch(record.simplifiedGeometryGeoJSON).then((r) => r.json());
  const polygons = geojson.features.flatMap(({ geometry }) =>
    geometry.type === "Polygon" ? [geometry.coordinates]
      : geometry.type === "MultiPolygon" ? geometry.coordinates
        : []);
  features.push({
    type: "Feature",
    properties,
    geometry: { type: "MultiPolygon", coordinates: polygons.map(roundRings) },
  });
  sources.push({
    cartaId: id, name: meta.pt, kind: "polygon", iso,
    source: record.simplifiedGeometryGeoJSON, license: record.boundaryLicense,
    polygons: polygons.length,
  });
}

await writeFile(
  "public/data/absorbed-territories.geojson",
  `${JSON.stringify({ type: "FeatureCollection", features })}\n`,
);
await writeFile(
  "public/data/absorbed-territories.manifest.json",
  `${JSON.stringify({ generatedBy: "scripts/build-absorbed-territories.mjs", generatedAt: new Date().toISOString().slice(0, 10), sources }, null, 2)}\n`,
);
console.log(`absorbed territories: ${features.length} (${sources.filter((s) => s.kind === "polygon").length} com contorno)`);
