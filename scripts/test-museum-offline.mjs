import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";

// Servidor temporário do build, encerrado ao terminar o teste.
const server = spawn("node_modules/.bin/vite", ["preview", "--host", "127.0.0.1", "--port", "5101"], { stdio: "ignore" });
let browser;
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await fetch("http://127.0.0.1:5101/").then((r) => r.ok).catch(() => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium",
    headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.evaluateOnNewDocument(() => localStorage.setItem("carta-locale", "pt"));
  await page.goto("http://127.0.0.1:5101/", { waitUntil: "networkidle0" });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    await new Promise((resolve) => {
      if (navigator.serviceWorker.controller) resolve();
      else navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
    });
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("carta-cega", 4);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("ledger", "readwrite");
      tx.objectStore("ledger").put({ id: "museum-offline:credit", kind: "credit", amount: 300000, reason: "test", source: "test", createdAt: 1 });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    for (const name of ["waldseemuller-1507", "ortelius-1570", "blue-marble-1972"]) {
      if (!await caches.match(`/museum/${name}.jpg`)) throw new Error(`Museum image missing from offline cache: ${name}`);
    }
  });
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: "networkidle0" });
  await page.click(".mobile-nav button:nth-child(2)");
  await page.waitForSelector('[data-album="museum"]');
  await page.click('[data-album="museum"]');
  for (const id of ["waldseemuller-1507", "ortelius-1570", "blue-marble-1972"]) {
    await page.waitForSelector('[data-action="museum-prepare"]');
    await page.click('[data-action="museum-prepare"]');
    await page.click('[data-action="museum-confirm"]');
    await page.waitForSelector(`[data-museum-piece="${id}"]`);
    await page.waitForFunction(() => !document.querySelector('[data-action="museum-prepare"]')?.disabled);
    await page.click(`[data-museum-piece="${id}"]`);
    await page.waitForSelector("dialog.museum-dialog[open]");
    await page.waitForFunction(() => {
      const image = document.querySelector(".museum-dialog-image img");
      return image?.complete && image.naturalWidth > 0;
    });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("dialog.museum-dialog[open]"));
  }
  assert.ok(await page.$(".museum-end"), "offline purchases complete collection");
  await page.click(".mobile-nav button:first-child");
  await page.waitForSelector(".hub-coin strong");
  assert.equal(await page.$eval(".hub-coin strong", (el) => el.textContent), "0", "main balance refreshes after museum purchases");
  console.log("museum production offline: cached app, all three purchases and artifact images, balance refresh pass");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}