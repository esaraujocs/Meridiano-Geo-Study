// Gera as prévias dos temas para a Loja e a Vitrine: uma miniatura WebP do Hub real em cada tema, em src/assets/themes/<id>.webp.
// Uso: com o app servido, rode `node scripts/build-theme-previews.mjs` (antes, `npm run test:themes` gera o .tmp-themes que este script lê).
// Variáveis: BASE (padrão http://127.0.0.1:5101, o servidor de desenvolvimento; NÃO aponte para o servidor ao vivo da 5000), CHROME_PATH (padrão: Chrome do Windows)
// e ONLY (ids separados por vírgula, para gerar só alguns). Rode de novo sempre que o Hub ou o CSS dos temas mudar.
// A captura é do Hub novo (03/10/2026): cabeçalho, carrossel de modos, Duelo, Vitrine, progresso e Mecenato, num quadro de 640×323 (o que a Loja espera).
// O perfil de amostra já tem todos os temas, então a Vitrine aparece com os suprimentos em todas as prévias (não mostra a prévia de outro tema dentro desta).
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { THEMES } from "../.tmp-themes/themes.js";

const BASE = process.env.BASE ?? "http://127.0.0.1:5101";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = new URL("../src/assets/themes/", import.meta.url);
const WIDTH = 640;
const FRAME = 323 / 640; // altura sobre largura do quadro da Loja
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

async function freshWith(themeId) {
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.evaluate(async () => { localStorage.clear(); await new Promise((resolve) => { const request = indexedDB.deleteDatabase("carta-cega"); request.onsuccess = resolve; request.onerror = resolve; request.onblocked = resolve; }); });
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForSelector(".hub-bar");
  // o tema só vale se for do jogador: desbloqueia todos (a Vitrine então mostra os suprimentos) e aplica este
  await page.evaluate(async (id, all) => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open("carta-cega"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(["unlocks"], "readwrite");
    for (const themeId of all) tx.objectStore("unlocks").put({ id: `theme:${themeId}`, key: `theme:${themeId}`, source: "preview", unlockedAt: Date.now() });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
    localStorage.setItem("carta-theme", id);
  }, themeId, THEMES.map((item) => item.id));
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForSelector(".hx-grid");
  await sleep(1200);
  // amostra: modos abertos e barras de progresso com valores de quem já joga (só para a miniatura)
  await page.evaluate(() => {
    document.querySelectorAll(".family").forEach((card) => {
      card.classList.remove("locked");
    });
    [["252/255", 99], ["24/30", 80], ["40%", 40]].forEach(([text, pct], index) => {
      const button = document.querySelectorAll(".hub-progress-grid button")[index];
      const value = button?.querySelector("strong"); if (value) value.textContent = text;
      const bar = button?.querySelector(".hub-progress-bar i"); if (bar) bar.style.width = `${pct}%`;
      const arc = button?.querySelector(".hx-ring-arc"); if (arc) arc.setAttribute("stroke-dasharray", `${2 * Math.PI * 32 * pct / 100} ${2 * Math.PI * 32}`);
    });
  });
  await sleep(250);
}

// ONLY=prata,atlas gera só esses (o resto fica como está)
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
for (const theme of THEMES.filter((item) => !only || only.includes(item.id))) {
  await freshWith(theme.id);
  const box = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const content = rect(".hub-content"), bar = rect(".hub-bar");
    // o fim do Hub: a peça mais baixa que está à vista (com o progresso no cabeçalho, a linha do progresso fica escondida)
    const bottom = Math.max(...[".hx-progress", ".hx-arena", ".hx-mecenato"].map((selector) => document.querySelector(selector)).filter((el) => el && el.offsetParent).map((el) => el.getBoundingClientRect().bottom));
    return { x: content.left, width: content.width, top: bar.top, bottom };
  });
  // o quadro tem proporção fixa: se o conteúdo for mais alto que ele, a janela de captura alarga (sobra só o fundo do tema dos lados)
  const width = Math.min(1920, Math.max(box.width + 72, (box.bottom - box.top + 32) / FRAME));
  const clip = { x: Math.max(0, box.x + box.width / 2 - width / 2), y: Math.max(0, box.top - 16), width, height: Math.round(width * FRAME) };
  // captureBeyondViewport:false — o padrão redimensiona a janela na captura e o carrossel (scroll-snap) mudava de cartão. Sem ele o Puppeteer ignora a escala,
  // então a captura sai inteira e é reduzida aqui no Chrome (meio a meio, com suavização) até a largura da Loja.
  const shot = await page.screenshot({ type: "png", captureBeyondViewport: false, clip });
  const height = Math.round((clip.height * WIDTH) / clip.width);
  const webp = await page.evaluate(async (base64, targetWidth, targetHeight) => {
    let current = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const resize = (width, h) => { const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = h; const context = canvas.getContext("2d"); context.imageSmoothingQuality = "high"; context.drawImage(current, 0, 0, width, h); current = canvas; };
    while (current.width / 2 > targetWidth) resize(Math.round(current.width / 2), Math.round(current.height / 2));
    resize(targetWidth, targetHeight);
    return current.toDataURL("image/webp", 0.82).split(",")[1];
  }, shot.toString("base64"), WIDTH, height);
  writeFileSync(fileURLToPath(new URL(`${theme.id}.webp`, OUT)), Buffer.from(webp, "base64"));
  console.log(`${theme.id.padEnd(17)} conteúdo ${Math.round(box.bottom - box.top + 32)} de ${clip.height} px de quadro → ${WIDTH}×${Math.round(clip.height * WIDTH / clip.width)}`);
}
await browser.close();
