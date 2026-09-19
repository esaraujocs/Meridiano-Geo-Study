import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.SMOKE_URL ?? "http://127.0.0.1:5000/";
const executablePath =
  process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium";
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
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

const result = await page.evaluate(async () => {
  const { startLearningSession } = await import(
    "/src/domain/learning-store.ts?browser-integration"
  );
  const { queryEconomy } = await import(
    "/src/domain/economy-store.ts?browser-integration"
  );
  const { unlockContent } = await import(
    "/src/domain/economy-store.ts?browser-unlock-integration"
  );
  const { migrateLegacyProgress } = await import(
    "/src/domain/legacy-migration.ts?browser-integration"
  );

  const first = await startLearningSession({
    family: "mapa",
    variant: "mapa",
    region: "caribe",
  });
  first.recordRound({
    targetId: "integration-target",
    correct: true,
    responseTimeMs: 100,
    answeredAt: 100,
  });
  first.recordRound({
    targetId: "integration-target",
    correct: true,
    responseTimeMs: 110,
    answeredAt: 110,
  });
  await first.finish();

  const abandoned = await startLearningSession({
    family: "mapa",
    variant: "mapa",
    region: "caribe",
  });
  await abandoned.end();

  for (const variant of ["bandeira-nome", "nome-bandeira"]) {
    const direction = await startLearningSession({
      family: "bandeiras",
      variant,
      region: "caribe",
    });
    direction.recordRound({
      targetId: `direction-${variant}`,
      correct: true,
      responseTimeMs: 90,
      answeredAt: variant === "bandeira-nome" ? 120 : 130,
    });
    await direction.finish();
  }

  const legacy = (rounds) =>
    JSON.stringify({
      v: 1,
      sessoes: [
        {
          id: "changed-fingerprint",
          ini: 1,
          fim: 2,
          modo: "mapa",
          recorte: "caribe",
          completa: true,
          r: rounds,
        },
      ],
    });
  localStorage.setItem(
    "carta-cega.hist.v1",
    legacy([["integration-target", true, 50]]),
  );
  await migrateLegacyProgress();

  const seedDb = await new Promise((resolve, reject) => {
    const request = indexedDB.open("carta-cega", 4);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const seedTransaction = seedDb.transaction(["ledger", "unlocks"], "readwrite");
  seedTransaction.objectStore("ledger").put({
    id: "test:legacy-alias-credit",
    kind: "credit",
    amount: 10,
    reason: "test",
    source: "test",
    createdAt: 140,
  });
  seedTransaction.objectStore("unlocks").put({
    id: "bandeiras:nome-bandeira:mundo",
    key: "bandeiras:nome-bandeira:mundo",
    source: "legacy-test",
    unlockedAt: 140,
  });
  await new Promise((resolve, reject) => {
    seedTransaction.oncomplete = resolve;
    seedTransaction.onerror = () => reject(seedTransaction.error);
  });
  seedDb.close();
  await unlockContent("bandeiras", "bandeira-nome", "mundo");
  localStorage.setItem(
    "carta-cega.hist.v1",
    legacy([
      ["integration-target", true, 50],
      ["integration-target", false, 60],
    ]),
  );
  await migrateLegacyProgress();

  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("carta-cega", 4);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const read = (storeName) =>
    new Promise((resolve, reject) => {
      const request = db
        .transaction(storeName, "readonly")
        .objectStore(storeName)
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const sessions = await read("sessions");
  const progress = await read("progress");
  const ledger = await read("ledger");
  const economy = await queryEconomy();
  db.close();
  return { sessions, progress, ledger, economy };
});

const currentSessions = result.sessions.filter(
  (session) => session.source === "current-v2",
);
assert.equal(currentSessions.length, 4);
assert.equal(
  currentSessions.filter((session) => session.complete).length,
  3,
);
assert.equal(
  currentSessions.find(
    (session) => session.complete && session.variant === "mapa",
  ).rounds.length,
  2,
);
assert.equal(
  currentSessions.find((session) => !session.complete).rounds.length,
  0,
);
const entities = result.progress.filter(
  (record) => record.entityId === "integration-target",
);
assert.equal(entities.length, 1);
const entity = entities[0];
assert.equal(entity.seen, 4);
assert.equal(entity.correct, 3);
assert.equal(entity.columns.mapa, 3);
assert.equal(
  result.ledger.filter(
    (entry) => entry.id === "reward:first-correct:integration-target:mapa",
  ).length,
  1,
);
// One qualifying current session plus the imported complete legacy session;
// the empty abandoned session is intentionally excluded.
assert.deepEqual(
  currentSessions
    .filter((session) => session.family === "bandeiras")
    .map((session) => session.variant)
    .sort(),
  ["bandeira-nome", "nome-bandeira"],
);
assert.equal(
  result.ledger.filter((entry) => entry.id === "debit:unlock:bandeiras:bandeira-nome:mundo").length,
  0,
);
assert.ok(result.economy.unlocked.includes("bandeiras:bandeira-nome:mundo"));
assert.equal(result.economy.sessions, 4);

await browser.close();
console.log("browser learning integration: ok");