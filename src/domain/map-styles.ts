// Estilos de mapa do Mecenato (itens que as expedições trazem): trocam o mapa das partidas de Mapa e Capitais por uma carta inspirada na peça histórica,
// por cima da paleta do tema (o tema continua mandando no Hub). Cada estilo define as cores (com o acerto e o erro sempre legíveis sobre a terra e o mar),
// a quadrícula, as linhas de rumo, o traço de tinta e os ornamentos: o cartucho do título e as rosas dos ventos presas ao mapa. Lógica pura.
import type { MapPalette } from "./map-palette.js";

export type MapStyleId = "estilo-1507" | "estilo-navegante" | "estilo-iluminura";
export type MapStyle = {
  palette: Partial<MapPalette>;
  /** Título e subtítulo do cartucho, no canto do mapa (nome da obra, não traduzido). */
  cartouche: readonly [string, string];
  /** Rosas dos ventos sobre o mar: longitude, latitude e largura em px no mapa-múndi (crescem com o zoom, como a fauna do Cartógrafo). */
  roses: readonly (readonly [number, number, number])[];
  /** Cores da rosa e do cartucho. */
  ornament: { paper: string; ink: string; accent: string; metal: string };
};

export const MAP_STYLES: Record<MapStyleId, MapStyle> = {
  // Waldseemüller 1507: papel marfim, terra creme, tinta sépia carregada de xilogravura, quadrícula de 15° e linhas de rumo
  "estilo-1507": {
    palette: {
      ocean: "#ECDCB6", land: "#F4E8C8", outline: "#5A3D22", marker: "#8E3B2F", markerStroke: "#F4E8C8", graticule: "#7A5A2E", graticuleOpacity: 0.42, graticuleStep: 15,
      landOpacity: 1, answer: "#2F7D5B", wrong: "#B2392B", coast: null,
      rhumb: { color: "#9C4F3A", opacity: 0.33, hubs: [[-38, 22], [64, -6]] }, ink: { color: "#4D331C", width: 1.15, opacity: 0.85 },
    },
    cartouche: ["Vniversalis Cosmographia", "1507"],
    roses: [[-36, 24, 110]],
    ornament: { paper: "#F4E8C8", ink: "#3D2814", accent: "#8E3B2F", metal: "#B68A3E" },
  },
  // Mercator 1569: carta de navegar — mar verde-papel, rede de linhas de rumo saindo de várias rosas, quadrícula de 10°
  "estilo-navegante": {
    palette: {
      ocean: "#DCE3D2", land: "#F6EFD9", outline: "#3E4A2A", marker: "#7C3A2A", markerStroke: "#F6EFD9", graticule: "#5D6B45", graticuleOpacity: 0.35, graticuleStep: 10,
      landOpacity: 1, answer: "#24785A", wrong: "#B43A2C", coast: null,
      rhumb: { color: "#6B4A22", opacity: 0.26, hubs: [[-40, 30], [-28, -22], [62, -12], [-150, 12], [150, 22]], directions: 32 }, ink: { color: "#2E3A22", width: 0.9, opacity: 0.7 },
    },
    cartouche: ["Ad usum navigantium", "1569"],
    roses: [[-40, 30, 92], [-28, -22, 72], [62, -12, 82], [-150, 12, 82]],
    ornament: { paper: "#F6EFD9", ink: "#2E3A22", accent: "#7C3A2A", metal: "#A88B4A" },
  },
  // Fra Mauro c. 1450: iluminura — mar azul-lápis, terra dourada, tinta castanha, sem quadrícula
  "estilo-iluminura": {
    palette: {
      ocean: "#1E3A7A", land: "#EAD69A", outline: "#7A5413", marker: "#C2412F", markerStroke: "#F4E3B0", graticule: null,
      landOpacity: 1, answer: "#1F8A5E", wrong: "#B8322A", coast: "#3B5BA8",
      rhumb: null, ink: { color: "#5C3D0E", width: 1, opacity: 0.8 },
    },
    cartouche: ["Mappa Mundi", "Fra Mauro · c. 1450"],
    roses: [[-27, 15, 92], [72, -20, 80]],
    ornament: { paper: "#F2E2B0", ink: "#3A2608", accent: "#B8322A", metal: "#D4A73A" },
  },
};
export const isMapStyleId = (value: unknown): value is MapStyleId => typeof value === "string" && value in MAP_STYLES;
/** A paleta do mapa com o estilo equipado por cima (sem estilo, a do tema). */
export const withMapStyle = (base: MapPalette, styleId: string | undefined): MapPalette => (isMapStyleId(styleId) ? { ...base, ...MAP_STYLES[styleId].palette } : base);

/** Rosa dos ventos de 16 pontas nas cores do estilo (SVG inline, sem texto). */
export function roseSvg(style: MapStyle) {
  const { paper, ink, accent, metal } = style.ornament;
  const pts = (n: number, outer: number, inner: number, offset = 0) => Array.from({ length: n * 2 }, (_, i) => {
    const angle = ((i * Math.PI) / n) + offset - Math.PI / 2, radius = i % 2 === 0 ? outer : inner;
    return `${(50 + Math.cos(angle) * radius).toFixed(1)},${(50 + Math.sin(angle) * radius).toFixed(1)}`;
  }).join(" ");
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="47" fill="${paper}" fill-opacity=".82" stroke="${metal}" stroke-width="2.4"/>`
    + `<circle cx="50" cy="50" r="40" fill="none" stroke="${ink}" stroke-width=".8" stroke-dasharray="1.6 2.6"/>`
    + `<polygon points="${pts(8, 34, 9, Math.PI / 8)}" fill="${metal}" fill-opacity=".55" stroke="${ink}" stroke-width=".7"/>`
    + `<polygon points="${pts(4, 44, 10)}" fill="${paper}" stroke="${ink}" stroke-width="1"/>`
    + `<polygon points="50,6 54,46 50,50 46,46" fill="${accent}"/><polygon points="50,94 46,54 50,50 54,54" fill="${ink}"/>`
    + `<circle cx="50" cy="50" r="4" fill="${metal}" stroke="${ink}" stroke-width=".8"/></svg>`;
}
