// Gera os contornos que substituem polígonos compartilhados ou marcadores de ponto
// nos tiles. Todas as geometrias vêm do Natural Earth 10m (domínio público).
// Rode: npm run build:split-islands
import { readFile, writeFile } from "node:fs/promises";

const NATURAL_EARTH_REVISION = "ca96624a56bd078437bca8184e78163e5039ad19";
const NATURAL_EARTH_BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NATURAL_EARTH_REVISION}/geojson`;
const SOURCES = {
  countries: `${NATURAL_EARTH_BASE}/ne_10m_admin_0_countries.geojson`,
  mapUnits: `${NATURAL_EARTH_BASE}/ne_10m_admin_0_map_units.geojson`,
};
const OVERLAYS = [
  {
    id: "16",
    iso: "ASM",
    expectedName: "American Samoa",
    candidates: [{ source: "countries", selectors: [{ field: "ADM0_A3", value: "ASM" }] }],
  },
  {
    id: "162",
    iso: "CXR",
    expectedName: "Christmas Island",
    candidates: [
      { source: "countries", selectors: [{ field: "ADM0_A3", value: "CXR" }] },
      {
        source: "mapUnits",
        selectors: [
          { field: "GU_A3", value: "CXR" },
          { field: "NAME_LONG", value: "Christmas Island" },
        ],
      },
    ],
  },
  {
    id: "534",
    iso: "SXM",
    expectedName: "Sint Maarten",
    candidates: [{ source: "countries", selectors: [{ field: "ADM0_A3", value: "SXM" }] }],
  },
  {
    id: "663",
    iso: "MAF",
    expectedName: "Saint-Martin",
    candidates: [{ source: "countries", selectors: [{ field: "ADM0_A3", value: "MAF" }] }],
  },
];

const catalog = JSON.parse(await readFile("public/data/legacy/catalog.json", "utf8"));
const sourceData = {};
for (const [source, url] of Object.entries(SOURCES)) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Natural Earth ${source}: HTTP ${response.status} (${url})`);
  const collection = await response.json();
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new Error(`Natural Earth ${source}: resposta não é uma FeatureCollection GeoJSON válida.`);
  }
  sourceData[source] = collection;
}

const round = (value) => Number(value.toFixed(5));
const polygonCoordinates = (geometry) => {
  if (geometry?.type === "Polygon") return [geometry.coordinates];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates;
  return null;
};

function validateGeometry(feature, id, expectedName) {
  const polygons = polygonCoordinates(feature.geometry);
  if (!polygons?.length) {
    throw new Error(`${id} (${expectedName}): geometria Natural Earth não é Polygon/MultiPolygon.`);
  }
  let positions = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) {
      throw new Error(`${id} (${expectedName}): polígono sem anel externo.`);
    }
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) {
        throw new Error(`${id} (${expectedName}): anel sem coordenadas suficientes.`);
      }
      positions += ring.length;
      for (const position of ring) {
        if (!Array.isArray(position) || position.length < 2
          || !Number.isFinite(position[0]) || !Number.isFinite(position[1])
          || position[0] < -180 || position[0] > 180 || position[1] < -90 || position[1] > 90) {
          throw new Error(`${id} (${expectedName}): coordenada inválida na geometria Natural Earth.`);
        }
      }
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        throw new Error(`${id} (${expectedName}): anel GeoJSON não está fechado.`);
      }
    }
  }
  if (positions < 5) {
    throw new Error(`${id} (${expectedName}): contorno Natural Earth inesperadamente incompleto (${positions} posições).`);
  }
  const foundName = feature.properties?.NAME_LONG;
  if (foundName !== expectedName) {
    throw new Error(`${id}: nome de feição Natural Earth inesperado: ${JSON.stringify(foundName)} (esperado ${expectedName}).`);
  }
  return polygons;
}

function locate(spec) {
  for (const candidate of spec.candidates) {
    const matches = sourceData[candidate.source].features.filter((feature) =>
      candidate.selectors.every(({ field, value }) => feature.properties?.[field] === value));
    if (matches.length > 1) {
      throw new Error(`${spec.iso}: seleção Natural Earth ambígua em ${candidate.source} (${matches.length} feições).`);
    }
    if (matches.length === 1) {
      return { feature: matches[0], source: candidate.source, selectors: candidate.selectors };
    }
  }
  throw new Error(`${spec.iso} (${spec.expectedName}) não encontrado nas feições Natural Earth configuradas; sem fallback aproximado.`);
}

const features = [];
const provenance = [];
for (const spec of OVERLAYS) {
  if (!catalog.meta?.[spec.id]) throw new Error(`${spec.iso}: carta_id ${spec.id} não existe no catálogo.`);
  const { feature, source, selectors } = locate(spec);
  const polygons = validateGeometry(feature, spec.id, spec.expectedName);
  features.push({
    type: "Feature",
    properties: { carta_id: spec.id, answer_id: spec.id, name: catalog.meta[spec.id].pt },
    geometry: {
      type: "MultiPolygon",
      coordinates: polygons.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => [round(x), round(y)]))),
    },
  });
  provenance.push({
    carta_id: spec.id,
    iso: spec.iso,
    name: spec.expectedName,
    source: SOURCES[source],
    dataset: source === "countries" ? "ne_10m_admin_0_countries.geojson" : "ne_10m_admin_0_map_units.geojson",
    selectors,
    naturalEarthName: feature.properties.NAME_LONG,
  });
}

await writeFile("public/data/split-islands.geojson", `${JSON.stringify({ type: "FeatureCollection", features })}\n`);
await writeFile("public/data/split-islands.manifest.json", `${JSON.stringify({
  generatedBy: "scripts/build-split-islands.mjs",
  license: "Natural Earth (domínio público)",
  repository: `https://github.com/nvkelso/natural-earth-vector/tree/${NATURAL_EARTH_REVISION}`,
  sourceRevision: NATURAL_EARTH_REVISION,
  sources: SOURCES,
  features: provenance,
  ids: Object.fromEntries(OVERLAYS.map(({ iso, id }) => [iso, id])),
}, null, 2)}\n`);
console.log(`split-island overlays: ${features.length} (${OVERLAYS.map(({ iso, id }) => `${iso}:${id}`).join(", ")}). Rode depois: npm run generate:markers`);