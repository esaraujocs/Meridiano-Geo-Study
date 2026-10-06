import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [source, catalog] = await Promise.all([
  readFile("src/data/small-entity-markers.json", "utf8").then(JSON.parse),
  readFile("public/data/legacy/catalog.json", "utf8").then(JSON.parse),
]);
const playableIds = new Set(catalog.mapEntityIds.map(String));
const byId = new Map(source.features.map((item) => [item.properties.carta_id, item]));

const absorbedMarkers = source.features.filter((item) => item.properties.absorbed);
const playableMarkers = source.features.filter((item) => !item.properties.absorbed);
assert(playableMarkers.length <= playableIds.size, "marker source cannot exceed playable entities");
assert.equal(byId.size, source.features.length, "exactly one marker per marked entity");
assert(playableMarkers.every((item) =>
  playableIds.has(item.properties.carta_id) &&
  item.geometry.coordinates.every(Number.isFinite)
), "every marker must belong to a playable entity and have finite coordinates");

// Absorvidos (Guadalupe, Martinica, Reunião, Svalbard, Bouvet, Heard, Ilhas Menores): nunca são
// alvo, respondem pelo soberano e existem no catálogo como absorvidos. No mapa em alta definição eles
// fazem parte do polígono do soberano; só os pequenos ganham marcador (Svalbard já se vê inteira).
const absorbedInCatalog = Object.entries(catalog.meta).filter(([, meta]) => meta.absorvido).map(([id]) => id);
assert(absorbedMarkers.every((item) => absorbedInCatalog.includes(item.properties.carta_id)),
  "marcador de absorvido só para território absorvido do catálogo");
for (const name of ["Guadalupe", "Martinica", "Reunião", "Ilha Bouvet"]) {
  const id = Object.entries(catalog.meta).find(([, meta]) => meta.pt === name)?.[0];
  assert(absorbedMarkers.some((item) => item.properties.carta_id === id), `${name} precisa de marcador (ilha pequena)`);
}
for (const item of absorbedMarkers) {
  const { carta_id: id, answer_id: answerId } = item.properties;
  assert(!playableIds.has(id), `${id}: absorvido não pode ser jogável`);
  assert(playableIds.has(answerId), `${id}: soberano ${answerId} precisa ser jogável`);
  assert.equal(String(catalog.meta[id].mapaPara), answerId, `${id}: answer_id diferente de mapaPara`);
  assert.equal(item.properties.un, false, `${id}: absorvido não é membro da ONU`);
  assert(item.geometry.coordinates.every(Number.isFinite), `${id}: coordenadas inválidas`);
}
const absorbedFile = await readFile("scripts/map-hd/absorbed.geojson", "utf8").then(JSON.parse);
const polygonIds = absorbedFile.features.filter((item) => item.geometry.type !== "Point").map((item) => item.properties.carta_id);
assert.deepEqual([...polygonIds].sort(), [...absorbedInCatalog].sort(), "todo território absorvido precisa de contorno em scripts/map-hd/absorbed.geojson");

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
const count = (region, unOnly) => playableMarkers.filter((item) => {
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

// Visibilidade por tamanho: o marcador só existe enquanto o contorno é menor que o ponto.
const cameraZoom = Object.fromEntries(
  [...(await readFile("src/domain/regions.ts", "utf8"))
    .matchAll(/(\w+): \{ center: \[[^\]]+\], zoom: ([\d.]+) \}/g)]
    .map(([, region, zoom]) => [region, Number(zoom)]),
);
assert(Number.isFinite(cameraZoom.caribe), "zoom da câmera do Caribe não encontrado em regions.ts");
const zoomOf = (name) => byId.get(idFor(name))?.properties.switchZoom;
assert(source.features.every((item) =>
  Number.isFinite(item.properties.switchZoom) && item.properties.switchZoom > 2
), "todo marcador precisa de switchZoom finito e maior que o zoom de classificação");
for (const name of ["Haiti", "Jamaica", "República Dominicana"]) {
  const value = zoomOf(name);
  assert(value === undefined || value < cameraZoom.caribe, `${name} não pode ter marcador visível no zoom do Caribe`);
}
for (const name of ["Barbados", "Granada", "Santa Lúcia", "Antígua e Barbuda", "Dominica", "Aruba", "Curaçao", "Ilhas Cayman"]) {
  assert(zoomOf(name) > cameraZoom.caribe, `${name} precisa de marcador visível no zoom do Caribe`);
}
assert(zoomOf("Vaticano") > 9 && zoomOf("San Marino") > 6 && zoomOf("Malta") > 6,
  "microestados mantêm o marcador até zoom alto");
assert(source.features.filter((item) => item.properties.switchZoom >= 24).length <= 10,
  "só entidades sem polígono nos tiles podem ficar sempre visíveis");

const counts = {
  total: playableMarkers.length,
  absorbed: absorbedMarkers.length,
  worldUnOn: count("mundo", true) + 1, // Vaticano is the explicit observer exception.
  worldUnOff: count("mundo", false),
  caribbean: count("caribe", false),
  pacific: count("pacifico", false),
};
for (const [label, value] of Object.entries(counts)) {
  assert(value <= playableIds.size, `${label} count exceeds playable entities`);
}

console.log(JSON.stringify(counts));