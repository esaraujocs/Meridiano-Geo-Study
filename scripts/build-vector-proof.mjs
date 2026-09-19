import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { feature } from "topojson-client";

const root = new URL("../", import.meta.url);
const inputUrl = new URL("public/data/legacy-map.json", root);
const buildDir = new URL("build/map/", root);
const publicDir = new URL("public/maps/", root);
const geojsonUrl = new URL("carta-legacy.geojson", buildDir);
const pmtilesUrl = new URL("carta-legacy.pmtiles", publicDir);
const manifestUrl = new URL("carta-legacy.manifest.json", publicDir);

const inputText = await readFile(inputUrl, "utf8");
const data = JSON.parse(inputText);
const topo = feature(data.topo, data.topo.objects.countries);

const compactProperties = (id, kind) => {
  const meta = data.meta[id] ?? {};
  return {
    carta_id: id,
    name: meta.pt ?? id,
    name_en: meta.en ?? "",
    cca2: meta.cca2 ?? "",
    cca3: meta.cca3 ?? "",
    region: meta.reg ?? "",
    subregion: meta.sub ?? "",
    un: Boolean(meta.un),
    kind,
  };
};
const isPlayable = (id) => {
  const meta = data.meta[id];
  return (
    meta &&
    meta.mapa !== false &&
    !meta.soBandeira &&
    !meta.absorvido
  );
};

const merged = [];
const seen = new Set();

for (const item of topo.features) {
  const id = String(item.id ?? item.properties?.id ?? "");
  if (!id || seen.has(id) || !isPlayable(id)) continue;
  seen.add(id);
  merged.push({
    type: "Feature",
    id,
    properties: compactProperties(id, "natural-earth"),
    geometry: item.geometry,
  });
}

for (const item of data.extras) {
  const id = String(item.id);
  if (!id || seen.has(id) || !isPlayable(id) || !item.geometry) continue;
  seen.add(id);
  merged.push({
    type: "Feature",
    id,
    properties: compactProperties(id, "legacy-extra"),
    geometry: item.geometry,
  });
}

for (const item of data.points) {
  const id = String(item.id);
  if (!id || seen.has(id) || !isPlayable(id)) continue;
  seen.add(id);
  merged.push({
    type: "Feature",
    id,
    properties: compactProperties(id, "legacy-point"),
    geometry: { type: "Point", coordinates: item.coordinates },
  });
}

const collection = { type: "FeatureCollection", features: merged };
const geojsonText = JSON.stringify(collection);

await mkdir(buildDir, { recursive: true });
await mkdir(publicDir, { recursive: true });
await writeFile(geojsonUrl, geojsonText);

const result = spawnSync(
  "tippecanoe",
  [
    "--output",
    new URL(pmtilesUrl).pathname,
    "--force",
    "--layer",
    "countries",
    "--minimum-zoom",
    "0",
    "--maximum-zoom",
    "7",
    "--detect-shared-borders",
    "--no-tile-stats",
    "--read-parallel",
    new URL(geojsonUrl).pathname,
  ],
  { encoding: "utf8" },
);

if (result.status !== 0) {
  throw new Error(`Tippecanoe falhou:\n${result.stderr || result.stdout}`);
}

const archive = await readFile(pmtilesUrl);
const archiveStats = await stat(pmtilesUrl);
  const ids = Object.keys(data.meta).filter(isPlayable);
const withoutGeometry = ids.filter((id) => !seen.has(id));
const report = {
  proof: "legacy-geometry-packaging",
  sourceVersion: data.sourceVersion,
  sourceHash: data.sourceHash,
  limitations: [
    "Este arquivo prova empacotamento, carregamento e preservação de IDs.",
    "A geometria ainda combina Natural Earth e exceções legadas; não é a fonte definitiva.",
  ],
  counts: {
    playableCatalogEntities: ids.length,
    tiledFeatures: merged.length,
    polygons: merged.filter((item) => item.geometry.type !== "Point").length,
    points: merged.filter((item) => item.geometry.type === "Point").length,
    withoutGeometry: withoutGeometry.length,
  },
  withoutGeometry,
  zoom: { min: 0, max: 7 },
  bytes: {
    extractedLegacyJson: Buffer.byteLength(inputText),
    mergedGeoJson: Buffer.byteLength(geojsonText),
    pmtiles: archiveStats.size,
  },
  hashes: {
    geojsonSha256: createHash("sha256").update(geojsonText).digest("hex"),
    pmtilesSha256: createHash("sha256").update(archive).digest("hex"),
  },
  layer: "countries",
  idProperty: "carta_id",
  attribution: [
    "Natural Earth (domínio público), para a base legada.",
    "© OpenStreetMap contributors, para exceções legadas documentadas no projeto.",
  ],
};

await writeFile(manifestUrl, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));