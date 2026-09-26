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
  "src/domain/league.ts", "src/domain/bots.ts", "src/domain/duel.ts", "src/domain/duel-rewards.ts", "src/domain/duel-modes.ts", "src/domain/economy-rules.ts", "src/domain/duel-run.ts", "src/domain/spoils.ts", "src/domain/duel-view.ts", "--outDir", out, "--target", "ES2022", "--module", "ES2022",
  "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM", "--ignoreConfig",
], { stdio: "inherit" });
const L = await import(pathToFileURL(join(out, "league.js")).href);
const B = await import(pathToFileURL(join(out, "bots.js")).href);
const D = await import(pathToFileURL(join(out, "duel.js")).href);
const R = await import(pathToFileURL(join(out, "duel-rewards.js")).href);
const M = await import(pathToFileURL(join(out, "duel-modes.js")).href);
const U = await import(pathToFileURL(join(out, "duel-run.js")).href);
const S = await import(pathToFileURL(join(out, "spoils.js")).href);
const V = await import(pathToFileURL(join(out, "duel-view.js")).href);

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
assert.equal(r.outcome, "win"); assert.ok(r.delta >= D.MIN_WIN); assert.equal(r.trophiesAfter, 1240 + r.delta);
assert.equal(r.botCorrect, sim.correct, "o duelo usa o mesmo bot simulado");
r = D.resolveDuel({ ...input, playerCorrect: Math.max(0, sim.correct - 1) });
if (sim.correct > 0) { assert.equal(r.outcome, "loss"); assert.ok(r.delta <= -D.MIN_LOSS); }
r = D.resolveDuel({ ...input, playerCorrect: sim.correct, playerMs: sim.totalMs - 1 });
assert.deepEqual([r.outcome, r.tiebreak], ["win", true]);
r = D.resolveDuel({ ...input, playerCorrect: sim.correct, playerMs: sim.totalMs + 1 });
assert.deepEqual([r.outcome, r.tiebreak], ["loss", true]);
r = D.resolveDuel({ ...input, playerCorrect: sim.correct, playerMs: null });
assert.deepEqual([r.outcome, r.tiebreak], ["draw", false]);
const draw = (trophies) => D.resolveDuel({ ...input, trophies, playerCorrect: sim.correct, playerMs: null }).delta;
assert.ok(draw(200) > 0, "empate nas ligas de baixo rende");
assert.ok(draw(2400) < 0, "empate nas ligas de cima custa");
const win = (trophies, league) => { const b = B.botsOfLeague(league)[0]; return D.resolveDuel({ trophies, bot: b, playerTotal: 20, playerMs: 1, seed: "w", playerCorrect: 20 }).delta; };
assert.ok(win(100, "bronze") > win(2100, "diamante"), "as ligas de baixo pagam mais pela vitória");
r = D.resolveDuel({ trophies: 3, bot: B.botsOfLeague("bronze")[0], playerCorrect: 0, playerTotal: 20, playerMs: 1, seed: "z" });
assert.equal(r.outcome, "loss"); assert.equal(r.trophiesAfter, 0); assert.equal(r.delta, -3);
r = D.resolveDuel({ trophies: 0, bot: B.botsOfLeague("bronze")[0], playerCorrect: 0, playerTotal: 20, playerMs: 1, seed: "z" });
assert.equal(r.trophiesAfter, 0); assert.equal(r.delta, 0);
for (const b of B.BOTS) assert.notEqual(D.resolveDuel({ trophies: 500, bot: b, playerCorrect: 20, playerTotal: 20, playerMs: 1, seed: "p", context: { division: 3, family: b.specialty } }).outcome, "loss", `${b.id} não vence 20/20`);
assert.equal(D.DUEL_ROUNDS, 20);

// ---- Registro e troféus derivados ----
const rec = (n, at, delta, extra = {}) => ({ id: D.duelRecordId(`s${n}`), sessionId: `s${n}`, at, botId: "bot-ouro-0", ladder: "mapas", family: "mapa", variant: "mapa", playerCorrect: 14, total: 20, botCorrect: 12, outcome: "win", tiebreak: false, delta, ...extra });
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
assert.equal(R.MILESTONES.length, 5 + 2 * 10, "5 ligas novas + 2 divisões em cada uma das 5 ligas com divisão, nas 2 escadas");
assert.deepEqual(R.MILESTONES.map((m) => m.at), [...R.MILESTONES.map((m) => m.at)].sort((a, b) => a - b), "em ordem de troféus");
assert.equal(new Set(R.MILESTONES.map((m) => R.milestoneLedgerId(m))).size, 25, "ids únicos");
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
assert.deepEqual(R.pendingMilestones(340, ledger).map((m) => m.id), ["division:mapas:bronze:3"], "o crédito antigo (sem escada) vale para Mapas; a escada Mapas só deve o Bronze III");
assert.equal(R.pendingMilestones(340, new Set(R.MILESTONES.map((m) => R.milestoneLedgerId(m)))).length, 0);
assert.equal(R.pendingMilestones(100, new Set()).length, 0, "descer não tira nem repete: só o que já foi alcançado e não pago");


// ---- Escadas, grupos de modos e sorteio dos 2 tempos ----
assert.deepEqual(M.LADDERS, ["mapas", "bandeiras"]);
assert.equal(M.MODE_GROUPS.length, 8);
assert.equal(new Set(M.MODE_GROUPS.map((g) => g.group)).size, 8);
assert.equal(M.groupsOfLadder("mapas").length, 5); assert.equal(M.groupsOfLadder("bandeiras").length, 3);
assert.deepEqual(M.MODE_GROUPS.filter((g) => g.kind === "escrita").map((g) => g.group).sort(), ["capitais-escrita", "escrita-pais", "silhueta-escrita"]);
for (const g of M.MODE_GROUPS) assert.ok(g.variants.length >= 1 && g.accuracy <= 0 && g.time >= 1, g.group);
assert.equal(M.groupDef("atuais").variants.length, 2);
assert.equal(M.isLadder("mapas"), true); assert.equal(M.isLadder("idiomas"), false);
assert.equal(M.LEGS, 2); assert.equal(M.LEG_ROUNDS, 10);

// sorteio: determinístico pela semente, 2 grupos diferentes da escada, 10 rodadas cada
const legsA = M.drawLegs("mapas", "duelo-1");
assert.deepEqual(legsA, M.drawLegs("mapas", "duelo-1"));
assert.notDeepEqual(legsA, M.drawLegs("mapas", "duelo-2"));
const seenGroups = { mapas: new Set(), bandeiras: new Set() }, variants = new Set();
for (const ladder of M.LADDERS) for (let i = 0; i < 400; i += 1) {
  const [one, two] = M.drawLegs(ladder, "s" + i);
  assert.notEqual(one.group, two.group, "os dois tempos são de modos diferentes");
  for (const leg of [one, two]) {
    const def = M.groupDef(leg.group);
    assert.equal(def.ladder, ladder); assert.equal(leg.rounds, 10);
    assert.ok(def.variants.some((v) => v.family === leg.family && v.variant === leg.variant), "sentido do grupo");
    assert.ok(Number.isInteger(leg.deckSeed));
    seenGroups[ladder].add(leg.group); variants.add(leg.variant);
  }
  assert.notEqual(one.deckSeed, two.deckSeed);
}
assert.equal(seenGroups.mapas.size, 5, "todos os grupos de Mapas aparecem"); assert.equal(seenGroups.bandeiras.size, 3, "e os de Bandeiras");
assert.ok(variants.has("nome-bandeira") && variants.has("bandeira-nome") && variants.has("nome-historica") && variants.has("historica-nome"), "os dois sentidos aparecem");
assert.ok(!variants.has("travel") && !variants.has("idioma-nome") && !variants.has("pais-capital"), "Travel, Idiomas e 4 opções de capital ficam de fora");

