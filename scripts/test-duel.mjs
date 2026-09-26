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
  "src/domain/league.ts", "src/domain/bots.ts", "src/domain/duel.ts", "src/domain/duel-rewards.ts", "--outDir", out, "--target", "ES2022", "--module", "ES2022",
  "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM", "--ignoreConfig",
], { stdio: "inherit" });
const L = await import(pathToFileURL(join(out, "league.js")).href);
const B = await import(pathToFileURL(join(out, "bots.js")).href);
const D = await import(pathToFileURL(join(out, "duel.js")).href);
const R = await import(pathToFileURL(join(out, "duel-rewards.js")).href);

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

// ---- Elenco: 5 bots por liga, ids e nomes únicos, um de cada jeito ----
assert.equal(B.BOTS.length, 30);
assert.equal(new Set(B.BOTS.map((bot) => bot.id)).size, 30);
assert.equal(new Set(B.BOTS.map((bot) => bot.name)).size, 30);
for (const league of L.LEAGUES) {
  const group = B.botsOfLeague(league);
  assert.equal(group.length, 5, league);
  assert.deepEqual(group.map((bot) => bot.style), ["constante", "preciso", "rapido", "irregular", "especialista"]);
  assert.deepEqual(group.filter((bot) => bot.specialty).map((bot) => bot.style), ["especialista"]);
}
assert.equal(B.botById("bot-ouro-2").name, "Caio Latitude");
assert.equal(B.botById("bot-prata").league, "prata", "registro antigo (só a liga) ainda resolve");
assert.equal(B.botById("bot-nao-existe"), null);

// ---- Força: sobe com a liga e com a divisão; cada jeito muda o perfil ----
const base = (league) => B.botsOfLeague(league)[0];
for (let i = 1; i < L.LEAGUES.length; i += 1) {
  const low = B.botProfile(base(L.LEAGUES[i - 1]), { division: 3, family: null });
  const high = B.botProfile(base(L.LEAGUES[i]), { division: 1, family: null });
  assert.ok(high.accuracy > low.accuracy, "a liga seguinte, mesmo na divisão I, é mais forte que a anterior na III");
  assert.ok(high.avgMs < low.avgMs, "e mais rápida");
}
const c1 = B.botProfile(base("ouro"), { division: 1, family: null });
const c3 = B.botProfile(base("ouro"), { division: 3, family: null });
assert.ok(Math.abs(c3.accuracy - c1.accuracy - 0.04) < 1e-9, "cada divisão soma 2 pontos");
assert.equal(B.botProfile(base("mestre"), { division: null, family: null }).accuracy, 0.96);
const [constant, precise, fast, streaky, expert] = B.botsOfLeague("prata");
const P = (bot, family = null) => B.botProfile(bot, { division: 1, family });
assert.ok(P(precise).accuracy > P(constant).accuracy && P(precise).avgMs > P(constant).avgMs, "preciso: acerta mais e demora mais");
assert.ok(P(fast).accuracy < P(constant).accuracy && P(fast).avgMs < P(constant).avgMs, "rápido: erra mais e responde antes");
assert.equal(P(streaky).streaky, true); assert.equal(P(constant).streaky, false);
assert.ok(P(expert, "bandeiras").accuracy > P(constant).accuracy, "especialista na família dele");
assert.ok(P(expert, "mapa").accuracy < P(constant).accuracy, "e fraco nas outras");
assert.ok(P(expert, null).accuracy < P(constant).accuracy, "sem família conhecida conta como fora");
assert.ok(B.botProfile(B.botsOfLeague("mestre")[1], { division: null, family: null }).accuracy <= 0.99, "nunca passa de 99%");

