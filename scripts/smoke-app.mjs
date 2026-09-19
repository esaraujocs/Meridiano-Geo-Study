import puppeteer from "puppeteer-core";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");

const baseUrl = process.env.SMOKE_URL ?? "http://127.0.0.1:5000/";
const executablePath =
  process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium";

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  dumpio: process.env.SMOKE_DUMPIO === "1",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
  ],
});

let page = await browser.newPage();
await page.setViewport({ width: 768, height: 720 });
const errors = [];
const accessibility = [];
const observePage = (target) => {
  target.on("pageerror", (error) => errors.push(error.message));
  target.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
};
observePage(page);

async function auditContrast(label) {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    const output = await window.axe.run({
      include: ["body"],
    }, {
      runOnly: { type: "rule", values: ["color-contrast"] },
    });
    return output.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.length,
      targets: violation.nodes.map((node) => node.target),
    }));
  });
  accessibility.push({ label, violations: result });
}

async function clickButton(label) {
  await page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find((item) =>
      item.textContent?.includes(text),
    );
    if (!button) {
      const available = [...document.querySelectorAll("button")]
        .map((item) => item.textContent?.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      throw new Error(`Botão não encontrado: ${text}. Disponíveis: ${available.join(" | ")}`);
    }
    button.click();
  }, label);
}

async function gotoHome() {
  if (await page.$(".family-grid")) return;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const usedBack = await page.evaluate(() => {
      const button = document.querySelector("button.back");
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    }).catch(() => false);
    if (!usedBack) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await page.$(".family-grid")) return;
  }
  const usedPlay = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "Jogar",
    );
    button?.click();
    return Boolean(button);
  }).catch(() => false);
  if (usedPlay) {
    await page.waitForSelector(".family-grid");
    return;
  }

  const viewport = page.viewport() ?? { width: 768, height: 720 };
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".family-grid");
  } catch (error) {
    if (!(error instanceof Error) || !/detached Frame|frame was detached/i.test(error.message)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 250));
    await page.setViewport(viewport);
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".family-grid");
  }
}

async function resetPage(viewport = { width: 1280, height: 720 }) {
  const previous = page;
  page = await browser.newPage();
  observePage(page);
  await page.setViewport(viewport);
  await previous.close().catch(() => undefined);
}

