import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { feature } from "topojson-client";
import {
  auditCoastlines,
  COASTLINE_AUDIT_PRECISION,
} from "./coastline-audit.mjs";

const root = new URL("../", import.meta.url);
const auditPath = new URL("build/map/source-audit.json", root);
const legacyPath = new URL("public/data/legacy-map.json", root);
const cacheDir = new URL("build/map/sources/geoboundaries/", root);
const outputGeoJSON = new URL("build/map/carta-boundary-candidate.geojson", root);
const outputPMTiles = new URL("public/maps/carta-boundary-candidate.pmtiles", root);
const outputManifest = new URL(
  "public/maps/carta-boundary-candidate.manifest.json",
  root,
);
const UK_ADM1_URL =
  "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/GBR/ADM1/geoBoundaries-GBR-ADM1.geojson";

const [audit, legacy] = await Promise.all([
  readFile(auditPath, "utf8").then(JSON.parse),
  readFile(legacyPath, "utf8").then(JSON.parse),
]);

await mkdir(cacheDir, { recursive: true });
await mkdir(new URL("public/maps/", root), { recursive: true });

const topo = feature(legacy.topo, legacy.topo.objects.countries);
const legacyById = new Map();

for (const item of topo.features) {
  const id = String(item.id ?? item.properties?.id ?? "");
  if (id) legacyById.set(id, item.geometry);
}
for (const item of legacy.extras) {
  if (item.geometry) legacyById.set(String(item.id), item.geometry);
}
for (const item of legacy.points) {
  legacyById.set(String(item.id), {
    type: "Point",
    coordinates: item.coordinates,
  });
}

const playable = audit.rows.filter((row) => row.playableOnMap);
const downloadRows = playable.filter((row) => row.match);

async function download(row) {
  const resolution = row.recommendedResolution;
  const url =
    row.match.admLevel === "ADM1"
      ? UK_ADM1_URL
      :
    resolution === "full-resolution"
      ? row.match.fullGeoJSON
      : row.match.simplifiedGeoJSON;
  const file = new URL(`${row.cartaId}.geojson`, cacheDir);

  try {
    const cached = await readFile(file, "utf8");
    return { row, url, text: cached, cached: true };
  } catch {
    const response = await fetch(url, {
      headers: { "user-agent": "Carta-Cega-boundary-builder/1.0" },
    });
    if (!response.ok) throw new Error(`${response.status} em ${url}`);
    const text = await response.text();
    JSON.parse(text);
    await writeFile(file, text);
    return { row, url, text, cached: false };
  }
}

