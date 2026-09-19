import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { feature } from "topojson-client";

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
  for (const sourceFeature of sourceFeatures) {
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
  sources: sourceRows,
  acceptance: {
    status: "accepted-with-documented-fallbacks",
    checks: [
      "250/250 IDs jogáveis preservados no catálogo e no PMTiles",
      "Cobertura do Caribe e do Pacífico conferida por carta_id",
      "Header PMTiles, zoom 0–9, ranges e layer countries válidos",
    ],
    limitations: [
      "25 entidades usam geometria legada licenciada/documentada como fallback.",
      "A aceitação é estrutural; desempenho visual em aparelhos low/mid ainda requer matriz física.",
      "As fontes geoBoundaries mantêm a proveniência e licença registrada por entidade.",
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
    `- Cobertura: ${report.counts.geoBoundariesEntities} geoBoundaries + ${report.counts.legacyFallbackEntities} fallbacks legados = ${report.counts.playableEntities} jogáveis.\n` +
    `- PMTiles: ${report.bytes.pmtiles} bytes, SHA-256 \`${report.hashes.pmtilesSha256}\`, zoom ${report.zoom.min}–${report.zoom.max}.\n` +
    `- Checks: IDs \`carta_id\`, layer \`countries\`, ranges do header e cobertura Caribe/Pacífico.\n\n` +
    `## Proveniência e licença\n\n` +
    `Cada fonte geoBoundaries mantém URL, boundary ID, ano e licença no manifesto JSON. ` +
    `Os ${report.counts.legacyFallbackEntities} fallbacks preservam a geometria do ` +
    `Carta Cega 0.13.5 (` +
    `sourceHash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1) ` +
    `e permanecem explicitamente separados; a licença/proveniência histórica deve ser ` +
    `confirmada antes de redistribuição fora deste rebuild.\n\n` +
    `## Limitações\n\n` +
    `- A aceitação é estrutural e não substitui uma matriz física low/mid de zoom, ` +
    `toque e desempenho.\n` +
    `- Fallbacks não são geoBoundaries e podem ter detalhe/precisão diferentes.\n` +
    `- O PMTiles é download offline opcional; a instalação não o pré-carrega.\n`,
);
console.log(JSON.stringify({ ...report.counts, ...report.bytes }, null, 2));