async function openFamily(family, variant, world = false, beforeStart, recordQuality = true) {
  await gotoHome();
  const familyLabel = family;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const found = await page.evaluate((label) => {
      const card = [...document.querySelectorAll(".family-grid .family")].find(
        (item) => item.querySelector("h3")?.textContent?.trim() === label,
      );
      if (!card) return false;
      (card.querySelector("h3") ?? card).dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    }, familyLabel);
    if (found) break;
    await page.click('button[aria-label="Próximo modo"]');
    await new Promise((resolve) => setTimeout(resolve, 40));
    if (attempt === 3) throw new Error(`Família não encontrada: ${familyLabel}`);
  }
  await page.waitForFunction(
    () => document.querySelector("h1")?.textContent?.includes("Configure a partida"),
  );
  const chipLabel = variant.includes("Escrita") ? "Escrita"
    : variant.includes("Silhueta") ? "Silhueta"
    : variant.includes("Travel") ? "Travel"
    : variant.includes("Idioma") ? "Idiomas"
    : variant;
  await clickButton(chipLabel);
  await page.waitForSelector(".region-list");
  checks.ui.dynamicConfiguration = checks.ui.dynamicConfiguration ?? await page.evaluate(() => {
    const regions = [...document.querySelectorAll(".region-list .region")];
    const counts = regions.map((item) => item.textContent?.match(/\d+/)?.[0]).filter(Boolean);
    const selected = regions.filter((item) => item.getAttribute("aria-pressed") === "true");
    const disabled = regions.filter((item) => item.disabled);
    return {
      regions: regions.length,
      selected: selected.length,
      counts: counts.length === regions.length,
      disabledExplanation: disabled.length === 0 || Boolean(document.querySelector(".config-empty-note")?.textContent?.trim()),
      uniqueDeckCount: Boolean(document.querySelector('.region[aria-pressed="true"] span') && document.querySelector(".button.coral")?.textContent?.match(/\d+/)),
      countPlacement: !document.querySelector(".section-label")?.textContent?.includes("cartas") &&
        !document.querySelector(".config-empty-note")?.textContent?.match(/\d+\s+cartas/),
    };
  });
  if (variant === "Silhueta · alternativas") {
    await clickButton("Alternativas");
  }
  if (!checks.ui.regionControls) {
    checks.ui.regionControls = (await page.$$eval(".region-list .region", (items) => items.length)) === 8;
  }
  if (!checks.ui.regionAcceptance) {
    const beforeRegion = await page.$eval('.region[aria-pressed="true"]', (item) => item.textContent ?? "");
    const regionState = await page.evaluate(() => ({
      count: document.querySelectorAll(".region-list .region").length,
      selected: document.querySelectorAll('.region-list .region[aria-pressed="true"]').length,
      selectedIndex: [...document.querySelectorAll(".region-list .region")].findIndex(
        (button) => button.getAttribute("aria-pressed") === "true",
      ),
      detail: document.querySelector('.region[aria-pressed="true"]')?.textContent ?? "",
    }));
    const alternate = await page.evaluate(() => {
      const item = [...document.querySelectorAll(".region-list .region")].find(
        (button) =>
          !button.disabled && button.getAttribute("aria-pressed") !== "true",
      );
      item?.click();
      return Boolean(item);
    });
    if (alternate) {
      await page.waitForFunction((previous) =>
        (document.querySelector('.region[aria-pressed="true"]')?.textContent ?? "") !== previous, {}, beforeRegion);
    }
    const changed = await page.evaluate(() => ({
      selected: document.querySelectorAll('.region-list .region[aria-pressed="true"]').length,
      detail: document.querySelector('.region[aria-pressed="true"]')?.textContent ?? "",
    }));
    checks.ui.regionAcceptance = regionState.count === 8 &&
      regionState.selected === 1 &&
      !/bloqueada|moedas|sessão/.test(regionState.detail) &&
      /cartas/.test(regionState.detail) &&
      changed.selected === 1 && (!alternate || changed.detail !== beforeRegion);
    if (alternate && regionState.selectedIndex >= 0) {
      await page.click(
        `.region-list .region:nth-child(${regionState.selectedIndex + 1})`,
      );
    }
  }
  if (variant.includes("Histórica") || variant.includes("histórica")) {
    const deckSize = await page.$eval('.region[aria-pressed="true"] span', (item) =>
      Number.parseInt(item.textContent ?? "0", 10),
    );
    if (!(deckSize > 0)) throw new Error("Baralho histórico não foi pré-carregado");
  }
  if (world) await page.click(".region-list .region:first-child");
  if (beforeStart) await beforeStart();
  await auditContrast(`config:${family}:${variant}`);
  await clickButton("Começar com");
  await page.waitForFunction(() => Boolean(document.querySelector(".quiz-stage,.map-stage")));
  const quality = await page.evaluate(() => {
    const prompt = document.querySelector(".quiz-prompt .target-kicker, .map-target-overlay strong, .geometry-main .feedback");
    const promptStyle = prompt ? getComputedStyle(prompt) : null;
    const input = document.querySelector('input[aria-label="Resposta"], input[aria-label="Próximo país"]');
    const submit = input?.parentElement?.querySelector("button");
    const inputRect = input?.getBoundingClientRect();
    const submitRect = submit?.getBoundingClientRect();
    const option = document.querySelector(".quiz-option");
    const optionStyle = option ? getComputedStyle(option) : null;
    const flag = document.querySelector(".quiz-flag");
    const flagRatio = flag instanceof HTMLImageElement && flag.naturalWidth
      ? (() => {
        const rect = flag.getBoundingClientRect();
        const contentWidth = rect.width - 2;
        const contentHeight = rect.height - 2;
        const scale = contentWidth / flag.naturalWidth;
        return Math.abs(contentHeight - flag.naturalHeight * scale) <= 1 &&
          Math.abs(contentWidth / contentHeight - flag.naturalWidth / flag.naturalHeight) < .005;
      })()
      : true;
    return {
      prompt20: Boolean(promptStyle && parseFloat(promptStyle.fontSize) >= 20),
      promptInk: Boolean(promptStyle && (prompt?.closest(".map-target-overlay") || !/rgb\(2\d\d|rgb\(1\d\d, 1\d\d, 1\d\d/.test(promptStyle.color))),
      noHint: !document.body.textContent?.includes("Escolha uma alternativa."),
      restartOnlyMenu: [...document.querySelectorAll("button")].filter((item) => /Recomeçar/.test(item.textContent ?? "")).every((item) => Boolean(item.closest(".hud-overflow"))),
      optionBaseline: !option || Boolean(optionStyle && parseFloat(optionStyle.borderTopWidth) >= 1 && parseFloat(optionStyle.borderRadius) >= 8),
      typedControl: !input || Boolean(inputRect && submitRect && inputRect.height >= 56 && parseFloat(getComputedStyle(input).fontSize) >= 20 && Math.abs(inputRect.height - submitRect.height) <= 1),
      flagProportional: flagRatio,
      reducedMotion: [...document.styleSheets].some((sheet) => {
        try { return [...sheet.cssRules].some((rule) => rule.cssText.includes("prefers-reduced-motion")); }
        catch { return false; }
      }),
    };
  });
  if (recordQuality) {
    checks.gameQuality = checks.gameQuality ?? [];
    checks.gameQuality.push({ family, variant, ...quality });
  }
  await auditContrast(`game:${family}:${variant}`);
}

const checks = {};

await gotoHome();
await auditContrast("hub");
checks.ui = await page.evaluate(() => {
  const familyGrid = document.querySelector(".family-grid");
  const idiomas = [...document.querySelectorAll(".family")].find((item) =>
    item.querySelector("h3")?.textContent?.includes("Idiomas"),
  );
  return {
    carousel768: getComputedStyle(familyGrid).display === "flex",
    nativeScrollbarHidden: getComputedStyle(familyGrid).scrollbarWidth === "none",
  idiomasLocked: Boolean(idiomas && idiomas.classList.contains("locked")),
    arrowsDots: document.querySelectorAll(".carousel-arrow").length === 2 &&
      document.querySelectorAll(".carousel-dots button").length === 4,
    familyCardsHaveNoInteractiveDescendants: [...document.querySelectorAll(".family")].every(
      (card) => card.querySelectorAll("a,button,input,select,textarea,[tabindex]").length === 0,
    ),
  };
});
await page.click(".family-grid .family.active h3");
await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Configure a partida"));
checks.ui.familyCardOpensVariant = true;
checks.ui.singleConfiguration = await page.evaluate(() => ({
  titleCount: [...document.querySelectorAll("h1")].filter((item) => item.textContent?.includes("Configure a partida")).length,
  variantChips: document.querySelectorAll(".variant-chips .chip").length,
  regionChips: document.querySelectorAll(".region-list .region").length,
  noVariantScreen: !document.body.textContent?.includes("Escolha a variante"),
}));
checks.ui.singleConfigurationPasses = checks.ui.singleConfiguration.titleCount === 1 &&
  checks.ui.singleConfiguration.variantChips === 3 &&
  checks.ui.singleConfiguration.regionChips === 8 &&
  checks.ui.singleConfiguration.noVariantScreen;
await gotoHome();
await page.$eval(".family-grid .family", (item) => item.querySelector("h3")?.textContent === "Idiomas" ? item.click() : [...document.querySelectorAll(".family h3")].find((h) => h.textContent === "Idiomas")?.click());
await page.waitForSelector(".variant-chips");
await clickButton("Idiomas");
checks.ui.blockedVariantSelection = await page.evaluate(() => {
  const chip = [...document.querySelectorAll(".variant-chips .chip")].find((item) => item.textContent?.includes("Idiomas"));
  const cta = [...document.querySelectorAll("button")].find((item) => item.classList.contains("coral"));
  return Boolean(chip && chip.classList.contains("chip-locked") && cta &&
    /Liberar|Falta|moedas/i.test(cta.textContent ?? ""));
});
await gotoHome();
await page.$eval(".family-grid .family.active h3", (item) => item.click());
await page.waitForSelector(".variant-chips");
await clickButton("Silhueta");
await page.waitForFunction(() => localStorage.getItem("carta-last-variant:mapa") === "silhueta");
const savedMapVariant = await page.evaluate(() => localStorage.getItem("carta-last-variant:mapa"));
await gotoHome();
await page.$eval(".family-grid .family.active h3", (item) => item.click());
await page.waitForSelector(".variant-chips");
checks.ui.lastVariantPersistence = savedMapVariant === "silhueta" &&
  await page.$eval('.variant-chips .chip[aria-pressed="true"]', (item) => item.textContent?.includes("Silhueta"));
await gotoHome();
await gotoHome();
await page.setViewport({ width: 390, height: 844 });
await page.click('button[aria-label="Próximo modo"]');
await page.waitForFunction(
  () =>
    document.querySelector(".family.active h3")?.textContent === "Bandeiras" &&
    document.querySelector('.carousel-dots button[aria-current="true"]')
      ?.getAttribute("aria-label") === "Ir para família 2",
);
await page.waitForFunction(() => {
  const grid = document.querySelector(".family-carousel")?.getBoundingClientRect();
  const active = document.querySelector(".family.active")?.getBoundingClientRect();
  return Boolean(
    grid &&
    active &&
    Math.abs((active.left + active.right) / 2 - (grid.left + grid.right) / 2) < 4
  );
});
checks.ui.carouselNavigation = await page.evaluate(() => {
  const cards = [...document.querySelectorAll(".family-grid > .family")];
  const active = document.querySelector(".family-grid > .family.active");
  return (
    active?.querySelector("h3")?.textContent === "Bandeiras" &&
    cards[0]?.getAttribute("aria-hidden") === "true" &&
    cards[0]?.hasAttribute("inert")
  );
});
checks.ui.carouselGeometry = await page.evaluate(() => {
  const grid = document.querySelector(".family-carousel").getBoundingClientRect();
  const active = document.querySelector(".family.active").getBoundingClientRect();
  const cards = [...document.querySelectorAll(".family")].map((card) => card.getBoundingClientRect());
  const visible = (rect) => Math.max(0, Math.min(rect.right, grid.right) - Math.max(rect.left, grid.left));
  const previous = visible([...document.querySelectorAll(".family")].find((item) => item.querySelector("h3")?.textContent === "Mapa").getBoundingClientRect());
  const next = visible([...document.querySelectorAll(".family")].find((item) => item.querySelector("h3")?.textContent === "Capitais").getBoundingClientRect());
  const prevArrow = document.querySelector(".carousel-arrow-prev").getBoundingClientRect();
  const nextArrow = document.querySelector(".carousel-arrow-next").getBoundingClientRect();
  return {
    activeCentered: Math.abs((active.left + active.right) / 2 - (grid.left + grid.right) / 2) < 8,
    symmetricPeeks: Math.abs(previous - next) < 14,
    arrowsSymmetric: Math.abs(
      Math.abs((prevArrow.left + prevArrow.right) / 2 - (grid.left + grid.right) / 2) -
      Math.abs((nextArrow.left + nextArrow.right) / 2 - (grid.left + grid.right) / 2),
    ) < 14,
    previous, next,
  };
});
await page.click('.carousel-dots button[aria-label="Ir para família 1"]');
await page.waitForFunction(
  () => document.querySelector(".family.active h3")?.textContent === "Mapa",
);
await clickButton("Opções");
await page.waitForSelector(".options-screen");
checks.ui.debugVisibleInDev = await page.$eval(".options-debug", (item) => item.textContent?.includes("Adicionar moedas") ?? false);
const debugBalanceBefore = await page.$eval(".pill.mono", (item) =>
  Number.parseInt(item.textContent ?? "0", 10),
);
await page.click(".options-debug input[type=number]", { clickCount: 3 });
await page.keyboard.type("17");
await clickButton("Adicionar moedas");
await page.waitForFunction(() => document.querySelector(".options-debug [role=status]")?.textContent?.includes("Moedas adicionadas"));
const debugBalanceAfter = await page.$eval(
  ".pill.mono",
  (item) => Number.parseInt(item.textContent ?? "0", 10),
);
checks.ui.debugLedgerRefresh = {
  before: debugBalanceBefore,
  after: debugBalanceAfter,
  expected: debugBalanceBefore + 17,
  passes: debugBalanceAfter === debugBalanceBefore + 17,
};
checks.ui.collectionDebugAbsent = !(await page.$eval(".options-debug", (item) => item.textContent?.includes("Coleção de teste") ?? false));
await clickButton("Liberar modos e recortes");
await page.waitForFunction(() => document.querySelector(".options-debug [role=status]")?.textContent?.includes("Conteúdo liberado"));
checks.ui.debugUnlockConfirmed = true;
await gotoHome();
await page.$eval(".family-grid .family h3", (items) => {
  const card = [...document.querySelectorAll(".family-grid .family h3")]
    .find((item) => item.textContent?.trim() === "Bandeiras");
  (card ?? items).dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Configure a partida"));
checks.ui.bandeiraCards = (await page.$$eval(".variant-chips .chip", (items) =>
  items.filter((item) => [
    "Nome → bandeira",
    "Bandeira → nome",
    "Escrita",
    "Nome → histórica",
    "Histórica → nome",
  ].some((label) => item.textContent?.includes(label))).length,
)) === 5;
await gotoHome();
await page.setViewport({ width: 1440, height: 900 });
await page.waitForSelector(".family-grid");
checks.ui.grid1440 = await page.$eval(
  ".family-grid",
  (item) => getComputedStyle(item).display === "grid",
);
await page.setViewport({ width: 1280, height: 720 });

let unDeckSize = 0;
await resetPage();
await openFamily("Mapa", "Clicar no mapa", false, async () => {
  await page.click(".region-list .region:first-child");
  await page.waitForFunction(() =>
    document.querySelector('.region[aria-pressed="true"] span')?.textContent?.includes("cartas"),
  );
  const lockedWorld = await page.$eval(
    ".button.coral",
    (item) =>
      item.textContent?.includes("Liberar") &&
      item.textContent?.includes("3 moedas"),
  );
  await page.click(".region-list .region:nth-child(2)");
    const before = await page.$eval('.region[aria-pressed="true"] span', (item) =>
    Number.parseInt(item.textContent ?? "0", 10),
  );
  await page.$eval('.config-row .chip', (input) => input.click());
  await page.waitForFunction(
    (previous) =>
      Number.parseInt(document.querySelector('.region[aria-pressed="true"] span')?.textContent ?? "0", 10) <
      previous,
    {},
    before,
  );
  unDeckSize = await page.$eval('.region[aria-pressed="true"] span', (item) =>
    Number.parseInt(item.textContent ?? "0", 10),
  );
  checks.ui.worldUnlockedAfterDebug = !lockedWorld;
  checks.ui.unFilterReducesDeck = unDeckSize > 0 && unDeckSize < before;
});
try {
  await page.waitForSelector("canvas", { timeout: 60_000 });
} catch (error) {
  console.error("Map canvas diagnostic", await page.evaluate(() => ({
    h1: document.querySelector("h1")?.textContent,
    diagnostic: document.querySelector(".diagnostic")?.textContent,
    mapStage: Boolean(document.querySelector(".map-stage")),
    body: document.body.textContent?.replace(/\s+/g, " ").trim().slice(0, 800),
  })), { errors });
  throw error;
}
await page.waitForSelector(".target", { timeout: 10_000 });
checks.map = {
  canvas: true,
  target: await page.$eval(".target", (item) => item.textContent),
  noTerritorySelect: !(await page.$("#map-answer-select")),
  keyboardMap: Boolean(await page.$('.map[role="application"][tabindex="0"]')),
  accessibleLiveStatus: await page.$eval(".map-wrap [role=status]", (item) => getComputedStyle(item).display !== "none"),
  keyboardInstructions: await page.$eval(".map-keyboard-hint", (item) => {
    const text = item.textContent ?? "";
    return text.includes("Setas") && text.includes("+") && text.includes("−") && text.includes("Enter");
  }),
  overlay: await page.$eval(".map-target-overlay", (item) => {
    const strong = item.querySelector("strong");
    return Boolean(strong && getComputedStyle(strong).fontSize && parseFloat(getComputedStyle(strong).fontSize) >= 20);
  }),
  countersInBar: await page.$eval(".map-panel .score-box", (item) => item.parentElement?.classList.contains("map-panel") ?? false),
};
checks.map.markerCoverage = await page.evaluate(async () => {
  const report = await fetch("/data/small-entity-markers-report.json").then((response) => response.json());
  const required = ["336", "674", "666", "798", "520", "585", "584", "583", "296", "776", "882"];
  const entities = new Set(report.entities.map((item) => item.id));
  return report.entities.length === 250 &&
    report.zooms.join(",") === "2,3,4,5,6,7,8" &&
    required.every((id) => entities.has(id)) &&
    report.entities.every((entity) => entity.markedParts.every((part) =>
      part.zooms.every((sample) => sample.marker !== sample.contour),
    ));
});
const mapTarget = checks.map.target;
await page.focus('.map[role="application"]');
checks.map.crosshairHiddenBeforeKeyboard = await page.$eval(".map-crosshair", (item) => getComputedStyle(item).opacity === "0");
await page.keyboard.press("ArrowRight");
await page.waitForFunction(() => getComputedStyle(document.querySelector(".map-crosshair")).opacity === "1");
checks.map.crosshairVisibleAfterKeyboard = await page.$eval(".map-crosshair", (item) => getComputedStyle(item).opacity === "1");
await page.mouse.click(640, 360);
await page.waitForFunction(() => getComputedStyle(document.querySelector(".map-crosshair")).opacity === "0");
checks.map.crosshairHiddenAfterMouse = await page.$eval(".map-crosshair", (item) => getComputedStyle(item).opacity === "0");
await page.keyboard.press("Enter");
await new Promise((resolve) => setTimeout(resolve, 500));
await resetPage();

await openFamily("Bandeiras", "Bandeira → nome");
await page.waitForSelector(".quiz-flag");
checks.flags = {
  options: await page.$$eval(".quiz-option", (items) => items.length),
  imageLoaded: await page.$eval(
    ".quiz-flag",
    (image) => image instanceof HTMLImageElement && image.naturalWidth > 0,
  ),
};

await openFamily("Bandeiras", "Nome → bandeira");
checks.flags.nameToFlagWidths = {};
for (const width of [1280, 1920]) {
  await page.setViewport({ width, height: 720 });
  checks.flags.nameToFlagWidths[width] = await page.evaluate(() => {
    const options = [...document.querySelectorAll(".quiz-option")];
    const images = [...document.querySelectorAll(".quiz-option img")];
    return {
      optionWidth: options.every((item) => item.getBoundingClientRect().width >= (innerWidth >= 1920 ? 240 : 160)),
      imageFillsCard: images.length === options.length && images.every((image) => {
        const card = image.parentElement?.getBoundingClientRect();
        const rect = image.getBoundingClientRect();
        return Boolean(card && rect.width >= card.width - 1 && rect.left <= card.left + 1 && rect.right >= card.right - 1);
      }),
    };
  });
}
checks.flags.nameToFlagDimensions = checks.flags.nameToFlagWidths[1280].optionWidth &&
  checks.flags.nameToFlagWidths[1280].imageFillsCard &&
  checks.flags.nameToFlagWidths[1920].optionWidth &&
  checks.flags.nameToFlagWidths[1920].imageFillsCard;
await page.setViewport({ width: 1280, height: 720 });

await openFamily("Capitais", "Clicar no mapa");
await page.waitForSelector("canvas", { timeout: 60_000 });
checks.capitals = {
  map: true,
  prompt: await page.$eval(".target", (item) => item.textContent),
};

await openFamily("Bandeiras", "Escrita · nome do país");
await page.waitForFunction(() => {
  const image = document.querySelector(".quiz-flag");
  return image instanceof HTMLImageElement && image.naturalWidth > 0;
});
checks.writing = {
  input: Boolean(await page.$('input[aria-label="Resposta"]')),
  flag: await page.$eval(".quiz-flag", (image) => image.naturalWidth > 0),
};

let capitalDeckSize = 0;
await openFamily("Capitais", "Escrita · nome da capital", false, async () => {
  await page.click(".region-list .region:nth-child(2)");
  await page.waitForFunction(() =>
    document.querySelector('.region[aria-pressed="true"] span')?.textContent?.includes("cartas"),
  );
  capitalDeckSize = await page.$eval('.region[aria-pressed="true"] span', (item) =>
    Number.parseInt(item.textContent ?? "0", 10),
  );
  const expected = await page.evaluate(async () => {
    const data = await fetch("/data/legacy/catalog.json").then((response) => response.json());
    return Object.values(data.meta).filter(
      (meta) =>
        !meta.absorvido &&
        meta.sub === "Caribbean" &&
        typeof meta.cap === "string" &&
        meta.cap.trim() &&
        !meta.soBandeira,
    ).length;
  });
  checks.ui.capitalDeckParity = capitalDeckSize === expected;
});
checks.capitalWriting = {
  input: Boolean(await page.$('input[aria-label="Resposta"]')),
};
const capitalAnswer = await page.evaluate(async () => {
  const clue = document.querySelector(".quiz-clue")?.textContent?.trim();
  const data = await fetch("/data/legacy/catalog.json").then((response) => response.json());
  const match = Object.values(data.meta).find((meta) =>
    !meta.absorvido && ((meta.pt === clue && typeof meta.cap === "string" && meta.cap.trim()) ||
      (meta.cap === clue && typeof meta.pt === "string" && meta.pt.trim()))
  );
  return match ? (match.pt === clue ? match.cap : match.pt) : "";
});
await page.type('input[aria-label="Resposta"]', capitalAnswer);
try {
  await page.waitForFunction(() => {
    const input = document.querySelector('input[aria-label="Resposta"]');
    return input instanceof HTMLInputElement && !input.disabled && input.value === "";
  }, { timeout: 3_000 });
} catch {
  const state = await page.evaluate(() => {
    const input = document.querySelector('input[aria-label="Resposta"]');
    return {
      clue: document.querySelector(".quiz-clue")?.textContent,
      input: input instanceof HTMLInputElement ? input.value : null,
      disabled: input instanceof HTMLInputElement ? input.disabled : null,
      feedback: document.querySelector('[role="status"]')?.textContent,
    };
  });
  throw new Error(`Escrita exata não autoavançou: ${JSON.stringify({ capitalAnswer, state })}`);
}
checks.writingExactAutoAdvance = Boolean(
  await page.$eval('input[aria-label="Resposta"]', (input) => input.value === "" && !input.disabled),
);
await openFamily("Capitais", "Escrita · nome da capital");
{
  const input = await page.$('input[aria-label="Resposta"]');
  await input.type("resposta-que-nao-existe");
  checks.writingPartialUnlocked = await page.$eval(
    'input[aria-label="Resposta"]',
    (item) => !item.disabled,
  );
  await input.press("Enter");
  await page.waitForFunction(() =>
    document.querySelector('input[aria-label="Resposta"]')?.disabled === true &&
    Boolean(document.querySelector('[role="status"]')?.textContent?.trim()),
  );
  checks.writingEnterIncorrect = await page.$eval(
    '[role="status"]',
    (item) => /correta|Ainda não/i.test(item.textContent ?? ""),
  );
}
await openFamily("Capitais", "Escrita · nome da capital");
await page.type('input[aria-label="Resposta"]', "resposta-por-desfoque");
await page.$eval('input[aria-label="Resposta"]', (input) => input.blur());
await page.waitForFunction(() => document.querySelector('input[aria-label="Resposta"]')?.disabled === true);
checks.writingBlurIncorrect = await page.$eval(
  '[role="status"]',
  (item) => /correta|Ainda não/i.test(item.textContent ?? ""),
);

await openFamily("Bandeiras", "Histórica → nome");
await page.waitForFunction(() => document.querySelectorAll(".quiz-option").length === 4);
checks.historical = {
  options: await page.$$eval(".quiz-option", (items) => items.length),
  flag: await page.$eval(".quiz-flag", (image) => image.naturalWidth > 0),
};

await openFamily("Bandeiras", "Nome → histórica");
await page.waitForFunction(() => document.querySelectorAll(".quiz-option img").length === 4);
checks.historicalInverse = {
  options: await page.$$eval(".quiz-option", (items) => items.length),
  images: await page.$$eval(".quiz-option img", (images) =>
    images.length === 4 && images.every((image) => image.naturalWidth > 0),
  ),
};

await openFamily("Idiomas", "Idioma → países");
await page.waitForFunction(() => document.querySelectorAll(".quiz-option").length === 4);
checks.languages = {
  options: await page.$$eval(".quiz-option", (items) => items.length),
  prompt: await page.$eval(".quiz-clue", (item) => item.textContent),
};

await openFamily("Mapa", "Silhueta");
await page.waitForSelector(".silhouette-frame path", { timeout: 60_000 });
checks.silhouette = {
  path: await page.$eval(".silhouette-frame path", (path) => (path.getAttribute("d") ?? "").length > 20),
  input: Boolean(await page.$('input[aria-label="Resposta"]')),
};
await openFamily("Mapa", "Silhueta · alternativas");
await page.waitForFunction(() => document.querySelectorAll(".quiz-option").length === 4);
checks.silhouetteChoices = {
  path: await page.$eval(".silhouette-frame path", (path) => (path.getAttribute("d") ?? "").length > 20),
  options: await page.$$eval(".quiz-option", (items) => new Set(items.map((item) => item.textContent?.trim())).size),
};

await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("carta-cega", 4);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const transaction = db.transaction(["ledger", "sessions", "unlocks"], "readwrite");
  transaction.objectStore("ledger").put({
    id: "smoke-geometry-credit",
    kind: "credit",
    amount: 20,
    reason: "smoke",
    source: "smoke",
    createdAt: Date.now(),
  });
  for (const id of ["smoke-session", "smoke-session-2"]) {
    transaction.objectStore("sessions").put({
      id,
      source: "smoke",
      rounds: [{ targetId: `${id}-target`, correct: true }],
      complete: true,
      startedAt: Date.now(),
      endedAt: Date.now(),
    });
  }
  transaction.objectStore("unlocks").put({
    id: "travel:travel:pacifico",
    key: "travel:travel:pacifico",
    source: "smoke",
    unlockedAt: Date.now(),
  });
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
});
await gotoHome();
  await page.$eval(".family-grid .family:first-child h3", (item) => item.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Configure a partida"));
await clickButton("Travel");
await page.waitForSelector(".region-list");
await page.click(".region-list .region:not([disabled])");
await clickButton("Começar com");
await page.waitForSelector(".travel-frame path", { timeout: 60_000 });
checks.travel = {
  route: await page.$eval(".travel-frame path", (path) => (path.getAttribute("d") ?? "").length > 20),
  destination: await page.$eval(".travel-destination", (item) => item.textContent),
  input: Boolean(await page.$('input[aria-label="Próximo país"]')),
};
await clickButton("Pista");
const hintedCountry = await page.$eval(".feedback", (item) =>
  item.textContent?.match(/é (.+)\.$/)?.[1] ?? "",
);
if (!hintedCountry) throw new Error("Travel não revelou o próximo intermediário");
const hintedAmbiguous = await page.evaluate(async (hint) => {
  const normalize = (value) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
  const data = await fetch("/data/legacy/catalog.json").then((response) => response.json());
  const candidates = [...new Set(Object.values(data.meta).flatMap((meta) =>
    [meta.pt, meta.en, ...(Array.isArray(meta.al) ? meta.al : [meta.al])]
      .filter(Boolean).map(normalize),
  ))];
  const normalized = normalize(hint);
  return candidates.some((candidate) => candidate !== normalized && candidate.startsWith(normalized));
}, hintedCountry);
await page.type('input[aria-label="Próximo país"]', hintedCountry);
if (hintedAmbiguous) {
  await page.waitForFunction(() => {
    const input = document.querySelector('input[aria-label="Próximo país"]');
    return input instanceof HTMLInputElement && !input.disabled && Boolean(input.value);
  });
  await page.keyboard.press("Enter");
}
await page.waitForFunction(() =>
  document.querySelector(".feedback")?.textContent?.includes("Trecho correto") ||
  document.querySelector(".feedback")?.textContent?.includes("Rota concluída"),
);
checks.travel.typedRule = hintedAmbiguous ? "ambiguous-explicit-commit" : "unique-auto-commit";

checks.mobileFourOption = {};
for (const width of [360, 390]) {
  for (const [family, variant] of [
    ["Bandeiras", "Bandeira → nome"],
    ["Bandeiras", "Nome → bandeira"],
    ["Bandeiras", "Histórica → nome"],
    ["Bandeiras", "Nome → histórica"],
    ["Idiomas", "Idioma → países"],
    ["Mapa", "Silhueta · alternativas"],
  ]) {
    await page.setViewport({ width, height: 640 });
    await openFamily(family, variant, false, undefined, false);
    checks.mobileFourOption[`${width}:${family}:${variant}`] = await page.evaluate(() => {
      const options = [...document.querySelectorAll(".quiz-option")];
      const optionGrid = document.querySelector(".quiz-options");
      const columns = optionGrid
        ? getComputedStyle(optionGrid).gridTemplateColumns.split(" ").filter(Boolean).length
        : 0;
      const withinViewport = [...document.querySelectorAll(".quiz-options, .quiz-prompt, .quiz-option")]
        .filter((item) => item instanceof HTMLElement && item.getBoundingClientRect().width > 0)
        .every((item) => {
          const rect = item.getBoundingClientRect();
          return rect.top >= -1 && rect.bottom <= innerHeight + 1;
        });
      const viewportOffenders = [...document.querySelectorAll(".quiz-options, .quiz-prompt, .quiz-option")]
        .filter((item) => item instanceof HTMLElement && item.getBoundingClientRect().width > 0)
        .filter((item) => {
          const rect = item.getBoundingClientRect();
          return rect.top < -1 || rect.bottom > innerHeight + 1;
        })
        .slice(0, 5)
        .map((item) => ({ tag: item.tagName, text: item.textContent?.slice(0, 24), className: item.className, top: item.getBoundingClientRect().top, bottom: item.getBoundingClientRect().bottom }));
      const targets = options.every((item) => {
        const rect = item.getBoundingClientRect();
        return rect.width >= 44 && rect.height >= 44;
      });
      return {
        twoColumns: columns === 2,
        options: options.length === 4,
        targets,
        withinViewport,
        viewportOffenders,
        noVerticalScroll: document.documentElement.scrollHeight <= innerHeight + 1,
      };
    });
  }
}

checks.mobileConfiguration = {};
for (const [family, variant] of [
  ["Bandeiras", "Nome → bandeira"],
  ["Capitais", "Escrita · nome da capital"],
]) {
  await page.setViewport({ width: 390, height: 844 });
  await gotoHome();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const found = await page.evaluate((label) => {
      const card = [...document.querySelectorAll(".family-grid .family")].find(
        (candidate) => candidate.querySelector("h3")?.textContent?.trim() === label,
      );
      if (!card) return false;
      card.querySelector("h3")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    }, family);
    if (found) break;
    await page.click('button[aria-label="Próximo modo"]');
    await new Promise((resolve) => setTimeout(resolve, 40));
    if (attempt === 3) throw new Error(`Família não encontrada: ${family}`);
  }
  await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Configure a partida"));
  if (variant.includes("Nome")) await clickButton(variant);
  if (variant.includes("Escrita")) await clickButton("Escrita");
  checks.mobileConfiguration[family] = await page.evaluate(() => {
    const title = document.querySelector(".rec-content h1")?.getBoundingClientRect();
    const variantChips = document.querySelectorAll(".variant-chips .chip");
    const regions = document.querySelectorAll(".region-list .region");
    const cta = document.querySelector(".rec-content .button.coral");
    const ctaStyle = cta ? getComputedStyle(cta) : null;
    return {
      compactTitle: Boolean(title && title.width > 0 && title.height > 0 && parseFloat(getComputedStyle(document.querySelector(".rec-content h1")).fontSize) <= 32),
      variantVisible: [...variantChips].every((item) => item.getBoundingClientRect().bottom <= innerHeight),
      regionVisible: [...regions].every((item) => item.getBoundingClientRect().bottom <= innerHeight),
      ctaSticky: Boolean(ctaStyle && (ctaStyle.position === "fixed" || ctaStyle.position === "sticky") && cta.getBoundingClientRect().bottom <= innerHeight && innerHeight - cta.getBoundingClientRect().bottom <= 16),
    };
  });
}

await page.setViewport({ width: 768, height: 720 });
await gotoHome();
await page.waitForSelector(".family-grid");
const carouselPosition = () => page.evaluate(() => {
  const track = document.querySelector(".family-grid.is-carousel");
  const active = document.querySelector(".family-grid .family.active");
  if (!track || !active) return { transform: "none", x: 0, transitionMs: 0 };
  const style = getComputedStyle(track);
  return {
    transform: style.transform,
    x: active.getBoundingClientRect().left,
    tx: style.transform === "none" ? 0 : Number.parseFloat(style.transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,([^,]+)/)?.[1] ?? "0"),
    transitionMs: parseFloat(style.transitionDuration) * 1000,
  };
});
const carouselStart = await carouselPosition();
await page.click('button[aria-label="Próximo modo"]');
await new Promise((resolve) => setTimeout(resolve, 120));
const carouselMid = await carouselPosition();
await new Promise((resolve) => setTimeout(resolve, 100));
const carouselEnd = await carouselPosition();
const carouselSample = {
  intermediate: carouselMid.transform !== carouselStart.transform &&
    carouselMid.transform !== carouselEnd.transform &&
    carouselMid.x !== carouselStart.x && carouselMid.x !== carouselEnd.x,
  transitionMs: carouselMid.transitionMs,
  displacement: Math.abs(carouselEnd.tx - carouselStart.tx),
};
await page.click('.carousel-dots button[aria-label="Ir para família 4"]');
await new Promise((resolve) => setTimeout(resolve, 350));
const carouselWrapStart = await carouselPosition();
await page.click('.carousel-dots button[aria-label="Ir para família 1"]');
await new Promise((resolve) => setTimeout(resolve, 120));
const carouselWrapMid = await carouselPosition();
await new Promise((resolve) => setTimeout(resolve, 100));
const carouselWrapEnd = await carouselPosition();
const carouselWrapSample = {
  intermediate: carouselWrapMid.transform !== carouselWrapStart.transform &&
    carouselWrapMid.transform !== carouselWrapEnd.transform &&
    carouselWrapMid.x !== carouselWrapStart.x && carouselWrapMid.x !== carouselWrapEnd.x,
  transitionMs: carouselWrapMid.transitionMs,
  displacement: Math.abs(carouselWrapEnd.tx - carouselWrapStart.tx),
};
await page.evaluate(() => { document.documentElement.dataset.reducedMotion = "true"; });
const reducedCarousel = await page.evaluate(() => {
  const track = document.querySelector(".family-grid.is-carousel");
  return Boolean(track && parseFloat(getComputedStyle(track).transitionDuration) < 50);
});
await page.evaluate(() => { delete document.documentElement.dataset.reducedMotion; });
checks.carouselMotion = { carouselSample, carouselWrapSample, reducedCarousel };
await page.setViewport({ width: 1920, height: 900 });
await gotoHome();
checks.carouselMeasuredControls = await page.evaluate(() => ({
  controlsHiddenWhenAllVisible: document.querySelectorAll(".carousel-arrow,.carousel-dots").length === 0,
}));

