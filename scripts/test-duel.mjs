import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(tmpdir(), "carta-cega-duel-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", [
  "src/domain/league.ts", "src/domain/duel.ts", "--outDir", out, "--target", "ES2022", "--module", "ES2022",
  "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM", "--ignoreConfig",
], { stdio: "inherit" });
const L = await import(pathToFileURL(join(out, "league.js")).href);
const D = await import(pathToFileURL(join(out, "duel.js")).href);

// ---- Ligas e divisões ----
let s = L.leagueOf(0);
assert.deepEqual([s.league, s.division, s.toNextDivision, s.toNextLeague], ["bronze", 1, 167, 500]);
s = L.leagueOf(166); assert.deepEqual([s.league, s.division], ["bronze", 1]);
s = L.leagueOf(167); assert.deepEqual([s.league, s.division, s.nextDivisionAt], ["bronze", 2, 334]);
s = L.leagueOf(334); assert.deepEqual([s.league, s.division, s.nextDivisionAt, s.toNextLeague], ["bronze", 3, 500, 166]);
s = L.leagueOf(500); assert.deepEqual([s.league, s.division, s.floor], ["prata", 1, 500]);
s = L.leagueOf(1240); assert.deepEqual([s.league, s.division, s.toNextDivision, s.toNextLeague], ["ouro", 2, 94, 260]);
s = L.leagueOf(2000); assert.deepEqual([s.league, s.division], ["diamante", 1]);
s = L.leagueOf(2499); assert.deepEqual([s.league, s.division], ["diamante", 3]);
s = L.leagueOf(2500); assert.deepEqual([s.league, s.division, s.toNextLeague], ["mestre", null, null]);
s = L.leagueOf(99999); assert.equal(s.league, "mestre");
s = L.leagueOf(-40); assert.equal(s.trophies, 0);
s = L.leagueOf(Number.NaN); assert.equal(s.trophies, 0);
assert.equal(L.divisionRoman(2), "II"); assert.equal(L.divisionRoman(null), "");

// ---- Bots: mais alto na liga, mais acerto e mais rápido ----
assert.equal(D.BOTS.length, 6);
assert.deepEqual(D.BOTS.map((bot) => bot.league), L.LEAGUES);
for (let i = 1; i < D.BOTS.length; i += 1) {
  assert.ok(D.BOTS[i].accuracy > D.BOTS[i - 1].accuracy, "acerto cresce com a liga");
  assert.ok(D.BOTS[i].avgMs < D.BOTS[i - 1].avgMs, "tempo cai com a liga");
}
assert.equal(D.botForLeague("bronze").accuracy, 0.6);

// simulação: reproduzível pela semente e perto da precisão nominal
assert.deepEqual(D.simulateBot(D.BOTS[0], 20, "abc"), D.simulateBot(D.BOTS[0], 20, "abc"));
assert.notDeepEqual(D.simulateBot(D.BOTS[0], 200, "abc"), D.simulateBot(D.BOTS[0], 200, "xyz"));
for (const bot of D.BOTS) {
  let hits = 0, rounds = 0;
  for (let game = 0; game < 400; game += 1) { const r = D.simulateBot(bot, 25, `g${game}`); hits += r.correct; rounds += 25; }
  const observed = hits / rounds;
  assert.ok(Math.abs(observed - bot.accuracy) < 0.03, `${bot.id}: ${observed.toFixed(3)} vs ${bot.accuracy}`);
}
assert.equal(D.simulateBot(D.BOTS[0], 0, "x").correct, 0);

