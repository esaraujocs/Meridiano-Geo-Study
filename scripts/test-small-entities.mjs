import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [source, catalog] = await Promise.all([
  readFile("src/data/small-entity-markers.json", "utf8").then(JSON.parse),
  readFile("public/data/legacy/catalog.json", "utf8").then(JSON.parse),
]);
const playableIds = new Set(catalog.mapEntityIds.map(String));
const byId = new Map(source.features.map((item) => [item.properties.carta_id, item]));

assert(source.features.length <= playableIds.size, "marker source cannot exceed playable entities");
assert.equal(byId.size, source.features.length, "exactly one marker per marked entity");
assert(source.features.every((item) =>
  playableIds.has(item.properties.carta_id) &&
  item.geometry.coordinates.every(Number.isFinite)
), "every marker must belong to a playable entity and have finite coordinates");

const idFor = (name) => Object.entries(catalog.meta)
  .find(([, meta]) => meta.pt === name)?.[0];
for (const name of ["Indonésia", "Filipinas", "Noruega", "Canadá", "Grécia"]) {
  assert(!byId.has(idFor(name)), `${name} must have zero markers`);
}
for (const name of ["Vaticano", "San Marino", "Malta", "Maldivas"]) {
  assert(byId.has(idFor(name)), `${name} must have exactly one marker`);
}

const regionMatches = (meta, region) => {
  if (region === "mundo") return true;
  if (region === "caribe") return meta?.reg === "Caribbean" || meta?.sub === "Caribbean";
  if (region === "pacifico") return meta?.reg === "Oceania";
  return false;
};
const count = (region, unOnly) => source.features.filter((item) => {
  const meta = catalog.meta[item.properties.carta_id];
  return regionMatches(meta, region) && (!unOnly || meta?.un);
}).length;

const vatican = idFor("Vaticano");
const sanMarino = idFor("San Marino");
const saintPierre = idFor("São Pedro e Miquelon");
assert(byId.get(vatican)?.properties.un === false && byId.has(vatican), "Vatican marker must remain in the ONU preset exception");
assert(byId.get(sanMarino)?.properties.un === true, "San Marino must be marked and ONU");
assert(byId.get(saintPierre)?.properties.un === false, "Saint Pierre must be marked but not ONU");
assert(!source.features.filter((item) => item.properties.un).some((item) =>
  item.properties.carta_id === saintPierre
), "ONU filter must exclude Saint Pierre");

const counts = {
  total: source.features.length,
  worldUnOn: count("mundo", true) + 1, // Vaticano is the explicit observer exception.
  worldUnOff: count("mundo", false),
  caribbean: count("caribe", false),
  pacific: count("pacifico", false),
};
for (const [label, value] of Object.entries(counts)) {
  assert(value <= playableIds.size, `${label} count exceeds playable entities`);
}

console.log(JSON.stringify(counts));