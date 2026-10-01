import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.SMOKE_URL ?? "http://127.0.0.1:5000/";
const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.createBrowserContext();
const errors = [];

try {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluateOnNewDocument(() => localStorage.setItem("carta-locale", "pt"));
  await page.goto(baseUrl, { waitUntil: "networkidle0" });

  // The context is a fresh browser profile; seed only purchase currency, then buy the real unlock in the UI.
  await page.evaluate(async () => {
    const request = indexedDB.deleteDatabase("carta-cega");
    await new Promise((resolve, reject) => {
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("fresh UI test profile database was blocked"));
    });
    await (await import("/src/domain/economy-store.ts?bot-ranking-ui-setup")).initializeEconomy();
    const database = await new Promise((resolve, reject) => {
      const open = indexedDB.open("carta-cega", 4);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("ledger", "readwrite");
      transaction.objectStore("ledger").put({
        id: "bot-ranking-ui:credit", kind: "credit", amount: 5_000,
        reason: "test-profile-funding", source: "test", createdAt: Date.now(),
      });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".hub-content");
  await page.click(".section-label.with-cta .mode-switch button:nth-child(2)");
  await page.waitForSelector("#arena-mapas");

  // Follow the rendered arena flow to its bot shortcut. Search may either enter the queue or
  // fail offline; both states expose the real "play a bot" action.
  await page.click("#arena-mapas .ar-go");
  await page.waitForSelector(".pvp-offer.is-dialog");
  await page.type('.pvp-offer input[type="search"]', "Ranking UI Test");
  await page.click('.pvp-offer button[type="submit"]');
  await page.waitForFunction(() =>
    document.querySelector("#arena-mapas .ar-foot-search .ar-go")
    || document.querySelector("#arena-mapas .ar-search-err button"),
  { timeout: 30_000 });
  const botShortcut = await page.evaluate(() =>
    document.querySelector("#arena-mapas .ar-foot-search .ar-go")
      ? "#arena-mapas .ar-foot-search .ar-go"
      : document.querySelector("#arena-mapas .ar-search-err button")
        ? "#arena-mapas .ar-search-err button"
        : null,
  );
  if (!botShortcut) throw new Error("arena did not expose its bot duel action");
  await page.click(botShortcut);
  try { await page.waitForSelector(".rv-card", { timeout: 15_000 }); } catch {
    const state = await page.evaluate((selector) => ({
      text: document.body.innerText.slice(0, 2_000),
      url: location.href,
      clicked: document.querySelector(selector)?.outerHTML,
      overlays: [...document.querySelectorAll(".pvp-offer")].map((element) => ({ text: element.innerText, display: getComputedStyle(element).display, rect: element.getBoundingClientRect().toJSON() })),
      buttons: [...document.querySelectorAll("#arena-mapas button")].map((button) => ({ text: button.innerText, disabled: button.disabled, cls: button.className })),
    }), botShortcut);
    throw new Error(`bot action did not open duel reveal: ${JSON.stringify(state)}; page errors: ${errors.join(" | ")}`);
  }

  const queryEconomy = () => page.evaluate(async () => (await import("/src/domain/economy-store.ts?bot-ranking-ui")).queryEconomy());
  const loadBotRanking = () => page.evaluate(async () => (await import("/src/domain/bot-ranking-store.ts?bot-ranking-ui")).loadBotRanking());
  const listDuels = () => page.evaluate(async () => (await import("/src/domain/duel-store.ts?bot-ranking-ui")).listDuels());
  const unlockedBefore = await queryEconomy();
  assert.equal(unlockedBefore.unlocked.includes("rounds:20"), false, "fresh profile starts without the long-round unlock");

  const before = await loadBotRanking();
  const beforeUnlocked = await queryEconomy();
  assert.equal(beforeUnlocked.balance, 5_000);
  await page.click(".rv-go");
  await page.waitForFunction(() => document.querySelector(".rv-go")?.textContent.includes("Começar duelo"));
  const afterUnlock = await queryEconomy();
  assert.ok(afterUnlock.unlocked.includes("rounds:20"), "the reveal action purchases rounds:20 through the app flow");
  assert.equal(afterUnlock.balance, 2_000);
  await page.click(".rv-go");
  await page.waitForSelector(".gs");

  // Exit through the game's leave confirmation; this exercises the app's actual abandon/conclude path.
  await page.click(".gs-x");
  await page.waitForSelector('[role="alertdialog"]');
  await page.click(".leave-quit");
  await page.waitForSelector(".dr-card", { timeout: 30_000 });
  await page.waitForFunction(async () => {
    const { listDuels } = await import("/src/domain/duel-store.ts?bot-ranking-ui-result");
    return (await listDuels()).length === 1;
  }, { timeout: 30_000 });

  const settled = await page.evaluate(async () => {
    const [{ listDuels }, { loadBotRanking }, { queryEconomy }] = await Promise.all([
      import("/src/domain/duel-store.ts?bot-ranking-ui-settled"),
      import("/src/domain/bot-ranking-store.ts?bot-ranking-ui-settled"),
      import("/src/domain/economy-store.ts?bot-ranking-ui-settled"),
    ]);
    return {
      duels: await listDuels(),
      ranking: await loadBotRanking(),
      economy: await queryEconomy(),
    };
  });
  assert.equal(settled.duels.length, 1, "one actual abandoned run is persisted exactly once");
  const duel = settled.duels[0];
  assert.equal(duel.abandoned, true);
  assert.equal(duel.playerCorrect, 0);
  assert.equal(duel.delta, 0, "the player starts at zero trophies and cannot lose below zero");
  assert.equal(duel.outcome, "loss");
  assert.ok(duel.botCorrect > 0, "the bot wins the unplayed rounds");
  const playerBefore = before.bots[duel.ladder][duel.botId];
  const botAfter = settled.ranking.bots[duel.ladder][duel.botId];
  assert.equal(botAfter.matches, playerBefore.matches + 1, "the real duel increments bot matches once");
  assert.ok(botAfter.trophies > playerBefore.trophies, "bot trophy settlement is independent of the player's zero delta");

  await page.setViewport({ width: 390, height: 844 });
  const resultOverflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    innerWidth,
    offenders: [...document.querySelectorAll("body *")].filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.right > innerWidth + 1 && getComputedStyle(element).position !== "fixed";
    }).slice(0, 12).map((element) => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right })),
  }));
  assert.ok(resultOverflow.width <= resultOverflow.innerWidth, `abandon result overflows at 390px: ${JSON.stringify(resultOverflow.offenders)}`);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".hub-content");
  const reloaded = await page.evaluate(async () => {
    const [{ listDuels }, { loadBotRanking }] = await Promise.all([
      import("/src/domain/duel-store.ts?bot-ranking-ui-reload"),
      import("/src/domain/bot-ranking-store.ts?bot-ranking-ui-reload"),
    ]);
    return { duels: await listDuels(), ranking: await loadBotRanking() };
  });
  assert.equal(reloaded.duels.length, 1, "reload does not duplicate the duel record");
  assert.deepEqual(reloaded.ranking, settled.ranking, "reload preserves exactly the same bot ranking state");

  await page.click(".section-label.with-cta .mode-switch button:nth-child(2)");
  await page.waitForSelector("#arena-mapas");
  await page.click(".hub-rank");
  await page.waitForSelector(".lg-page");
  const visibleTrophies = await page.evaluate(async (botId, ladder, expected) => {
    const { botById } = await import("/src/domain/bots.ts?bot-ranking-ui-league");
    const bot = botById(botId);
    const row = [...document.querySelectorAll(".lg-bot")].find((item) => item.textContent.includes(bot.name));
    if (!row) return { found: false, expected };
    const trophyLine = row.querySelectorAll(".pr-rname small")[1]?.textContent ?? "";
    const displayed = Number(trophyLine.replace(/\D/g, ""));
    return { found: true, displayed, expected, ladder: document.querySelector(".pg-hero")?.getAttribute("data-ladder") };
  }, duel.botId, duel.ladder, botAfter.trophies);
  assert.equal(visibleTrophies.found, true, "League screen visibly lists the settled bot");
  assert.equal(visibleTrophies.ladder, duel.ladder);
  assert.equal(visibleTrophies.displayed, visibleTrophies.expected, "visible bot trophies match the persisted ranking");
  const leagueOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  assert.equal(leagueOverflow, true, "League screen does not overflow horizontally at 390px");
  assert.deepEqual(errors, [], "browser flow has no uncaught page errors");
  console.log("bot ranking UI: purchase, actual abandoned duel, persistence, league display and 390px layout verified");
} finally {
  await context.close();
  await browser.close();
}