// ---- Resolução do duelo ----
const base = { trophies: 1240, bot: D.botForLeague("ouro"), playerTotal: 10, playerMs: 60000, seed: "s1" };
const sim = D.simulateBot(base.bot, 10, "s1");
let r = D.resolveDuel({ ...base, playerCorrect: sim.correct + 1 });
assert.equal(r.outcome, "win"); assert.ok(r.delta >= D.MIN_SWING); assert.equal(r.trophiesAfter, 1240 + r.delta);
r = D.resolveDuel({ ...base, playerCorrect: Math.max(0, sim.correct - 1) });
if (sim.correct > 0) { assert.equal(r.outcome, "loss"); assert.ok(r.delta <= -D.MIN_SWING); }
// empate nos acertos: o tempo desempata; sem tempo, é empate
r = D.resolveDuel({ ...base, playerCorrect: sim.correct, playerMs: sim.totalMs - 1 });
assert.deepEqual([r.outcome, r.tiebreak], ["win", true]);
r = D.resolveDuel({ ...base, playerCorrect: sim.correct, playerMs: sim.totalMs + 1 });
assert.deepEqual([r.outcome, r.tiebreak], ["loss", true]);
r = D.resolveDuel({ ...base, playerCorrect: sim.correct, playerMs: null });
assert.deepEqual([r.outcome, r.tiebreak], ["draw", false]);
// mesmo adversário e mesmo empate: a nota do jogador decide o quanto o empate mexe
const draw = (trophies) => D.resolveDuel({ ...base, trophies, playerCorrect: sim.correct, playerMs: null }).delta;
assert.ok(draw(200) > 0, "empate contra bot mais forte rende");
assert.ok(draw(2400) < 0, "empate contra bot mais fraco custa");
// vencer um bot mais forte rende mais que vencer um mais fraco
const win = (trophies, league) => { const bot = D.botForLeague(league); const t = D.simulateBot(bot, 10, "w"); return D.resolveDuel({ trophies, bot, playerTotal: 10, playerMs: 1, seed: "w", playerCorrect: 10 }).delta; };
assert.ok(win(700, "diamante") > win(700, "bronze"));
// nunca passa de zero para baixo
r = D.resolveDuel({ trophies: 3, bot: D.botForLeague("bronze"), playerCorrect: 0, playerTotal: 10, playerMs: 1, seed: "z" });
assert.equal(r.outcome, "loss"); assert.equal(r.trophiesAfter, 0); assert.equal(r.delta, -3);
r = D.resolveDuel({ trophies: 0, bot: D.botForLeague("bronze"), playerCorrect: 0, playerTotal: 10, playerMs: 1, seed: "z" });
assert.equal(r.trophiesAfter, 0); assert.equal(r.delta, 0);
// 10/10 contra todos os bots vence sempre (nenhum acerta 100% com 10 rodadas... exceto por sorte): pelo menos empata
for (const bot of D.BOTS) assert.notEqual(D.resolveDuel({ trophies: 500, bot, playerCorrect: 10, playerTotal: 10, playerMs: 1, seed: "p" }).outcome, "loss");

// ---- Registro e troféus derivados ----
const rec = (n, at, delta, extra = {}) => ({ id: D.duelRecordId(`s${n}`), sessionId: `s${n}`, at, botId: "bot-ouro", family: "mapa", variant: "mapa", playerCorrect: 7, total: 10, botCorrect: 6, outcome: "win", tiebreak: false, delta, ...extra });
assert.equal(D.trophiesFromDuels([]), 0);
assert.equal(D.trophiesFromDuels([rec(1, 1, 20), rec(2, 2, -8)]), 12);
assert.equal(D.trophiesFromDuels([rec(2, 2, -8), rec(1, 1, 20)]), 12, "a ordem de chegada não importa");
assert.equal(D.trophiesFromDuels([rec(1, 1, -5), rec(2, 2, 10)]), 10, "não fica negativo no meio do caminho");
assert.equal(D.parseDuel(rec(1, 1, 20)).delta, 20);
assert.equal(D.parseDuel({ ...rec(1, 1, 20), id: "preset:x" }), null);
assert.equal(D.parseDuel({ ...rec(1, 1, 20), outcome: "??" }), null);
assert.equal(D.parseDuel({ ...rec(1, 1, 20), delta: "8" }), null);
assert.equal(D.parseDuel(null), null);
assert.equal(D.duelRecordId("abc"), "duel:abc");

console.log("duelo: ligas, bots, resolução e troféus ok");