// ---- Simulação: reproduzível pela semente e perto do acerto nominal ----
const ctx = { division: 1, family: null };
assert.deepEqual(B.simulateBot(constant, 20, "abc", ctx), B.simulateBot(constant, 20, "abc", ctx));
assert.notDeepEqual(B.simulateBot(constant, 200, "abc", ctx), B.simulateBot(constant, 200, "xyz", ctx));
assert.equal(B.simulateBot(constant, 0, "x", ctx).correct, 0);
for (const bot of B.BOTS) {
  for (const division of [1, 3]) {
    const context = { division: bot.league === "mestre" ? null : division, family: bot.specialty };
    const expected = B.botProfile(bot, context).accuracy;
    let hits = 0, rounds = 0;
    for (let game = 0; game < 400; game += 1) { hits += B.simulateBot(bot, 25, `g${game}`, context).correct; rounds += 25; }
    const observed = hits / rounds;
    const tolerance = 0.03;
    assert.ok(Math.abs(observed - expected) < tolerance, `${bot.id} div ${division}: ${observed.toFixed(3)} vs ${expected.toFixed(3)}`);
  }
}
// o irregular tem mais variação entre partidas que o constante, com a mesma média
const spread = (bot) => { const scores = Array.from({ length: 600 }, (_, game) => B.simulateBot(bot, 20, `v${game}`, ctx).correct); const mean = scores.reduce((a, b) => a + b, 0) / scores.length; return scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length; };
assert.ok(spread(streaky) > spread(constant) * 1.4, "irregular oscila mais");

// ---- Sorteio do adversário ----
assert.equal(B.pickBot("ouro", 123).id, B.pickBot("ouro", 123).id, "mesma semente, mesmo bot");
for (const league of L.LEAGUES) for (let seed = 0; seed < 50; seed += 1) assert.equal(B.pickBot(league, seed).league, league);
const seen = new Set(Array.from({ length: 200 }, (_, seed) => B.pickBot("bronze", seed).id));
assert.equal(seen.size, 5, "com sementes diferentes aparecem os 5 bots");
for (let seed = 0; seed < 100; seed += 1) assert.notEqual(B.pickBot("prata", seed, "bot-prata-0").id, "bot-prata-0", "não repete o do duelo anterior");

// ---- Resolução do duelo ----
const dctx = { division: 2, family: "mapa" };
const bot = B.botsOfLeague("ouro")[0];
const input = { trophies: 1240, bot, playerTotal: 20, playerMs: 90000, seed: "s1", context: dctx };
const sim = B.simulateBot(bot, 20, "s1", dctx);
let r = D.resolveDuel({ ...input, playerCorrect: sim.correct + 1 });
assert.equal(r.outcome, "win"); assert.ok(r.delta >= D.MIN_SWING); assert.equal(r.trophiesAfter, 1240 + r.delta);
assert.equal(r.botCorrect, sim.correct, "o duelo usa o mesmo bot simulado");
r = D.resolveDuel({ ...input, playerCorrect: Math.max(0, sim.correct - 1) });
if (sim.correct > 0) { assert.equal(r.outcome, "loss"); assert.ok(r.delta <= -D.MIN_SWING); }
r = D.resolveDuel({ ...input, playerCorrect: sim.correct, playerMs: sim.totalMs - 1 });
assert.deepEqual([r.outcome, r.tiebreak], ["win", true]);
r = D.resolveDuel({ ...input, playerCorrect: sim.correct, playerMs: sim.totalMs + 1 });
assert.deepEqual([r.outcome, r.tiebreak], ["loss", true]);
r = D.resolveDuel({ ...input, playerCorrect: sim.correct, playerMs: null });
assert.deepEqual([r.outcome, r.tiebreak], ["draw", false]);
const draw = (trophies) => D.resolveDuel({ ...input, trophies, playerCorrect: sim.correct, playerMs: null }).delta;
assert.ok(draw(200) > 0, "empate contra bot mais forte rende");
assert.ok(draw(2400) < 0, "empate contra bot mais fraco custa");
const win = (trophies, league) => { const b = B.botsOfLeague(league)[0]; return D.resolveDuel({ trophies, bot: b, playerTotal: 20, playerMs: 1, seed: "w", playerCorrect: 20 }).delta; };
assert.ok(win(700, "diamante") > win(700, "bronze"), "vencer um bot mais forte rende mais");
r = D.resolveDuel({ trophies: 3, bot: B.botsOfLeague("bronze")[0], playerCorrect: 0, playerTotal: 20, playerMs: 1, seed: "z" });
assert.equal(r.outcome, "loss"); assert.equal(r.trophiesAfter, 0); assert.equal(r.delta, -3);
r = D.resolveDuel({ trophies: 0, bot: B.botsOfLeague("bronze")[0], playerCorrect: 0, playerTotal: 20, playerMs: 1, seed: "z" });
assert.equal(r.trophiesAfter, 0); assert.equal(r.delta, 0);
for (const b of B.BOTS) assert.notEqual(D.resolveDuel({ trophies: 500, bot: b, playerCorrect: 20, playerTotal: 20, playerMs: 1, seed: "p", context: { division: 3, family: b.specialty } }).outcome, "loss", `${b.id} não vence 20/20`);
assert.equal(D.DUEL_ROUNDS, 20);