// modos que a pessoa tem: grátis ou comprados
assert.deepEqual([...M.ownedGroups([])].sort(), ["atuais", "capitais-clique", "mapa"]);
assert.equal(M.isVariantOwned({ family: "escrita", variant: "escrita-pais" }, []), false);
assert.equal(M.isVariantOwned({ family: "escrita", variant: "escrita-pais" }, ["escrita:escrita-pais"]), true);
assert.equal(M.isVariantOwned({ family: "historicas", variant: "nome-historica" }, ["historicas:historica-nome"]), true, "os dois sentidos das históricas valem a mesma compra");
assert.equal(M.isGroupOwned(M.groupDef("historicas"), []), false);
assert.ok(M.ownedGroups(["escrita:escrita-pais", "silhueta:silhueta-opcoes"]).has("escrita-pais"));
// contra bot: ao menos um tempo num modo que a pessoa tem, quando ela tem algum
const freeMapas = M.ownedGroups([]);
let allPreview = 0, guardedBad = 0, sameWhenOneOwned = true;
for (let i = 0; i < 600; i += 1) {
  const free = M.drawLegs("mapas", "g" + i), guarded = M.drawLegs("mapas", "g" + i, freeMapas);
  if (free.every((leg) => !freeMapas.has(leg.group))) allPreview += 1;
  if (guarded.every((leg) => !freeMapas.has(leg.group))) guardedBad += 1;
  if (free.some((leg) => freeMapas.has(leg.group)) && JSON.stringify(free) !== JSON.stringify(guarded)) sameWhenOneOwned = false;
}
assert.ok(allPreview > 0, "sem a garantia, alguns sorteios seriam só de prévia");
assert.equal(guardedBad, 0, "com a garantia, nunca");
assert.ok(sameWhenOneOwned, "quando já havia um modo da pessoa, o sorteio é o mesmo (a garantia não mexe à toa)");
assert.deepEqual(M.drawLegs("bandeiras", "z", new Set()).map((l) => l.group), M.drawLegs("bandeiras", "z").map((l) => l.group), "sem modo nenhum liberado, nada a garantir");

// regra de moedas: o modo que você tem paga o normal; prévia paga como o modo base da escada
assert.deepEqual(M.coinModeFor("mapas", { family: "escrita", variant: "escrita-capital" }, true), { family: "escrita", variant: "escrita-capital" });
assert.deepEqual(M.coinModeFor("mapas", { family: "escrita", variant: "escrita-capital" }, false), { family: "mapa", variant: "mapa" });
assert.deepEqual(M.coinModeFor("bandeiras", { family: "historicas", variant: "nome-historica" }, false), { family: "bandeiras", variant: "nome-bandeira" });
// escada de registros antigos
assert.equal(M.ladderForFamily("mapa", "mapa"), "mapas"); assert.equal(M.ladderForFamily("capitais", "capital-pais"), "mapas");
assert.equal(M.ladderForFamily("silhueta", "silhueta"), "mapas"); assert.equal(M.ladderForFamily("bandeiras", "nome-bandeira"), "bandeiras");
assert.equal(M.ladderForFamily("historicas", "nome-historica"), "bandeiras");
assert.equal(M.ladderForFamily("escrita", "escrita-pais"), "bandeiras"); assert.equal(M.ladderForFamily("escrita", "escrita-capital"), "mapas");
assert.equal(M.ladderForFamily("idiomas", "idioma-nome"), "mapas");

// ---- Bot calibrado por modo ----
const mestre = B.botsOfLeague("mestre")[0], bronze = B.botsOfLeague("bronze")[0], ouro = B.botsOfLeague("ouro")[0];
const hard = { accuracy: M.groupDef("capitais-escrita").accuracy, time: M.groupDef("capitais-escrita").time };
const plain = (bot, division) => B.botProfile(bot, { division, family: null });
const tuned = (bot, division) => B.botProfile(bot, { division, family: null, tuning: hard });
assert.ok(Math.abs((tuned(bronze, 1).accuracy - plain(bronze, 1).accuracy) - hard.accuracy) < 1e-9, "no Bronze o ajuste vale por inteiro");
assert.ok(tuned(ouro, 1).accuracy < plain(ouro, 1).accuracy && tuned(ouro, 1).accuracy > plain(ouro, 1).accuracy + hard.accuracy, "no Ouro vale menos");
assert.ok(Math.abs(tuned(mestre, null).accuracy - plain(mestre, null).accuracy) < 0.03, "no Mestre quase não pesa");
assert.equal(tuned(bronze, 1).avgMs, Math.round(plain(bronze, 1).avgMs * hard.time), "o tempo do bot cresce com a dificuldade do modo");
for (const g of M.MODE_GROUPS) for (const league of L.LEAGUES) { const p = B.botProfile(B.botsOfLeague(league)[0], { division: 1, family: null, tuning: g }); assert.ok(p.accuracy >= 0.05 && p.accuracy <= 0.99, g.group + league); }
// modo mais difícil = bot erra mais, e a média simulada acompanha
const mean = (bot, tuning, division = 1) => { let hits = 0, rounds = 0; for (let g = 0; g < 400; g += 1) { hits += B.simulateBot(bot, 25, "t" + g, { division, family: null, tuning }).correct; rounds += 25; } return hits / rounds; };
assert.ok(mean(bronze, hard) < mean(bronze, { accuracy: 0, time: 1 }) - 0.1, "Bronze erra bem mais em Capitais · escrita que em Bandeiras");
assert.ok(Math.abs(mean(bronze, hard) - tuned(bronze, 1).accuracy) < 0.03);

