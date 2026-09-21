import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");
const manifest = JSON.parse(
  await readFile(join(dist, "manifest.webmanifest"), "utf8"),
);

assert.equal(manifest.start_url, "/");
await access(join(dist, "index.html"));

for (const icon of manifest.icons ?? []) {
  assert.equal(typeof icon.src, "string");
  assert.ok(icon.src.startsWith("/"), `Manifest icon must be root-relative: ${icon.src}`);
  await access(join(dist, icon.src.slice(1)));
}

// O service worker serve o mapa offline pelo nome/tamanho do arquivo no OPFS. Se essas constantes
// divergirem das de offline-map.ts (ou do arquivo real), o mapa offline nunca é encontrado.
const [sw, offlineMap, pmtiles, mapManifest] = await Promise.all([
  readFile("public/sw.js", "utf8"),
  readFile("src/domain/offline-map.ts", "utf8"),
  stat("public/maps/carta-boundary-candidate.pmtiles"),
  readFile("public/maps/carta-boundary-candidate.manifest.json", "utf8").then(JSON.parse),
]);
const swBytes = Number(/const MAP_BYTES = (\d+);/.exec(sw)?.[1]);
const swFile = /const MAP_FILE = "([^"]+)";/.exec(sw)?.[1];
const appBytes = Number(/export const MAP_BYTES =\s*([\d_]+);/.exec(offlineMap)?.[1]?.replaceAll("_", ""));
const appVersion = /export const MAP_VERSION =\s*"([^"]+)";/.exec(offlineMap)?.[1];
assert.equal(swBytes, appBytes, "MAP_BYTES do sw.js diverge de offline-map.ts");
assert.equal(appBytes, pmtiles.size, "MAP_BYTES não bate com o tamanho real do .pmtiles");
assert.equal(appVersion, mapManifest.hashes.pmtilesSha256, "MAP_VERSION não bate com o hash do manifesto do mapa");
assert.equal(swFile, `carta-boundary-candidate-${appVersion}.pmtiles`, "MAP_FILE do sw.js diverge do arquivo que o app grava no OPFS");
for (const worker of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await access(join(dist, "assets", worker));
}

console.log(`manifest resources: ${(manifest.icons ?? []).length} icon(s) verified; offline map constants and MapLibre worker verified`);