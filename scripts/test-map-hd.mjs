// Mapa em alta definição (public/maps/meridiano-hd.pmtiles, scripts/map-hd/): cabeçalho, manifesto e quem responde por
// pontos conhecidos no zoom mais detalhado (metades de São Martinho, Saara Ocidental × Marrocos, Ilha de Páscoa × Chile,
// nações do Reino Unido, lagos como água, terra neutra sem entidade) e emendas (pedaços da mesma entidade que não fundiram
// na borda de um tile e desenham uma linha no meio da terra). Uso: npm run test:map
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PMTiles } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

const FILE = "public/maps/meridiano-hd.pmtiles";
const bytes = await readFile(FILE);
const manifest = JSON.parse(await readFile("public/maps/meridiano-hd.manifest.json", "utf8"));
const catalog = JSON.parse(await readFile("public/data/legacy/catalog.json", "utf8"));
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const archive = new PMTiles({ getKey: () => FILE, getBytes: async (offset, length) => ({ data: buffer.slice(offset, offset + length) }) });
const header = await archive.getHeader();

assert.equal(header.tileType, 1, "tiles MVT");
assert.equal(header.tileCompression, 2, "tiles com gzip");
assert.equal(header.minZoom, 0);
assert.equal(header.maxZoom, manifest.zoom.max);
assert.equal(bytes.byteLength, manifest.bytes, "tamanho do arquivo = manifesto");
assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.sha256, "hash do arquivo = manifesto");
const playable = catalog.mapEntityIds.map(String);
assert.deepEqual([...manifest.entities].sort(), [...playable].sort(), "o manifesto lista exatamente as entidades jogáveis");
for (const id of playable) assert.ok(manifest.vertices[id] > 0, `${id} (${catalog.meta[id]?.pt}) sem geometria`);

const Z = header.maxZoom;
const world = (lon, lat) => {
  const sin = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180);
  return [((lon + 180) / 360) * 2 ** Z, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 2 ** Z];
};
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
/** carta_id de quem cobre o ponto (lon, lat) no zoom máximo; null = água. */
async function ownerAt(lon, lat) {
  const [wx, wy] = world(lon, lat);
  const tx = Math.floor(wx); const ty = Math.floor(wy);
  const tile = await archive.getZxy(Z, tx, ty);
  if (!tile) return null;
  const layer = new VectorTile(new PbfReader(new Uint8Array(tile.data))).layers.countries;
  const x = (wx - tx) * layer.extent; const y = (wy - ty) * layer.extent;
  for (let index = 0; index < layer.length; index += 1) {
    const feature = layer.feature(index);
    if (feature.type === 3 && inside(feature.loadGeometry(), x, y)) return String(feature.properties.carta_id);
  }
  return null;
}

const probes = [
  ["Marigot (São Martinho, França)", -63.085, 18.07, "663"],
  ["Philipsburg (São Martinho, Holanda)", -63.045, 18.025, "534"],
  ["Saba (terra sem entidade)", -63.235, 17.63, ""],
  ["Santo Eustáquio", -62.98, 17.49, "bq-se"],
  ["Bonaire", -68.27, 12.15, "535"],
  ["Basse-Terre (Guadalupe vale a França)", -61.7, 16.2, "250"],
  ["El Aaiún (Saara Ocidental)", -13.2, 27.15, "732"],
  ["Marrakech", -7.99, 31.63, "504"],
  ["Hanga Roa (Ilha de Páscoa)", -109.43, -27.15, "cl-ip"],
  ["Santiago do Chile", -70.65, -33.45, "152"],
  ["Campo de Gelo Patagônico Sul (Argentina, como no mapa anterior)", -73.25, -49.5, "32"],
  ["Londres", -0.12, 51.5, "gb-eng"],
  ["Edimburgo", -3.19, 55.95, "gb-sct"],
  ["Cardiff", -3.18, 51.48, "gb-wls"],
  ["Belfast", -5.93, 54.6, "gb-nir"],
  ["Jamestown (Santa Helena)", -5.72, -15.93, "654"],
  ["Ascensão", -14.36, -7.94, "sh-ac"],
  ["Tristão da Cunha", -12.28, -37.1, "sh-ta"],
  ["Gaza", 34.45, 31.5, "275"],
  ["Ramala (Cisjordânia)", 35.2, 31.9, "275"],
  ["Pristina", 21.16, 42.66, "926"],
  ["Iturup (Curilas, Rússia)", 147.8, 45.0, "643"],
  ["Chukotka a leste do antimeridiano", -175.0, 66.0, "643"],
  ["Spitsbergen (Svalbard vale a Noruega)", 17.5, 78.4, "578"],
  ["Interior da Groenlândia", -42.0, 72.0, "304"],
  ["Hong Kong (Kowloon)", 114.17, 22.32, "344"],
  ["Macau", 113.55, 22.19, "446"],
  ["Taipé", 121.56, 25.04, "158"],
  ["Gibraltar", -5.35, 36.14, "292"],
  ["Vaticano", 12.4533, 41.9029, "336"],
  ["San Marino", 12.45, 43.94, "674"],
  ["Mônaco", 7.42, 43.735, "492"],
  ["Maseru (Lesoto)", 27.48, -29.31, "426"],
  ["Honolulu", -157.86, 21.31, "840"],
  ["Suva (Fiji)", 178.44, -18.14, "242"],
  ["Brasília", -47.88, -15.79, "76"],
  ["Interior da Antártida", 0.0, -80.0, "10"],
  ["Bir Tawil (terra sem entidade)", 33.7, 21.88, ""],
  ["Lago Michigan (água)", -87.0, 43.5, null],
  ["Lago Vitória (água)", 33.0, -1.0, null],
  ["Lago Baikal (água)", 108.0, 53.2, null],
  ["Lago Titicaca (água)", -69.4, -15.8, null],
  // lagos do Natural Earth acima de 1.000 km² e os menores de lakes.json (fetch-lakes.py): o Manitoba antes pegava o Winnipeg
  ["Lago Manitoba (água)", -98.3036, 50.4131, null],
  ["IJsselmeer (água)", 5.4818, 52.7312, null],
  ["Sobradinho (água)", -42.1913, -9.8993, null],
  ["Lagoa Mirim (água)", -52.8247, -32.6371, null],
  ["Lago Saint Clair (água)", -82.7486, 42.422, null],
  ["Itaipu (água)", -54.4598, -25.2104, null],
  ["Lago de Garda (água)", 10.6683, 45.5145, null],
  ["Represa de Kuibyshev/Samara (água)", 49.5634, 55.2768, null],
  ["Smallwood (água)", -64.0183, 54.1516, null],
  // lagunas que o OSM deixa fora da linha de costa (sem elas, terra)
  ["Lagoa dos Patos (água)", -50.9851, -30.6642, null],
  ["Kara-Bogaz-Gol (água)", 53.4453, 41.4655, null],
  ["Laguna de Veneza (água)", 12.2847, 45.3407, null],
  ["Lago Enriquillo (água)", -71.5917, 18.4566, null],
  ["Lough Neagh (água, Irlanda do Norte em volta)", -6.4117, 54.6109, null],
  ["Lago de Como (água)", 9.2611, 46.0117, null],
  ["Mar Cáspio (água)", 50.5, 42.0, null],
  ["Atlântico (água)", -30.0, 0.0, null],
];
const failures = [];
for (const [name, lon, lat, expected] of probes) {
  const got = await ownerAt(lon, lat);
  if (got !== expected) failures.push(`${name}: esperado ${JSON.stringify(expected)}, veio ${JSON.stringify(got)}`);
}
assert.deepEqual(failures, [], `pontos com dono errado:\n${failures.join("\n")}`);