// ---- Registro e troféus derivados ----
const rec = (n, at, delta, extra = {}) => ({ id: D.duelRecordId(`s${n}`), sessionId: `s${n}`, at, botId: "bot-ouro-0", family: "mapa", variant: "mapa", playerCorrect: 14, total: 20, botCorrect: 12, outcome: "win", tiebreak: false, delta, ...extra });
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
assert.equal(D.playerTotalMs([{ responseTimeMs: 1000 }, { responseTimeMs: 2500 }], 15), 3500);
assert.equal(D.playerTotalMs([{ responseTimeMs: 1000 }, { responseTimeMs: null, timedOut: true }], 15), 16000);
assert.equal(D.playerTotalMs([{ responseTimeMs: 1000 }, { responseTimeMs: null }], 15), null);

// ---- Marcos de recompensa ----
assert.equal(R.MILESTONES.length, 5 + 10, "5 ligas novas + 2 divisões em cada uma das 5 ligas com divisão");
assert.deepEqual(R.MILESTONES.map((m) => m.at), [...R.MILESTONES.map((m) => m.at)].sort((a, b) => a - b), "em ordem de troféus");
assert.equal(new Set(R.MILESTONES.map((m) => R.milestoneLedgerId(m))).size, 15, "ids únicos");
const coinsAt = (trophies) => R.reachedMilestones(trophies).reduce((n, m) => n + m.coins, 0);
assert.equal(R.reachedMilestones(0).length, 0);
assert.equal(R.reachedMilestones(166).length, 0);
assert.equal(coinsAt(167), 500, "Bronze II");
assert.equal(coinsAt(334), 1000, "Bronze III");
assert.equal(coinsAt(500), 1000 + 3000, "Prata: +3.000");
assert.equal(coinsAt(1000), 1000 + 3000 + 1000 + 6000, "Ouro");
assert.equal(coinsAt(2500), 5 * 1000 + 3000 + 6000 + 12000 + 24000 + 48000, "Mestre: tudo");
assert.equal(R.MILESTONES.find((m) => m.id === "league:mestre").at, 2500);
// os marcos casam com as ligas e divisões de league.ts
for (const m of R.MILESTONES) {
  const at = L.leagueOf(m.at);
  assert.equal(at.league, m.league, m.id);
  assert.equal(at.division, m.kind === "league" ? (m.league === "mestre" ? null : 1) : m.division, m.id);
  const before = L.leagueOf(m.at - 1);
  assert.ok(before.index < at.index || (before.division ?? 0) < (at.division ?? 99) || m.at === 0, `${m.id} abre exatamente em ${m.at}`);
}
// pagar uma vez só: com o crédito já no livro, o marco não volta
const ledger = new Set(["grant:duel:division:bronze:2"]);
assert.deepEqual(R.pendingMilestones(340, ledger).map((m) => m.id), ["division:bronze:3"]);
assert.equal(R.pendingMilestones(340, new Set(R.MILESTONES.map((m) => R.milestoneLedgerId(m)))).length, 0);
assert.equal(R.pendingMilestones(100, new Set()).length, 0, "descer não tira nem repete: só o que já foi alcançado e não pago");

console.log("duelo: ligas, bots, resolução, troféus e marcos ok");
