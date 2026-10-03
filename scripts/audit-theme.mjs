// Varredura de acessibilidade de um tema NO APP DE VERDADE (sem CSS injetado): semeia dados de jogo, libera e aplica o tema e passa o axe em cada tela,
// agrupando as violações por alvo, com as cores e a lista do que continua claro (útil em tema escuro). Serve para todo tema novo.
// Uso: node scripts/audit-theme.mjs <id do tema> [cenas separadas por vírgula] [base, padrão http://127.0.0.1:5101/, o app em dev ou o build servido]
//   MOBILE=1 audita no celular; EXPLAIN=".seletor|.outro" mostra quais regras de CSS definem a cor dos elementos (achar quem ganha da regra do tema).
// Cenas: hub, duelo, revelacao, liga, config, quiz, resultado, progresso, colecao, conquistas, opcoes, loja. Capturas em .tmp-audit/.
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const click = (page, selector, text) => page.evaluate((s, t) => { const el = [...document.querySelectorAll(s)].find((e) => !t || e.textContent.includes(t)); if (!el) return false; el.click(); return true; }, selector, text);
async function launch(width, height, mobile = false) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage();
  await page.setViewport(mobile ? { width, height, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width, height, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { browser, page, errors };
}
const THEME = process.argv[2];
if (!THEME) { console.log("Uso: node scripts/audit-theme.mjs <id do tema> [cenas] [base]"); process.exit(1); }
const only = process.argv[3] ? process.argv[3].split(",") : null;
const BASE = process.argv[4] || "http://127.0.0.1:5101/";
const OUT = fileURLToPath(new URL("../.tmp-audit", import.meta.url));
mkdirSync(OUT, { recursive: true });
const axe = readFileSync(`${ROOT}node_modules/axe-core/axe.min.js`, "utf8");
const { browser, page, errors } = await (process.env.MOBILE ? launch(390, 844, true) : launch(1440, 900));
const IDS = ["4", "8", "10", "12", "16", "20", "24", "28", "31", "32", "36", "40"];

// ── dados de jogo: moedas, troféus, corte de 20 rodadas, partidas e o tema liberado e aplicado ──
await page.goto(BASE + "?debug=1", { waitUntil: "load" });
await page.evaluate(async () => { localStorage.clear(); for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); await new Promise((res) => { const q = indexedDB.deleteDatabase("carta-cega"); q.onsuccess = q.onerror = q.onblocked = res; }); });
await page.goto(BASE + "?debug=1", { waitUntil: "load" });
await sleep(2500);
await page.evaluate(async (theme, ids) => {
  const db = await new Promise((res, rej) => { const q = indexedDB.open("carta-cega"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const now = Date.now(); const duels = []; const sessions = [];
  for (const ladder of ["mapas", "bandeiras"]) for (let i = 0; i < 13; i += 1) duels.push({ id: `duel:${ladder}${i}`, sessionId: `${ladder}${i}`, at: now - (60 - i) * 3600000, botId: "bot-bronze-1", ladder, family: ladder === "mapas" ? "mapa" : "bandeiras", variant: "x", playerCorrect: 15, total: 20, botCorrect: 10, outcome: i % 5 === 4 ? "loss" : "win", tiebreak: false, delta: i % 5 === 4 ? -20 : 50, mmrDelta: 45, mmrVersion: 4, mmrSigma: 200, mmrExp: 0.6, source: "duel-v1", legs: [{ group: "mapa", playerCorrect: 8, botCorrect: 5, total: 10 }, { group: "capitais-clique", playerCorrect: 7, botCorrect: 5, total: 10 }] });
  const variants = [["mapa", "mapa"], ["bandeiras", "nome-bandeira"], ["capitais", "capital-pais"], ["silhueta", "silhueta-opcoes"], ["bandeiras", "bandeira-nome"], ["mapa", "mapa"]];
  variants.forEach(([family, variant], s) => { const start = now - (s + 1) * 7200000; sessions.push({ id: `s${s}`, family, variant, mode: variant, region: "mundo", regions: ["mundo"], startedAt: start, endedAt: start + 240000, complete: true, roundLimit: 10, pace: "timed", rounds: ids.slice(0, 10).map((id, i) => ({ targetId: id, correct: (i + s) % 4 !== 0, responseTimeMs: 2500 + i * 150 })) }); });
  await new Promise((res) => {
    const tx = db.transaction(["ledger", "preferences", "unlocks", "sessions"], "readwrite");
    tx.objectStore("ledger").put({ id: "grant:t", kind: "credit", amount: 300000, reason: "debug", source: "t", createdAt: now });
    for (const d of duels) tx.objectStore("preferences").put(d);
    for (const key of ["rounds:20", `theme:${theme}`]) tx.objectStore("unlocks").put({ id: key, key, source: "audit", unlockedAt: now });
    for (const s of sessions) tx.objectStore("sessions").put(s);
    tx.oncomplete = res;
  });
  db.close();
  localStorage.setItem("carta-theme", theme);
}, THEME, IDS);
await page.reload({ waitUntil: "load" });
await sleep(3500);
await page.addStyleTag({ content: ".ach-toaster{display:none!important}" });
console.log("tema aplicado:", await page.evaluate(() => document.documentElement.dataset.theme));

const audit = async (label, wait = 0) => {
  if (wait) await sleep(wait);
  await page.evaluate(axe);
  const rows = await page.evaluate(async () => {
    const r = await window.axe.run(document.body);
    const out = [];
    for (const v of r.violations) for (const n of v.nodes) out.push({ id: v.id, target: n.target.join(" ").replace(/:nth-child\(\d+\)/g, "").replace(/\[aria-labelledby="[^"]*"\]/g, "").slice(-80), html: n.html.slice(0, 80), data: n.any[0]?.data ? { ratio: n.any[0].data.contrastRatio, fg: n.any[0].data.fgColor, bg: n.any[0].data.bgColor } : null });
    return out;
  });
  const groups = new Map();
  for (const row of rows) { const key = `${row.id} ${row.target}`; const g = groups.get(key) || { ...row, n: 0 }; g.n += 1; groups.set(key, g); }
  console.log(`\n== ${label}: ${rows.length} violações em ${groups.size} alvos`);
  for (const [key, g] of groups) console.log("  ", `x${g.n}`, key, g.data ? `| ${g.data.ratio} fg ${g.data.fg} bg ${g.data.bg}` : "", "|", g.html.replace(/\s+/g, " "));
  const light = await page.evaluate(() => { const out = []; for (const el of document.querySelectorAll("body *")) { const r = el.getBoundingClientRect(); if (r.width < 60 || r.height < 24) continue; const cs = getComputedStyle(el); const m = cs.backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/); if (!m) continue; if ((m[4] === undefined ? 1 : Number(m[4])) < 0.5) continue; if ((0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 > 0.55) out.push(`${el.tagName.toLowerCase()}${[...el.classList].map((c) => "." + c).join("")} ${Math.round(r.width)}x${Math.round(r.height)}`); } return out.slice(0, 12); });
  if (light.length) console.log("   claro:", JSON.stringify(light));
  await page.screenshot({ path: `${OUT}/real-${label.replace(/[^a-z0-9]+/gi, "-")}.png`, fullPage: false });
  if (process.env.EXPLAIN) {
    const out = await page.evaluate((sels) => sels.map((sel) => { const el = document.querySelector(sel); if (!el) return { sel, missing: true }; const rules = []; for (const sheet of document.styleSheets) { let list; try { list = sheet.cssRules; } catch { continue; } const walk = (rs) => { for (const r of rs) { if (r.cssRules && r.type !== 1) walk(r.cssRules); if (r.style && r.selectorText && r.style.color) { try { if (el.matches(r.selectorText)) rules.push(`${r.selectorText.slice(0, 100)} => ${r.style.color}${r.style.getPropertyPriority("color") ? " !important" : ""}`); } catch { /* seletor inválido */ } } } }; walk(list); } const cs = getComputedStyle(el); let op = 1, p = el; while (p) { op *= Number(getComputedStyle(p).opacity); p = p.parentElement; } return { sel, computed: cs.color, opacityChain: op, rules: rules.slice(-5) }; }), process.env.EXPLAIN.split("|"));
    console.log("   EXPLAIN", JSON.stringify(out));
  }
};
const navText = (text) => page.evaluate((t) => { const b = [...document.querySelectorAll("button, a")].find((e) => e.textContent.trim() === t); b?.click(); return Boolean(b); }, text);
const toHub = async () => { await page.evaluate(() => document.querySelector(".back, .cv-top .back")?.click()); await sleep(700); await navText("Modos"); await sleep(1000); };
const home = async () => { await page.goto(BASE + "?debug=1", { waitUntil: "load" }); await sleep(3200); await page.addStyleTag({ content: ".ach-toaster{display:none!important}" }); };
const scenes = {
  async hub() { await audit("hub solo"); },
  async duelo() { await page.evaluate(() => document.querySelector(".hx-duel")?.scrollIntoView()); await sleep(500); await audit("hub duelo"); },
  async revelacao() { await click(page, ".hx-go"); await sleep(1200); await audit("revelacao do duelo"); await click(page, ".rv-cancel, button", "Cancelar"); await sleep(600); },
  async liga() { await page.evaluate(() => document.querySelector(".hx-pill")?.click()); await sleep(1200); await audit("liga"); await home(); },
  async config() { await page.evaluate(() => { const card = [...document.querySelectorAll("article, section, div")].find((e) => /Localizar países e territórios/.test(e.textContent) && e.querySelector("button")); [...card.querySelectorAll("button")].find((x) => /Jogar/.test(x.textContent))?.click(); }); await sleep(1500); await audit("configurar partida"); },
  async quiz() { await page.goto(BASE + "?debug=1", { waitUntil: "load" }); await sleep(3500); await page.evaluate(() => { const card = [...document.querySelectorAll("article, section, div")].find((e) => /Reconhecimento visual e escrita/.test(e.textContent) && e.querySelector("button")); [...card.querySelectorAll("button")].find((x) => /Jogar/.test(x.textContent))?.click(); }); await sleep(1500); await click(page, "button", "Começar"); await sleep(3500); await audit("quiz de bandeiras"); await page.keyboard.press("Escape"); await sleep(600); await audit("aviso de saida"); await click(page, ".leave-quit"); await sleep(1500); },
  async resultado() { await page.evaluate(() => window.__cartaDuelResult?.("t3")); await audit("resultado vitoria", 13000); await page.evaluate(() => window.__cartaDuelResult?.("loss")); await audit("resultado derrota", 13000); await page.evaluate(() => window.__cartaDuelResult?.("tprata")); await audit("resultado liga com aviso", 13000); },
  async progresso() { await home(); await navText("Progresso"); await sleep(5500); await audit("progresso resumo"); await page.evaluate(() => [...document.querySelectorAll(".pg-chip")].find((b) => /Histórico/.test(b.textContent))?.click()); await sleep(800); await audit("progresso historico"); },
  async colecao() { await home(); await navText("Coleção"); await sleep(2500); await audit("colecao"); },
  async conquistas() { await home(); await navText("Achievements"); await sleep(5500); await audit("conquistas"); },
  async opcoes() { await home(); await navText("Opções"); await sleep(1500); await audit("opcoes"); },
  async loja() { await home(); await page.evaluate(() => document.querySelector("button.hub-coin")?.click()); await sleep(1800); for (const tab of ["Paletas", "Pintados", "Elaborados", "Ligas"]) { await page.evaluate((t) => [...document.querySelectorAll(".store-tabs .pg-chip")].find((b) => b.textContent.trim().startsWith(t))?.click(), tab); await sleep(500); await audit(`loja ${tab}`); } },
};
for (const [name, run] of Object.entries(scenes)) { if (only && !only.includes(name)) continue; try { await run(); } catch (error) { console.log(`\n!! cena ${name} falhou: ${String(error).slice(0, 160)}`); } }
console.log("\nerros de página:", JSON.stringify(errors.slice(0, 4)));
await browser.close();
