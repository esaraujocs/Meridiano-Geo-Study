// Conferência do Hub no celular (Hub em faixa, 09/10/2026): simetria, que tudo caiba sem rolar e um uso simulado com toques de verdade.
// Uso: com o app em dev (npm run dev, ou a 5101 do launch.json): node scripts/check-hub-mobile.mjs
//   BASE=http://127.0.0.1:5101/  PROFILE=<backup .json para importar>  THEMES=papel,noturno  CHROME=<caminho do Chrome>
// Sai com código 1 se alguma conferência falhar; os prints ficam em .tmp-hub/mobile-<tela>-<tema>.png.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
const puppeteer = createRequire(import.meta.url)("puppeteer-core");
const BASE = process.env.BASE ?? "http://127.0.0.1:5101/";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const THEMES = (process.env.THEMES ?? "papel,noturno").split(",");
const SIZES = [[360, 640], [375, 667], [390, 844], [412, 915], [430, 932]];
const TOL = 1.5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(".tmp-hub", { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
// perfil: o backup indicado (ou um perfil novo com os modos liberados)
{
  const page = await browser.newPage();
  await page.goto(BASE + "?debug=1", { waitUntil: "load" });
  await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase("carta-cega"); q.onsuccess = q.onerror = q.onblocked = r; }); });
  await page.reload({ waitUntil: "load" }); await page.waitForSelector(".hx-grid");
  const profile = process.env.PROFILE && existsSync(process.env.PROFILE) ? readFileSync(process.env.PROFILE, "utf8") : null;
  await page.evaluate(async (json) => {
    if (json) { const { parseBackup, importProgress } = await import("/src/domain/progress-backup.ts"); await importProgress(parseBackup(json)); }
    const tools = await import("/src/domain/debug-tools.ts"); await tools.unlockAllModes();
    localStorage.removeItem("carta-hub-layout"); localStorage.removeItem("carta-cega:debug");
  }, profile);
  await page.close();
}

const failures = [];
const check = (scope, name, ok, detail = "") => { if (!ok) failures.push(`${scope} · ${name}${detail ? ` (${detail})` : ""}`); return ok; };
const near = (a, b) => Math.abs(a - b) <= TOL;

async function openHub(w, h, theme) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE, { waitUntil: "load" });
  await page.evaluate((th) => localStorage.setItem("carta-theme", th), theme);
  await page.reload({ waitUntil: "load" }); await page.waitForSelector(".hx-grid"); await sleep(2200);
  return page;
}

// as medidas da tela: caixas, o cartão de modo da frente, o ícone de cada modo e texto cortado
const MEASURE = () => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
  const vis = (sel) => [...document.querySelectorAll(sel)].find((el) => el.offsetParent);
  const track = document.querySelector(".hx-track").getBoundingClientRect();
  const front = [...document.querySelectorAll(".hx-slide .family.hx-mode")].find((el) => { const r = el.getBoundingClientRect(); return r.left >= track.left - 2 && r.right <= track.right + 2 && r.width > 0; });
  const icons = {};
  for (const card of document.querySelectorAll(".hx-slide .family.hx-mode")) { const r = card.getBoundingClientRect(); if (!r.width || card.dataset.fam in icons) continue; icons[card.dataset.fam] = card.querySelector(".family-icon").getBoundingClientRect().top - r.top; }
  const clipped = [...document.querySelectorAll(".hx *")].filter((el) => el.offsetParent && el.children.length === 0 && el.textContent.trim() && el.clientWidth > 2 && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim().slice(0, 20));
  const small = [...document.querySelectorAll(".hx button:not(.hx-hit):not([inert] *), .mobile-nav button")].filter((el) => el.offsetParent && !el.closest("[inert]")).map((el) => ({ label: el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 16), ...box(el) })).filter((b) => b.w < 24 || b.h < 24);
  const duel = vis(".hx-duel:not(.hx-chal)"), chal = vis(".hx-chal");
  return {
    vw: innerWidth, vh: innerHeight, doc: document.documentElement.scrollHeight,
    head: box(vis(".hx-head")), card: front && box(front), duel: duel && box(duel), chal: chal && box(chal),
    duelIc: duel && box(duel.querySelector(".hx-duel-ic")), chalIc: chal && box(chal.querySelector(".hx-duel-ic")),
    duelGo: duel && box(duel.querySelector(".hx-go")), chalGo: chal && box(chal.querySelector(".hx-go")),
    prev: box(vis(".hx-arrow.is-prev")), next: box(vis(".hx-arrow.is-next")), nav: box(vis(".mobile-nav")),
    mecenato: Boolean(vis(".hx-mecenato")), icons, clipped, small,
  };
};