await page.setViewport({ width: 360, height: 720 });
await openFamily("Mapa", "Clicar no mapa");
await page.waitForSelector("canvas", { timeout: 60_000 });
checks.map.mobile360 = await page.evaluate(() => {
  const overlap = (a, b) =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const back = document.querySelector(".map-panel .back")?.getBoundingClientRect();
  const target = document.querySelector(".map-panel .target")?.getBoundingClientRect();
  const score = document.querySelector(".map-panel .score-box")?.getBoundingClientRect();
  const map = document.querySelector(".map-wrap")?.getBoundingClientRect();
  const hudHidden = getComputedStyle(document.querySelector(".map-hud")).display === "none";
  const attribution = Boolean(document.querySelector(".maplibregl-ctrl-attrib"));
  return {
    backScoreOverlap: back && score ? overlap(back, score) : null,
    targetScoreOverlap: target && score ? overlap(target, score) : null,
    select: null,
    mapHeight: map?.height ?? null,
    hudHidden,
    attribution,
    passes: Boolean(
    back && target && score && map &&
    overlap(back, score) === 0 &&
    overlap(target, score) === 0 &&
    map.height >= 360 &&
    hudHidden && attribution
    ),
  };
});
await page.focus('.map[role="application"]');
checks.map.mobileKeyboardFocus = await page.$eval(
  '.map[role="application"]',
  (map) => document.activeElement === map,
);
await page.setViewport({ width: 1280, height: 720 });

