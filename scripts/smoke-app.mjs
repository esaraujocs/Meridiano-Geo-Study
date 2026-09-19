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
    if (!button) throw new Error(`Botão não encontrado: ${text}`);
    button.click();
  }, label);
}

async function openFamily(family, variant, world = false) {
  await page.goto(baseUrl, { waitUntil: "networkidle0" });
  await clickButton(family);
  await page.waitForFunction(
    () => document.querySelector("h1")?.textContent?.includes("Como"),
  );
  await clickButton(variant);
  await page.waitForSelector(".region-list");
  if (world) await page.click(".region-list .region:first-child");
  await clickButton("Abrir sessão");
}

const checks = {};

await openFamily("Mapa", "Localizar no mapa");
await page.waitForSelector("canvas", { timeout: 60_000 });
await page.waitForSelector(".target", { timeout: 10_000 });
checks.map = {
  canvas: true,
  target: await page.$eval(".target", (item) => item.textContent),
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

await openFamily("Capitais", "Capital → país");
await page.waitForSelector(".quiz-options");
checks.capitals = {
  options: await page.$$eval(".quiz-option", (items) => items.length),
  prompt: await page.$eval(".quiz-clue", (item) => item.textContent),
};

await openFamily("Escrita", "Escrita → país");
checks.writing = {
  input: Boolean(await page.$('input[aria-label="Resposta"]')),
  flag: await page.$eval(".quiz-flag", (image) => image.naturalWidth > 0),
};

await openFamily("Históricas", "Bandeira histórica → nome");
await page.waitForFunction(() => document.querySelectorAll(".quiz-option").length === 4);
checks.historical = {
  options: await page.$$eval(".quiz-option", (items) => items.length),
  flag: await page.$eval(".quiz-flag", (image) => image.naturalWidth > 0),
};

await openFamily("Históricas", "Nome → bandeira histórica");
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

await openFamily("Silhueta", "Silhueta");
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
await clickButton("Travel");
await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Como"));
await clickButton("Travel");
await page.waitForSelector(".region-list");
await page.click(".region-list .region:nth-child(3)");
await clickButton("Abrir sessão");
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

await openFamily("Capitais", "Capital → país");
await page.waitForSelector(".quiz-option");
await page.click(".quiz-option");
await clickButton("Encerrar sessão");
await page.waitForFunction(() => document.querySelector("h1")?.textContent?.includes("Sessão encerrada"));
checks.result = true;

await browser.close();

if (
  errors.length ||
  !checks.map.canvas ||
  checks.flags.options !== 4 ||
  !checks.flags.imageLoaded ||
  checks.capitals.options !== 4 ||
  !checks.writing.input ||
  !checks.writing.flag ||
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

console.log(JSON.stringify({ checks, errors }, null, 2));