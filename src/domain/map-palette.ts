// Cores do mapa em jogo (MapLibre). O tema escolhido pode trocar o oceano, a terra, as costas e os marcadores dos territórios pequenos, o tom do acerto e
// do erro (temas claros pedem verdes e vermelhos mais fundos), ligar uma quadrícula de meridianos, uma sombra suave junto às costas e linhas de rumo de
// carta portulana. Lógica pura.

/** Linhas de rumo: 16 direções a partir de cada rosa dos ventos (longitude e latitude), retas no Mercator como nas cartas portulanas. */
export type RhumbSpec = { color: string; opacity: number; hubs: readonly (readonly [number, number])[]; directions?: number };

export type MapPalette = {
  ocean: string;
  land: string;
  /** Costas e fronteiras. */
  outline: string;
  /** Marcador dos territórios pequenos e dos países de um ponto só. */
  marker: string;
  markerStroke: string;
  /** Cor da quadrícula de meridianos e paralelos; sem ela (null) o mapa não tem quadrícula. */
  graticule: string | null;
  graticuleOpacity: number;
  /** Opacidade da terra: o padrão deixa o fundo aparecer um pouco; tema de mapa claro usa 1. */
  landOpacity: number;
  /** País ou território certo (revelado) e errado (o que a pessoa tocou). */
  answer: string;
  wrong: string;
  /** Sombra junto às costas, do lado do mar: três faixas opacas do oceano até esta cor; sem ela (null) o mar é liso. */
  coast: string | null;
  /** Linhas de rumo sobre o mar; sem elas (null) não há. */
  rhumb: RhumbSpec | null;
  /** Traço de tinta por cima das costas e fronteiras (estilos de mapa do Mecenato, como a gravura de 1507); sem ele (null) vale só o contorno fino da terra. */
  ink?: { color: string; width: number; opacity: number } | null;
  /** Espaçamento da quadrícula em graus (padrão 30). */
  graticuleStep?: number;
  /** Fundo de satélite ou relevo (map-base.ts): a opacidade da terra de perto (a foto amacia e a terra volta) e a dos países marcados (acerto,
   *  erro, dicas), que acendem por cima da foto. Sem elas, a terra tem sempre `landOpacity`. */
  landOpacityNear?: number;
  landMarkedOpacity?: number;
};

export const DEFAULT_MAP_PALETTE: MapPalette = {
  ocean: "#081825", land: "#164455", outline: "#4c8890", marker: "#9db7b2", markerStroke: "#24423d", graticule: null, graticuleOpacity: 0.2,
  landOpacity: 0.82, answer: "#4fe0a8", wrong: "#ee7968", coast: null, rhumb: null,
};

/** Meridianos e paralelos de `step` em `step` graus, como linhas GeoJSON (o mapa é Mercator: os paralelos param em ±60° e os meridianos em ±80°). */
export function graticuleLines(step = 30) {
  const features: { type: "Feature"; properties: Record<string, never>; geometry: { type: "LineString"; coordinates: [number, number][] } }[] = [];
  for (let lon = -180; lon <= 180; lon += step) {
    features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: Array.from({ length: 33 }, (_, index) => [lon, -80 + index * 5] as [number, number]) } });
  }
  for (let lat = -60; lat <= 60; lat += step) {
    features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: Array.from({ length: 73 }, (_, index) => [-180 + index * 5, lat] as [number, number]) } });
  }
  return { type: "FeatureCollection" as const, features };
}

const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * (180 / Math.PI);
const inverseMercatorY = (y: number) => (2 * Math.atan(Math.exp((y * Math.PI) / 180)) - Math.PI / 2) * (180 / Math.PI);

/** As linhas de rumo: cada uma parte da rosa dos ventos e vai reta (no Mercator) até a borda do mundo; 16 por rosa. */
export function rhumbLines(hubs: RhumbSpec["hubs"], directions = 16) {
  const features: { type: "Feature"; properties: Record<string, never>; geometry: { type: "LineString"; coordinates: [number, number][] } }[] = [];
  for (const [lon, lat] of hubs) {
    const y0 = mercatorY(lat);
    for (let k = 0; k < directions; k += 1) {
      const theta = (k * 2 * Math.PI) / directions, dx = Math.cos(theta), dy = Math.sin(theta);
      let reach = 400;
      if (dx > 0.001) reach = Math.min(reach, (179.9 - lon) / dx);
      if (dx < -0.001) reach = Math.min(reach, (-179.9 - lon) / dx);
      if (dy > 0.001) reach = Math.min(reach, (170 - y0) / dy);
      if (dy < -0.001) reach = Math.min(reach, (-170 - y0) / dy);
      features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[lon, lat], [lon + dx * reach, inverseMercatorY(y0 + dy * reach)]] } });
    }
  }
  return { type: "FeatureCollection" as const, features };
}

/** Mistura duas cores hex (t = 0 devolve a primeira, 1 a segunda). */
export function mixHex(from: string, to: string, t: number) {
  const parse = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const [a, b] = [parse(from), parse(to)];
  return "#" + a.map((value, index) => Math.round(value + (b[index] - value) * t).toString(16).padStart(2, "0")).join("");
}

/** As três faixas opacas da sombra da costa, da mais larga e clara à mais fina e escura; a largura vai do zoom 1 ao 5. Vazio se a paleta não tem sombra. */
export const COAST_BANDS = [
  { id: "coast-1", mix: 0.3, w1: 9, w5: 24, blur: 7 },
  { id: "coast-2", mix: 0.62, w1: 5.5, w5: 14, blur: 3.5 },
  { id: "coast-3", mix: 1, w1: 2.4, w5: 5.5, blur: 1.2 },
] as const;
export const coastBands = (palette: MapPalette) => (palette.coast ? COAST_BANDS.map((band) => ({ ...band, color: mixHex(palette.ocean, palette.coast as string, band.mix) })) : []);