for (const [button, heading] of [
  ["Progresso", "Progresso que explica"],
  ["Coleção", "Coleção em camadas"],
  ["Achievements", "Achievements de aprendizagem"],
]) {
  await gotoHome();
  await clickButton(button);
  await page.waitForFunction((text) => document.querySelector("h1")?.textContent?.includes(text), {}, heading);
  await auditContrast(`surface:${button}`);
  checks[button.toLowerCase()] = true;
  if (button === "Coleção") {
    await page.click('[role="tab"]:nth-child(2)');
    await auditContrast("surface:Collection:historical");
    checks.collectionAlbums = await page.evaluate(() => ({
      albums: document.querySelectorAll('[role="tab"]').length >= 2,
      historicalSlots: document.querySelectorAll(".historical-card").length === 200,
      filters: document.querySelectorAll(".collection-filters select").length >= 2,
      counters: [...document.querySelectorAll("h2 small")].some((item) => /\d+\/\d+/.test(item.textContent ?? "")),
    }));
  }
  if (button === "Achievements") {
    checks.achievementSurface = await page.evaluate(() => ({
      total30: /30/.test(document.querySelector(".surface-card h2")?.textContent ?? ""),
      categories6: document.querySelectorAll(".achievement-group").length === 6,
      hiddenState: [...document.querySelectorAll(".achievement")].some((item) => item.textContent?.includes("???")),
      progressOrDate: [...document.querySelectorAll(".achievement")].some((item) => /\/|desbloquead|data/i.test(item.textContent ?? "")),
    }));
  }
}
await gotoHome();
await clickButton("Progresso");
await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Progresso que explica"));
await clickButton("Histórico");
await page.waitForFunction(() =>
  document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.includes("Histórico") &&
  document.querySelector(".history-list, .surface-card .lede"),
);
await auditContrast("surface:Histórico");
checks.histórico = true;

