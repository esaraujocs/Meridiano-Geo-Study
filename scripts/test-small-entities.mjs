import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { feature } from "topojson-client";
import {
  LEGACY_POINT_ENTITY_IDS,
  smallEntityPoints,
  runtimeSmallEntityPoints,
  smallEntityCoverageReport,
} from "../.tmp-small/small-entities.js";

const [geometryData, catalog] = await Promise.all([
  readFile("public/data/legacy-map.json", "utf8").then(JSON.parse),
  readFile("public/data/legacy/catalog.json", "utf8").then(JSON.parse),
]);
const collection = feature(
  geometryData.topo,
  geometryData.topo.objects.countries,
);
const geometryById = new Map(collection.features.map((item) => [String(item.id), item.geometry]));
const sourceIds = [...new Set([...catalog.mapEntityIds.map(String), ...LEGACY_POINT_ENTITY_IDS])];
const features = sourceIds.map((id) => ({
  id: String(id),
  geometry: geometryById.get(String(id)),
}));
const markers = smallEntityPoints(features, catalog);
const ids = markers.features.map((item) => item.properties.carta_id);

assert(ids.includes("744"), "Svalbard e Jan Mayen must retain a marker");
assert(ids.includes("772"), "Tokelau must retain a marker");
assert(ids.length > 2, "small polygon entities beyond the two legacy points must receive markers");
assert.equal(new Set(ids).size, ids.length, "each small entity must receive one marker");
assert(markers.features.every((item) =>
  item.geometry.coordinates.every(Number.isFinite)
), "every marker must have finite coordinates");

const report = smallEntityCoverageReport(
  features,
  catalog,
  ([longitude, latitude], zoom) => {
    const scale = 512 * 2 ** zoom;
    const sin = Math.sin((latitude * Math.PI) / 180);
    return [
      ((longitude + 180) / 360) * scale,
      (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
    ];
  },
);
assert.equal(report.entities.length, sourceIds.length, "coverage report must include every playable entity");
assert.deepEqual(report.zooms, [2, 3, 4, 5, 6, 7, 8]);
const byName = new Map(report.entities.map((item) => [item.name, item]));
for (const name of ["Vaticano", "San Marino", "Tuvalu", "Nauru", "Palau", "Ilhas Marshall", "Micronésia", "Kiribati", "Tonga", "Samoa"]) {
  assert(byName.has(name), `${name} must be in marker coverage report`);
}
for (const id of ["336", "674", "666", "798", "520", "585", "584", "583", "296", "776", "882"]) {
  assert(report.entities.some((entity) => entity.id === id), `${id} must have marker coverage`);
}
assert(report.entities.every((entity) =>
  entity.markedParts.every((part) => part.zooms.every((sample) => sample.marker !== sample.contour)),
), "each marked part must list deterministic switch zoom coverage");
for (const zoom of report.zooms) {
  const runtime = runtimeSmallEntityPoints(features, catalog, zoom, ([longitude, latitude], currentZoom) => {
    const scale = 512 * 2 ** currentZoom;
    const sin = Math.sin((latitude * Math.PI) / 180);
    return [((longitude + 180) / 360) * scale, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale];
  }).features;
  for (const entity of report.entities) for (const part of entity.markedParts) {
    const expected = part.zooms.find((sample) => sample.zoom === zoom)?.marker;
    const actual = runtime.some((item) => item.properties.carta_id === entity.id && item.properties.part === part.part);
    assert.equal(actual, expected, `runtime/report parity failed for ${entity.id} part ${part.part} zoom ${zoom}`);
  }
}
const brazilAtWorld = runtimeSmallEntityPoints(features, catalog, 2, ([longitude, latitude], currentZoom) => {
  const scale = 512 * 2 ** currentZoom;
  const sin = Math.sin((latitude * Math.PI) / 180);
  return [((longitude + 180) / 360) * scale, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale];
});
assert(!brazilAtWorld.features.some((item) => item.properties.carta_id === "76" && item.properties.part === 0), "large-country main-part marker must not appear at world zoom");
const fadeSamples = [2, 2.25, 2.5, 2.75, 3].map((zoom) =>
  runtimeSmallEntityPoints([{ id: "336", geometry: geometryById.get("336") }], catalog, zoom, ([longitude, latitude], currentZoom) => {
    const scale = 512 * 2 ** currentZoom;
    const sin = Math.sin((latitude * Math.PI) / 180);
    return [((longitude + 180) / 360) * scale, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale];
  }).features[0]?.properties.opacity ?? 0,
);
assert(fadeSamples.every((opacity, index) => index === 0 || opacity <= fadeSamples[index - 1]), "marker fade must be monotonic with zoom");

const holeFeature = {
  id: "hole",
  geometry: { type: "Polygon", coordinates: [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
  ] },
};
const holeMarkers = runtimeSmallEntityPoints([holeFeature], { meta: { hole: { pt: "Hole" } }, mapEntityIds: ["hole"] }, 2, (point, zoom) => point.map((value) => value * 2));
const holePoint = holeMarkers.features[0].geometry.coordinates;
assert(!(holePoint[0] > 4 && holePoint[0] < 6 && holePoint[1] > 4 && holePoint[1] < 6), "marker must not land inside a hole");
assert(holePoint[0] > 0 && holePoint[0] < 10 && holePoint[1] > 0 && holePoint[1] < 10, "marker must be strictly inside the shell");

console.log(`small entities: ${ids.length} runtime markers verified`);