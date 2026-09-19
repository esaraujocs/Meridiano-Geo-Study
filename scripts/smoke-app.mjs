import puppeteer from "puppeteer-core";

const baseUrl = process.env.SMOKE_URL ?? "http://127.0.0.1:5000/";
const executablePath =
  process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium";

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

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

async function openFamily(family, variant, world = false, beforeStart) {
  await page.goto(baseUrl, { waitUntil: "networkidle0" });
  await clickButton(family === "Mapa" ? "Abrir Mapa" : family === "Bandeiras" ? "Abrir Bandeiras" : family === "Capitais" ? "Abrir Capitais" : "Abrir Idiomas");
  await page.waitForFunction(
    () => document.querySelector("h1")?.textContent?.includes("Como"),
  );
  if (family === "Bandeiras" && (variant.includes("Bandeira") || variant.toLowerCase().includes("histórica"))) {
    await clickButton(variant);
    await clickButton(variant.includes("Bandeira") ? "Começar Atuais" : "Começar Históricas");
  } else if (family === "Bandeiras" && variant.includes("Escrita")) {
    await clickButton("Começar Escrita");
  } else {
    await clickButton(variant);
  }
  await page.waitForSelector(".region-list");
  if (!checks.ui.regionControls) {
    checks.ui.regionControls = (await page.$$eval(".region-list .region", (items) => items.length)) === 8;
  }
  if (variant.includes("Histórica") || variant.includes("histórica")) {
    const deckSize = await page.$eval(".deck-line b", (item) =>
      Number.parseInt(item.textContent ?? "0", 10),
    );
    if (!(deckSize > 0)) throw new Error("Baralho histórico não foi pré-carregado");
  }
  if (world) await page.click(".region-list .region:first-child");
  if (beforeStart) await beforeStart();
  await clickButton("Começar com");
}

const checks = {};

await page.goto(baseUrl, { waitUntil: "networkidle0" });
checks.ui = await page.evaluate(() => {
  const familyGrid = document.querySelector(".family-grid");
  const idiomas = [...document.querySelectorAll(".family")].find((item) =>
    item.querySelector("h3")?.textContent?.includes("Idiomas"),
  );
  return {
    carousel1280: getComputedStyle(familyGrid).display === "flex",
    nativeScrollbarHidden: getComputedStyle(familyGrid).scrollbarWidth === "none",
    idiomasFree: Boolean(idiomas && !idiomas.classList.contains("locked")),
    arrowsDots: document.querySelectorAll(".carousel-arrow").length === 2 &&
      document.querySelectorAll(".carousel-dots button").length === 4,
  };
});
await page.click('button[aria-label="Próxima família"]');
await page.waitForFunction(
  () =>
    document.querySelector(".family.active h3")?.textContent === "Bandeiras" &&
    document.querySelector('.carousel-dots button[aria-current="true"]')
      ?.getAttribute("aria-label") === "Ir para família 2",
);
checks.ui.carouselNavigation = await page.evaluate(() => {
  const cards = [...document.querySelectorAll(".family-grid > .family")];
  return (
    cards[0]?.getAttribute("aria-hidden") === "true" &&
    cards[1]?.getAttribute("aria-hidden") !== "true" &&
    cards[0]?.hasAttribute("inert")
  );
});
await page.click('.carousel-dots button[aria-label="Ir para família 1"]');
await page.waitForFunction(
  () => document.querySelector(".family.active h3")?.textContent === "Mapa",
);
await page.click('button[aria-label="Abrir opções"]');
checks.ui.debugHiddenWithoutOptIn = !(await page.$eval(".options-popover", (item) => item.textContent?.includes("Conceder 10 moedas") ?? false));
await page.goto(`${baseUrl}?debug-coins=1`, { waitUntil: "networkidle0" });
await page.click('button[aria-label="Abrir opções"]');
checks.ui.debugVisibleWithOptIn = await page.$eval(".options-popover", (item) => item.textContent?.includes("Conceder 10 moedas") ?? false);
await clickButton("Conceder 10 moedas");
await page.waitForFunction(() => document.querySelector(".pill")?.textContent?.includes("10 moedas"));
checks.ui.debugLedgerRefresh = true;
await clickButton("Abrir Bandeiras");
await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Como"));
checks.ui.bandeiraCards = (await page.$$eval(".family h3", (items) =>
  items.filter((item) => ["Atuais", "Históricas"].includes(item.textContent ?? "") || item.textContent?.includes("Escrita")).length,
)) === 3;
await page.goto(baseUrl, { waitUntil: "networkidle0" });
await page.setViewport({ width: 1440, height: 900 });
checks.ui.grid1440 = await page.$eval(
  ".family-grid",
  (item) => getComputedStyle(item).display === "grid",
);
await page.setViewport({ width: 1280, height: 720 });

