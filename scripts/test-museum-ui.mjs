import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const base = process.env.SMOKE_URL ?? "http://127.0.0.1:5000/";
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const localeScript = await page.evaluateOnNewDocument(() => localStorage.setItem("carta-locale", "pt"));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(base, { waitUntil: "networkidle0" });
  const seed = async (amount) => {
    await page.evaluate(async (credit) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("carta-cega", 4);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction("ledger", "readwrite");
        tx.objectStore("ledger").put({ id: "museum-ui:credit", kind: "credit", amount: credit, reason: "test", source: "test", createdAt: 1 });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, amount);
  };
  const openMuseum = async (mobile = false) => {
    const tile = await page.$('[data-tile="collection"]');
    if (mobile) await page.click(".mobile-nav button:nth-child(2)");
    else if (tile) await tile.click();
    else await page.click(`${mobile ? ".mobile-nav" : ".desktop-nav"} button:nth-child(2)`);
    await page.waitForSelector('[data-album="museum"]');
    await page.click('[data-album="museum"]');
    await page.waitForSelector(".museum-hero");
  };
  await openMuseum();
  assert.equal(await page.$eval('[data-action="museum-prepare"]', (button) => button.disabled), true);
  assert.equal(await page.$$eval(".museum-piece img", (images) => images.length), 0, "locked art stays hidden");
  await seed(300000);
  await page.reload({ waitUntil: "networkidle0" });
  await openMuseum();
  await page.click('[data-action="museum-prepare"]');
  await page.waitForSelector('[data-action="museum-confirm"]');
  await page.click('[data-action="museum-cancel"]');
  const before = await page.evaluate(async () => (await import("/src/domain/museum-store.ts")).queryMuseum());
  assert.equal(before.balance, 300000, "cancelling confirmation cannot spend coins");
  await page.click('[data-action="museum-prepare"]');
  await page.click('[data-action="museum-confirm"]');
  await page.waitForSelector('[data-museum-piece="waldseemuller-1507"]');
  await page.waitForFunction(() => document.querySelector(".museum-alert")?.textContent.includes("Peça revelada"));
  const purchased = await page.evaluate(async () => (await import("/src/domain/museum-store.ts")).queryMuseum());
  assert.equal(purchased.balance, 275000);
  assert.deepEqual(purchased.owned, ["waldseemuller-1507"]);
  assert.ok((await page.$eval(".museum", (el) => el.textContent)).includes("75.000"), "next expedition uses growing cost");
  await page.click('[data-museum-piece="waldseemuller-1507"]');
  await page.waitForSelector("dialog.museum-dialog[open]");
  assert.equal(await page.$$eval(".museum-dialog-links a", (links) => links.length), 2);
  assert.equal(await page.$eval(".museum-dialog-image img", (img) => img.complete && img.naturalWidth > 0), true);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog.museum-dialog[open]"));
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-museum-piece") === "waldseemuller-1507");
  await mkdir("screenshots", { recursive: true });
  await page.screenshot({ path: "screenshots/museum-desktop.jpg", fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  await page.screenshot({ path: "screenshots/museum-mobile.jpg", fullPage: true });
  const overflow = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.right > window.innerWidth + 1 && getComputedStyle(el).position !== "fixed";
  }).map((el) => ({ tag: el.tagName, className: el.className, right: el.getBoundingClientRect().right })).slice(0, 15));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `mobile must not overflow horizontally: ${JSON.stringify(overflow)}`);
  await page.addScriptTag({ content: await readFile(require.resolve("axe-core/axe.min.js"), "utf8") });
  const a11y = await page.evaluate(async () => {
    const result = await window.axe.run(".museum", { runOnly: { type: "rule", values: ["color-contrast", "button-name", "image-alt"] } });
    return result.violations.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target) }));
  });
  assert.deepEqual(a11y, [], "museum basic accessibility");
  // Another tab acquires the currently confirmed piece before this tab confirms.
  await page.click('[data-action="museum-prepare"]');
  assert.equal(await page.evaluate(async () => (await import("/src/domain/museum-store.ts")).fundMuseumExpedition("ortelius-1570")), true);
  await page.click('[data-action="museum-confirm"]');
  await page.waitForFunction(() => document.querySelector(".museum-alert")?.textContent.includes("outra aba"));
  assert.equal(await page.$('[data-action="museum-confirm"]'), null, "next artifact requires a fresh confirmation");
  const reconciled = await page.evaluate(async () => (await import("/src/domain/museum-store.ts")).queryMuseum());
  assert.equal(reconciled.balance, 200000);
  assert.equal(reconciled.spent, 100000, "rejected duplicate must not buy the next 200k piece");
  await page.click('[data-action="museum-prepare"]');
  await page.evaluate(() => {
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function(...args) {
      IDBFactory.prototype.open = original;
      throw new Error("Injected storage failure before purchase");
    };
  });
  await page.click('[data-action="museum-confirm"]');
  await page.waitForSelector('[data-action="museum-retry"]');
  await page.click('[data-action="museum-retry"]');
  const afterRetry = await page.evaluate(async () => (await import("/src/domain/museum-store.ts")).queryMuseum());
  assert.equal(afterRetry.balance, 200000, "retry refreshes state and never spends coins");
  assert.equal(await page.$('[data-action="museum-confirm"]'), null);
  await page.click('[data-action="museum-prepare"]');
  await page.click('[data-action="museum-confirm"]');
  await page.waitForSelector(".museum-end");
  assert.equal(await page.$('[data-action="museum-prepare"]'), null, "complete collection cannot spend more");
  await page.reload({ waitUntil: "networkidle0" });
  await openMuseum(true);
  await page.waitForSelector('[data-museum-piece="waldseemuller-1507"]');
  await page.removeScriptToEvaluateOnNewDocument(localeScript.identifier);
  for (const [lang, title] of [["en", "Meridiano Museum"], ["es", "Museo Meridiano"]]) {
    await page.evaluate((value) => localStorage.setItem("carta-locale", value), lang);
    await page.reload({ waitUntil: "networkidle0" });
    await openMuseum(true);
    assert.ok((await page.$eval(".museum h2", (heading) => heading.textContent)).includes(title));
  }
  assert.deepEqual(errors, [], "no browser exceptions");
  console.log("museum UI: confirmation, cancellation, funding, detail, persistence, translations, mobile and accessibility pass");
} finally {
  await browser.close();
}