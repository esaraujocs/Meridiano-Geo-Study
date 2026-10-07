// Bandeiras das unidades de um país do modo "Estados e províncias": build/divisions/<país>/flags/<CÓDIGO>.svg (baixadas do Wikimedia Commons
// por fetch-flags.py, todas em domínio público, licença conferida no download) → public/data/divisions/<país>/flags.json, no mesmo formato do
// acervo do mapa-múndi (public/data/legacy/flags.json): "svg:<svg…>" para as leves e uma imagem de 512 px para as pesadas (brasões com milhares
// de curvas: Rio de Janeiro, Alagoas, Rio Grande do Sul…), como o clássico fazia com as bandeiras pesadas dos países.
// Uso: node scripts/divisions/flags.mjs <país>  (precisa do Chrome; CHROME_PATH troca o caminho)
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = join(import.meta.dirname, "..", "..");
const COUNTRY = (process.argv[2] ?? "").toLowerCase();
if (!COUNTRY) throw new Error("uso: node scripts/divisions/flags.mjs <país>");
const SOURCE = join(ROOT, "build", "divisions", COUNTRY, "flags");
const TARGET = join(ROOT, "public", "data", "divisions", COUNTRY, "flags.json");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
/** Acima disto o SVG vira imagem: o maior SVG leve tem ~18 kB; os brasões passam de 70 kB. */
const HEAVY_BYTES = 20_000;
const RASTER_WIDTH = 512;

const states = JSON.parse(await readFile(join(import.meta.dirname, "countries", `${COUNTRY}.json`), "utf8")).units.filter((unit) => unit.flagFile);
const licenses = JSON.parse(await readFile(join(SOURCE, "licenses.json"), "utf8"));

/** Tira o que não desenha (prólogo, comentários, metadados RDF do Inkscape) e garante largura e altura na raiz: sem elas a bandeira
 *  vira um retângulo de 300×150 no <img>. Devolve o SVG e a proporção altura/largura. */
function cleanSvg(text) {
  let svg = text
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, "")
    .replace(/<sodipodi:namedview[\s\S]*?(\/>|<\/sodipodi:namedview>)/gi, "")
    .replace(/>\s+</g, "><")
    .trim();
  const root = /<svg\b[^>]*>/.exec(svg)?.[0];
  if (!root) throw new Error("sem <svg>");
  const attr = (name) => new RegExp(`\\s${name}="([^"]*)"`).exec(root)?.[1];
  const box = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);
  const number = (value) => (value && !value.endsWith("%") ? Number.parseFloat(value) : NaN);
  let width = number(attr("width"));
  let height = number(attr("height"));
  if (!(width > 0 && height > 0)) {
    if (!box || box.length !== 4) throw new Error("sem tamanho nem viewBox");
    width = 1000;
    height = Math.round((1000 * box[3]) / box[2]);
    const fixed = root.replace(/\s(width|height)="[^"]*"/g, "").replace(/^<svg/, `<svg width="${width}" height="${height}"`);
    svg = svg.replace(root, fixed);
  }
  return { svg, ratio: height / width };
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setContent("<!doctype html><title>bandeiras</title>");
/** Desenha o SVG num canvas de 512 px e fica com o menor entre WebP e PNG. */
const raster = (svg, ratio) => page.evaluate(async (source, width, height) => {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(image, 0, 0, width, height);
  const webp = canvas.toDataURL("image/webp", 0.92);
  const png = canvas.toDataURL("image/png");
  return webp.startsWith("data:image/webp") && webp.length < png.length ? webp : png;
}, svg, RASTER_WIDTH, Math.round(RASTER_WIDTH * ratio));

const flags = {};
const ratios = {};
const sources = {};
for (const state of states) {
  const sigla = state.code;
  const id = `${COUNTRY}-${sigla.toLowerCase()}`;
  const raw = await readFile(join(SOURCE, `${sigla}.svg`), "utf8");
  const { svg, ratio } = cleanSvg(raw);
  const heavy = Buffer.byteLength(svg) > HEAVY_BYTES;
  flags[id] = heavy ? await raster(svg, ratio) : `svg:${svg}`;
  ratios[id] = Math.round(ratio * 1000) / 1000;
  const license = licenses[sigla];
  if (!license || !/public domain/i.test(license.license)) throw new Error(`${sigla}: licença não conferida em licenses.json`);
  sources[id] = { file: license.file, url: license.url, license: license.license };
  console.log(`${sigla}: ${heavy ? "imagem" : "svg"} · ${Math.round(flags[id].length / 1000)} kB · proporção ${ratios[id]}`);
}
await browser.close();

const document = {
  source: "Wikimedia Commons (bandeiras oficiais, domínio público); scripts/divisions/flags.mjs",
  flags, ratio: ratios, sources,
};
await writeFile(TARGET, JSON.stringify(document));
const total = Object.values(flags).reduce((sum, value) => sum + value.length, 0);
console.log(`ok: ${Object.keys(flags).length} bandeiras · ${Math.round(total / 1000)} kB → ${TARGET}`);