// Emendas: com a margem de 8 px, o contorno só corre SOBRE a borda de um tile quando a terra acaba ali. Se o tile vizinho (do
// outro lado da borda, dando a volta no antimeridiano) tem terra da MESMA entidade logo ali, é um pedaço que não fundiu com o
// vizinho, e o contorno vira uma linha desenhada no meio da terra (a grade das células, o antimeridiano em Chukotka e na
// Antártida). Confere todos os tiles até o zoom 7 e as colunas do antimeridiano nos zooms de cima; tolera até 2 px (pedacinhos
// de costa ou de fronteira que caem numa linha da grade ficam abaixo de 1 px).
const tileCache = new Map();
async function polygonsOf(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (!tileCache.has(key)) {
    if (tileCache.size > 4000) tileCache.clear();
    const tile = await archive.getZxy(z, x, y);
    let value = null;
    if (tile) {
      const layer = new VectorTile(new PbfReader(new Uint8Array(tile.data))).layers.countries;
      value = { extent: layer.extent, list: [] };
      for (let index = 0; index < layer.length; index += 1) {
        const feature = layer.feature(index);
        if (feature.type === 3) value.list.push({ id: String(feature.properties.carta_id), rings: feature.loadGeometry() });
      }
    }
    tileCache.set(key, value);
  }
  return tileCache.get(key);
}
async function seamsOf(z, x, y) {
  const tile = await polygonsOf(z, x, y);
  if (!tile) return [];
  const E = tile.extent; const n = 2 ** z; const tolerance = (2 * E) / 512; const out = [];
  for (const feature of tile.list) for (const ring of feature.rings) for (let i = 1; i < ring.length; i += 1) {
    const a = ring[i - 1]; const b = ring[i];
    // a terra fica à direita do sentido do anel (MVT, y para baixo): só conta a borda com a terra do lado de dentro do tile
    let side = null;
    if (a.x === b.x && a.x === E && b.y > a.y) side = [1, 0];
    else if (a.x === b.x && a.x === 0 && b.y < a.y) side = [-1, 0];
    else if (a.y === b.y && a.y === E && b.x < a.x && y < n - 1) side = [0, 1];
    else if (a.y === b.y && a.y === 0 && b.x > a.x && y > 0) side = [0, -1];
    const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (!side || length <= tolerance) continue;
    const neighbor = await polygonsOf(z, (x + side[0] + n) % n, y + side[1]);
    if (!neighbor) continue;
    const scale = neighbor.extent / E;
    const px = side[0] === 1 ? 0.5 : side[0] === -1 ? neighbor.extent - 0.5 : ((a.x + b.x) / 2) * scale;
    const py = side[1] === 1 ? 0.5 : side[1] === -1 ? neighbor.extent - 0.5 : ((a.y + b.y) / 2) * scale;
    if (neighbor.list.some((other) => other.id === feature.id && inside(other.rings, px, py))) out.push(`${z}/${x}/${y} ${feature.id || "(neutra)"} (${length} unidades)`);
  }
  return out;
}
const seams = [];
for (let z = 0; z <= Math.min(7, Z); z += 1) for (let x = 0; x < 2 ** z; x += 1) for (let y = 0; y < 2 ** z; y += 1) seams.push(...await seamsOf(z, x, y));
for (let z = 8; z <= Z; z += 1) for (const x of [0, 2 ** z - 1]) for (let y = 0; y < 2 ** z; y += 1) seams.push(...await seamsOf(z, x, y));
assert.deepEqual(seams, [], `emendas desenhadas no meio da terra:\n${seams.slice(0, 20).join("\n")}`);
console.log(`map hd: z0–${Z}, ${(bytes.byteLength / 1e6).toFixed(1)} MB, ${playable.length} entidades, ${probes.length} pontos conferidos, sem emendas`);
