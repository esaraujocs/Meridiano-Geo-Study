import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { feature } from "topojson-client";
import {
  LEGACY_POINT_ENTITY_IDS,
  smallEntityPoints,
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

console.log(`small entities: ${ids.length} runtime markers verified`);