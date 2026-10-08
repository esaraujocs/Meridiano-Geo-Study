// Ferramentas comuns das bandeiras baixadas do Wikimedia Commons (scripts/divisions/flags.mjs e scripts/merge-historical.mjs): limpar o SVG e,
// para as pesadas, desenhar uma imagem de 512 px, no formato do acervo do mapa-múndi ("svg:<svg…>" ou "data:image/…").
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
/** Acima disto o SVG vira imagem: o maior SVG leve tem ~18 kB; os brasões passam de 70 kB. */
export const HEAVY_BYTES = 20_000;
export const RASTER_WIDTH = 512;

/** Tira o que não desenha (prólogo, comentários, metadados RDF do Inkscape) e garante largura e altura na raiz: sem elas a bandeira
 *  vira um retângulo de 300×150 no <img>. Devolve o SVG e a proporção altura/largura. */
export function cleanSvg(text) {
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
  // só número puro ou em px: com outra unidade (a da Companhia Britânica da África do Sul vem com width="297mm" e a altura sem unidade) a
  // proporção sai errada, então vale o viewBox
  const number = (value) => (value && /^\s*[\d.e+-]+(px)?\s*$/i.test(value) ? Number.parseFloat(value) : NaN);
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

/** Um Chrome sem janela para desenhar as bandeiras pesadas; o navegador só abre na primeira que precisar. */
export function rasterizer() {
  let browser = null;
  let page = null;
  /** Desenha o SVG num canvas de 512 px e fica com o menor entre WebP e PNG. */
  const raster = async (svg, ratio) => {
    if (!page) {
      browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
      page = await browser.newPage();
      await page.setContent("<!doctype html><title>bandeiras</title>");
    }
    return page.evaluate(async (source, width, height) => {
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
  };
  /** A bandeira no formato do acervo: o SVG limpo para as leves, a imagem para as pesadas; e a proporção altura/largura. */
  const flagValue = async (text) => {
    const { svg, ratio } = cleanSvg(text);
    const heavy = Buffer.byteLength(svg) > HEAVY_BYTES;
    return { value: heavy ? await raster(svg, ratio) : `svg:${svg}`, ratio, heavy };
  };
  return { raster, flagValue, close: async () => { if (browser) await browser.close(); } };
}
