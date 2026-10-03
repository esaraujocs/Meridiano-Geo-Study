import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "carta-cega-profile-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", ["src/domain/progress-surfaces.ts", "--outDir", out, "--target", "ES2022", "--module", "ES2022", "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM", "--ignoreConfig"], { stdio: "ignore" });
const profile = await import(`file://${out}/progress-surfaces.js`);

const current = profile.normalizeSession({ id: "c", family: "mapa", mode: "mapa", rounds: [{ targetId: "a", correct: true, responseTimeMs: 100 }, { targetId: "b", correct: false }] });
assert.equal(current.correct, 1);
assert.equal(current.accuracy, 0.5);
const raw = profile.normalizeSession({ id: "l", modo: "capital-pais", r: [["a", 1, 80], ["b", 0]], ini: 10, fim: 20 });
assert.equal(raw.rounds.length, 2);
const aggregate = profile.normalizeSession({ id: "p", modo: "mapa", ag: { ac: 7, rod: 10 } });
assert.equal(aggregate.correct, 7);
assert.equal(aggregate.accuracy, 0.7);

const records = [
  { entityId: "a", mastery: 2, seen: 10, columns: { mapa: 8 } },
  { entityId: "b", mastery: 0, seen: 0, columns: {} },
];
const progress = profile.deriveProgress(records, ["a", "b", "c"]);
assert.equal(progress.total, 3);
assert.equal(progress.discovered, 1);
assert.deepEqual(progress.distribution, [2, 0, 1, 0, 0, 0]);
assert.equal(progress.pillars.mapa.correct, 8);
assert.equal(progress.pillars.mapa.bayesianScore, (8 + 12 * 0.45) / 22);
assert.equal(progress.pillars.mapa.status, "em desenvolvimento");

const meta = { a: { pt: "Alfa", mapa: true }, b: { pt: "Beta", absorvido: true }, c: { pt: "Gama", cap: "Capital" } };
assert.deepEqual(profile.canonicalCurrentIds(meta), ["a", "c"]);
assert.equal(profile.collectionCard("a", meta.a, 0).fields.length, 0);
assert.equal(profile.collectionCard("a", meta.a, 2).fields.length, 2);
assert.equal(profile.collectionCard("a", meta.a, 5).fields.length, 5);
const cards = [
  profile.collectionCard("a", { pt: "Alfa", reg: "Europe", sub: "Western Europe", un: true }, 2),
  profile.collectionCard("b", { pt: "Beta", reg: "Asia", sub: "Eastern Asia", un: false }, 0),
];
assert.equal(profile.filterCollectionCards(cards, { unOnly: true }).length, 1);
assert.equal(profile.filterCollectionCards(cards, { state: "faltando" }).length, 1);
assert.equal(profile.filterCollectionCards(cards, { region: "europa" })[0]?.id, "a");
const historical = profile.historicalAlbum([
  { id: "empire", pt: "Império", reg: "Europe", sub: "Western Europe", tipo: "imperio", fl: "hist-empire" },
  { id: "movement", pt: "Movimento", reg: "Asia", sub: "Eastern Asia", tipo: "movimento", fl: "hist-movement" },
], [{ entityId: "empire" }]);
assert.equal(historical.length, 2);
assert.equal(historical.filter((item) => item.discovered).length, 1);
assert.equal(profile.filterHistoricalAlbum(historical, "europa", "imperio").length, 1);

const achievements = profile.evaluateAchievements(progress, [current], []);
assert.equal(achievements.find((item) => item.id === "first-session").unlocked, true);
assert.equal(achievements.find((item) => item.id === "coverage-10").unlocked, false);

// A precisão do pilar é a HISTÓRICA (bayesiana); não existe mais janela das últimas 100 rodadas
const capSession = (id, startedAt, hits) => ({ id, family: "capitais", variant: "capital-pais", mode: "capital-pais", complete: true, startedAt, rounds: hits.map((ok, i) => ({ targetId: "x" + i, correct: ok, responseTimeMs: 900 })) });
const alternate = (n, every) => Array.from({ length: n }, (_, i) => i % every !== 0);
const history = profile.deriveProgress([], undefined, [capSession("a", 1000, alternate(1000, 2)), capSession("b", 2000, alternate(100, 25))].map((x, i) => profile.normalizeSession(x, i)));
assert.ok(history.pillars.capitais.bayesianScore < 0.6, "a precisão segue histórica: o fim bom não a levanta");
assert.equal(history.pillars.capitais.titleScore, undefined);
assert.equal(history.pillars.capitais.recent, undefined);

// Domínio do pilar: país conquistado = 5 certas seguidas já feitas no pilar, para sempre
const domSession = (id, startedAt, family, variant, hits) => profile.normalizeSession({ id, family, variant, mode: variant, complete: true, startedAt, rounds: Object.entries(hits).map(([targetId, correct]) => ({ targetId, correct, responseTimeMs: 900 })) });
const five = [1, 2, 3, 4, 5].map((n) => domSession("c" + n, n, "capitais", "capital-pais", { a: true, b: n !== 3, c: false }));
const afterMiss = domSession("c6", 6, "capitais", "capital-pais", { a: false }); // errar depois não tira a conquista
const domain = profile.deriveProgress([], ["a", "b", "c", "d"], [...five, afterMiss]);
assert.deepEqual(domain.pillars.capitais.domain, { done: 1, total: 4, pct: 25 }, "só o país a fez 5 seguidas (o b quebrou no meio) e o erro posterior não desfaz");
assert.equal(domain.pillars.mapa.domain.done, 0);
assert.equal(domain.pillars.bandeiras.domain.pct, 0);
// Antártida (10) e Macau (446) não têm capital: não entram no total das Capitais
const noCap = profile.deriveProgress([], ["10", "446", "a", "b"], []);
assert.equal(noCap.pillars.capitais.domain.total, 2);
assert.equal(noCap.pillars.mapa.domain.total, 4);
console.log("profile surface tests passed");