await openFamily("Capitais", "Clicar no mapa");
await page.waitForSelector("canvas", { timeout: 60_000 });
await clickButton("Encerrar sessão");
await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Configure a partida"));
checks.result = await page.evaluate(async () => {
  const request = indexedDB.open("carta-cega");
  const database = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const transaction = database.transaction("sessions", "readonly");
  const records = await new Promise((resolve, reject) => {
    const all = transaction.objectStore("sessions").getAll();
    all.onsuccess = () => resolve(all.result);
    all.onerror = () => reject(all.error);
  });
  database.close();
  const latest = records.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0];
  return latest?.endedAt != null && latest?.complete === false;
});

checks.responsive = {};
for (const width of [320, 375, 768, 1024, 1280, 1440, 1920]) {
  await page.setViewport({ width, height: 800 });
  await gotoHome();
  checks.responsive[width] = await page.evaluate(() => {
    const grid = document.querySelector(".family-carousel")?.getBoundingClientRect();
    const cards = [...document.querySelectorAll(".family")].map((item) => item.getBoundingClientRect());
    const active = document.querySelector(".family.active")?.getBoundingClientRect() ?? cards[0];
    const carousel = matchMedia("(max-width: 899px)").matches;
    return {
      noOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      maxCard: cards.every((rect) => rect.width <= 420 + 1),
      centered: !carousel || Boolean(grid && active && Math.abs((active.left + active.right) / 2 - (grid.left + grid.right) / 2) < 12),
    };
  });
}
await page.setViewport({ width: 1280, height: 720 });