let unDeckSize = 0;
await openFamily("Mapa", "Clicar no mapa", false, async () => {
  const lockedWorld = await page.$eval(
    ".region-list .region:first-child",
    (item) => item.textContent?.includes("3 moedas"),
  );
  const before = await page.$eval(".deck-line b", (item) =>
    Number.parseInt(item.textContent ?? "0", 10),
  );
  await page.$eval('.config-details input[type="checkbox"]', (input) => input.click());
  await page.waitForFunction(
    (previous) =>
      Number.parseInt(document.querySelector(".deck-line b")?.textContent ?? "0", 10) <
      previous,
    {},
    before,
  );
  unDeckSize = await page.$eval(".deck-line b", (item) =>
    Number.parseInt(item.textContent ?? "0", 10),
  );
  checks.ui.lockedWorld = lockedWorld;
  checks.ui.unFilterReducesDeck = unDeckSize > 0 && unDeckSize < before;
});
await page.waitForSelector("canvas", { timeout: 60_000 });
await page.waitForSelector(".target", { timeout: 10_000 });
checks.map = {
  canvas: true,
  target: await page.$eval(".target", (item) => item.textContent),
  deckParity:
    (await page.$eval("#map-answer-select", (select) => select.options.length - 1)) ===
    unDeckSize,
};
const mapTarget = checks.map.target;
const mapAnswer = await page.$eval(
  "#map-answer-select",
  (select, targetName) => {
    const option = [...select.options].find(
      (item) => item.textContent?.trim() === targetName?.trim(),
    );
    if (!option) throw new Error(`Território não encontrado na lista: ${targetName}`);
    return option.value;
  },
  mapTarget,
);
await page.select("#map-answer-select", mapAnswer);
await page.waitForFunction(() =>
  document.querySelector('[role="status"]')?.textContent?.includes("Acerto"),
);
checks.map.keyboard = true;

await openFamily("Bandeiras", "Bandeira → nome");
await page.waitForSelector(".quiz-flag");
checks.flags = {
  options: await page.$$eval(".quiz-option", (items) => items.length),
  imageLoaded: await page.$eval(
    ".quiz-flag",
    (image) => image instanceof HTMLImageElement && image.naturalWidth > 0,
  ),
};

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
  capitalDeckSize = await page.$eval(".deck-line b", (item) =>
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
await page.goto(baseUrl, { waitUntil: "networkidle0" });
await clickButton("Abrir Mapa");
await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Como"));
await clickButton("Travel");
await page.waitForSelector(".region-list");
await page.click(".region-list .region:nth-child(3)");
await clickButton("Começar com");
await page.waitForSelector(".travel-frame path", { timeout: 60_000 });
checks.travel = {
  route: await page.$eval(".travel-frame path", (path) => (path.getAttribute("d") ?? "").length > 20),
  destination: await page.$eval(".travel-destination", (item) => item.textContent),
  input: Boolean(await page.$('input[aria-label="Próximo país"]')),
};

for (const [button, heading] of [
  ["Progresso", "Progresso que explica"],
  ["Coleção", "Coleção em camadas"],
  ["Conquistas", "Conquistas de aprendizagem"],
  ["Histórico", "Histórico de sessões"],
]) {
  await page.goto(baseUrl, { waitUntil: "networkidle0" });
  await clickButton(button);
  await page.waitForFunction((text) => document.querySelector("h1")?.textContent?.includes(text), {}, heading);
  checks[button.toLowerCase()] = true;
}

await openFamily("Capitais", "Clicar no mapa");
await page.waitForSelector("canvas", { timeout: 60_000 });
await clickButton("Encerrar sessão");
await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Sessão encerrada"));
checks.result = true;

if (
  errors.length ||
  !checks.ui.carousel1280 ||
  !checks.ui.nativeScrollbarHidden ||
  !checks.ui.arrowsDots ||
  !checks.ui.carouselNavigation ||
  !checks.ui.grid1440 ||
  !checks.ui.idiomasFree ||
  !checks.ui.debugHiddenWithoutOptIn ||
  !checks.ui.debugVisibleWithOptIn ||
  !checks.ui.debugLedgerRefresh ||
  !checks.ui.bandeiraCards ||
  !checks.ui.regionControls ||
  !checks.ui.lockedWorld ||
  !checks.ui.unFilterReducesDeck ||
  !checks.ui.capitalDeckParity ||
  !checks.map.canvas ||
  !checks.map.deckParity ||
  checks.flags.options !== 4 ||
  !checks.flags.imageLoaded ||
  !checks.capitals.map ||
  !checks.writing.input ||
  !checks.writing.flag ||
  !checks.capitalWriting.input ||
  checks.historical.options !== 4 ||
  !checks.historical.flag ||
  checks.historicalInverse.options !== 4 ||
  !checks.historicalInverse.images ||
  checks.languages.options !== 4 ||
  !checks.silhouette.path ||
  !checks.silhouette.input ||
  !checks.travel.route ||
  !checks.travel.input
  || !checks.progresso
  || !checks.coleção
  || !checks.conquistas
  || !checks.histórico
  || !checks.result
) {
  throw new Error(JSON.stringify({ checks, errors }, null, 2));
}

const nestedButtons = await page.$$eval("button button", (items) => items.length);
if (nestedButtons) throw new Error(`Botões aninhados encontrados: ${nestedButtons}`);

await browser.close();
console.log(JSON.stringify({ checks, errors }, null, 2));