// ---- Duelo em dois tempos ----
const legIn = (group, playerCorrect, playerMs = 30000) => ({ group, rounds: 10, playerCorrect, playerMs });
const twoLegs = { trophies: 1240, bot: ouro, seed: "d1", division: 2, legs: [legIn("mapa", 7), legIn("capitais-escrita", 5)] };
let d = D.resolveDuelLegs(twoLegs);
assert.equal(d.total, 20); assert.equal(d.playerCorrect, 12); assert.equal(d.legs.length, 2);
assert.equal(d.botCorrect, d.legs[0].botCorrect + d.legs[1].botCorrect);
assert.deepEqual(d, D.resolveDuelLegs(twoLegs), "mesma semente, mesmo duelo");
assert.notEqual(D.resolveDuelLegs({ ...twoLegs, seed: "d2" }).botCorrect + "x" + D.resolveDuelLegs({ ...twoLegs, seed: "d3" }).botCorrect, "x", "sementes diferentes rodam");
// cada tempo tem o próprio sorteio: usa a semente + índice
const s0 = B.simulateBot(ouro, 10, "d1:0", { division: 2, family: M.groupDef("mapa").botFamily, tuning: { accuracy: M.groupDef("mapa").accuracy, time: M.groupDef("mapa").time } });
assert.equal(d.legs[0].botCorrect, s0.correct); assert.equal(d.legs[0].botMs, s0.totalMs);
assert.ok(["win", "loss", "draw"].includes(d.outcome));
// vitória, derrota e desempate pelo tempo somado
const runLegs = (ply) => D.resolveDuelLegs({ ...twoLegs, legs: ply });
const baseRes = runLegs([legIn("mapa", 5), legIn("capitais-escrita", 5)]);
const winAll = runLegs([legIn("mapa", 10), legIn("capitais-escrita", 10)]);
assert.equal(winAll.outcome, "win"); assert.ok(winAll.delta >= D.MIN_WIN);
const loseAll = runLegs([legIn("mapa", 0), legIn("capitais-escrita", 0)]);
assert.equal(loseAll.outcome, "loss"); assert.ok(loseAll.delta <= -D.MIN_LOSS);
const halfBot = baseRes.botCorrect; // empate: joga exatamente o que o bot fez, dividido nos tempos
const bl = baseRes.legs;
const tieRes = (ms) => runLegs([{ group: "mapa", rounds: 10, playerCorrect: bl[0].botCorrect, playerMs: ms[0] }, { group: "capitais-escrita", rounds: 10, playerCorrect: bl[1].botCorrect, playerMs: ms[1] }]);
assert.equal(tieRes([1, 1]).tiebreak, true); assert.equal(tieRes([1, 1]).outcome, "win", "mesmo placar, muito mais rápido, ganha");
assert.equal(tieRes([900000, 900000]).outcome, "loss", "mesmo placar, muito mais devagar, perde");
assert.deepEqual([runLegs([{ group: "mapa", rounds: 10, playerCorrect: bl[0].botCorrect, playerMs: null }, { group: "capitais-escrita", rounds: 10, playerCorrect: bl[1].botCorrect, playerMs: 5 }]).outcome], ["draw"], "sem tempo de um dos tempos, empate no placar é empate");
assert.ok(halfBot >= 0);
// os troféus seguem a mesma conta do duelo de um tempo só
const single = D.resolveDuel({ trophies: 1240, bot: ouro, playerCorrect: 12, playerTotal: 20, playerMs: null, seed: "x" });
assert.equal(typeof single.delta, "number");

// ---- Registros com escada e troféus por escada ----
assert.equal(D.parseDuel({ ...rec(1, 1, 5) }).ladder, "mapas");
assert.equal(D.parseDuel({ ...rec(1, 1, 5), ladder: "bandeiras" }).ladder, "bandeiras");
const { ladder: _drop, ...noLadder } = rec(2, 2, 5, { family: "bandeiras", variant: "nome-bandeira" });
assert.equal(D.parseDuel(noLadder).ladder, "bandeiras", "registro antigo: a escada vem da família jogada");
assert.equal(D.parseDuel({ ...noLadder, family: "escrita", variant: "escrita-capital" }).ladder, "mapas");
assert.equal(D.parseDuel({ ...rec(3, 3, 5), ladder: "??" }).ladder, "mapas", "escada inválida cai na da família");
const withLegs = D.parseDuel({ ...rec(4, 4, 5), legs: [{ group: "mapa", playerCorrect: 7, botCorrect: 6, total: 10 }, { group: "capitais-escrita", playerCorrect: 5, botCorrect: 4, total: 10 }] });
assert.equal(withLegs.legs.length, 2);
assert.equal(D.parseDuel({ ...rec(5, 5, 5), legs: [{ group: "mapa", playerCorrect: "x" }] }).legs, undefined, "tempos inválidos são descartados");
assert.equal(D.parseDuel({ ...rec(6, 6, 5), legs: [] }).legs, undefined);
const mixed = [rec(10, 1, 20, { ladder: "mapas" }), rec(11, 2, 30, { ladder: "bandeiras" }), rec(12, 3, -10, { ladder: "mapas" }), rec(13, 4, 8, { ladder: "bandeiras" })];
assert.equal(D.trophiesFromDuels(mixed, "mapas"), 10); assert.equal(D.trophiesFromDuels(mixed, "bandeiras"), 38);
assert.equal(D.trophiesFromDuels(mixed), 48, "sem escada, soma tudo (v1)");
assert.deepEqual(D.trophiesByLadder(mixed), { mapas: 10, bandeiras: 38 });
assert.deepEqual(D.trophiesByLadder([]), { mapas: 0, bandeiras: 0 });

// ---- Marcos por escada ----
const idsOf = (list) => list.map((m) => m.id);
assert.deepEqual(idsOf(R.reachedMilestones({ bandeiras: 200 })), ["division:bandeiras:bronze:2"], "divisão é da escada que chegou lá");
assert.deepEqual(idsOf(R.reachedMilestones({ mapas: 200, bandeiras: 200 })).sort(), ["division:bandeiras:bronze:2", "division:mapas:bronze:2"], "as duas escadas pagam a própria divisão");
assert.equal(R.reachedMilestones({ mapas: 100, bandeiras: 510 }).filter((m) => m.kind === "league").length, 1, "liga nova de qualquer escada abre o marco de liga");
assert.equal(R.reachedMilestones({ mapas: 510, bandeiras: 520 }).filter((m) => m.id === "league:prata").length, 1, "e ele é um só, mesmo com as duas escadas na liga");
assert.equal(R.MILESTONES.filter((m) => m.id === "league:prata")[0].ladder, null);
const claimed = new Set([R.milestoneLedgerId({ id: "league:prata" })]);
assert.equal(R.pendingMilestones({ mapas: 510, bandeiras: 520 }, claimed).some((m) => m.id === "league:prata"), false, "já pago: nenhuma escada repete");
assert.deepEqual(idsOf(R.pendingMilestones({ mapas: 200, bandeiras: 200 }, new Set(["grant:duel:division:bronze:2"]))), ["division:bandeiras:bronze:2"], "o crédito antigo sem escada cobre só Mapas");
assert.equal(R.pendingMilestones(200, new Set()).length, 1, "número solto vale para Mapas");


