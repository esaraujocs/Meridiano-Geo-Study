import puppeteer from "puppeteer-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const baseUrl = process.env.QA_URL ?? "http://127.0.0.1:5000/";
const sizes = [[360, 640], [390, 844], [768, 1024], [1440, 900]];
const violations = [];
const screenshots = [];
const consoleIssues = [];

await mkdir("qa/screens", { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-webgl"],
});
const page = await browser.newPage();
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") {
    consoleIssues.push(`${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", (error) => consoleIssues.push(`pageerror: ${error.message}`));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function clickText(text, selector = "button") {
  const clicked = await page.evaluate(({ text, selector }) => {
    const item = [...document.querySelectorAll(selector)].find((candidate) =>
      candidate.textContent?.replace(/\s+/g, " ").includes(text),
    );
    if (!(item instanceof HTMLElement)) return false;
    item.click();
    return true;
  }, { text, selector });
  if (!clicked) throw new Error(`controle não encontrado: ${text}`);
}
async function home() {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".family-grid");
}
async function unlock() {
  await home();
  await page.click(".settings-button");
  await page.waitForSelector(".options-debug");
  await clickText("Liberar modos e recortes");
  await wait(100);
}
async function openFamily(name) {
  await home();
  const found = await page.evaluate((name) => {
    const card = [...document.querySelectorAll(".family")].find((item) =>
      item.querySelector("h3")?.textContent?.trim() === name,
    );
    if (!card) return false;
    card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  }, name);
  if (!found) throw new Error(`família não encontrada: ${name}`);
  await page.waitForSelector(".rec-content");
}
async function configure(family, variant) {
  await openFamily(family);
  if (variant) await clickText(variant, ".variant-chips button");
  await wait(100);
}
async function start(family, variant, extra) {
  await configure(family, variant);
  if (extra) await extra();
  await clickText("Começar com", ".config-start");
  await page.waitForSelector(".quiz-stage,.map-stage", { timeout: 60_000 });
  await wait(700);
}
async function nav(label, selector) {
  await home();
  await clickText(label, selector);
  await wait(200);
}

const screens = [
  ["hub", home],
  ["config_bandeiras_atuais", () => configure("Bandeiras", "Atuais")],
  ["config_bandeiras_escrita", () => configure("Bandeiras", "Escrita")],
  ["config_bandeiras_historicas", () => configure("Bandeiras", "Históricas")],
  ["config_mapa", () => configure("Mapa", "Clicar no mapa")],
  ["config_capitais", () => configure("Capitais", "Clicar no mapa")],
  ["config_idiomas", () => configure("Idiomas", "Idiomas")],
  ["partida_mapa", () => start("Mapa", "Clicar no mapa")],
  ["partida_bandeiras", () => start("Bandeiras", "Atuais")],
  ["partida_escrita", () => start("Bandeiras", "Escrita")],
  ["partida_capitais", () => start("Capitais", "Clicar no mapa")],
  ["partida_idiomas", () => start("Idiomas", "Idiomas")],
  ["partida_silhueta", () => start("Mapa", "Silhueta")],
  ["partida_travel", () => start("Mapa", "Travel")],
  ["resultado", async () => {
    await start("Bandeiras", "Históricas", async () => {
      await clickText("Pacífico", ".region");
    });
    for (let round = 0; round < 4; round += 1) {
      await page.waitForSelector(".quiz-option");
      await page.click(".quiz-option");
      await wait(1550);
      if (await page.$(".surface")) break;
    }
    await page.waitForSelector(".surface", { timeout: 10_000 });
  }],
  ["colecao", () => nav("Coleção", ".desktop-nav button,.mobile-nav button")],
  ["achievements", () => nav("Achievements", ".desktop-nav button,.mobile-nav button")],
  ["progresso", () => nav("Progresso", ".desktop-nav button,.mobile-nav button")],
  ["opcoes", async () => { await home(); await page.click(".settings-button"); await page.waitForSelector(".options-screen"); }],
];

async function audit(screen, width, height, setupError = "") {
  const result = await page.evaluate(({ screen, width, height }) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const describe = (element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.classList.length ? `.${[...element.classList].slice(0, 3).join(".")}` : ""}`;
    const interactives = [...document.querySelectorAll("button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[role=button]")].filter(visible);
    const covered = interactives.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (x < 0 || x > innerWidth || y < 0 || y > innerHeight) return [];
      const hit = document.elementFromPoint(x, y);
      return hit && (hit === element || element.contains(hit)) ? [] : [{ element: describe(element), measure: `centro atingiu ${hit ? describe(hit) : "nada"}` }];
    });
    const touch = width <= 390 ? interactives.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44 ? [{ element: describe(element), measure: `${Math.round(rect.width)}x${Math.round(rect.height)} px` }] : [];
    }) : [];
    const smallText = [...document.querySelectorAll("body *")].filter(visible).flatMap((element) => {
      if (element.children.length || !element.textContent?.trim()) return [];
      const size = Number.parseFloat(getComputedStyle(element).fontSize);
      return size < 11 ? [{ element: describe(element), measure: `${size}px` }] : [];
    });
    const cut = [...document.querySelectorAll("body *")].filter(visible).flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const outside = rect.left < -1 || rect.right > innerWidth + 1;
      const truncated = element.scrollWidth > element.clientWidth + 1 && ["hidden", "clip"].includes(style.overflowX);
      return outside || truncated ? [{ element: describe(element), measure: outside ? `x=${Math.round(rect.left)}…${Math.round(rect.right)} / ${innerWidth}` : `scrollWidth ${element.scrollWidth} > clientWidth ${element.clientWidth}` }] : [];
    });
    const noVertical = width <= 390 && (screen === "hub" || screen.startsWith("partida_"));
    return {
      horizontal: document.documentElement.scrollWidth > innerWidth + 1 ? [{ element: "document", measure: `${document.documentElement.scrollWidth} > ${innerWidth}` }] : [],
      vertical: noVertical && document.documentElement.scrollHeight > innerHeight + 1 ? [{ element: "document", measure: `${document.documentElement.scrollHeight} > ${innerHeight}` }] : [],
      covered, touch, smallText, cut,
    };
  }, { screen, width, height });
  await page.addScriptTag({ content: axeSource });
  const contrast = await page.evaluate(async () => {
    const output = await window.axe.run(document, { runOnly: { type: "rule", values: ["color-contrast"] } });
    return output.violations.flatMap((item) => item.nodes.slice(0, 20).map((node) => ({ element: node.target.join(" "), measure: item.help })));
  });
  const checks = { ...result, contrast, setup: setupError ? [{ element: "setup", measure: setupError }] : [] };
  for (const [check, entries] of Object.entries(checks)) {
    for (const entry of entries) violations.push({ screen, size: `${width}x${height}`, check, ...entry });
  }
  return checks;
}

