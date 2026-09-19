import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { feature } from "topojson-client";

const out = ".tmp-small-report";
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", [
  "src/domain/small-entities.ts", "--outDir", out, "--target", "ES2022",
  "--module", "NodeNext", "--moduleResolution", "NodeNext", "--skipLibCheck",
  "--ignoreConfig",
], { stdio: "ignore" });
const { smallEntityCoverageReport } = await import(`../${out}/small-entities.js`);
const [geometryData, catalog] = await Promise.all([
  readFile("public/data/legacy-map.json", "utf8").then(JSON.parse),
  readFile("public/data/legacy/catalog.json", "utf8").then(JSON.parse),
]);
const collection = feature(geometryData.topo, geometryData.topo.objects.countries);
const geometryById = new Map(collection.features.map((item) => [String(item.id), item.geometry]));
const ids = [...new Set(catalog.mapEntityIds.map(String))];
const features = ids.map((id) => ({ id, geometry: geometryById.get(id) }));
const project = ([longitude, latitude], zoom) => {
  const scale = 512 * 2 ** zoom;
  const sin = Math.sin((latitude * Math.PI) / 180);
  return [
    ((longitude + 180) / 360) * scale,
    (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  ];
};
const report = smallEntityCoverageReport(features, catalog, project);
await writeFile("public/data/small-entity-markers-report.json", `${JSON.stringify({
  generatedBy: "scripts/generate-small-entity-report.mjs",
  criterion: "marker per polygon part while projected bbox is below 28px; otherwise contour",
  ...report,
}, null, 2)}\n`);
console.log(`small entity report: ${report.entities.length} entities`);