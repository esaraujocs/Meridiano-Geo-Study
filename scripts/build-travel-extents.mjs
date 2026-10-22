// Caixas de verdade de cada território para a câmera do Travel (22/10/2026): o centro e a área do catálogo encolhiam os países compridos
// (o Chile saía cortado). Lê public/data/silhouettes.json (as silhuetas do mapa HD, já sem o ultramar distante) e grava
// src/domain/travel-extents.ts. Rodar de novo quando as silhuetas mudarem: node scripts/build-travel-extents.mjs
import { readFile, writeFile } from "node:fs/promises";

const shapes = JSON.parse(await readFile("public/data/silhouettes.json", "utf8"));
const lines = [];
for (const [id, geometry] of Object.entries(shapes)) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (value) => {
    if (typeof value[0] === "number") { w = Math.min(w, value[0]); e = Math.max(e, value[0]); s = Math.min(s, value[1]); n = Math.max(n, value[1]); return; }
    for (const item of value) walk(item);
  };
  walk(geometry.coordinates);
  if (!Number.isFinite(w)) continue;
  const r = (v) => Math.round(v * 10) / 10;
  lines.push(`  "${id}": [${r(w)}, ${r(s)}, ${r(e)}, ${r(n)}],`);
}
await writeFile("src/domain/travel-extents.ts", `// Gerado por scripts/build-travel-extents.mjs a partir de public/data/silhouettes.json: [oeste, sul, leste, norte] de cada território
// (a longitude passa de 180 em quem cruza o antimeridiano, como a Rússia). Não editar à mão.
export const TRAVEL_EXTENTS: Readonly<Record<string, readonly [number, number, number, number]>> = {
${lines.join("\n")}
};
`);
console.log(`travel-extents: ${lines.length} territórios`);
