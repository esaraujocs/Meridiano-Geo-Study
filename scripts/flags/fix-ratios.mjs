// Bandeiras do mapa-múndi na proporção oficial (20/10/2026, pedido do Enzo: "Mônaco e Indonésia impossíveis de distinguir", depois "pode seguir
// nos ajustes pendentes"). O flags.json herdado do jogo antigo tem ~140 bandeiras esticadas (quase todas para 4:3). Este script compara cada uma
// com o arquivo atual da bandeira no Wikimedia Commons (o P41 do país no Wikidata, levantado em build/flag-ratios/compare.json) e, onde a
// proporção difere mais de 3%, grava em public/data/flag-overrides/<código>.svg (ou .png, as pesadas, desenhadas a 512 px) a do Commons, só
// domínio público ou CC0. O jogo põe as substituições por cima do flags.json (quiz.ts, special-data.ts). Rode depois:
// node scripts/validate-flag-overrides.mjs (refaz o manifest.json). Os downloads ficam em build/flag-ratios/svg/ (fora do git).
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { rasterizer } from "../flag-tools.mjs";

const SKIP = new Set([
  "gp", "mq", "re", "bv", "um", "hm", // absorvidos: nunca são alvo e o Wikidata dá a bandeira do soberano (ou outra)
  "sh-hl", // o Wikidata dá a do Reino Unido para Santa Helena
  "io", // o Wikidata dá a do Comissário, não a do território
  "om", // Omã: arquivo do Commons em licença própria (OGL-om) e proporção discutível
  "af", // o Afeganistão usa a bandeira do Talibã por decisão do Enzo
]);
const LICENSES = /^(public domain|cc0)/i;
const OUT = new URL("../../public/data/flag-overrides/", import.meta.url);
const CACHE = new URL("../../build/flag-ratios/svg/", import.meta.url);
await mkdir(CACHE, { recursive: true });
const rows = JSON.parse(await readFile(new URL("../../build/flag-ratios/compare.json", import.meta.url), "utf8"));
const exists = (url) => access(url).then(() => true, () => false);
const { flagValue, close } = rasterizer();
const sources = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const row of rows.filter((item) => item.diff > 0.03 && !SKIP.has(item.fl)).sort((a, b) => a.fl.localeCompare(b.fl))) {
  if (!LICENSES.test(row.lic)) { console.log(`${row.fl}: licença ${row.lic}, pulada`); continue; }
  const cache = new URL(`${row.fl}.svg`, CACHE);
  let text;
  if (await exists(cache)) text = await readFile(cache, "utf8");
  else {
    for (let attempt = 0; attempt < 4 && !text; attempt += 1) {
      const response = await fetch(row.url, { headers: { "User-Agent": "MeridianoGeoStudy/1.0 (pratesbaliza@gmail.com)" } });
      if (response.ok) text = await response.text();
      else { console.log(`${row.fl}: HTTP ${response.status}, tentando de novo`); await sleep(5000 * (attempt + 1)); }
    }
    if (!text) { console.log(`${row.fl}: não baixou`); continue; }
    await writeFile(cache, text);
    await sleep(600);
  }
  const { value, ratio, heavy } = await flagValue(text);
  if (heavy) await writeFile(new URL(`${row.fl}.${value.startsWith("data:image/webp") ? "webp" : "png"}`, OUT), Buffer.from(value.split(",", 2)[1], "base64"));
  else await writeFile(new URL(`${row.fl}.svg`, OUT), value.slice(4));
  sources[row.fl] = { name: row.name, file: row.file, license: row.lic, ratio: Math.round((1 / ratio) * 1000) / 1000, heavy };
  console.log(`${row.fl} ${row.name}: ${row.cur} → ${Math.round((1 / ratio) * 1000) / 1000}${heavy ? " (imagem)" : ""}`);
}
// Iêmen: o arquivo do Commons é CC BY-SA; a bandeira é só três faixas (vermelho, branco, preto, 2:3), então vai desenhada aqui
await writeFile(new URL("ye.svg", OUT), '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 3 2"><rect width="3" height="2" fill="#000"/><rect width="3" height="1.333" fill="#fff"/><rect width="3" height="0.667" fill="#ce1126"/></svg>');
sources.ye = { name: "Iêmen", file: "(desenhada: três faixas, 2:3)", license: "—", ratio: 1.5, heavy: false };
await close();
await writeFile(new URL("../../scripts/flags/ratio-sources.json", import.meta.url), `${JSON.stringify(sources, null, 1)}\n`);
console.log(`${Object.keys(sources).length} bandeiras gravadas`);
