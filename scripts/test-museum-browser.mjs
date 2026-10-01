import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.SMOKE_URL ?? "http://127.0.0.1:5000/";
const executablePath = process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium";
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle0" });
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("carta-cega");
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("database deletion blocked"));
    });
  });
  await page.reload({ waitUntil: "networkidle0" });

  const firstRun = await page.evaluate(async () => {
    const { fundMuseumExpedition, queryMuseum } = await import("/src/domain/museum-store.ts?museum-integration");
    const { queryEconomy } = await import("/src/domain/economy-store.ts?museum-integration");
    const { exportProgress, importProgress } = await import("/src/domain/progress-backup.ts?museum-integration");
    const { MUSEUM_PIECES } = await import("/src/domain/museum.ts?museum-integration");
    for (const piece of MUSEUM_PIECES) {
      if (!Number.isInteger(piece.cost) || piece.cost <= 0) throw new Error("Invalid museum price");
      if (!piece.sourceUrl.startsWith("https://") || !piece.rightsUrl.startsWith("https://")) throw new Error("Missing museum provenance");
      for (const lang of ["pt", "en", "es"]) {
        if (!piece.text[lang].title || !piece.text[lang].detail || !piece.rights[lang]) throw new Error("Missing museum translation");
      }
      const response = await fetch(piece.image);
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error("Missing museum image");
    }

    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("carta-cega", 4);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const seed = (entries) => new Promise((resolve, reject) => {
      const transaction = db.transaction("ledger", "readwrite");
      for (const entry of entries) transaction.objectStore("ledger").put(entry);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });

    await seed([
      { id: "museum-test:initial-credit", kind: "credit", amount: 24999, reason: "test", source: "test", createdAt: 1 },
      { id: "museum-test:other-debit", kind: "debit", amount: 100, reason: "test", source: "other", createdAt: 2 },
    ]);
    const initially = await queryMuseum();
    const invalid = await fundMuseumExpedition("not-a-museum-piece");
    const insufficient = await fundMuseumExpedition("waldseemuller-1507");
    const afterInsufficient = await queryMuseum();
    await seed([{ id: "museum-test:ordering-credit", kind: "credit", amount: 300000, reason: "test", source: "test", createdAt: 3 }]);
    const skippedExpedition = await fundMuseumExpedition("blue-marble-1972");
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("ledger", "readwrite");
      transaction.objectStore("ledger").delete("museum-test:ordering-credit");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    await seed([{ id: "museum-test:one-coin", kind: "credit", amount: 101, reason: "test", source: "test", createdAt: 3 }]);
    const concurrent = await Promise.all([
      fundMuseumExpedition("waldseemuller-1507"),
      fundMuseumExpedition("waldseemuller-1507"),
    ]);
    const duplicate = await fundMuseumExpedition("waldseemuller-1507");
    const outOfOrder = await fundMuseumExpedition("ortelius-1570");
    const afterFirst = await queryMuseum();
    const economyAfterFirst = await queryEconomy();

    await seed([{ id: "museum-test:second-credit", kind: "credit", amount: 75000, reason: "test", source: "test", createdAt: 4 }]);
    const secondPurchase = await fundMuseumExpedition("ortelius-1570");
    await seed([{ id: "museum-test:third-credit", kind: "credit", amount: 200000, reason: "test", source: "test", createdAt: 5 }]);
    const thirdPurchase = await fundMuseumExpedition("blue-marble-1972");
    const finalSnapshot = await queryMuseum();
    const backup = await exportProgress();
    await importProgress(backup);
    await importProgress(backup);
    const afterReimport = await queryMuseum();
    db.close();
    return {
      initially, invalid, insufficient, afterInsufficient, skippedExpedition, concurrent, duplicate, outOfOrder, afterFirst, afterReimport,
      economyBalance: economyAfterFirst.balance, secondPurchase, thirdPurchase, finalSnapshot, backup,
      backupMuseumUnlocks: backup.stores.unlocks.filter((row) => String(row.id).startsWith("museum:")),
      backupMuseumDebits: backup.stores.ledger.filter((row) => row.source === "museum"),
    };
  });

  assert.deepEqual(firstRun.initially, { balance: 24899, owned: [], nextId: "waldseemuller-1507", spent: 0 });
  assert.equal(firstRun.invalid, false);
  assert.equal(firstRun.insufficient, false);
  assert.equal(firstRun.skippedExpedition, false, "cannot skip expeditions even with enough coins");
  assert.deepEqual(firstRun.afterInsufficient, firstRun.initially, "an insufficient purchase writes neither debit nor unlock");
  assert.deepEqual(firstRun.concurrent.sort(), [false, true], "simultaneous attempts at one piece must only debit once");
  assert.equal(firstRun.duplicate, false);
  assert.equal(firstRun.outOfOrder, false);
  assert.deepEqual(firstRun.afterFirst, { balance: 0, owned: ["waldseemuller-1507"], nextId: "ortelius-1570", spent: 25000 });
  assert.equal(firstRun.economyBalance, firstRun.afterFirst.balance, "museum purchases share, rather than replace, the game ledger");
  assert.equal(firstRun.secondPurchase, true);
  assert.equal(firstRun.thirdPurchase, true);
  assert.deepEqual(firstRun.finalSnapshot, {
    balance: 0,
    owned: ["waldseemuller-1507", "ortelius-1570", "blue-marble-1972"],
    nextId: null,
    spent: 300000,
  });
  assert.deepEqual(firstRun.afterReimport, firstRun.finalSnapshot, "reimporting backup twice cannot duplicate museum charges or ownership");
  assert.deepEqual(firstRun.backupMuseumUnlocks.map((row) => row.id).sort(), [
    "museum:blue-marble-1972",
    "museum:ortelius-1570",
    "museum:waldseemuller-1507",
  ]);
  assert.equal(firstRun.backupMuseumDebits.length, 3, "backup export retains each museum debit");
  assert.ok(firstRun.backupMuseumDebits.every((row) => row.reason === "museum-expedition"));
  assert.deepEqual(firstRun.backupMuseumDebits.map((row) => row.id).sort(), [
    "purchase:museum:blue-marble-1972",
    "purchase:museum:ortelius-1570",
    "purchase:museum:waldseemuller-1507",
  ]);

  await page.reload({ waitUntil: "networkidle0" });
  const afterReload = await page.evaluate(async () => {
    const { queryMuseum, fundMuseumExpedition } = await import("/src/domain/museum-store.ts?museum-persistence");
    return { snapshot: await queryMuseum(), repeat: await fundMuseumExpedition("blue-marble-1972") };
  });
  assert.deepEqual(afterReload.snapshot, firstRun.finalSnapshot, "purchases persist across page reload");
  assert.equal(afterReload.repeat, false);

  const restored = await page.evaluate(async (backup) => {
    localStorage.clear();
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("carta-cega");
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("database deletion blocked"));
    });
    const { importProgress, exportProgress } = await import("/src/domain/progress-backup.ts?museum-fresh-restore");
    const { queryMuseum } = await import("/src/domain/museum-store.ts?museum-fresh-restore");
    await importProgress(backup);
    await importProgress(backup);
    return { museum: await queryMuseum(), backup: await exportProgress() };
  }, firstRun.backup);
  assert.deepEqual(restored.museum, firstRun.finalSnapshot, "a fresh database restores museum purchases from backup");
  assert.equal(restored.backup.stores.ledger.filter((row) => row.source === "museum").length, 3);
  assert.equal(restored.backup.stores.unlocks.filter((row) => String(row.id).startsWith("museum:")).length, 3);

  const purchaseRace = await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("carta-cega");
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("database deletion blocked"));
    });
    const { exportProgress } = await import("/src/domain/progress-backup.ts?museum-export-race");
    const { fundMuseumExpedition, queryMuseum } = await import("/src/domain/museum-store.ts?museum-export-race");
    await exportProgress();
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("carta-cega", 4);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("ledger", "readwrite");
      transaction.objectStore("ledger").put({
        id: "museum-race:credit", kind: "credit", amount: 25000, reason: "test", source: "test", createdAt: 1,
      });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();

    const [backup, purchased] = await Promise.all([
      exportProgress(),
      fundMuseumExpedition("waldseemuller-1507"),
    ]);
    const hasUnlock = backup.stores.unlocks.some((row) => row.id === "museum:waldseemuller-1507");
    const hasDebit = backup.stores.ledger.some((row) => row.id === "purchase:museum:waldseemuller-1507");
    return { purchased, hasUnlock, hasDebit, final: await queryMuseum() };
  });
  assert.equal(purchaseRace.purchased, true);
  assert.equal(purchaseRace.hasUnlock, purchaseRace.hasDebit, "an export racing a purchase must include both ownership and its debit, or neither");
  assert.deepEqual(purchaseRace.final.owned, ["waldseemuller-1507"]);
  assert.equal(purchaseRace.final.balance, 0);

  await browser.close();
  console.log("museum browser integration: ok");
} catch (error) {
  await browser.close();
  throw error;
}