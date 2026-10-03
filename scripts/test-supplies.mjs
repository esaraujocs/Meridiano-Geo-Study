import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "carta-cega-supplies-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", [
  "src/domain/supplies.ts",
  "src/domain/spoils.ts",
  "src/domain/dominated.ts",
  "src/domain/achievements.ts",
  "--outDir", out, "--target", "ES2022", "--module", "ES2022",
  "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM",
  "--ignoreConfig",
]);
const supplies = await import(`file://${out}/supplies.js`);
const spoils = await import(`file://${out}/spoils.js`);
const dominated = await import(`file://${out}/dominated.js`);
const achievements = await import(`file://${out}/achievements.js`);

// ---- supplyApplies / usableSupplies: Lupa só em alternativas, Bússola só em clicar no mapa, Ampulheta em tudo
assert.equal(supplies.supplyApplies("lupa", "bandeira-nome"), true);
assert.equal(supplies.supplyApplies("lupa", "silhueta-opcoes"), true);
assert.equal(supplies.supplyApplies("lupa", "escrita-pais"), false, "escrita não tem alternativas para a Lupa tirar");
assert.equal(supplies.supplyApplies("lupa", "mapa"), false);
assert.equal(supplies.supplyApplies("lupa", "travel"), false);
assert.equal(supplies.supplyApplies("bussola", "mapa"), true);
assert.equal(supplies.supplyApplies("bussola", "capital-pais"), true);
assert.equal(supplies.supplyApplies("bussola", "bandeira-nome"), false);
assert.equal(supplies.supplyApplies("bussola", "silhueta-opcoes"), false);
assert.equal(supplies.supplyApplies("ampulheta", "mapa"), true);
assert.equal(supplies.supplyApplies("ampulheta", "travel"), true);
assert.equal(supplies.supplyApplies("ampulheta", "escrita-pais"), true);

const counts = { ampulheta: 1, bussola: 1, lupa: 1 };
assert.deepEqual(supplies.usableSupplies(counts, "mapa").sort(), ["ampulheta", "bussola"]);
assert.deepEqual(supplies.usableSupplies(counts, "bandeira-nome").sort(), ["ampulheta", "lupa"]);
assert.deepEqual(supplies.usableSupplies({ ampulheta: 0, bussola: 0, lupa: 0 }, "mapa"), [], "sem estoque, nada aparece");
assert.deepEqual(supplies.usableSupplies(counts, "mapa", false), ["bussola"], "no Treino a Ampulheta some (não há cronômetro)");
assert.deepEqual(supplies.usableSupplies(counts, "bandeira-nome", false), ["lupa"], "no Treino a Lupa segue valendo");

// ---- rodada assistida paga ASSISTED_COIN_FACTOR (metade) do normal, ver spoils.ts
assert.equal(spoils.ASSISTED_COIN_FACTOR, 0.5);
const roundsOf = (assisted) => [{ correct: true, tier: 1, ...(assisted ? { assisted: true } : {}) }];
const spoilsBase = { variant: "bandeira-nome", pace: "timed", complete: false, newCards: 0, levelUps: 0 };
const normal = spoils.computeSpoils({ ...spoilsBase, rounds: roundsOf(false) });
const assisted = spoils.computeSpoils({ ...spoilsBase, rounds: roundsOf(true) });
assert.equal(normal.hits.coins, 32, "acerto normal em bandeira-nome vale 32");
assert.equal(assisted.hits.coins, 16, "rodada assistida paga metade");
assert.equal(assisted.hits.coins, normal.hits.coins * spoils.ASSISTED_COIN_FACTOR);

// ---- rodada assistida não conta para o domínio (fica de fora da evidência, como se não tivesse acontecido)
const roundsForBRA = (assistedMiddle) => [
  { targetId: "BRA", correct: true, column: "mapa", answeredAt: 1 },
  { targetId: "BRA", correct: true, column: "capitais", answeredAt: 2, assisted: assistedMiddle },
  { targetId: "BRA", correct: true, column: "mapa", answeredAt: 3 },
];
const sessionAssisted = { complete: true, rounds: roundsForBRA(true) };
const sessionClean = { complete: true, rounds: roundsForBRA(false) };
assert.ok(!dominated.dominatedIdsFromSessions([sessionAssisted]).has("BRA"), "com uma resposta assistida no meio, só sobram 2 respostas: não domina");
assert.ok(dominated.dominatedIdsFromSessions([sessionClean]).has("BRA"), "as mesmas 3 respostas sem suprimento dominam o país");
assert.ok(!dominated.everDominatedIdsFromSessions([sessionAssisted]).has("BRA"));
assert.ok(dominated.everDominatedIdsFromSessions([sessionClean]).has("BRA"));

// ---- sessão com suprimento nunca conta como "Perfeita" (perfect20/perfect40), mesmo com baralho inteiro e 100%
const roundsOf20 = Array.from({ length: 20 }, (_, index) => ({ correct: true, targetId: `T${index}`, responseTimeMs: 500 }));
const progress = { records: [], pillars: {} };
const perfectSession = (assistedCount) => ({
  complete: true, mode: "mapa", family: "mapa", variant: "mapa", region: "mundo", regions: [],
  rounds: roundsOf20, correct: 20, accuracy: 1, assistedCount,
});
const ctxAssisted = achievements.achievementContext(progress, [perfectSession(1)], {});
assert.equal(ctxAssisted.perfect20, false, "baralho de 20 acertos com 1 rodada assistida não conta para Perfeita");
const ctxClean = achievements.achievementContext(progress, [perfectSession(0)], {});
assert.equal(ctxClean.perfect20, true, "o mesmo baralho sem suprimento conta para Perfeita");

console.log("test:supplies ok");

// ---- Bússola: as Américas se dividem em Sul e Norte/Central (só no item) ----
assert.equal(supplies.compassGroup({ reg: "Americas", sub: "South America" }), "america-do-sul");
assert.equal(supplies.compassGroup({ reg: "Americas", sub: "North America" }), "america-do-norte-central");
assert.equal(supplies.compassGroup({ reg: "Americas", sub: "Central America" }), "america-do-norte-central");
assert.equal(supplies.compassGroup({ reg: "Americas", sub: "Caribbean" }), "america-do-norte-central", "o Caribe vai com a América do Norte");
assert.equal(supplies.compassGroup({ reg: "Europe", sub: "Western Europe" }), "Europe", "os outros continentes seguem como são");
assert.equal(supplies.compassGroup(undefined), null);
console.log("compass groups ok");