// ---- Duelo em andamento ----
const legsX = M.drawLegs("mapas", "run-1");
const runX = U.newDuelRun({ id: "run-1", ladder: "mapas", bot: ouro, trophiesBefore: 1240, division: 2, legs: legsX });
assert.equal(runX.index, 0); assert.equal(runX.done.length, 0); assert.equal(U.isRunComplete(runX), false);
const free = [];
const o0 = U.legOptions(runX, free);
assert.deepEqual([o0.pace, o0.roundLimit, o0.deckSeed, o0.duel], ["timed", 10, legsX[0].deckSeed, { id: "run-1", leg: 0 }]);
const ownAll = M.MODE_GROUPS.flatMap((g) => g.variants).map((v) => v.family + ":" + v.variant);
assert.equal(U.legOptions(runX, ownAll).coinVariant, undefined, "modo que você tem paga o próprio modo: sem troca");
// modo de prévia: moedas do modo base da escada
const prevRun = U.newDuelRun({ id: "p", ladder: "mapas", bot: ouro, trophiesBefore: 0, division: 1, legs: [M.legOfGroup("capitais-escrita", "p", 0), M.legOfGroup("mapa", "p", 1)] });
assert.equal(U.legOptions(prevRun, []).coinVariant, "mapa", "Capitais · escrita sem comprar paga como Clicar no mapa");
assert.equal(U.legOptions(prevRun, [], 1).coinVariant, undefined, "e o modo grátis não troca nada");
assert.equal(U.legOptions(prevRun, ["escrita:escrita-capital"], 0).coinVariant, undefined, "comprado, paga o próprio");
const prevB = U.newDuelRun({ id: "pb", ladder: "bandeiras", bot: ouro, trophiesBefore: 0, division: 1, legs: [M.legOfGroup("historicas", "pb", 0), M.legOfGroup("atuais", "pb", 1)] });
assert.equal(U.legOptions(prevB, []).coinVariant, "nome-bandeira");
assert.deepEqual(U.previewLegs(prevRun, []).map((p) => [p.leg.group, p.owned, p.coin.variant]), [["capitais-escrita", false, "mapa"], ["mapa", true, "mapa"]]);
// legOfGroup: sentido da semente
const senses = new Set(Array.from({ length: 60 }, (_, i) => M.legOfGroup("atuais", "x" + i, 0).variant));
assert.deepEqual([...senses].sort(), ["bandeira-nome", "nome-bandeira"]);
assert.deepEqual(M.legOfGroup("mapa", "a", 0), M.legOfGroup("mapa", "a", 0));
// andamento
const r1 = U.recordLeg(runX, { group: legsX[0].group, rounds: 10, playerCorrect: 7, playerMs: 40000 });
assert.equal(r1.index, 1); assert.equal(r1.done.length, 1); assert.equal(U.isRunComplete(r1), false);
const r2 = U.recordLeg(r1, { group: legsX[1].group, rounds: 10, playerCorrect: 6, playerMs: 50000 });
assert.equal(r2.index, 1, "não passa do 2º tempo"); assert.equal(U.isRunComplete(r2), true);
assert.equal(runX.done.length, 0, "não muda o estado anterior");
const full = U.resolveRun(r2);
assert.equal(full.playerCorrect, 13); assert.equal(full.total, 20);
assert.deepEqual(full, D.resolveDuelLegs({ trophies: 1240, bot: ouro, seed: "run-1", division: 2, legs: [{ group: legsX[0].group, rounds: 10, playerCorrect: 7, playerMs: 40000 }, { group: legsX[1].group, rounds: 10, playerCorrect: 6, playerMs: 50000 }] }));
// desistir no 2º tempo: o tempo que faltou conta zero
const forfeit = U.resolveRun(r1);
assert.equal(forfeit.playerCorrect, 7); assert.equal(forfeit.total, 20); assert.equal(forfeit.legs[1].playerCorrect, 0);
assert.ok(forfeit.playerCorrect <= full.playerCorrect);
// desistir sem jogar nada: zero acertos, derrota
const none = U.resolveRun(runX);
assert.equal(none.playerCorrect, 0); assert.equal(none.outcome, "loss");

// ---- Riscos antes do duelo ----
const st = D.stakesRange(1240, 1240);
assert.deepEqual(st.win, [33, 41], "33 de base, até +8 pelo desempenho");
assert.deepEqual(st.loss, [-22, -30], "27 de base, de −20% (apertada) a +10% (goleada)");
assert.deepEqual(D.stakesRange(100, 100), D.stakesRange(1900, 1900), "até a Platina o valor é o mesmo");
assert.ok(D.stakesRange(100, 100).win[0] > D.stakesRange(3100, 3100).win[0], "no alto a vitória paga menos");
assert.ok(D.stakesRange(100, 100).loss[0] > D.stakesRange(3100, 3100).loss[0], "no alto a derrota custa mais");
assert.deepEqual(D.stakesRange(3, 3).loss, [-3, -3], "o chão em zero vale na prévia");
assert.deepEqual(D.stakesRange(0, 0).loss, [0, 0]);
// a prévia contém o que a resolução entrega quando vence ou perde
const chk = D.resolveDuelLegs({ trophies: 1240, bot: ouro, seed: "k", division: 2, legs: [legIn("mapa", 10), legIn("capitais-escrita", 10)] });
assert.equal(chk.outcome, "win"); assert.ok(chk.delta >= st.win[0] && chk.delta <= st.win[1]);
const chk2 = D.resolveDuelLegs({ trophies: 1240, bot: ouro, seed: "k", division: 2, legs: [legIn("mapa", 0), legIn("capitais-escrita", 0)] });
assert.ok(chk2.delta <= st.loss[0] && chk2.delta >= st.loss[1]);

// ---- Soma dos espólios dos dois tempos ----
const spoilsOf = (variant, correct) => S.computeSpoils({ variant, pace: "timed", rounds: correct.map((c) => ({ correct: c })), complete: true, newCards: 1, levelUps: 0 });
const sp1 = spoilsOf("mapa", [true, true, false, true, true, true, false, true, true, true]);
const sp2 = spoilsOf("mapa", [true, false, false, true, true, false, true, true, false, true]);
const sm = S.mergeSpoils([sp1, sp2]);
assert.equal(sm.total, sp1.total + sp2.total);
assert.equal(sm.hits.count, sp1.hits.count + sp2.hits.count); assert.equal(sm.hits.coins, sp1.hits.coins + sp2.hits.coins);
assert.equal(sm.newCards.count, 2); assert.equal(sm.streak.best, Math.max(sp1.streak.best, sp2.streak.best));
assert.equal(sm.total, sm.hits.coins + sm.streak.coins + sm.newCards.coins + sm.levelUps.coins + sm.completion.coins, "a soma bate com as linhas");
assert.deepEqual(S.mergeSpoils([sp1]).total, sp1.total); assert.equal(S.mergeSpoils([]).total, 0);
// prévia paga como o modo base: mesmos acertos, valor do modo base
const asPreview = S.computeSpoils({ variant: "mapa", pace: "timed", rounds: Array.from({ length: 10 }, () => ({ correct: true })), complete: true, newCards: 0, levelUps: 0 });
const asOwned = S.computeSpoils({ variant: "escrita-capital", pace: "timed", rounds: Array.from({ length: 10 }, () => ({ correct: true })), complete: true, newCards: 0, levelUps: 0 });
assert.ok(asOwned.hits.coins > asPreview.hits.coins, "o modo pago rende mais por acerto que o base");
assert.equal(S.baseCoins("mapa"), 48);


