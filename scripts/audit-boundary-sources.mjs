import { mkdir, readFile, writeFile } from "node:fs/promises";

const API = "https://www.geoboundaries.org/api/current/gbOpen/ALL/ADM0/";
const root = new URL("../", import.meta.url);
const legacy = JSON.parse(
  await readFile(new URL("public/data/legacy-map.json", root), "utf8"),
);

const response = await fetch(API, {
  headers: { "user-agent": "Carta-Cega-boundary-audit/1.0" },
});

if (!response.ok) {
  throw new Error(`geoBoundaries respondeu ${response.status}.`);
}

const boundaries = await response.json();
const byIso = new Map(boundaries.map((item) => [item.boundaryISO, item]));
const isoUsage = new Map();

for (const [id, meta] of Object.entries(legacy.meta)) {
  const iso = meta.cca3 || "";
  if (!iso) continue;
  const ids = isoUsage.get(iso) ?? [];
  ids.push(id);
  isoUsage.set(iso, ids);
}

const rows = Object.entries(legacy.meta).map(([id, meta]) => {
  const iso = meta.cca3 || "";
  const source = byIso.get(iso);
  const area = Number(meta.area) || null;
  const priority =
    meta.sub === "Caribbean" ||
    (meta.reg === "Oceania" && area !== null && area < 100_000) ||
    (area !== null && area < 10_000)
      ? "full-resolution"
      : "simplified-first";

  return {
    cartaId: id,
    name: meta.pt,
    cca3: iso || null,
    playableOnMap:
      meta.mapa !== false && !meta.soBandeira && !meta.absorvido,
    currentGeometryPolicy: legacy.points.some((item) => item.id === id)
      ? "point"
      : legacy.extras.some((item) => item.id === id)
        ? "legacy-extra"
        : "legacy-topology-or-none",
    recommendedResolution: priority,
    match: source
      ? {
          boundaryID: source.boundaryID,
          boundaryName: source.boundaryName,
          year: source.boundaryYearRepresented,
          buildDate: source.buildDate,
          source: source.boundarySource,
          sourceURL: source.boundarySourceURL,
          license: source.boundaryLicense,
          licenseURL: source.licenseSource,
          fullGeoJSON: source.gjDownloadURL,
          simplifiedGeoJSON: source.simplifiedGeometryGeoJSON,
        }
      : null,
  };
});

const matched = rows.filter((row) => row.match);
const unmatched = rows.filter((row) => !row.match);
const playableUnmatched = unmatched.filter((row) => row.playableOnMap);
const duplicateIso = [...isoUsage.entries()]
  .filter(([, ids]) => ids.length > 1)
  .map(([cca3, cartaIds]) => ({ cca3, cartaIds }));

const report = {
  generatedFrom: {
    api: API,
    cartaSourceVersion: legacy.sourceVersion,
    cartaSourceHash: legacy.sourceHash,
  },
  summary: {
    catalogEntities: rows.length,
    geoBoundariesRecords: boundaries.length,
    matchedEntities: matched.length,
    unmatchedEntities: unmatched.length,
    playableUnmatchedEntities: playableUnmatched.length,
    duplicateIsoMappings: duplicateIso.length,
    fullResolutionPriority: rows.filter(
      (row) => row.recommendedResolution === "full-resolution",
    ).length,
  },
  playableUnmatched: playableUnmatched.map((row) => ({
    cartaId: row.cartaId,
    name: row.name,
    cca3: row.cca3,
    currentGeometryPolicy: row.currentGeometryPolicy,
  })),
  duplicateIso,
  rows,
};

const outputDir = new URL("build/map/", root);
await mkdir(outputDir, { recursive: true });
await writeFile(
  new URL("source-audit.json", outputDir),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(JSON.stringify(report.summary, null, 2));
if (playableUnmatched.length) {
  console.log("\nSem correspondência jogável:");
  for (const row of playableUnmatched) {
    console.log(`- ${row.cartaId}: ${row.name} (${row.cca3 ?? "sem CCA3"})`);
  }
}