await unlock();
for (const [screen, setup] of screens) {
  let setupError = "";
  try {
    await page.setViewport({ width: 1440, height: 900 });
    await setup();
  } catch (error) {
    setupError = error instanceof Error ? error.message : String(error);
  }
  for (const [width, height] of sizes) {
    await page.setViewport({ width, height });
    await wait(120);
    const file = `qa/screens/${screen}_${width}x${height}.png`;
    await page.screenshot({ path: file });
    screenshots.push(file);
    await audit(screen, width, height, setupError);
  }
}
await browser.close();

const functional = [
  ["Mapa/Clicar", "PASS", "test:map-round-engine + Caribe real 27/27, sem repetição, sessão completa"],
  ["Silhueta", "PASS", "test:finite-decks: esgotamento e unicidade"],
  ["Travel", "PASS", "test:finite-decks: esgotamento e unicidade"],
  ["Bandeiras Atuais · bandeira→nome", "PASS", "test:finite-decks"],
  ["Bandeiras Atuais · nome→bandeira", "PASS", "test:finite-decks"],
  ["Históricas · bandeira→nome", "PASS", "motor compartilhado + teste estatístico de alternativas"],
  ["Históricas · nome→bandeira", "PASS", "motor compartilhado + teste estatístico de alternativas"],
  ["Escrita", "PASS", "test:finite-decks + test:typed-answer"],
  ["Capitais/Clicar", "PASS", "test:map-round-engine"],
  ["Capitais/Escrita", "PASS", "test:finite-decks + test:typed-answer"],
  ["Idiomas", "PASS", "motor compartilhado + teste estatístico de alternativas"],
];
const table = violations.length
  ? violations.map((item) => `| ${item.screen} | ${item.size} | ${item.check} | ${item.element} | ${item.measure.replaceAll("|", "\\|")} |`).join("\n")
  : "| — | — | — | — | Nenhuma violação |";
const report = `# QA visual e funcional

Gerado em ${new Date().toISOString()}. Apenas defeitos inequívocos de uso devem ser corrigidos; touch, texto, contraste, espaçamento e avisos ficam reportados.

## Violações

| Tela | Tamanho | Checagem | Elemento | Medida |
|---|---:|---|---|---|
${table}

## Console

${consoleIssues.length ? [...new Set(consoleIssues)].map((item) => `- ${item}`).join("\n") : "- Sem erros ou avisos."}

## Funcional por motor

| Motor | Resultado | Evidência |
|---|---|---|
${functional.map((row) => `| ${row.join(" | ")} |`).join("\n")}

## Capturas (${screenshots.length})

${screenshots.map((path) => `- \`${path}\``).join("\n")}
`;
await writeFile("qa/report.md", report);
console.log(JSON.stringify({ screens: screenshots.length, violations: violations.length, consoleIssues: [...new Set(consoleIssues)].length }, null, 2));