// Consulta o mapa ANTERIOR (geoBoundaries + tippecanoe, até 05/10/2026) em pontos dados: qual carta_id cobre cada ponto no zoom 9.
// Serviu para o mapa em alta definição herdar decisões do antigo (a quem pertence cada área disputada; ver entities.json).
// O arquivo antigo saiu do repositório: recupere com git show dc14e65:public/maps/carta-boundary-candidate.pmtiles (ou qualquer
// commit anterior à troca) e grave em build/map-hd/carta-boundary-candidate-old.pmtiles. Também serve para outro .pmtiles qualquer.
// Uso: node scripts/map-hd/sample-old-map.mjs <entrada.json> <saida.json> [arquivo.pmtiles]
//   entrada: [{ "key": "XA", "lon": 146.1, "lat": 43.5 }, ...] → saída: { "XA": "643" | null, ... }
import { readFile, writeFile } from "node:fs/promises";
import { PMTiles } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

const [input, output, file = "build/map-hd/carta-boundary-candidate-old.pmtiles"] = process.argv.slice(2);
const points = JSON.parse(await readFile(input, "utf8"));
const bytes = await readFile(file);
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const archive = new PMTiles({ getKey: () => file, getBytes: async (offset, length) => ({ data: buffer.slice(offset, offset + length) }) });
const Z = 9;
const world = (lon, lat) => {
  const sin = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180);
  return [((lon + 180) / 360) * 2 ** Z, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 2 ** Z];
};
// ponto dentro de polígono por paridade (anéis externos e buracos juntos: a regra par/ímpar resolve os buracos)
const inside = (rings, x, y) => {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]; const b = ring[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
  }
  return hit;
};
const result = {};
for (const point of points) {
  const [wx, wy] = world(point.lon, point.lat);
  const tx = Math.floor(wx); const ty = Math.floor(wy);
  const tile = await archive.getZxy(Z, tx, ty);
  result[point.key] = null;
  if (!tile) continue;
  const layer = new VectorTile(new PbfReader(new Uint8Array(tile.data))).layers.countries;
  const x = (wx - tx) * layer.extent; const y = (wy - ty) * layer.extent;
  for (let index = 0; index < layer.length; index += 1) {
    const feature = layer.feature(index);
    if (feature.type !== 3) continue;
    if (inside(feature.loadGeometry(), x, y)) { result[point.key] = String(feature.properties.carta_id); break; }
  }
}
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