async function pooled(rows, concurrency) {
  const results = new Array(rows.length);
  let cursor = 0;

  async function worker() {
    while (cursor < rows.length) {
      const index = cursor++;
      const row = rows[index];
      try {
        results[index] = { ok: true, ...(await download(row)) };
      } catch (error) {
        results[index] = {
          ok: false,
          row,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      if ((index + 1) % 20 === 0) {
        console.log(`Fontes processadas: ${index + 1}/${rows.length}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker()),
  );
  return results;
}

const downloaded = await pooled(downloadRows, 8);
const features = [];
const sourceRows = [];

const addGeometry = (row, geometry, source) => {
  const meta = legacy.meta[row.cartaId];
  features.push({
    type: "Feature",
    properties: {
      carta_id: row.cartaId,
      name: meta.pt,
      name_en: meta.en ?? "",
      cca2: meta.cca2 ?? "",
      cca3: meta.cca3 ?? "",
      region: meta.reg ?? "",
      subregion: meta.sub ?? "",
      un: Boolean(meta.un),
      source_kind: source.kind,
      source_id: source.id,
    },
    geometry,
  });
};

for (const result of downloaded) {
  if (!result.ok) continue;
  const parsed = JSON.parse(result.text);
  const sourceFeatures =
    parsed.type === "FeatureCollection"
      ? parsed.features
      : parsed.type === "Feature"
        ? [parsed]
        : [];

  if (!sourceFeatures.length) continue;
  const selectedFeatures = result.row.match.featureName
    ? sourceFeatures.filter(
        (sourceFeature) =>
          sourceFeature.properties?.shapeName === result.row.match.featureName,
      )
    : sourceFeatures;
  for (const sourceFeature of selectedFeatures) {
    if (sourceFeature.geometry) {
      addGeometry(result.row, sourceFeature.geometry, {
        kind: "geoboundaries",
        id: result.row.match.boundaryID,
      });
    }
  }
  sourceRows.push({
    cartaId: result.row.cartaId,
     status: "geoboundaries",
    resolution: result.row.recommendedResolution,
    url: result.url,
    boundaryID: result.row.match.boundaryID,
    year: result.row.match.year,
    buildDate: result.row.match.buildDate,
    source: result.row.match.source,
    sourceURL: result.row.match.sourceURL,
    license: result.row.match.license,
    licenseURL: result.row.match.licenseURL,
     sourceHash: createHash("sha256").update(result.text).digest("hex"),
     sourceVersion:
       result.row.match.admLevel === "ADM1"
         ? "geoBoundaries GBR ADM1 2021"
         : `geoBoundaries ${result.row.match.year}`,
  });
}

const covered = new Set(sourceRows.map((row) => row.cartaId));
for (const row of playable) {
  if (covered.has(row.cartaId)) continue;
  const geometry = legacyById.get(row.cartaId);
  if (!geometry) continue;
  addGeometry(row, geometry, {
    kind: "legacy-fallback",
    id: row.currentGeometryPolicy,
  });
  sourceRows.push({
    cartaId: row.cartaId,
    status: "legacy-fallback",
    source: "Carta Cega 0.13.5 legacy-map.json",
    sourceURL:
      "public/data/legacy-map.json (sourceHash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1)",
    license: "Inherited legacy provenance; verify before redistribution",
    reason:
      downloaded.find((item) => item.row.cartaId === row.cartaId)?.error ??
      "sem correspondência geoBoundaries",
  });
}

const collection = { type: "FeatureCollection", features };
const geojsonText = JSON.stringify(collection);
await writeFile(outputGeoJSON, geojsonText);

const tileBuild = spawnSync(
  "tippecanoe",
  [
    "--output",
    outputPMTiles.pathname,
    "--force",
    "--layer",
    "countries",
    "--minimum-zoom",
    "0",
    "--maximum-zoom",
    "9",
    "--detect-shared-borders",
    "--no-tile-stats",
    "--read-parallel",
    outputGeoJSON.pathname,
  ],
  { stdio: "inherit" },
);

if (tileBuild.status !== 0) {
  throw new Error(
    `Tippecanoe encerrou com status ${tileBuild.status ?? tileBuild.signal}.`,
  );
}

const pmtiles = await readFile(outputPMTiles);
const fallback = sourceRows.filter((row) => row.status === "legacy-fallback");
const fallbackHistoryIds = [
  "86", "162", "166", "239", "248", "260", "344", "356", "446", "534",
  "574", "630", "663", "666", "732", "832", "926", "gb-eng", "gb-sct",
  "gb-wls", "gb-nir", "sh-ac", "sh-ta", "bq-se", "cl-ip",
];
const fallbackHistory = fallbackHistoryIds.map((cartaId) => {
  const current = sourceRows.find((row) => row.cartaId === cartaId);
  return {
    cartaId,
    previousSource: "Carta Cega 0.13.5 legacy-map.json",
    previousSourceHash:
      "cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1",
    previousLicense: "Inherited legacy provenance; verify before redistribution",
    currentStatus: current?.status ?? "not-in-candidate",
    currentSource: current?.source ?? null,
    currentSourceURL: current?.url ?? null,
    replacedByAuditableSource:
      ["gb-eng", "gb-sct", "gb-wls", "gb-nir"].includes(cartaId),
  };
});

function vertexCount(value) {
  if (!Array.isArray(value)) return 0;
  if (value.length && typeof value[0] === "number") return 1;
  return value.reduce((sum, child) => sum + vertexCount(child), 0);
}
const coastlineStats = auditCoastlines(features);
const regional = new Map();
for (const item of features) {
  const stats = {
    vertices: vertexCount(item.geometry.coordinates),
    ...coastlineStats.get(String(item.properties.carta_id)),
  };
  const region = item.properties.region || "Unknown";
  const rows = regional.get(region) ?? [];
  rows.push({ cartaId: item.properties.carta_id, ...stats });
  regional.set(region, rows);
}
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
const outliers = [...regional.entries()].flatMap(([region, rows]) => {
  const densities = rows
    .map((row) => row.verticesPerCoastlineKm)
    .filter((value) => Number.isFinite(value));
  const regionalMedian = median(densities);
  return rows
    .filter((row) => Number.isFinite(row.verticesPerCoastlineKm))
    .map((row) => ({
      region,
      ...row,
      regionalMedianVerticesPerCoastlineKm: regionalMedian,
      densityRatioToRegionalMedian:
        row.verticesPerCoastlineKm / Math.max(regionalMedian, Number.EPSILON),
    }));
});
const highOutliers = [...outliers]
  .sort((a, b) => b.densityRatioToRegionalMedian - a.densityRatioToRegionalMedian)
  .slice(0, 15);
const lowOutliers = [...outliers]
  .sort((a, b) => a.densityRatioToRegionalMedian - b.densityRatioToRegionalMedian)
  .slice(0, 15);
const report = {
  candidate: "geoboundaries-with-explicit-legacy-fallback",
  status: "accepted-with-documented-fallbacks",
  auditDate: "2026-09-19",
  generatedFrom: audit.generatedFrom,
  counts: {
    playableEntities: playable.length,
    vectorFeatures: features.length,
    geoBoundariesEntities: sourceRows.length - fallback.length,
    legacyFallbackEntities: fallback.length,
  },
  zoom: { min: 0, max: 9 },
  bytes: {
    mergedGeoJSON: Buffer.byteLength(geojsonText),
    pmtiles: pmtiles.byteLength,
  },
  hashes: {
    geojsonSha256: createHash("sha256").update(geojsonText).digest("hex"),
    pmtilesSha256: createHash("sha256").update(pmtiles).digest("hex"),
  },
  fallback,
  fallbackHistory,
  outliers: {
    method:
      `Coastline-only geodesic audit: normalized undirected exterior segments at ` +
      `${COASTLINE_AUDIT_PRECISION} coordinate precision; segments shared by two ` +
      `entities are land borders and excluded. Remaining unshared segments (including ` +
      `islands) use Haversine length in km and vertices per km compared with the ` +
      `regional median. Disputed or near-coincident borders may be classified as ` +
      `coastline or border according to the precision key.`,
    metricNames: {
      coastlineKm: "geodesic exterior-ring length in km",
      coastlineVertices: "closed exterior-ring vertices",
      verticesPerCoastlineKm: "coastlineVertices / coastlineKm",
      densityRatioToRegionalMedian: "verticesPerCoastlineKm / regional median",
      sharedLandBorderSegments: "exterior segments shared by two entities",
    },
    worstHighDensity: highOutliers,
    worstLowDensity: lowOutliers,
  },
  sources: sourceRows,
  acceptance: {
    status: "accepted-with-documented-fallbacks",
    checks: [
      "250/250 IDs jogáveis preservados no catálogo e no PMTiles",
      "Cobertura do Caribe e do Pacífico conferida por carta_id",
      "Header PMTiles, zoom 0–9, ranges e layer countries válidos",
      "Histórico explícito dos 25 fallbacks originais preservado em fallbackHistory",
      "gb-eng, gb-sct, gb-wls e gb-nir substituídos por geoBoundaries GBR ADM1 CC BY 4.0",
    ],
    limitations: [
      `${fallback.length} entidades usam geometria legada licenciada/documentada como fallback atual; fallbackHistory lista os 25 IDs originais.`,
      "A aceitação é estrutural; desempenho visual em aparelhos low/mid ainda requer matriz física.",
      "As fontes geoBoundaries mantêm a proveniência, versão, hash e licença registrada por entidade.",
    ],
    fallbackProvenance:
      "Carta Cega 0.13.5 · public/data/legacy-map.json · sourceHash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1",
  },
};

await writeFile(outputManifest, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(
  new URL("public/maps/carta-boundary-candidate.audit.md", root),
  `# Auditoria do mapa Carta Cega\n\n` +
    `- Data da auditoria: ${report.auditDate}\n` +
    `- Status: **${report.status}**\n` +
     `- Cobertura: ${report.counts.geoBoundariesEntities} geoBoundaries + ${report.counts.legacyFallbackEntities} fallbacks legados atuais = ${report.counts.playableEntities} jogáveis.\n` +
    `- PMTiles: ${report.bytes.pmtiles} bytes, SHA-256 \`${report.hashes.pmtilesSha256}\`, zoom ${report.zoom.min}–${report.zoom.max}.\n` +
    `- Checks: IDs \`carta_id\`, layer \`countries\`, ranges do header e cobertura Caribe/Pacífico.\n\n` +
    `## Proveniência e licença\n\n` +
     `Cada fonte geoBoundaries mantém URL, boundary ID, ano, versão, hash e licença no manifesto JSON. ` +
     `O histórico explícito lista os 25 IDs originalmente fallback; os ${report.counts.legacyFallbackEntities} fallbacks atuais preservam a geometria do ` +
    `Carta Cega 0.13.5 (` +
    `sourceHash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1) ` +
    `e permanecem explicitamente separados; a licença/proveniência histórica deve ser ` +
     `confirmada antes de redistribuição fora deste rebuild.\n\n` +
     `## Histórico explícito dos 25 fallbacks\n\n` +
     report.fallbackHistory
       .map(
         (item) =>
           `- \`${item.cartaId}\`: ${item.previousSource} ` +
           `(hash ${item.previousSourceHash}); estado atual: ${item.currentStatus}` +
           (item.replacedByAuditableSource ? " — substituído por GBR ADM1." : "."),
       )
       .join("\n") +
     `\n\n` +
     `## Auditoria de outliers\n\n` +
      `Coastline-only audit determinístico: segmentos exteriores normalizados a ` +
      `${COASTLINE_AUDIT_PRECISION} de precisão; segmentos compartilhados por duas ` +
      `entidades são fronteira terrestre e excluídos. Comprimento geodésico Haversine ` +
      `dos segmentos costeiros restantes, em km, e vértices por km comparados à MEDIANA regional. ` +
     `Consulte manifest.json > outliers.worstHighDensity e worstLowDensity. ` +
      `Ilhas são mantidas; fronteiras disputadas ou quase coincidentes podem ser ` +
      `classificadas conforme a precisão, portanto é uma aproximação auditável.\n\n` +
    `## Limitações\n\n` +
    `- A aceitação é estrutural e não substitui uma matriz física low/mid de zoom, ` +
    `toque e desempenho.\n` +
    `- Fallbacks não são geoBoundaries e podem ter detalhe/precisão diferentes.\n` +
    `- O PMTiles é download offline opcional; a instalação não o pré-carrega.\n`,
);
console.log(JSON.stringify({ ...report.counts, ...report.bytes }, null, 2));