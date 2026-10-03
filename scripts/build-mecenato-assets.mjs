// Gera as imagens do Mecenato a partir do jogo de verdade (app em dev): a carta das rotas (estilo Carta de 1507, mundo inteiro, sem marcadores) com as
// posições das rotas em pixels, e uma prévia de cada estilo de mapa numa partida. Saída: public/museum/carta-rotas.webp, public/museum/estilo-*.webp e
// src/domain/mecenato-chart.json. Uso: node scripts/build-mecenato-assets.mjs [base, padrão http://127.0.0.1:5101/]
import { writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
const BASE = (process.argv[2] ?? "http://127.0.0.1:5101/").replace(/\/?$/, "/") + "?debug=1";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PIECES = ["waldseemuller-1507", "ortelius-1570", "mercator-1569", "fra-mauro-1450"];
// rotas: do Porto de Lisboa até o destino de cada uma (longitude, latitude)
const ROUTES = {
  velho: [[-9.1, 38.7], [-14, 44], [-6, 51], [2.3, 48.9], [12.5, 41.9]],
  indias: [[-9.1, 38.7], [-18, 20], [-12, -10], [18.4, -34.4], [40, -20], [55, 10], [72.8, 19]],
  cima: [[-9.1, 38.7], [-50, 25], [-80.6, 28.5]],
  monstros: [[-9.1, 38.7], [-20, 55], [-10, 64], [10, 70]],
  bandeiras: [[-9.1, 38.7], [-30, 30], [-60, 38], [-74, 40.7]],
  brasil: [[-9.1, 38.7], [-25, 15], [-34.9, -8], [-38.5, -13], [-43.2, -22.9]],
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
async function open(width, height, style) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(BASE, { waitUntil: "load" });
  await page.evaluate(async ({ pieces, style }) => {
    localStorage.clear();
    localStorage.setItem("carta-pace", "timed");
    localStorage.setItem("carta-mecenato", JSON.stringify({ "map-style": style }));
    await new Promise((resolve) => { const request = indexedDB.deleteDatabase("carta-cega"); request.onsuccess = request.onerror = request.onblocked = resolve; });
    const { DATABASE_NAME, DATABASE_VERSION, upgradeStorage } = await import("/src/domain/storage-schema.ts");
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION); request.onupgradeneeded = () => upgradeStorage(request.result); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction("unlocks", "readwrite");
    for (const piece of pieces) tx.objectStore("unlocks").put({ id: `museum:${piece}`, key: `museum:${piece}`, source: "asset-build", unlockedAt: 1 });
    await new Promise((resolve) => { tx.oncomplete = resolve; });
    db.close();
  }, { pieces: PIECES, style });
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(".hx-grid");
  await sleep(1500);
  const hit = await page.evaluateHandle(() => [...document.querySelectorAll(".hx-slide:not([inert])")].find((slide) => slide.querySelector("[data-fam=mapa]")).querySelector(".hx-hit"));
  await hit.asElement().click();
  await sleep(1200);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.trim().startsWith("Clicar no mapa"))?.click());
  await sleep(300);
  const start = await page.evaluateHandle(() => [...document.querySelectorAll("button")].find((button) => /Começar/.test(button.textContent)));
  await start.asElement().click();
  await sleep(8000);
  return page;
}

// carta das rotas
{
  const W = 1208, H = 560;
  const page = await open(W, H + 68, "estilo-1507");
  await page.evaluate(() => {
    const map = window.__cartaMap;
    map.jumpTo({ zoom: 1.3, center: [40, 24] });
    for (const selector of [".map-target-overlay", ".map-keyboard-hint", ".map-hud", ".maplibregl-control-container", ".gs-hotbar", ".map-cartouche"]) document.querySelectorAll(selector).forEach((element) => { element.style.display = "none"; });
    for (const layer of map.getStyle().layers) if (layer.id === "pts" || layer.id.startsWith("small-entities")) map.setLayoutProperty(layer.id, "visibility", "none");
  });
  await sleep(2500);
  const positions = await page.evaluate((routes) => {
    const map = window.__cartaMap;
    const box = map.getContainer().getBoundingClientRect();
    return { size: [Math.round(box.width), Math.round(box.height)], routes: Object.fromEntries(Object.entries(routes).map(([id, points]) => [id, points.map((point) => { const at = map.project(point); return [Math.round(at.x), Math.round(at.y)]; })])) };
  }, ROUTES);
  const element = await page.$(".map");
  await element.screenshot({ path: "public/museum/carta-rotas.webp", type: "webp", quality: 82 });
  writeFileSync("src/domain/mecenato-chart.json", `${JSON.stringify(positions)}\n`);
  console.log("carta-rotas.webp", JSON.stringify(positions.size));
  await page.close();
}
// prévias dos estilos (uma partida de verdade)
for (const style of ["estilo-1507", "estilo-navegante", "estilo-iluminura", ""]) {
  const page = await open(1280, 680, style);
  await page.evaluate(() => { window.__cartaMap.jumpTo({ zoom: 1.75, center: [-8, 14] }); document.querySelectorAll(".map-keyboard-hint, .gs-hotbar").forEach((element) => { element.style.display = "none"; }); });
  await sleep(2500);
  await page.screenshot({ path: `public/museum/${style || "estilo-tema"}.webp`, type: "webp", quality: 80, clip: { x: 0, y: 68, width: 1280, height: 612 } });
  console.log(`${style || "estilo-tema"}.webp`);
  await page.close();
}
await browser.close();
