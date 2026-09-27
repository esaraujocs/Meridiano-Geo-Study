// Tamanho e opacidade das figuras do mar (tema Cartógrafo) conforme o zoom do mapa. Lógica pura; o desenho e a posição estão em components/map-fauna.ts.

/** Zoom do mapa-múndi: nele cada figura tem a largura `px` do catálogo. */
export const FAUNA_REFERENCE_ZOOM = 1.35;
/** Fração do crescimento do mapa que a figura acompanha (0,35: a cada zoom inteiro a figura cresce ×1,27 e o mapa ×2), para continuarem pequenas. */
export const FAUNA_GROWTH = 0.35;
/** A partir deste zoom as figuras começam a sumir (em FAUNA_FADE_START + FAUNA_FADE_SPAN somem de vez): lá o que importa são as ilhas pequenas. */
export const FAUNA_FADE_START = 5;
export const FAUNA_FADE_SPAN = 1.2;

/** Quanto a figura cresce em relação ao tamanho do mapa-múndi. */
export const faunaScale = (zoom: number) => 2 ** (FAUNA_GROWTH * (zoom - FAUNA_REFERENCE_ZOOM));
/** 1 (visível) até FAUNA_FADE_START, descendo a 0 em FAUNA_FADE_SPAN de zoom. */
export const faunaOpacity = (zoom: number) => Math.max(0, Math.min(1, 1 - (zoom - FAUNA_FADE_START) / FAUNA_FADE_SPAN));
