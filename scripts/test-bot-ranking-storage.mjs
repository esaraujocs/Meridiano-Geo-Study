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
  const result = await page.evaluate(async () => {
    const deleteDatabase = async () => new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("carta-cega");
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("database deletion blocked"));
    });
    const readPreference = async (id) => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("carta-cega", 4);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const request = database.transaction("preferences", "readonly").objectStore("preferences").get(id);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      } finally { database.close(); }
    };
    const snapshotStores = async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("carta-cega", 4);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const transaction = database.transaction(["preferences", "state"], "readonly");
          const snapshot = {};
          for (const name of ["preferences", "state"]) {
            const request = transaction.objectStore(name).getAll();
            request.onsuccess = () => { snapshot[name] = request.result; };
          }
          transaction.oncomplete = () => resolve(snapshot);
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } finally { database.close(); }
    };
    const writePreference = async (row) => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("carta-cega", 4);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise((resolve, reject) => {
          const transaction = database.transaction("preferences", "readwrite");
          transaction.objectStore("preferences").put(row);
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } finally { database.close(); }
    };
    const deletePreference = async (id) => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("carta-cega", 4);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise((resolve, reject) => {
          const transaction = database.transaction("preferences", "readwrite");
          transaction.objectStore("preferences").delete(id);
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } finally { database.close(); }
    };
    await deleteDatabase();

    const { loadBotRanking } = await import("/src/domain/bot-ranking-store.ts?ranking-storage-test");
    const { saveDuel, listDuels } = await import("/src/domain/duel-store.ts?ranking-storage-test");
    const { exportProgress, importProgress } = await import("/src/domain/progress-backup.ts?ranking-storage-test");
    const { BOT_RANKING_ID } = await import("/src/domain/bot-ranking.ts?ranking-storage-test");
    const dayMs = 86_400_000;
    const now = Date.now();
    const record = (sessionId) => ({
      id: `duel:${sessionId}`, sessionId, at: now, botId: "bot-bronze-0", ladder: "mapas",
      family: "map", variant: "", playerCorrect: 8, total: 10, botCorrect: 6,
      outcome: "win", tiebreak: false, delta: 20,
    });

    const missingMmr = record("ranking-missing-mmr");
    let rejectedMissingMmr = false;
    try { await saveDuel(missingMmr); } catch (error) {
      rejectedMissingMmr = /pre-match MMR/.test(String(error));
    }
    if (!rejectedMissingMmr) throw new Error("new duels without pre-match MMR must fail explicitly");
    if (await readPreference(missingMmr.id) !== undefined || await readPreference(BOT_RANKING_ID) !== undefined) {
      throw new Error("a rejected duel must atomically write neither record nor ranking");
    }

    const { createBotRanking, MAX_SIMULATION_DAYS } = await import("/src/domain/bot-ranking.ts?ranking-storage-invalid-date-test");
    const emptyBackup = await exportProgress();
    const negative = { ...createBotRanking(Math.floor(now / dayMs)), lastDay: -1 };
    const beforeNegativeImport = await snapshotStores();
    let rejectedNegativeImport = false;
    try {
      await importProgress({
        ...emptyBackup,
        stores: { ...emptyBackup.stores, preferences: [...emptyBackup.stores.preferences, negative] },
      });
    } catch (error) { rejectedNegativeImport = /lastDay/.test(String(error)); }
    if (!rejectedNegativeImport) throw new Error("backup import must reject a negative bot ranking lastDay");
    if (JSON.stringify(await snapshotStores()) !== JSON.stringify(beforeNegativeImport)) {
      throw new Error("rejecting a negative imported ranking must perform no database writes");
    }

    await writePreference(negative);
    const beforeNegativeLoad = await snapshotStores();
    let rejectedNegativeLoad = false;
    try { await loadBotRanking(now); } catch (error) { rejectedNegativeLoad = /lastDay/.test(String(error)); }
    if (!rejectedNegativeLoad) throw new Error("loading a negative bot ranking lastDay must reject");
    if (JSON.stringify(await snapshotStores()) !== JSON.stringify(beforeNegativeLoad)) {
      throw new Error("a rejected negative-day load must perform no database writes");
    }
    await deletePreference(BOT_RANKING_ID);

    const dayZero = createBotRanking(0);
    await writePreference(dayZero);
    const beforeLongCatchup = await snapshotStores();
    let rejectedLongCatchup = false;
    try { await loadBotRanking((MAX_SIMULATION_DAYS + 1) * dayMs); } catch (error) {
      rejectedLongCatchup = /ten years|catch-up/i.test(String(error));
    }
    if (!rejectedLongCatchup) throw new Error("loading day 0 beyond the 3650-day catch-up cap must reject");
    if (JSON.stringify(await snapshotStores()) !== JSON.stringify(beforeLongCatchup)) {
      throw new Error("a rejected long catch-up must perform no database writes");
    }
    await deletePreference(BOT_RANKING_ID);

    const initial = await loadBotRanking(now);
    const duplicate = record("ranking-duplicate");
    const duplicateSaves = await Promise.all([saveDuel(duplicate, 900), saveDuel(duplicate, 900)]);
    const parallelSaves = await Promise.all([
      saveDuel(record("ranking-parallel-a"), 900),
      saveDuel(record("ranking-parallel-b"), 900),
    ]);
    const afterMatches = await loadBotRanking(now);
    const tracked = afterMatches.bots.mapas["bot-bronze-0"];
    const duelCount = (await listDuels()).filter((duel) => duel.sessionId.startsWith("ranking-")).length;
    if (tracked.matches !== initial.bots.mapas["bot-bronze-0"].matches + 3) {
      throw new Error("concurrent transactions or duplicate retries settled a bot duel incorrectly");
    }
    if (duelCount !== 3 || duplicateSaves.some((state) => state.revision !== 1)
      || parallelSaves.some((state) => state.revision < 2)) {
      throw new Error(`duel records and bot settlements must commit once, together (duels=${duelCount}, duplicateRevisions=${duplicateSaves.map((state) => state.revision)}, parallelRevisions=${parallelSaves.map((state) => state.revision)})`);
    }

    const caughtUp = await loadBotRanking(now + 2 * dayMs);
    if (caughtUp.lastDay !== Math.floor((now + 2 * dayMs) / dayMs) || caughtUp.revision !== afterMatches.revision + 2) {
      throw new Error("load must simulate each missed UTC day exactly once");
    }
    const repeatedDay = await loadBotRanking(now + 2 * dayMs);
    if (repeatedDay.revision !== caughtUp.revision) throw new Error("loading the same day must be a no-op");
    const backup = await exportProgress();
    const backedUpRanking = backup.stores.preferences.find((row) => row.id === BOT_RANKING_ID);
    if (JSON.stringify(backedUpRanking) !== JSON.stringify(caughtUp)) throw new Error("export must include the complete ranking snapshot");
    const firstLocalImport = await importProgress(backup);
    if (firstLocalImport.alreadyImported) throw new Error("first same-device backup import should record its marker");
    if (!(await importProgress(backup)).alreadyImported) throw new Error("reimporting the same backup must be idempotent");

    // Restore first into an empty database and verify the whole state survives, then repeat it.
    await deleteDatabase();
    const emptyRestore = await importProgress(backup);
    if (emptyRestore.alreadyImported) throw new Error("a fresh destination must import the backup");
    const restoredRanking = await loadBotRanking(now + 2 * dayMs);
    if (JSON.stringify(restoredRanking) !== JSON.stringify(caughtUp)) throw new Error("ranking restore changed or merged snapshot counters");
    if (!(await importProgress(backup)).alreadyImported) throw new Error("a repeated restore must be idempotent");

    // A later-day revision-0 startup seed must not block a populated imported snapshot.
    await deleteDatabase();
    const pristine = await loadBotRanking(now + 10 * dayMs);
    if (pristine.revision !== 0) throw new Error("fresh seed should have revision zero");
    const seededRestore = await importProgress(backup);
    if (seededRestore.writes.preferences[0]?.revision !== caughtUp.revision) {
      throw new Error("a populated snapshot must replace a later-day pristine seed");
    }
    const exportedAfterSeedRestore = await exportProgress();
    const restoredBeforeCatchup = exportedAfterSeedRestore.stores.preferences.find((row) => row.id === BOT_RANKING_ID);
    if (JSON.stringify(restoredBeforeCatchup) !== JSON.stringify(caughtUp)) {
      throw new Error("backup import must preserve the incoming state before lazy daily catch-up");
    }
    if (!(await importProgress(backup)).alreadyImported) throw new Error("pristine-seed restore must also be idempotent");
    return { ranking: caughtUp, trackedMatches: tracked.matches, duelCount };
  });

  await page.reload({ waitUntil: "networkidle0" });
  const afterReload = await page.evaluate(async () => {
    const { loadBotRanking } = await import("/src/domain/bot-ranking-store.ts?ranking-storage-reload");
    return loadBotRanking(Date.now() + 2 * 86_400_000);
  });
  assert.deepEqual(afterReload, result.ranking, "ranking snapshot must persist across reloads");
  assert.equal(result.duelCount, 3);
  console.log("bot ranking storage: atomic settlements, idempotence, catch-up and backup restore verified");
} finally {
  await browser.close();
}