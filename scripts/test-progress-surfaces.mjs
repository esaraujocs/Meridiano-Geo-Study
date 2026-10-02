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

// Nota do título: a melhor entre a de sempre e a das últimas 100 rodadas (quem aprende jogando não fica preso aos erros do começo)
const capSession = (id, startedAt, hits, extra = {}) => ({ id, family: "capitais", variant: "capital-pais", mode: "capital-pais", startedAt, rounds: hits.map((ok, i) => ({ targetId: "x" + i, correct: ok, responseTimeMs: 900, ...extra })) });
const alternate = (n, every) => Array.from({ length: n }, (_, i) => i % every !== 0); // erra 1 a cada `every`
const learner = [
  capSession("b", 2000, alternate(100, 25)), // as 100 mais recentes: 96%
  capSession("a", 1000, alternate(1000, 2)), // as primeiras 1000: 50% (fora de ordem no array de propósito)
];
const learned = profile.deriveProgress([], undefined, learner.map((s, i) => profile.normalizeSession(s, i)));
assert.ok(learned.pillars.capitais.bayesianScore < 0.6, "a de sempre segue baixa");
assert.equal(learned.pillars.capitais.recent, 0.96);
assert.equal(learned.pillars.capitais.titleScore, 0.96);
assert.equal(learned.pillars.bandeiras.recent, null, "sem 100 rodadas a janela não vale");
assert.equal(learned.pillars.bandeiras.titleScore, null);
// poucas rodadas: a janela não existe ainda e vale só a de sempre
const few = profile.deriveProgress([], undefined, [profile.normalizeSession(capSession("f", 1, Array(99).fill(true)))]);
assert.equal(few.pillars.capitais.recent, null);
assert.equal(few.pillars.capitais.titleScore, few.pillars.capitais.bayesianScore, "sem janela, vale só a de sempre");
// rodada com suprimento não entra na janela: 100 acertos assistidos + 100 reais a 80% => 80%
const mixed = profile.deriveProgress([], undefined, [
  profile.normalizeSession(capSession("m1", 1, Array(100).fill(true), { assisted: true })),
  profile.normalizeSession(capSession("m2", 2, alternate(100, 5))),
]);
assert.equal(mixed.pillars.capitais.recent, 0.8);
// quem já é bom desde o começo não perde nada: vale a maior das duas
const steady = profile.deriveProgress([], undefined, [profile.normalizeSession(capSession("s", 1, Array(500).fill(true)))]);
assert.ok(steady.pillars.capitais.titleScore >= steady.pillars.capitais.bayesianScore);
console.log("profile surface tests passed");