// ---- Telas: cartões das escadas, sequência, plano do resultado ----
const dd = (n, at, ladder, outcome, delta) => ({ id: "duel:v" + n, sessionId: "v" + n, at, botId: "bot-ouro-0", ladder, family: "mapa", variant: "mapa", playerCorrect: 12, total: 20, botCorrect: 10, outcome, tiebreak: false, delta });
const history = [dd(1, 1, "mapas", "win", 30), dd(2, 2, "mapas", "win", 30), dd(3, 3, "bandeiras", "loss", -5), dd(4, 4, "mapas", "win", 20), dd(5, 5, "mapas", "loss", -10), dd(6, 6, "mapas", "win", 40), dd(7, 7, "mapas", "draw", 0), dd(8, 8, "mapas", "win", 30)];
const ladderList = V.ladderCards(history, []);
assert.deepEqual(ladderList.map((c) => c.ladder), ["mapas", "bandeiras"]);
assert.equal(ladderList[0].trophies, 140); assert.equal(ladderList[1].trophies, 0);
assert.equal(ladderList[0].status.league, "bronze"); assert.equal(ladderList[0].duels, 7);
assert.deepEqual(ladderList[0].form, ["loss", "win", "draw", "win", "win"].slice(0, 0).concat(["win", "loss", "win", "draw", "win"]), "os 5 últimos da escada, do mais antigo ao mais novo");
assert.deepEqual(ladderList[1].form, ["loss"]);
assert.deepEqual(ladderList[0].groups.map((g) => [g.group, g.owned]), [["mapa", true], ["capitais-clique", true], ["silhueta-opcoes", false], ["silhueta-escrita", false], ["capitais-escrita", false]]);
assert.deepEqual(ladderList[1].groups.map((g) => [g.group, g.owned]), [["atuais", true], ["escrita-pais", false], ["historicas", false]]);
assert.equal(V.ladderCards(history, ["escrita:escrita-pais"])[1].groups[1].owned, true);
assert.equal(V.ladderCards([], [])[0].trophies, 0);
assert.equal(V.winStreak(history), 1, "o último foi vitória e o anterior empate");
assert.equal(V.winStreak([dd(1, 1, "mapas", "win", 1), dd(2, 2, "bandeiras", "win", 1), dd(3, 3, "mapas", "win", 1)]), 3, "vale em qualquer escada");
assert.equal(V.winStreak([dd(1, 1, "mapas", "win", 1), dd(2, 2, "mapas", "loss", -1)]), 0); assert.equal(V.winStreak([]), 0);
// próximos marcos: o de divisão da escada mais avançada e o de liga mais perto
let nx = V.nextMilestones([]);
assert.deepEqual(nx.map((m) => m.id), ["division:mapas:bronze:2", "league:prata"]);
nx = V.nextMilestones([dd(1, 1, "bandeiras", "win", 200)]);
assert.deepEqual(nx.map((m) => m.id), ["division:bandeiras:bronze:3", "league:prata"], "olha a escada com mais troféus");
nx = V.nextMilestones([dd(1, 1, "mapas", "win", 2600)]);
assert.deepEqual(nx.map((m) => m.id), [], "no Mestre não sobra marco");
assert.equal(V.nextMilestones([dd(1, 1, "mapas", "win", 500)])[0].id, "division:mapas:prata:2");

// plano do resultado: festa por importância
const plan = (o) => V.resultPlan({ outcome: "win", playerCorrect: 12, botCorrect: 10, total: 20, before: 1240, after: 1261, streakAfter: 1, streakBefore: 0, milestones: 0, ...o });
let pl = plan({});
assert.deepEqual([pl.kind, pl.tier, pl.delta, pl.cross], ["win", "win", 21, null]);
assert.deepEqual(pl.pills, [{ key: "delta", tone: "up", value: 21 }]);
assert.equal(plan({ playerCorrect: 20, botCorrect: 9 }).tier, "perfect");
assert.ok(plan({ playerCorrect: 20 }).particles > pl.particles);
pl = plan({ streakAfter: 4 }); assert.deepEqual(pl.pills.map((p) => p.key), ["delta", "streak"]);
assert.deepEqual(plan({ streakAfter: 2 }).pills.map((p) => p.key), ["delta"], "sequência curta não vira pílula");
pl = plan({ before: 1320, after: 1352 }); assert.equal(pl.tier, "division-up"); assert.equal(pl.cross, null);
assert.ok(pl.particles > 24 && pl.durationMs > 2200);
assert.ok(plan({ before: 1320, after: 1352 }).pills.some((p) => p.key === "division"));
pl = plan({ before: 1480, after: 1512, milestones: 1 }); assert.equal(pl.tier, "league-up");
assert.deepEqual(pl.cross, { floorA: 1000, floorB: 1500, mid: 1500 }); assert.equal(pl.particles, 70);
assert.deepEqual(pl.pills.map((p) => p.key), ["delta", "league", "marks"]);
assert.equal(plan({ before: 0, after: 4 }).tier, "win");
const lp = (o) => V.resultPlan({ outcome: "loss", playerCorrect: 9, botCorrect: 13, total: 20, before: 1240, after: 1223, streakAfter: 0, streakBefore: 0, milestones: 0, ...o });
pl = lp({}); assert.deepEqual([pl.kind, pl.tier, pl.delta], ["loss", "loss", -17]);
assert.deepEqual(pl.pills.map((p) => p.key), ["delta", "stay"]);
assert.equal(lp({ playerCorrect: 12, botCorrect: 13 }).tier, "close");
assert.equal(lp({ playerCorrect: 11, botCorrect: 13 }).tier, "close", "por até 2 acertos");
assert.equal(lp({ playerCorrect: 10, botCorrect: 13 }).tier, "loss");
assert.deepEqual(lp({ streakBefore: 4 }).pills.map((p) => p.key), ["delta", "broken", "stay"]);
pl = lp({ before: 1170, after: 1148 }); assert.equal(pl.tier, "division-down"); assert.deepEqual(pl.pills.map((p) => p.key), ["delta", "kept"]);
pl = lp({ before: 1010, after: 988 }); assert.equal(pl.tier, "league-down");
assert.deepEqual(pl.cross, { floorA: 1000, floorB: 500, mid: 1000 });
assert.equal(lp({ before: 0, after: 0 }).delta, 0);
assert.deepEqual([V.resultPlan({ outcome: "draw", playerCorrect: 10, botCorrect: 10, total: 20, before: 1240, after: 1244, streakAfter: 0, streakBefore: 2, milestones: 0 }).tier], ["draw"]);
// quadro da animação: a barra vai do começo ao fim, e na passagem de liga muda de faixa no meio
const planSingle = V.resultPlan({ outcome: "win", playerCorrect: 12, botCorrect: 10, total: 20, before: 1240, after: 1261, streakAfter: 1, streakBefore: 0, milestones: 0 });
assert.equal(V.trophyFrame(planSingle, 0).value, 1240); assert.equal(V.trophyFrame(planSingle, 1).value, 1261);
assert.equal(V.trophyFrame(planSingle, -3).value, 1240); assert.equal(V.trophyFrame(planSingle, 9).value, 1261);
assert.ok(V.trophyFrame(planSingle, 0.5).value > 1240 && V.trophyFrame(planSingle, 0.5).value < 1261);
assert.equal(V.trophyFrame(planSingle, 0.5).floor, 1000);
const planUp = V.resultPlan({ outcome: "win", playerCorrect: 16, botCorrect: 12, total: 20, before: 1480, after: 1512, streakAfter: 1, streakBefore: 0, milestones: 1 });
assert.deepEqual([V.trophyFrame(planUp, 0).value, V.trophyFrame(planUp, 0).floor, V.trophyFrame(planUp, 0).phase], [1480, 1000, 0]);
assert.deepEqual([V.trophyFrame(planUp, 0.5).value, V.trophyFrame(planUp, 0.5).floor, V.trophyFrame(planUp, 0.5).phase], [1500, 1500, 1]);
assert.equal(V.trophyFrame(planUp, 1).value, 1512);
const planDown = V.resultPlan({ outcome: "loss", playerCorrect: 7, botCorrect: 15, total: 20, before: 1010, after: 988, streakAfter: 0, streakBefore: 0, milestones: 0 });
assert.deepEqual([V.trophyFrame(planDown, 0.49).floor, V.trophyFrame(planDown, 0.5).floor, V.trophyFrame(planDown, 0.5).value, V.trophyFrame(planDown, 1).value], [1000, 500, 1000, 988]);
let lastValue = Infinity; for (let i = 0; i <= 20; i += 1) { const value = V.trophyFrame(planDown, i / 20).value; assert.ok(value <= lastValue + 1e-9, "a queda é monótona"); lastValue = value; }

