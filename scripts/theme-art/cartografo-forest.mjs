// Florestas do tema Cartógrafo: árvores pequenas de gravura espalhadas pelas grandes florestas do mundo (taiga, Amazônia, Congo...). As posições saem daqui, uma vez,
// da geometria do jogo (public/data/legacy-map.json): só em terra e a uma boa distância de fronteiras e costas, para nunca atrapalharem o contorno dos países.
import { readFileSync } from "node:fs";
import { feature } from "topojson-client";

/** Regiões de floresta: nome, longitude e latitude do centro, raios em graus, tipo de árvore e quantidade de árvores desejada (antes do filtro de terra). */
export const FORESTS = [
  ["Taiga siberiana", 95, 61, 32, 7, "conifer", 150],
  ["Taiga do extremo oriente", 137, 59, 12, 6, "conifer", 40],
  ["Escandinávia e Finlândia", 21, 63, 8, 5, "conifer", 34],
  ["Taiga canadense", -101, 56, 26, 7, "conifer", 140],
  ["Taiga canadense leste", -72, 51, 9, 5, "conifer", 34],
  ["Alasca", -150, 65, 9, 4, "conifer", 24],
  ["Rocheiras", -114, 47, 5, 8, "conifer", 22],
  ["Leste dos Estados Unidos", -84, 37, 9, 6, "deciduous", 44],
  ["Europa central e oriental", 24, 51, 13, 5, "deciduous", 40],
  ["Amazônia", -62, -5, 14, 8, "deciduous", 90],
  ["Mata Atlântica", -47, -20, 4, 7, "deciduous", 16],
  ["América Central", -86, 13, 5, 3, "deciduous", 12],
  ["Congo", 23, 0, 10, 6, "deciduous", 55],
  ["África oriental", 34, -10, 4, 6, "deciduous", 12],
  ["Sudeste Asiático", 104, 17, 6, 7, "deciduous", 30],
  ["Sul da China", 111, 27, 8, 4, "deciduous", 26],
  ["Bornéu", 114, 0.5, 3.5, 3, "deciduous", 14],
  ["Sumatra", 102, -1, 2.5, 5, "deciduous", 10],
  ["Nova Guiné", 141, -5, 7, 2.5, "deciduous", 16],
  ["Chile do sul", -72, -42, 2, 6, "conifer", 10],
  ["Leste da Austrália", 148, -30, 3, 9, "deciduous", 12],
  ["Japão e Coreia", 136, 36, 8, 5, "conifer", 14],
];

/** Gerador pseudoaleatório com semente (as árvores saem sempre iguais). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a += 0x6d2b79f5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Anéis (lon, lat) de todos os países do jogo. */
function landRings(path = new URL("../../public/data/legacy-map.json", import.meta.url)) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  const collection = feature(data.topo, data.topo.objects.countries);
  const rings = [];
  for (const item of collection.features) {
    if (!item.geometry) continue;
    const polys = item.geometry.type === "Polygon" ? [item.geometry.coordinates] : item.geometry.type === "MultiPolygon" ? item.geometry.coordinates : [];
    for (const poly of polys) rings.push(poly);
  }
  return rings; // cada item: [anel externo, ...buracos]
}

const inRing = (lon, lat, ring) => { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside; } return inside; };
const inLand = (lon, lat, polygons) => polygons.some((poly) => { const [outer, ...holes] = poly; return inRing(lon, lat, outer) && !holes.some((hole) => inRing(lon, lat, hole)); });

/** Distância (em graus, com a longitude corrigida pela latitude) do ponto ao segmento mais próximo de qualquer fronteira ou costa. */
function makeEdgeIndex(polygons) {
  const cell = 2, grid = new Map();
  const put = (lon, lat, seg) => { const key = `${Math.floor(lon / cell)},${Math.floor(lat / cell)}`; (grid.get(key) ?? grid.set(key, []).get(key)).push(seg); };
  for (const poly of polygons) for (const ring of poly) for (let i = 1; i < ring.length; i += 1) {
    const seg = [ring[i - 1][0], ring[i - 1][1], ring[i][0], ring[i][1]];
    const x0 = Math.floor(Math.min(seg[0], seg[2]) / cell), x1 = Math.floor(Math.max(seg[0], seg[2]) / cell), y0 = Math.floor(Math.min(seg[1], seg[3]) / cell), y1 = Math.floor(Math.max(seg[1], seg[3]) / cell);
    for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) put(x * cell, y * cell, seg);
  }
  return (lon, lat, reach = 4) => {
    let best = Infinity; const k = Math.cos((lat * Math.PI) / 180);
    for (let x = Math.floor((lon - reach) / cell); x <= Math.floor((lon + reach) / cell); x += 1) for (let y = Math.floor((lat - reach) / cell); y <= Math.floor((lat + reach) / cell); y += 1) {
      for (const [ax, ay, bx, by] of grid.get(`${x},${y}`) ?? []) {
        const px = (lon - ax) * k, py = lat - ay, dx = (bx - ax) * k, dy = by - ay, len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
        best = Math.min(best, Math.hypot(px - t * dx, py - t * dy));
      }
    }
    return best;
  };
}

