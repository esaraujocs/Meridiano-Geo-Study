// Tamanho e opacidade das figuras do mar (tema Cartógrafo) conforme o zoom do mapa. Lógica pura; o desenho e a posição estão em components/map-fauna.ts.
// As figuras são "desenhadas no oceano": acompanham EXATAMENTE a escala do mapa (a figura ao lado do Brasil tem sempre a mesma proporção em relação ao Brasil).

/** Zoom do mapa-múndi: nele cada figura tem a largura `px` do catálogo. */
export const FAUNA_REFERENCE_ZOOM = 1.35;
/** Acima deste zoom as figuras (já maiores que a tela) somem devagar, e de vez em FAUNA_FADE_START + FAUNA_FADE_SPAN: lá o que importa são as ilhas pequenas. */
export const FAUNA_FADE_START = 5.5;
export const FAUNA_FADE_SPAN = 1;

/** Quanto a figura cresce em relação ao tamanho do mapa-múndi: o mesmo que o mapa (cada zoom inteiro dobra). */
export const faunaScale = (zoom: number) => 2 ** (zoom - FAUNA_REFERENCE_ZOOM);
/** 1 (visível) até FAUNA_FADE_START, descendo a 0 em FAUNA_FADE_SPAN de zoom. */
export const faunaOpacity = (zoom: number) => Math.max(0, Math.min(1, 1 - (zoom - FAUNA_FADE_START) / FAUNA_FADE_SPAN));