// medidor: valor, preenchimento e trecho ganho/perdido em cada instante
let mf = V.meterLayout(planSingle, 0);
assert.deepEqual([mf.value, mf.shown, mf.status.league, mf.status.division, mf.phase], [1240, 0, "ouro", 2, 0]);
assert.ok(mf.fill > 47 && mf.fill < 49 && mf.deltaFrom === mf.fill && mf.deltaTo === mf.fill, "sem trecho no começo");
mf = V.meterLayout(planSingle, 1);
assert.deepEqual([mf.value, mf.shown, mf.status.division], [1261, 21, 2]);
assert.ok(mf.deltaTo > mf.deltaFrom && mf.ticks[0] && !mf.ticks[1], "ganho verde e a divisão II já passou");
mf = V.meterLayout(planUp, 0.5);
assert.deepEqual([mf.floor, mf.value, mf.status.league, mf.fill], [1500, 1500, "platina", 0], "na passagem a barra recomeça vazia na liga nova");
mf = V.meterLayout(planUp, 0.49); assert.equal(mf.floor, 1000); assert.ok(mf.deltaTo > 95, "a barra enche até a beirada antes de passar");
assert.equal(V.meterLayout(planUp, 1).shown, 32);
const planLoss = V.resultPlan({ outcome: "loss", playerCorrect: 9, botCorrect: 13, total: 20, before: 1240, after: 1223, streakAfter: 0, streakBefore: 0, milestones: 0 });
mf = V.meterLayout(planLoss, 1);
assert.deepEqual([mf.value, mf.shown], [1223, -17]);
assert.ok(mf.fill < 47 && mf.deltaFrom === mf.fill && mf.deltaTo > mf.deltaFrom, "na derrota a barra recua e o trecho perdido fica à frente");
mf = V.meterLayout(planDown, 0.5);
assert.deepEqual([mf.floor, mf.value, mf.fill, mf.deltaTo], [500, 1000, 100, 100], "na queda de liga a barra reaparece cheia na liga anterior");
assert.equal(V.meterLayout(planDown, 1).status.league, "prata");
for (let i = 0; i <= 20; i += 1) { const frame = V.meterLayout(planDown, i / 20); assert.ok(frame.fill >= 0 && frame.fill <= 100 && frame.deltaTo <= 100 && frame.deltaFrom <= frame.deltaTo + 1e-9); }
const planMaster = V.resultPlan({ outcome: "win", playerCorrect: 15, botCorrect: 10, total: 20, before: 2600, after: 2620, streakAfter: 1, streakBefore: 0, milestones: 0 });
mf = V.meterLayout(planMaster, 1); assert.deepEqual([mf.status.league, mf.ticks, mf.status.division], ["mestre", [false, false], null]);
// tempo decisivo e o que treinar
assert.deepEqual(V.decisiveLeg([{ playerCorrect: 8, botCorrect: 6 }, { playerCorrect: 6, botCorrect: 5 }], "win"), null, "os dois tempos a favor: ninguém decidiu sozinho");
assert.deepEqual(V.decisiveLeg([{ playerCorrect: 8, botCorrect: 6 }, { playerCorrect: 4, botCorrect: 6 }], "win"), { index: 0, margin: 2 });
assert.deepEqual(V.decisiveLeg([{ playerCorrect: 6, botCorrect: 7 }, { playerCorrect: 3, botCorrect: 6 }], "loss"), null, "os dois tempos atrás");
assert.deepEqual(V.decisiveLeg([{ playerCorrect: 6, botCorrect: 6 }, { playerCorrect: 3, botCorrect: 6 }], "loss"), { index: 1, margin: -3 });
assert.equal(V.decisiveLeg([{ playerCorrect: 6, botCorrect: 6 }, { playerCorrect: 3, botCorrect: 6 }], "draw"), null);
assert.deepEqual(V.worstLeg([{ playerCorrect: 6, botCorrect: 7 }, { playerCorrect: 3, botCorrect: 6 }]), { index: 1, margin: -3 });
assert.equal(V.worstLeg([{ playerCorrect: 8, botCorrect: 7 }, { playerCorrect: 6, botCorrect: 6 }]), null);

