// Gera public/data/split-islands.geojson: ilhas divididas entre dois territórios jogáveis cujo contorno nos tiles é a ilha INTEIRA para os dois
// (fallback legado, sem tippecanoe aqui para refazer o .pmtiles). Hoje só São Martinho: 534 (Holanda, Sint Maarten, sul) e 663 (França, Saint-Martin,
// norte) vinham com o mesmo polígono, os dois marcadores no mesmo ponto e o clique de um valendo pelo outro. O mapa desenha estes contornos por cima,
// esconde o polígono dos tiles dessas entidades e mede a distância por aqui (map-game.tsx). O marcador de cada uma vai para dentro da própria metade
// em generate-small-entity-report.mjs (npm run generate:markers), que lê este arquivo.
// Fonte: Natural Earth 10m admin 0 (domínio público). Rode: npm run build:split-islands
import { readFile, writeFile } from "node:fs/promises";

const SOURCE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson";
const SPLITS = { SXM: "534", MAF: "663" };
const catalog = JSON.parse(await readFile("public/data/legacy/catalog.json", "utf8"));
const ne = await fetch(SOURCE).then((response) => { if (!response.ok) throw new Error(`Natural Earth: ${response.status}`); return response.json(); });
const round = (value) => Number(value.toFixed(5));
const features = [];
for (const [iso, id] of Object.entries(SPLITS)) {
  const found = ne.features.find((feature) => feature.properties.ADM0_A3 === iso);
  if (!found) throw new Error(`${iso} não está no Natural Earth.`);
  const polygons = found.geometry.type === "Polygon" ? [found.geometry.coordinates] : found.geometry.coordinates;
  features.push({
    type: "Feature",
    properties: { carta_id: id, answer_id: id, name: catalog.meta[id].pt },
    geometry: { type: "MultiPolygon", coordinates: polygons.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => [round(x), round(y)]))) },
  });
}
await writeFile("public/data/split-islands.geojson", `${JSON.stringify({ type: "FeatureCollection", features })}\n`);
await writeFile("public/data/split-islands.manifest.json", `${JSON.stringify({ generatedBy: "scripts/build-split-islands.mjs", source: SOURCE, license: "Natural Earth (domínio público)", ids: SPLITS }, null, 2)}\n`);
// o marcador de cada metade é posto dentro dela pelo gerador de marcadores (lê este arquivo)
console.log(`split islands: ${features.length} (${Object.values(SPLITS).join(", ")}). Rode depois: npm run generate:markers`);
