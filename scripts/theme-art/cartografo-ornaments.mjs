// Ornamentos do tema Cartógrafo: rosa dos ventos, cantos de folha e o ruído do papel. SVG em texto.
import { INK } from "./svg-kit.mjs";

/** Rosa dos ventos em traço de tinta (stroke) com opacidade (mais leve para fundo, mais forte para o selo do alvo). */
export const compassSvg = (stroke = INK, opacity = ".9") => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='-100 -100 200 200'><g fill='none' stroke='${stroke}' stroke-opacity='${opacity}' stroke-width='.7' stroke-linejoin='round'><circle r='97'/><circle r='92'/><circle r='94.5' stroke-dasharray='.55 5.1' stroke-width='3'/><circle r='64'/><circle r='60' stroke-dasharray='1 3'/><circle r='30'/><path d='M0-92L9-9L92 0L9 9L0 92L-9 9L-92 0L-9-9Z'/><path d='M0-92L0 0L-9-9Z M92 0L0 0L9-9Z M0 92L0 0L9 9Z M-92 0L0 0L-9 9Z' fill='${stroke}' fill-opacity='.22' stroke='none'/><path d='M0-64L6-6L64 0L6 6L0 64L-6 6L-64 0L-6-6Z' transform='rotate(45)'/><path d='M0-100L5-90L-5-90Z' fill='${stroke}' fill-opacity='.8'/></g></svg>`;

/** Canto ornamentado (filete duplo com um cacho), nas quatro orientações: matriz de espelhamento em `m`. */
const cornerBase = (ink) => `<path d='M3 45V13Q3 3 13 3H45' fill='none' stroke='${ink}' stroke-width='1.4'/><path d='M8 45V16Q8 8 16 8H45' fill='none' stroke='${ink}' stroke-width='.6' stroke-opacity='.75'/><path d='M15 15c0 8 9 8 9 2.5c0-4.5-6.5-4-6 .5' fill='none' stroke='${ink}' stroke-width='1.1' stroke-linecap='round'/><circle cx='3' cy='3' r='2.2' fill='${ink}'/>`;
export const CORNERS = { tl: "matrix(1 0 0 1 0 0)", tr: "matrix(-1 0 0 1 48 0)", bl: "matrix(1 0 0 -1 0 48)", br: "matrix(-1 0 0 -1 48 48)" };
export const cornerSvg = (m, ink = INK) => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><g transform='${m}' opacity='.85'>${cornerBase(ink)}</g></svg>`;

/** Papel: ruído quente e manchas (ladrilho de 300 px). */
export const paperSvg = () => `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='3' seed='4'/><feColorMatrix values='0 0 0 0 .32  0 0 0 0 .22  0 0 0 0 .1  0 0 0 .55 0'/></filter><rect width='300' height='300' filter='url(#n)' opacity='.5'/></svg>`;
