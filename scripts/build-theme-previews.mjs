// Gera as prévias dos temas para a Loja: uma miniatura WebP do Hub real em cada tema, em src/assets/themes/<id>.webp.
// Uso: com o app servido (npm run build && npm run preview), rode `node scripts/build-theme-previews.mjs`.
// Variáveis: BASE (padrão http://localhost:5000), CHROME_PATH (padrão: Chrome do Windows) e ONLY (ids separados por vírgula, para gerar só alguns). Rode de novo sempre que o CSS dos temas mudar.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { THEMES } from "../.tmp-themes/themes.js";

const BASE = process.env.BASE ?? "http://localhost:5000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = new URL("../src/assets/themes/", import.meta.url);
const WIDTH = 640;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 945, deviceScaleFactor: 1 });

async function freshWith(themeId) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate(async () => { localStorage.clear(); await new Promise((resolve) => { const request = indexedDB.deleteDatabase("carta-cega"); request.onsuccess = resolve; request.onerror = resolve; request.onblocked = resolve; }); });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".hub-bar");
  // o tema só vale se for do jogador: desbloqueia este para a prévia
  await page.evaluate(async (id) => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open("carta-cega"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(["unlocks"], "readwrite");
    tx.objectStore("unlocks").put({ id: `theme:${id}`, key: `theme:${id}`, source: "preview", unlockedAt: Date.now() });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
    localStorage.setItem("carta-theme", id);
  }, themeId);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".hub-bar");
  await sleep(900);
  // amostra: modos abertos e barras de progresso com valores de quem já joga (só para a miniatura)
  await page.evaluate(() => {
    document.querySelectorAll(".family").forEach((card) => {
      card.classList.remove("locked");
      const state = card.querySelector(".family-footer > span:first-child"); if (state) state.textContent = "aberta";
    });
    [["252/255", 99], ["24/30", 80], ["40%", 40]].forEach(([text, pct], index) => {
      const button = document.querySelectorAll(".hub-progress-grid button")[index];
      const value = button?.querySelector("strong"); if (value) value.textContent = text;
      const bar = button?.querySelector(".hub-progress-bar i"); if (bar) bar.style.width = `${pct}%`;
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
    const content = rect(".hub-content"), label = rect(".hub-content > .section-label"), grid = rect(".hub-progress-grid");
    return { x: content.left, width: content.width, top: label.top, bottom: grid.bottom };
  });
  const clip = { x: Math.max(0, box.x - 36), y: Math.max(0, box.top - 16), width: box.width + 72, height: box.bottom - box.top + 32 };
  await page.screenshot({ path: fileURLToPath(new URL(`${theme.id}.webp`, OUT)), type: "webp", quality: 80, clip: { ...clip, scale: WIDTH / clip.width } });
  console.log(`${theme.id.padEnd(17)} ${Math.round(clip.width)}×${Math.round(clip.height)} → ${WIDTH}×${Math.round(clip.height * WIDTH / clip.width)}`);
}
await browser.close();
