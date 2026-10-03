import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "carta-cega-economy-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", [
  "src/domain/economy-rules.ts",
  "src/domain/economy-store.ts",
  "src/domain/legacy-migration.ts",
  "src/domain/types.ts",
  "src/domain/tonic.ts",
  "--outDir", out, "--target", "ES2022", "--module", "ESNext",
  "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM",
  "--ignoreConfig",
], { env: { ...process.env, NODE_OPTIONS: "--experimental-specifier-resolution=node" } });
const economyPath = join(out, "economy-store.js");
await writeFile(economyPath, (await readFile(economyPath, "utf8")).replace('"./economy-rules"', '"./economy-rules.js"'));
const playerStats = await import(`file://${out}/player-stats.js`);
const migrationPath = join(out, "legacy-migration.js");
await writeFile(migrationPath, (await readFile(migrationPath, "utf8")).replaceAll('"./learning-rules"', '"./learning-rules.js"').replaceAll('"./storage-schema"', '"./storage-schema.js"'));
const rules = await import(`file://${out}/economy-rules.js`);
const economy = await import(`file://${out}/economy-store.js`);
const migration = await import(`file://${out}/legacy-migration.js`);
// Economia v2: o acerto não paga mais na hora (as moedas vêm no fim da partida, em spoils.ts).
assert.equal(rules.firstCorrectReward, undefined);
const world = rules.policyFor("mapa", "mapa", "mundo");
assert.equal(rules.canUnlock(world, 0, 0, 0), true);
const travel = rules.policyFor("travel", "travel", "mundo");
// Só moedas: nem cobertura nem partidas jogadas entram no desbloqueio.
assert.equal(rules.canUnlock(travel, 63999, 99, 99), false);
assert.equal(rules.canUnlock(travel, 64000, 0, 0), true);
const completed = (rounds) => ({ complete: true, family: "mapa", variant: "mapa", rounds });
const abandoned = (rounds) => ({ complete: false, family: "mapa", variant: "mapa", rounds });
const answer = (targetId, correct, column) => ({ targetId, correct, column });
assert.equal(economy.dominatedFromSessions([
  completed([answer("a", true, "mapa"), answer("a", true, "bandeiras"), answer("a", true, "capitais")]),
  abandoned([answer("b", true, "mapa"), answer("b", true, "bandeiras"), answer("b", true, "capitais")]),
]), 1);
assert.equal(economy.dominatedFromSessions([
  completed([answer("a", true, "mapa"), answer("a", true, "mapa"), answer("a", true, "mapa")]),
]), 0);
assert.equal(economy.dominatedFromSessions([
  completed([answer("a", true, "mapa"), answer("a", false, "bandeiras"), answer("a", true, "capitais"), answer("a", true, "bandeiras")]),
]), 0);
assert.equal(economy.dominatedFromSessions([], [{ entityId: "legacy", last3: [
  { correct: true, column: "mapa" }, { correct: true, column: "bandeiras" }, { correct: true, column: "mapa" },
] }]), 1);
const migrated = {
  complete: true,
  column: "bandeiras",
  r: [["legacy-country", true, 1000, 0], ["legacy-country", true, 2000, 0]],
};
const migratedOtherMode = {
  complete: true,
  column: "mapa",
  r: [["legacy-country", true, 3000, 0]],
};
assert.equal(economy.dominatedFromSessions([migrated, migratedOtherMode]), 1);
assert.equal(economy.roundsFromCompletedSessions([migrated, migratedOtherMode, abandoned([])]), 3);
assert.deepEqual(playerStats.playerStatsFromSessions([
  migrated,
  migratedOtherMode,
  abandoned([answer("ignored", true, "mapa")]),
  { complete: true, aggregate: { rod: 7 } },
]), { completedSessions: 3, rounds: 10, boostedRounds: 0 });
const transformed = migration.transformLegacy({ history: { sessoes: [
  { ini: 100, modo: "mapa", completa: true, r: [["chronology", true, 9000], ["chronology", true, 1]] },
  { ini: 200, modo: "bn", completa: true, r: [["chronology", false, 1], ["chronology", true, 8000]] },
  { ini: 300, modo: "escr", completa: true, r: [["chronology", true, 2]] },
] } });
assert.equal(economy.roundsFromCompletedSessions(transformed.sessions), 5);
assert.equal(economy.dominatedFromSessions(transformed.sessions), 0);
const transformedPositive = migration.transformLegacy({ history: { sessoes: [
  { ini: 100, modo: "mapa", completa: true, r: [["positive", true, 9000]] },
  { ini: 200, modo: "bn", completa: true, r: [["positive", true, 1]] },
  { ini: 300, modo: "bn", completa: true, r: [["positive", true, 8000]] },
] } });
assert.equal(economy.dominatedFromSessions(transformedPositive.sessions), 1);
const curve = await import(`file://${out}/player-level.js`);
for (const [xp, level, base, next] of [[0, 1, 0, 100], [99, 1, 0, 100], [100, 2, 100, 300], [299, 2, 100, 300], [300, 3, 300, 600]]) {
  const actual = curve.levelForXp(xp);
  assert.equal(actual, level);
  assert.equal(curve.xpForLevel(actual), base);
  assert.equal(curve.xpForLevel(actual + 1), next);
}
assert.equal(curve.levelForXp(1e9) > 100, true, "sem teto de nível");
// XP em dobro (26/09): 2 por rodada + 50 por país já dominado
assert.equal(curve.xpFrom(10, 0), 20);
assert.equal(curve.xpFrom(4000, 200), 18000);
// Tônico de XP (04/10): as rodadas turbinadas rendem 8 em vez de 2; não aumentam o número de rodadas, só a diferença
assert.equal(curve.TONIC_ROUNDS, 50);
assert.equal(curve.xpFrom(10, 0, 10), 80, "10 rodadas turbinadas: 10 × 8");
assert.equal(curve.xpFrom(10, 1, 4), 10 * 2 + 4 * 6 + 50, "4 turbinadas entre 10 rodadas, mais 1 país dominado");
assert.equal(curve.xpFrom(10, 0, 99), 80, "nunca mais turbinadas do que rodadas");
assert.equal(curve.xpFrom(10, 0, 0), curve.xpFrom(10, 0), "sem Tônico nada muda");
const boostedSession = (n, complete = true) => ({ complete, rounds: Array.from({ length: 10 }, (_, i) => ({ targetId: "t" + i, correct: true, ...(i < n ? { boosted: true } : {}) })) });
assert.deepEqual(playerStats.playerStatsFromSessions([boostedSession(4), boostedSession(0)]), { completedSessions: 2, rounds: 20, boostedRounds: 4 });
assert.equal(playerStats.playerStatsFromSessions([boostedSession(10, false)]).boostedRounds, 0, "partida abandonada não rende XP, nem o turbinado");
const tonic = await import(`file://${out}/tonic.js`);
const state = tonic.createTonicState(0);
assert.equal(state.take(), false, "sem Tônico nada é turbinado");
assert.equal(state.activate(), true);
assert.equal(state.left, 50);
assert.equal(state.activate(), false, "não empilha");
let taken = 0; while (state.take()) taken += 1;
assert.equal(taken, 50, "são 50 rodadas");
assert.equal(state.left, 0);
assert.equal(state.activate(), true, "depois de acabar dá para ligar outro");
state.set(7); assert.equal(state.left, 7);
state.set(9999); assert.equal(state.left, 50, "nunca passa de 50");
state.set(-3); assert.equal(state.left, 0);
assert.equal(tonic.createTonicState(12).left, 12, "volta do aparelho com o que faltava");
assert.equal(tonic.createTonicState(NaN).left, 0);

// domínio (26/09): acertar o mesmo país 3 vezes no mesmo modo não tira o domínio; só o erro tira
const at = (targetId, correct, column, t) => ({ targetId, correct, column, answeredAt: t });
const mixedThenSame = [completed([at("a", true, "mapa", 1), at("a", true, "bandeiras", 2), at("a", true, "capitais", 3), at("a", true, "capitais", 4), at("a", true, "capitais", 5), at("a", true, "capitais", 6)])];
assert.equal(economy.dominatedFromSessions(mixedThenSame), 1, "três acertos seguidos em Capitais mantêm o domínio");
const thenMiss = [...mixedThenSame, completed([at("a", false, "capitais", 7)])];
assert.equal(economy.dominatedFromSessions(thenMiss), 0, "um erro tira o domínio de agora");
assert.equal(economy.everDominatedFromSessions(thenMiss), 1, "mas o país continua contando para o XP");
assert.equal(economy.everDominatedFromSessions([completed([at("b", true, "mapa", 1), at("b", true, "mapa", 2), at("b", true, "mapa", 3)])]), 0, "um modo só nunca domina");
console.log("economy rules: ok");