if (
  errors.length ||
  !checks.ui.arrowsDots ||
  !checks.ui.familyCardsHaveNoInteractiveDescendants ||
  !checks.ui.familyCardOpensVariant ||
  !checks.ui.carouselNavigation ||
  !checks.ui.carouselGeometry.activeCentered ||
  !checks.ui.carouselGeometry.symmetricPeeks ||
  !checks.ui.carouselGeometry.arrowsSymmetric ||
  !checks.ui.grid1440 ||
  !checks.ui.regionAcceptance ||
  !checks.ui.unFilterReducesDeck ||
  !checks.ui.idiomasLocked ||
  !checks.ui.debugVisibleInDev ||
  !checks.ui.debugLedgerRefresh.passes ||
  !checks.ui.collectionDebugAbsent ||
  !checks.ui.debugUnlockConfirmed ||
  !checks.ui.singleConfigurationPasses ||
  !checks.ui.blockedVariantSelection ||
  !checks.ui.lastVariantPersistence ||
  !checks.ui.dynamicConfiguration.regions ||
  !checks.ui.dynamicConfiguration.selected ||
  !checks.ui.dynamicConfiguration.counts ||
  !checks.ui.dynamicConfiguration.disabledExplanation ||
  !checks.ui.dynamicConfiguration.countPlacement ||
  !checks.map.canvas ||
   !checks.map.noTerritorySelect ||
   !checks.map.keyboardMap ||
  !checks.map.accessibleLiveStatus ||
  !checks.map.keyboardInstructions ||
  !checks.map.overlay ||
  !checks.map.countersInBar ||
  !checks.map.crosshairHiddenBeforeKeyboard ||
  !checks.map.crosshairVisibleAfterKeyboard ||
  !checks.map.crosshairHiddenAfterMouse ||
  !checks.map.mobile360.passes ||
  !checks.map.mobileKeyboardFocus ||
  checks.flags.options !== 4 ||
  !checks.flags.imageLoaded ||
  !checks.flags.nameToFlagDimensions ||
  !checks.capitals.map ||
  !checks.writing.input ||
  !checks.writing.flag ||
  !checks.writingExactAutoAdvance ||
  !checks.writingPartialUnlocked ||
  !checks.writingEnterIncorrect ||
  !checks.writingBlurIncorrect ||
  !checks.capitalWriting.input ||
  checks.historical.options !== 4 ||
  !checks.historical.flag ||
  checks.historicalInverse.options !== 4 ||
  !checks.historicalInverse.images ||
  checks.languages.options !== 4 ||
  !checks.silhouette.path ||
  !checks.silhouette.input ||
  !checks.silhouetteChoices.path ||
  checks.silhouetteChoices.options !== 4 ||
  !checks.travel.route ||
  !checks.travel.input ||
  !checks.travel.typedRule ||
  Object.values(checks.mobileFourOption).some((item) => !item.twoColumns || !item.options || !item.targets || !item.withinViewport || !item.noVerticalScroll) ||
  Object.values(checks.mobileConfiguration).some((item) => !item.compactTitle || !item.variantVisible || !item.regionVisible || !item.ctaSticky) ||
  !checks.carouselMotion.carouselSample.intermediate ||
  checks.carouselMotion.carouselSample.transitionMs < 250 ||
  !checks.carouselMotion.carouselWrapSample.intermediate ||
  checks.carouselMotion.carouselWrapSample.transitionMs < 250 ||
  Math.abs(checks.carouselMotion.carouselWrapSample.displacement - checks.carouselMotion.carouselSample.displacement) >
    Math.max(24, checks.carouselMotion.carouselSample.displacement * 0.25) ||
  !checks.carouselMotion.reducedCarousel ||
  !checks.carouselMeasuredControls.controlsHiddenWhenAllVisible ||
  checks.gameQuality.some((item) => !item.prompt20 || !item.promptInk || !item.noHint || !item.restartOnlyMenu || !item.optionBaseline || !item.typedControl || !item.flagProportional || !item.reducedMotion) ||
  Object.values(checks.responsive).some((item) => !item.noOverflow || !item.maxCard || !item.centered)
  || !checks.progresso
  || !checks.coleção
  || !checks.achievements
  || !checks.histórico
  || !checks.result
  || !checks.collectionAlbums?.albums
  || !checks.collectionAlbums?.historicalSlots
  || !checks.collectionAlbums?.filters
  || !checks.collectionAlbums?.counters
  || !checks.achievementSurface?.total30
  || !checks.achievementSurface?.categories6
  || !checks.achievementSurface?.hiddenState
  || !checks.achievementSurface?.progressOrDate
  || accessibility.some((item) => item.violations.length)
) {
  throw new Error(JSON.stringify({ checks, accessibility, errors }, null, 2));
}

const nestedButtons = await page.$$eval("button button", (items) => items.length);
if (nestedButtons) throw new Error(`Botões aninhados encontrados: ${nestedButtons}`);

await browser.close();
console.log(JSON.stringify({ checks, accessibility, errors }, null, 2));