// Cores do mapa em jogo (MapLibre). O tema escolhido pode trocar o oceano, a terra, as costas e os marcadores dos territórios pequenos e ligar uma
// quadrícula de meridianos; o verde do acerto e o vermelho do erro ficam fixos em qualquer tema. Lógica pura.

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
};

export const DEFAULT_MAP_PALETTE: MapPalette = { ocean: "#081825", land: "#164455", outline: "#4c8890", marker: "#9db7b2", markerStroke: "#24423d", graticule: null };

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
