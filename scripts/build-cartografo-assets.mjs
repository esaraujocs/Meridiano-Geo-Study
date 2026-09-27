// Gera os SVG do tema Cartógrafo em src/assets/themes/ (rosa dos ventos, cantos, papel e as figuras do mar). Rode de novo ao mexer em scripts/theme-art/.
// Uso: node scripts/build-cartografo-assets.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { INK } from "./theme-art/svg-kit.mjs";
import { compassSvg, cornerSvg, CORNERS, paperSvg } from "./theme-art/cartografo-ornaments.mjs";
import { FIGURES } from "./theme-art/cartografo-fauna.mjs";

const OUT = new URL("../src/assets/themes/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const write = (name, svg) => { writeFileSync(fileURLToPath(new URL(name, OUT)), svg); return svg.length; };

let bytes = 0, files = 0;
const put = (name, svg) => { bytes += write(name, svg); files += 1; };
put("cartografo-compass.svg", compassSvg(INK, ".2"));
put("cartografo-compass-dark.svg", compassSvg(INK, ".9"));
put("cartografo-paper.svg", paperSvg());
for (const [key, matrix] of Object.entries(CORNERS)) put(`cartografo-corner-${key}.svg`, cornerSvg(matrix));
for (const [id, figure] of Object.entries(FIGURES)) put(`cartografo-fauna-${id}.svg`, figure.svg(INK));
console.log(`cartografo: ${files} arquivos, ${(bytes / 1024).toFixed(1)} KB em src/assets/themes/`);
