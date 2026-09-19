import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:5000/";
const families = [
  {
    key: "mapa",
    label: "Mapa",
    chips: ["Clicar no mapa", "Silhueta", "Travel"],
    defaultContext: ["mapa", "mapa"],
    contaminant: "escrita-capital",
    variants: [
      ["Clicar no mapa", "mapa", "mapa", ".map-stage"],
      ["Silhueta", "silhueta", "silhueta", ".silhouette-frame"],
      ["Travel", "travel", "travel", ".travel-frame"],
    ],
  },
  {
    key: "bandeiras",
    label: "Bandeiras",
    chips: ["Atuais", "Escrita", "Históricas"],
    defaultContext: ["bandeiras", "nome-bandeira"],
    contaminant: "escrita-capital",
    variants: [
      ["Atuais", "bandeiras", "nome-bandeira", ".quiz-stage", "Nome → bandeira"],
      ["Atuais", "bandeiras", "bandeira-nome", ".quiz-stage", "Bandeira → nome"],
      ["Escrita", "escrita", "escrita-pais", ".quiz-stage"],
      ["Históricas", "historicas", "nome-historica", ".quiz-stage", "Nome → bandeira"],
      ["Históricas", "historicas", "historica-nome", ".quiz-stage", "Bandeira → nome"],
    ],
  },
  {
    key: "capitais",
    label: "Capitais",
    chips: ["Clicar no mapa", "Escrita"],
    defaultContext: ["capitais", "capital-pais"],
    contaminant: "nome-historica",
    variants: [
      ["Clicar no mapa", "capitais", "capital-pais", ".map-stage"],
      ["Escrita", "escrita", "escrita-capital", ".quiz-stage"],
    ],
  },
  {
    key: "idiomas",
    label: "Idiomas",
    chips: ["Idiomas"],
    defaultContext: ["idiomas", "idioma-pais"],
    contaminant: "silhueta",
    variants: [["Idiomas", "idiomas", "idioma-pais", ".quiz-stage"]],
  },
];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

const clickText = async (selector, text) => {
  const clicked = await page.evaluate(({ selector, text }) => {
    const element = [...document.querySelectorAll(selector)].find(
      (candidate) => candidate.textContent?.replace(/\s+/g, " ").trim() === text,
    );
    if (!(element instanceof HTMLElement)) return false;
    element.click();
    return true;
  }, { selector, text });
  assert.equal(clicked, true, `Controle não encontrado: ${text}`);
};
const clickFamily = async (label) => {
  const clicked = await page.evaluate((text) => {
    const element = [...document.querySelectorAll(".family")].find(
      (candidate) => candidate.querySelector("h3")?.textContent?.trim() === text,
    );
    if (!(element instanceof HTMLElement)) return false;
    element.click();
    return true;
  }, label);
  assert.equal(clicked, true, `Família não encontrada: ${label}`);
};
const openFamily = async (family, direction) => {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".family-grid");
  if (direction) {
    await page.evaluate((value) => localStorage.setItem("carta-flag-direction", value), direction);
  }
  await clickFamily(family.label);
  await page.waitForSelector(".variant-chips");
};
const configuration = () => page.evaluate(() => ({
  chips: [...document.querySelectorAll(".variant-chips button")].map((item) =>
    item.textContent?.replace(/\s+·\\s+\\d+\\s+moedas$/, "").trim(),
  ),
  topFamily: document.querySelector(".rec-content")?.getAttribute("data-top-family"),
  family: document.querySelector(".rec-content")?.getAttribute("data-family"),
  variant: document.querySelector(".rec-content")?.getAttribute("data-variant"),
  direction: Boolean(document.querySelector(".config-direction")),
}));

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".settings-button");
  await page.click(".settings-button");
  await page.waitForSelector(".options-debug");
  await clickText(".options-debug button", "Liberar modos e recortes");
  await page.waitForFunction(() => document.querySelector(".options-debug [role=status]")?.textContent?.includes("Conteúdo liberado"));

  for (const family of families) {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.evaluate(({ key, contaminant }) => {
      localStorage.setItem(`carta-last-variant:${key}`, contaminant);
    }, family);
    await page.waitForSelector(".family-grid");
    await clickFamily(family.label);
    await page.waitForSelector(".variant-chips");
    const restored = await configuration();
    assert.deepEqual(restored.chips, family.chips, `${family.label}: chips após restore contaminado`);
    assert.deepEqual(
      [restored.family, restored.variant],
      family.defaultContext,
      `${family.label}: fallback após restore contaminado`,
    );
    assert.equal(restored.topFamily, family.key, `${family.label}: família superior após restore`);

    for (const [chip, engine, variant, stage, direction] of family.variants) {
      await openFamily(family, family.key === "bandeiras" ? "name-to-flag" : undefined);
      await clickText(".variant-chips button", chip);
      if (direction) await clickText(".config-direction button", direction);
      const selected = await configuration();
      assert.deepEqual(selected.chips, family.chips, `${family.label}/${chip}: chips visíveis`);
      assert.equal(selected.topFamily, family.key, `${family.label}/${chip}: família superior`);
      assert.deepEqual([selected.family, selected.variant], [engine, variant], `${family.label}/${chip}: motor`);
      assert.equal(
        selected.direction,
        family.key === "bandeiras" && chip !== "Escrita",
        `${family.label}/${chip}: seção Direção`,
      );
      await page.waitForSelector(".config-start:not([disabled])", { timeout: 60_000 });
      await page.click(".config-start");
      await page.waitForSelector(stage, { timeout: 60_000 });
    }
  }
  assert.deepEqual(consoleErrors, [], "Erros de console");
  console.log(JSON.stringify({ families: families.length, variants: families.reduce((total, item) => total + item.variants.length, 0), crossFamilyRestores: families.length }, null, 2));
} finally {
  await browser.close();
}