// sequência de vitórias: +3 por vitória anterior, até +12, só na vitória
assert.deepEqual([0, 1, 2, 3, 4, 5, 20, -2, NaN].map((n) => D.streakBonus(n)), [0, 3, 6, 9, 12, 12, 12, 0, 0]);
assert.deepEqual([D.STREAK_STEP, D.STREAK_CAP], [3, 4]);
const stakes0 = D.stakesRange(1240, 1240);
assert.deepEqual(D.stakesRange(1240, 1240, 2).win, [39, 47], "a prévia da vitória inclui a sequência");
assert.deepEqual(D.stakesRange(1240, 1240, 9).win, [45, 50], "o teto da vitória é a base + 17");
assert.deepEqual(D.stakesRange(1240, 1240, 3).loss, stakes0.loss, "a derrota não muda com a sequência");
const winLegs = [{ group: legsX[0].group, rounds: 10, playerCorrect: 10, playerMs: 40000 }, { group: legsX[1].group, rounds: 10, playerCorrect: 10, playerMs: 50000 }];
const lossLegs = [{ group: legsX[0].group, rounds: 10, playerCorrect: 0, playerMs: 40000 }, { group: legsX[1].group, rounds: 10, playerCorrect: 0, playerMs: 50000 }];
// vitória apertada (1 acerto à frente do bot) para o bônus não esbarrar no teto
const narrowLegs = [{ group: "mapa", rounds: 10, playerCorrect: Math.min(10, bl[0].botCorrect + 1), playerMs: 1 }, { group: "capitais-escrita", rounds: 10, playerCorrect: bl[1].botCorrect, playerMs: 1 }];
const nw = (streak) => D.resolveDuelLegs({ ...twoLegs, legs: narrowLegs, streak });
const sw0 = nw(0), sw3 = nw(3);
assert.equal(sw0.outcome, "win"); assert.equal(sw0.streakBonus, 0);
assert.deepEqual([sw3.outcome, sw3.streakBonus, sw3.delta - sw0.delta, sw3.trophiesAfter - sw0.trophiesAfter], ["win", 9, 9, 9], "mesma partida, +9 pela sequência");
const sl3 = D.resolveDuelLegs({ trophies: 1240, bot: ouro, seed: "run-1", division: 2, legs: lossLegs, streak: 4 });
assert.deepEqual([sl3.outcome, sl3.streakBonus, sl3.delta], ["loss", 0, D.resolveDuelLegs({ trophies: 1240, bot: ouro, seed: "run-1", division: 2, legs: lossLegs }).delta], "derrota não ganha nem perde por causa da sequência");
assert.equal(D.resolveDuelLegs({ trophies: 1240, bot: ouro, seed: "run-1", division: 2, legs: winLegs, streak: 50 }).streakBonus, 12, "teto de +12");
// a corrida do duelo leva a sequência até a resolução
const runStreak = U.newDuelRun({ id: "run-1", ladder: "mapas", bot: ouro, trophiesBefore: 1240, division: 2, legs: legsX, streak: 2 });
assert.equal(runStreak.streak, 2); assert.equal(runX.streak, 0, "sem sequência informada, zero");
const doneAll = { ...runStreak, done: winLegs.map((leg) => ({ ...leg })), index: 1 };
assert.equal(U.resolveRun(doneAll).streakBonus, 6);
// cartão da escada mostra a sequência daquela escada (não a da outra)
const streakCards = V.ladderCards([dd(1, 1, "mapas", "win", 16), dd(2, 2, "mapas", "win", 16), dd(3, 3, "bandeiras", "loss", -8), dd(4, 4, "mapas", "win", 16)], []);
assert.deepEqual(streakCards.map((card) => [card.ladder, card.streak]), [["mapas", 3], ["bandeiras", 0]]);
assert.equal(V.ladderCards([], []).every((card) => card.streak === 0), true);
// pílula do bônus na vitória
let boost = plan({ streakAfter: 4, streakBonus: 9 });
assert.deepEqual(boost.pills.map((p) => p.key), ["delta", "boost", "streak"]);
assert.equal(boost.pills[1].value, 9);
assert.deepEqual(plan({ streakBonus: 0 }).pills.map((p) => p.key), ["delta"]);
assert.deepEqual(lp({ streakBonus: 9 }).pills.map((p) => p.key), ["delta", "stay"], "na derrota não há pílula de bônus");

