import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(tmpdir(), "carta-cega-backup-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", [
  "src/domain/progress-backup.ts", "--outDir", out, "--target", "ES2022", "--module", "ES2022",
  "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM", "--ignoreConfig",
], { stdio: "inherit" });

const { emptyRows, planMerge, parseBackup, buildBackup, sumProgress, coinBalance, importMarkerId } = await import(pathToFileURL(join(out, "progress-backup.js")).href);
const card = (id, seen, correct, columns) => ({ id, entityId: id.split(":")[1], seen, correct, columns: { bandeiras: 0, mapa: 0, capitais: 0, ...columns }, latest: 10, mastery: 1, source: "current-v2" });

// soma de cartas e maestria recalculada
const summed = sumProgress(card("current:1", 3, 3, { bandeiras: 3 }), card("current:1", 2, 2, { mapa: 1, capitais: 1 }));
assert.equal(summed.seen, 5); assert.equal(summed.correct, 5);
assert.deepEqual(summed.columns, { bandeiras: 3, mapa: 1, capitais: 1 });
assert.equal(summed.mastery, 3);

const local = emptyRows(); const incoming = emptyRows();
local.progress = [card("current:1", 3, 3, { bandeiras: 3 })];
incoming.progress = [card("current:1", 2, 2, { mapa: 2 }), card("current:2", 1, 1, { mapa: 1 })];
local.ledger = [{ id: "a", kind: "credit", amount: 100 }, { id: "b", kind: "debit", amount: 30 }];
incoming.ledger = [{ id: "a", kind: "credit", amount: 100 }, { id: "c", kind: "credit", amount: 500 }];
local.achievements = [{ id: "x", unlockedAt: 50 }]; incoming.achievements = [{ id: "x", unlockedAt: 20 }, { id: "y", unlockedAt: 5 }];
local.unlocks = [{ id: "u1" }]; incoming.unlocks = [{ id: "u1" }, { id: "u2" }];

const plan = planMerge(local, incoming);
assert.equal(plan.summed, 1); assert.equal(plan.added.progress, 1); assert.equal(plan.added.ledger, 1); assert.equal(plan.added.unlocks, 1);
assert.equal(plan.coinsBefore, 70); assert.equal(plan.coinsAfter, 570);
assert.equal(plan.writes.achievements.length, 2, "conquista mais antiga vence, nova entra");
assert.equal(plan.writes.achievements.find((r) => r.id === "x").unlockedAt, 20);
assert.equal(plan.writes.ledger.length, 1, "ledger repetido não é regravado");

// mesma compra com preços diferentes: vale o maior pago, nunca devolve moedas
const priced = planMerge(
  { ...emptyRows(), ledger: [{ id: "c1", kind: "credit", amount: 1000 }, { id: "debit:unlock:x", kind: "debit", amount: 10 }, { id: "debit:unlock:y", kind: "debit", amount: 500 }] },
  { ...emptyRows(), ledger: [{ id: "debit:unlock:x", kind: "debit", amount: 400 }, { id: "debit:unlock:y", kind: "debit", amount: 50 }] },
);
assert.equal(priced.coinsBefore, 490); assert.equal(priced.coinsAfter, 100);
assert.equal(priced.writes.ledger.length, 1, "só a compra mais cara é regravada");

// mesmo aparelho: não soma cartas de novo
const same = planMerge(local, incoming, { sameDevice: true });
assert.equal(same.summed, 0); assert.equal(same.added.progress, 1);

// marcador: importar o mesmo arquivo duas vezes não faz nada
const file = { deviceId: "d1", exportedAt: 99 };
const withMarker = { ...local, state: [{ id: importMarkerId(file) }] };
const again = planMerge(withMarker, incoming, { marker: importMarkerId(file) });
assert.equal(again.alreadyImported, true); assert.equal(again.writes.progress.length, 0);

// nada é apagado: a união nunca tira registro que já existe
for (const name of Object.keys(local)) assert.ok(plan.writes[name].every((row) => row.id));

// arquivo: ida e volta, e rejeições
const backup = buildBackup(local, { "carta-theme": "x" }, "d1", 5);
const parsed = parseBackup(JSON.stringify(backup));
assert.equal(parsed.deviceId, "d1"); assert.equal(parsed.stores.progress.length, 1); assert.equal(coinBalance(parsed.stores.ledger), 70);
assert.equal(parseBackup("nao json"), null);
assert.equal(parseBackup(JSON.stringify({ format: "outro", version: 1, stores: {} })), null);
assert.equal(parseBackup(JSON.stringify({ ...backup, version: 99 })), null);
assert.equal(parseBackup(JSON.stringify({ ...backup, stores: { ...backup.stores, progress: [{ semId: 1 }] } })), null);

console.log("progress backup ok");