/** Número normal (Box-Muller) com o gerador dado. */
const gauss = (random) => Math.sqrt(-2 * Math.log(random() || 1e-9)) * Math.cos(2 * Math.PI * random());

/** As árvores: [lon, lat, tipo (0 conífera, 1 folhosa), tamanho em graus de largura, cor (0 a 3)]. Em cada região saem bosques (manchas de árvores) e não uma grade: só em terra, a `margin` graus (mais a meia largura) de fronteiras e costas, com espaçamento mínimo. */
export function forestTrees({ margin = 1.0, spacing = 1.35, seed = 27 } = {}) {
  const polygons = landRings(), edge = makeEdgeIndex(polygons), random = rng(seed);
  const trees = [];
  for (const [, lon0, lat0, rx, ry, kind, count] of FORESTS) {
    // centros dos bosques dentro da elipse da região; cada árvore nasce perto de um deles
    const clumps = Array.from({ length: Math.max(3, Math.round(count / 12)) }, () => { const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * 0.9; return [lon0 + Math.cos(angle) * radius * rx, lat0 + Math.sin(angle) * radius * ry, 0.6 + random() * 0.8]; });
    let placed = 0;
    for (let attempt = 0; attempt < count * 30 && placed < count; attempt += 1) {
      const [cx, cy, spread] = clumps[Math.floor(random() * clumps.length)];
      const lon = cx + gauss(random) * rx * 0.16 * spread, lat = cy + gauss(random) * ry * 0.22 * spread;
      if (Math.abs(lat) > 72 || ((lon - lon0) / (rx * 1.25)) ** 2 + ((lat - lat0) / (ry * 1.25)) ** 2 > 1) continue;
      const size = +(1.15 + random() * 0.85).toFixed(2);
      if (!inLand(lon, lat, polygons) || edge(lon, lat) < margin + size / 2) continue;
      if (trees.some(([x, y]) => Math.hypot((x - lon) * Math.cos((lat * Math.PI) / 180), y - lat) < spacing * (0.75 + 0.25 * size))) continue;
      trees.push([+lon.toFixed(2), +lat.toFixed(2), kind === "conifer" ? 0 : 1, size, Math.floor(random() * 4)]);
      placed += 1;
    }
  }
  // de cima para baixo, para as de baixo (mais perto de quem olha) cobrirem as de cima, como nas gravuras
  return trees.sort((p, q) => q[1] - p[1]);
}

const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * (180 / Math.PI);
const unmerc = (y) => (2 * Math.atan(Math.exp((y * Math.PI) / 180)) - Math.PI / 2) * (180 / Math.PI);
// silhuetas no espaço do Mercator (unidade = largura da árvore; y para cima), para as árvores terem a mesma proporção em qualquer latitude
const CONIFER = [[0, 1.5], [0.32, 0.95], [0.16, 0.95], [0.42, 0.42], [0.2, 0.42], [0.5, -0.05], [0.09, -0.05], [0.09, -0.32], [-0.09, -0.32], [-0.09, -0.05], [-0.5, -0.05], [-0.2, 0.42], [-0.42, 0.42], [-0.16, 0.95], [-0.32, 0.95]];
const CANOPY = Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return [Math.cos(a) * 0.42 * (1 + 0.1 * Math.sin(a * 3)), 0.78 + Math.sin(a) * 0.42]; });
const TRUNK = [[-0.08, 0.36], [0.08, 0.36], [0.1, -0.3], [-0.1, -0.3]];
const TINTS = { 0: ["#7C9160", "#8A9A5E", "#6E8A5C", "#94A066"], 1: ["#9AA463", "#C99A4B", "#8FA25E", "#B4783C"] };

/** Polígonos GeoJSON das árvores (copa e tronco), com a cor de cada uma. */
export function treeFeatures(trees) {
  const features = [];
  for (const [lon, lat, kind, size, tint] of trees) {
    const y0 = merc(lat), shape = (pts) => [pts.map(([ux, uy]) => [+(lon + ux * size).toFixed(3), +unmerc(y0 + uy * size).toFixed(3)])].map((ring) => [...ring, ring[0]]);
    const color = TINTS[kind][tint];
    if (kind === 0) features.push({ type: "Feature", properties: { c: color }, geometry: { type: "Polygon", coordinates: shape(CONIFER) } });
    else { features.push({ type: "Feature", properties: { c: "#7A5C34" }, geometry: { type: "Polygon", coordinates: shape(TRUNK) } }, { type: "Feature", properties: { c: color }, geometry: { type: "Polygon", coordinates: shape(CANOPY) } }); }
  }
  return { type: "FeatureCollection", features };
}