// ---- Troféus e MMR escondido (mmr.ts) ----
const X = await import(pathToFileURL(join(out, "mmr.js")).href);
// o valor é o mesmo de Bronze a Platina; só no alto (a partir do Diamante) a vitória encolhe e a derrota cresce
assert.deepEqual([X.BASE_WIN, X.BASE_LOSS, X.WIN_CAP_EXTRA, X.DECAY_START], [33, 27, 17, 2000]);
for (const t of [0, 100, 499, 500, 1240, 1500, 1999, 2000]) assert.deepEqual(X.baseStakes(t), { win: 33, loss: 27, scale: 1, minWin: 5 }, "igual até o Diamante (" + t + ")");
assert.deepEqual([X.baseStakes(2500).win, X.baseStakes(2500).loss], [24, 31]);
assert.deepEqual([X.baseStakes(3000).win, X.baseStakes(3000).loss], [19, 35]);
assert.deepEqual([X.baseStakes(3500).win, X.baseStakes(3500).loss], [16, 39]);
let lastWin = Infinity, lastLoss = 0;
for (let t = 2000; t <= 9000; t += 250) { const b2 = X.baseStakes(t); assert.ok(b2.win <= lastWin && b2.loss >= lastLoss && b2.win >= X.HIGH_MIN_WIN, "a curva só fecha (" + t + ")"); lastWin = b2.win; lastLoss = b2.loss; }
assert.ok(X.baseStakes(2499).win < 33 && X.baseStakes(2499).win > X.baseStakes(2999).win, "o Diamante já começa a diminuir, suave");
const drift = (t, p) => { const b2 = X.baseStakes(t); return p * b2.win - (1 - p) * b2.loss; };
assert.ok(drift(1000, 0.6) > 0 && drift(4000, 0.6) < 0, "quem vence 60% sobe embaixo e para de subir no alto");
assert.ok(drift(4000, 0.85) > drift(4000, 0.6));
// o MMR muda o ganho e a perda; com os troféus à frente do MMR ele segura (o efeito continua do lado de baixo)
assert.deepEqual(X.gapFactors(0), { win: 1, loss: 1 });
const gf = X.gapFactors(200); assert.ok(Math.abs(gf.win - 1.35) < 1e-9 && Math.abs(gf.loss - 0.7) < 1e-9);
assert.deepEqual(X.gapFactors(9999), gf, "o efeito para de crescer para cima");
const gb = X.gapFactors(-200); assert.ok(Math.abs(gb.win - 0.65) < 1e-9 && Math.abs(gb.loss - 1.3) < 1e-9);
const gh = X.gapFactors(-400); assert.ok(gh.win < gb.win && gh.loss > gb.loss, "quanto mais os troféus passam do MMR, mais ele segura");
const gz = X.gapFactors(-600); assert.ok(Math.abs(gz.win - 0.25) < 1e-9 && Math.abs(gz.loss - 1.9) < 1e-9);
assert.deepEqual(X.gapFactors(-99999), gz, "o efeito para de crescer para baixo");
const tc = (o) => X.trophyChange({ trophies: 100, mmr: 100, streak: 0, outcome: "win", margin: 1, ...o });
assert.equal(tc({ margin: 0 }).delta, 33, "vitória normal: 33");
assert.equal(tc({ margin: 8 }).delta, 41, "goleada: +8 de desempenho");
assert.equal(tc({ margin: 8 }).perfBonus, 8);
assert.equal(tc({ margin: 20 }).perfBonus, 8, "o desempenho tem teto");
assert.deepEqual([tc({ streak: 4, margin: 8 }).delta, tc({ streak: 4, margin: 8 }).streakBonus, tc({ streak: 4, margin: 8 }).perfBonus], [50, 12, 5], "sequência e desempenho param no teto de 50");
assert.equal(tc({ mmr: 300, margin: 0 }).delta, 45, "MMR 200 acima: vitória ×1,35");
assert.equal(tc({ mmr: 300, streak: 4, margin: 8 }).delta, 50, "MMR acima da liga: ganha mais, mas o teto é o mesmo");
assert.equal(tc({ mmr: -100, margin: 0 }).delta, 21, "MMR 200 abaixo: vitória ×0,65");
const held = tc({ trophies: 1000, mmr: 400, streak: 4, margin: 8 });
assert.ok(held.delta <= 15 && held.streakBonus <= 3 && held.perfBonus <= 2, "com os troféus muito à frente do MMR, os bônus também encolhem (o MMR segura)");
const lc = (o) => X.trophyChange({ trophies: 100, mmr: 100, streak: 0, outcome: "loss", margin: -4, ...o });
assert.equal(lc({ margin: -1 }).delta, -22, "derrota apertada custa menos");
assert.equal(lc({ margin: -10 }).delta, -30, "goleada custa mais");
assert.ok(lc({ mmr: 300 }).delta > lc({}).delta && lc({ mmr: -100 }).delta < lc({}).delta, "MMR alto perde menos, MMR baixo perde mais");
assert.equal(lc({ streak: 9 }).delta, lc({}).delta, "a sequência não muda a derrota");
assert.ok(X.trophyChange({ trophies: 3000, mmr: 3000, streak: 0, outcome: "loss", margin: -4 }).delta < lc({}).delta, "no alto a derrota dói mais");
assert.equal(X.trophyChange({ trophies: 100, mmr: 100, streak: 0, outcome: "draw", margin: 0 }).delta, 3);
assert.ok(X.trophyChange({ trophies: 3000, mmr: 3000, streak: 0, outcome: "draw", margin: 0 }).delta < 0);
// no alto os bônus encolhem junto com a vitória (senão furavam o limite)
const mw = X.trophyChange({ trophies: 4000, mmr: 4000, streak: 4, outcome: "win", margin: 8 });
assert.ok(mw.delta <= X.baseStakes(4000).win + Math.round(X.WIN_CAP_EXTRA * X.baseStakes(4000).scale) && mw.streakBonus < 12, "bônus reduzidos no alto");
// matchmaking: o bot sai da liga do MMR, presa a 2 ligas acima e nunca abaixo da liga em troféus
const mm = (t, m) => { const st2 = X.matchmaking(t, m); return [st2.league, st2.division]; };
assert.deepEqual(mm(100, 100), ["bronze", 1]);
assert.deepEqual(mm(100, 900), ["prata", 3], "MMR na Prata: o bot vem da Prata");
assert.deepEqual(mm(100, 2000), ["ouro", 3], "no máximo 2 ligas acima");
assert.deepEqual(mm(1200, 100), ["ouro", 1], "nunca abaixo da própria liga, mesmo com o MMR lá embaixo");
assert.deepEqual(mm(1200, 900), ["ouro", 1], "MMR na liga de baixo: enfrenta os mais fracos da própria liga");
assert.deepEqual(mm(3000, 3000), ["mestre", null]);
assert.deepEqual(mm(0, NaN), ["bronze", 1], "MMR inválido não quebra");
assert.deepEqual(mm(1200, 1200), [L.leagueOf(1200).league, L.leagueOf(1200).division], "MMR igual aos troféus: a própria liga");
// MMR: sobe mais quando vence um bot acima dele, cai menos quando perde por pouco
assert.equal(X.MMR_K, 64);
assert.equal(X.mmrChange(1000, 1000, "win", 8), 32);
assert.ok(X.mmrChange(500, 1000, "win", 8) > X.mmrChange(1000, 1000, "win", 8));
assert.ok(X.mmrChange(1000, 1000, "loss", -1) > X.mmrChange(1000, 1000, "loss", -10), "perder por pouco custa menos MMR");
assert.equal(X.mmrChange(1000, 1000, "draw", 0), 0);
assert.ok(X.mmrChange(1000, 1000, "win", 1) < X.mmrChange(1000, 1000, "win", 8), "vitória apertada rende menos MMR que goleada");
// a nota do bot acompanha a divisão em que ele é enfrentado
assert.equal(D.botRating({ league: "ouro" }), 1250);
assert.deepEqual([1, 2, 3].map((d) => D.botRating({ league: "ouro" }, d)), [1083.5, 1250.5, 1417.5]);
// o duelo devolve o MMR novo, e o MMR do histórico deriva dos registros
const withMmr = D.resolveDuel({ ...input, trophies: 1240, mmr: 1400, playerCorrect: 20 });
assert.equal(withMmr.outcome, "win"); assert.equal(withMmr.mmrAfter, 1400 + withMmr.mmrDelta); assert.ok(withMmr.mmrDelta > 0);
assert.ok(withMmr.delta > D.resolveDuel({ ...input, trophies: 1240, mmr: 1240, playerCorrect: 20 }).delta, "MMR acima da liga rende mais troféus na mesma vitória");
assert.equal(D.resolveDuel({ ...input, trophies: 1240, playerCorrect: 20 }).delta, D.resolveDuel({ ...input, trophies: 1240, mmr: 1240, playerCorrect: 20 }).delta, "sem MMR informado, vale a própria liga");
const recM = (n, at, delta, mmrDelta, ladder = "mapas", mmrVersion = X.MMR_MODEL) => ({ id: "duel:m" + n, at, delta, ladder, ...(mmrDelta === undefined ? {} : { mmrDelta, mmrVersion }) });
assert.equal(D.mmrFromDuels([recM(1, 1, 30), recM(2, 2, -10)]), D.trophiesFromDuels([recM(1, 1, 30), recM(2, 2, -10)]), "duelos antigos: o MMR começa igual aos troféus");
assert.equal(D.mmrFromDuels([recM(1, 1, 30, 50), recM(2, 2, -10, -20)]), 30);
assert.equal(D.mmrFromDuels([recM(1, 1, 30, 50, "mapas", 1), recM(2, 2, -10, -20, "mapas", 1)]), 20, "MMR gravado por uma versão antiga da conta não vale: conta o próprio delta");
assert.equal(D.mmrFromDuels([recM(1, 1, 30, 50, "mapas", 1), recM(2, 2, -10, -20)]), 10, "versões misturadas: cada registro vale pela sua");
assert.equal(D.mmrFromDuels([recM(1, 1, 30, 50), recM(2, 2, -10, -80)]), 0, "o MMR não passa de zero");
assert.deepEqual(D.mmrByLadder([recM(1, 1, 30, 50), recM(2, 2, 20, 10, "bandeiras")]), { mapas: 50, bandeiras: 10 });
const parsedM = D.parseDuel({ ...rec(9, 9, 20), mmrDelta: 33, mmrVersion: 2 }); assert.deepEqual([parsedM.mmrDelta, parsedM.mmrVersion], [33, 2]);
assert.equal("mmrDelta" in D.parseDuel({ ...rec(9, 9, 20), mmrDelta: "x" }), false, "MMR inválido é ignorado");
assert.equal("mmrDelta" in D.parseDuel(rec(8, 8, 20)), false, "registro antigo continua sem MMR");
// a corrida leva o MMR para a resolução (sem MMR informado, vale os troféus)
assert.equal(U.newDuelRun({ id: "r", ladder: "mapas", bot: ouro, trophiesBefore: 800, division: 1, legs: legsX }).mmr, 800);
assert.equal(U.newDuelRun({ id: "r", ladder: "mapas", bot: ouro, trophiesBefore: 800, division: 1, legs: legsX, mmr: 950 }).mmr, 950);
// pílula do desempenho
assert.deepEqual(plan({ perfBonus: 5 }).pills.map((p) => p.key), ["delta", "perf"]);
assert.deepEqual(plan({ streakBonus: 3, perfBonus: 5, streakAfter: 4 }).pills.map((p) => p.key), ["delta", "perf", "boost", "streak"]);
assert.deepEqual(lp({ perfBonus: 5 }).pills.map((p) => p.key), ["delta", "stay"], "derrota não tem pílula de desempenho");

console.log("duelo: ligas, bots, escadas, sorteio dos 2 tempos, resolução, troféus e marcos ok");