for (const theme of THEMES) for (const [w, h] of SIZES) {
  if (theme !== THEMES[0] && w !== 390) continue; // os outros temas só no tamanho de referência
  const scope = `${w}×${h} ${theme}`;
  const page = await openHub(w, h, theme);
  const m = await page.evaluate(MEASURE);
  // cabe na tela: nada rola e nada fica embaixo da barra de baixo
  check(scope, "sem rolar", m.doc <= m.vh + 1, `página ${m.doc} em ${m.vh}`);
  check(scope, "acima da barra de baixo", Math.max(m.duel.b, m.chal.b) <= m.nav.t + 1, `cartões até ${Math.round(Math.max(m.duel.b, m.chal.b))}, barra em ${Math.round(m.nav.t)}`);
  check(scope, "sem o Mecenato · Vitrine", !m.mecenato);
  // simetria: as mesmas bordas para tudo e as margens iguais dos dois lados
  check(scope, "margens iguais", near(m.card.l, m.vw - m.card.r), `${m.card.l.toFixed(1)} × ${(m.vw - m.card.r).toFixed(1)}`);
  for (const [name, b] of [["cabeçalho", m.head], ["Duelo", m.duel]]) check(scope, `${name} na borda esquerda do cartão de modo`, near(b.l, m.card.l), `${b.l.toFixed(1)} × ${m.card.l.toFixed(1)}`);
  for (const [name, b] of [["cabeçalho", m.head], ["Desafios", m.chal]]) check(scope, `${name} na borda direita do cartão de modo`, near(b.r, m.card.r), `${b.r.toFixed(1)} × ${m.card.r.toFixed(1)}`);
  check(scope, "Duelo e Desafios do mesmo tamanho", near(m.duel.w, m.chal.w) && near(m.duel.h, m.chal.h) && near(m.duel.t, m.chal.t), `${m.duel.w.toFixed(1)}×${m.duel.h.toFixed(1)} · ${m.chal.w.toFixed(1)}×${m.chal.h.toFixed(1)}`);
  check(scope, "ícone e botão no mesmo lugar nos dois", near(m.duelIc.l - m.duel.l, m.chalIc.l - m.chal.l) && near(m.duelIc.t, m.chalIc.t) && near(m.duelGo.t, m.chalGo.t) && near(m.duelGo.w, m.chalGo.w));
  check(scope, "vão entre os dois no meio", near((m.duel.r + m.chal.l) / 2, m.vw / 2), `${((m.duel.r + m.chal.l) / 2).toFixed(1)} × ${m.vw / 2}`);
  check(scope, "setas simétricas", near(m.prev.l, m.vw - m.next.r) && near(m.prev.t, m.next.t));
  // o cartão de modo: de quadrado a retrato, o ícone na mesma altura nos 6
  const ratio = m.card.h / m.card.w;
  check(scope, "cartão de modo quadrado a retrato", ratio >= 0.85 && ratio <= 1.7, `altura/largura ${ratio.toFixed(2)}`);
  const tops = Object.values(m.icons).map((v) => Math.round(v));
  check(scope, "ícone do modo na mesma altura", Math.max(...tops) - Math.min(...tops) <= 1, tops.join(","));
  check(scope, "nenhum texto cortado", m.clipped.length === 0, m.clipped.join(" | "));
  check(scope, "alvos de toque ≥ 24 px", m.small.length === 0, m.small.map((s) => `${s.label} ${Math.round(s.w)}×${Math.round(s.h)}`).join(", "));
  // acessibilidade
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  const axe = await page.evaluate(async () => (await window.axe.run(document.body, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((v) => `${v.id}×${v.nodes.length}`));
  check(scope, "axe", axe.length === 0, axe.join(", "));
  await page.screenshot({ path: `.tmp-hub/mobile-${w}x${h}-${theme}.png`, captureBeyondViewport: false });
  console.log(`${scope}: cartão ${Math.round(m.card.w)}×${Math.round(m.card.h)} · Duelo/Desafios ${Math.round(m.duel.w)}×${Math.round(m.duel.h)} · página ${m.doc}/${m.vh}`);
  await page.close();
}

// uso simulado (390×844): deslizar, setas, abrir um modo e voltar, trocar a escada, a barra de baixo
{
  const scope = "uso 390×844";
  const page = await openHub(390, 844, THEMES[0]);
  const client = await page.target().createCDPSession();
  const active = () => page.evaluate(() => [...document.querySelectorAll(".hx-dots button")].findIndex((b) => b.getAttribute("aria-current") === "true"));
  const swipe = async (fromX, toX, y) => {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fromX, y }] });
    for (let i = 1; i <= 8; i += 1) { await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: fromX + ((toX - fromX) * i) / 8, y }] }); await sleep(16); }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(1100);
  };
  const cardBox = await page.evaluate(() => { const r = document.querySelector(".hx-track").getBoundingClientRect(); return { y: r.top + r.height / 2, l: r.left, r: r.right }; });
  const start = await active();
  const total = await page.evaluate(() => document.querySelectorAll(".hx-dots button").length);
  const seen = [start];
  for (let i = 0; i < total; i += 1) { await swipe(cardBox.r - 70, cardBox.l + 70, cardBox.y); seen.push(await active()); }
  check(scope, "deslizar passa por todos os modos e volta ao começo (laço)", new Set(seen).size === total && seen.at(-1) === start, seen.join("→"));
  await swipe(cardBox.l + 70, cardBox.r - 70, cardBox.y);
  check(scope, "deslizar para a direita volta um", await active() === (start - 1 + total) % total);
  await page.tap(".hx-arrow.is-next"); await sleep(1100);
  check(scope, "seta da direita avança", await active() === start);
  // abrir o modo da frente com um toque e voltar
  const fam = await page.evaluate(() => { const track = document.querySelector(".hx-track").getBoundingClientRect(); const card = [...document.querySelectorAll(".hx-slide .family.hx-mode")].find((el) => { const r = el.getBoundingClientRect(); return r.left >= track.left - 2 && r.right <= track.right + 2 && r.width > 0; }); const r = card.getBoundingClientRect(); window.__tap = [r.left + r.width / 2, r.top + r.height / 3]; return card.dataset.fam; });
  const [tx, ty] = await page.evaluate(() => window.__tap);
  await page.touchscreen.tap(tx, ty); await sleep(1500);
  const mesa = await page.evaluate(() => Boolean(document.querySelector(".mz")));
  check(scope, `tocar no cartão abre a Mesa (${fam})`, mesa);
  if (mesa) { await page.tap(".st-back"); await sleep(1500); }
  check(scope, "voltar da Mesa ao Hub", await page.evaluate(() => Boolean(document.querySelector(".hx-grid"))));
  // a escada do Duelo troca com um toque e fica guardada
  const before = await page.evaluate(() => document.querySelector(".hx-ladder-swap")?.textContent.trim());
  await page.tap(".hx-ladder-swap"); await sleep(500);
  const after = await page.evaluate(() => ({ label: document.querySelector(".hx-ladder-swap")?.textContent.trim(), saved: localStorage.getItem("carta-hub-ladder") }));
  check(scope, "trocar a escada do Duelo", Boolean(before) && after.label !== before && Boolean(after.saved), `${before} → ${after.label} (${after.saved})`);
  await page.tap(".hx-ladder-swap"); await sleep(400);
  check(scope, "Duelar ativo e Desafiar desativado (em breve)", await page.evaluate(() => !document.querySelector(".hx-duel:not(.hx-chal) .hx-go").disabled && document.querySelector(".hx-chal .hx-go").disabled));
  // a barra de baixo: cada destino abre e fica marcado; os anéis de progresso aparecem
  const rings = await page.evaluate(() => [...document.querySelectorAll(".mobile-nav .hx-ring-arc")].length);
  check(scope, "anéis de progresso na barra de baixo (Coleção, Conquistas, Maestria)", rings === 3, String(rings));
  for (const dest of ["collection", "achievements", "progress", "store", "hub"]) {
    await page.tap(`.mobile-nav [data-nav=${dest}]`); await sleep(1300);
    const current = await page.evaluate(() => document.querySelector(".mobile-nav [aria-current=page]")?.dataset.nav ?? null);
    check(scope, `barra de baixo → ${dest}`, current === dest, String(current));
  }
  await page.close();
}

await browser.close();
if (failures.length) { console.log(`\n${failures.length} conferência(s) falharam:\n  ${failures.join("\n  ")}`); process.exit(1); }
console.log("\ntodas as conferências passaram");
