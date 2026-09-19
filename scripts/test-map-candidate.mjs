import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { PMTiles, tileIdToZxy } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("public/maps/carta-boundary-candidate.manifest.json", root)),
);
const catalog = JSON.parse(
  await readFile(new URL("public/data/legacy/catalog.json", root)),
);
const bytes = await readFile(
  new URL("public/maps/carta-boundary-candidate.pmtiles", root),
);
const archiveBuffer = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
);
const source = {
  getKey: () => "carta-boundary-candidate-local",
  getBytes: async (offset, length) => ({
    data: archiveBuffer.slice(offset, offset + length),
  }),
};
const archive = new PMTiles(source);
const header = await archive.getHeader();

assert.equal(manifest.status, "accepted-with-documented-fallbacks");
assert.equal(bytes.byteLength, manifest.bytes.pmtiles);
assert.equal(header.minZoom, manifest.zoom.min);
assert.equal(header.maxZoom, manifest.zoom.max);
assert.ok(header.numTileEntries > 0);
assert.ok(header.numTileContents > 0);
assert.equal(manifest.counts.playableEntities, 250);

const playable = Object.entries(catalog.meta)
  .filter(([, meta]) => meta.mapa !== false && !meta.soBandeira && !meta.absorvido)
  .map(([id]) => id);
assert.equal(playable.length, manifest.counts.playableEntities);

async function directory(offset, length) {
  return archive.cache.getDirectory(
    archive.source,
    offset,
    length,
    header,
  );
}

const rootEntries = await directory(
  header.rootDirectoryOffset,
  header.rootDirectoryLength,
);
const tileEntries = [];
for (const entry of rootEntries) {
  if (entry.runLength === 0) {
    tileEntries.push(
      ...(await directory(
        header.leafDirectoryOffset + entry.offset,
        entry.length,
      )),
    );
  } else {
    tileEntries.push(entry);
  }
}

const contents = new Map();
for (const entry of tileEntries) {
  if (entry.runLength === 0) continue;
  const key = `${entry.offset}:${entry.length}`;
  if (contents.has(key)) continue;
  const [z, x, y] = tileIdToZxy(entry.tileId);
  const tile = await archive.getZxy(z, x, y);
  assert.ok(tile, `tile ${z}/${x}/${y} não encontrado`);
  const vector = new VectorTile(new PbfReader(new Uint8Array(tile.data)));
  const layer = vector.layers.countries;
  assert.ok(layer, `layer countries ausente em ${z}/${x}/${y}`);
  const ids = [];
  for (let index = 0; index < layer.length; index += 1) {
    const properties = layer.feature(index).properties ?? {};
    const id = properties.carta_id ?? layer.feature(index).id;
    if (id !== undefined && id !== null) ids.push(String(id));
  }
  contents.set(key, ids);
}

const present = new Set([...contents.values()].flat());
const missing = playable.filter((id) => !present.has(id));
assert.deepEqual(missing, [], `IDs jogáveis ausentes nos tiles: ${missing.join(", ")}`);

const regionIds = (predicate) =>
  playable.filter((id) => predicate(catalog.meta[id])).filter((id) => present.has(id));
const caribbean = regionIds((meta) => meta.sub === "Caribbean");
const pacific = regionIds((meta) => meta.reg === "Oceania");
assert.ok(caribbean.length > 0, "catálogo Caribe vazio");
assert.ok(pacific.length > 0, "catálogo Pacífico vazio");
assert.ok(
  caribbean.every((id) => present.has(id)),
  "houve regressão de cobertura do Caribe",
);
assert.ok(
  pacific.every((id) => present.has(id)),
  "houve regressão de cobertura do Pacífico",
);

const result = {
  archive: "carta-boundary-candidate.pmtiles",
  status: manifest.status,
  playable: playable.length,
  tileEntries: header.numTileEntries,
  tileContentsChecked: contents.size,
  zoom: { min: header.minZoom, max: header.maxZoom },
  caribbean: caribbean.length,
  pacific: pacific.length,
  missing,
  limitations: manifest.acceptance?.limitations ?? [],
};
await mkdir(new URL("build/map/", root), { recursive: true });
await writeFile(
  new URL("build/map/candidate-integrity.json", root),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));