// Desafios (challenges.ts): os 21 desafios, os 195 países soberanos por continente, as células de cada degrau (com as lacunas do Vaticano e da
// Palestina), a moeda 1:1 ("dólar namibiano" sim, "dólar" não), o nome que abre a linha (Níger antes de Nigéria), o recorde, as medalhas e o dia.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(tmpdir(), "carta-cega-challenges-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", ["src/domain/challenges.ts", "--outDir", out, "--target", "ES2022", "--module", "ES2022", "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM", "--ignoreConfig"]);
await writeFile(join(out, "package.json"), JSON.stringify({ type: "module" }));
const C = await import(pathToFileURL(join(out, "challenges.js")).href);

const meta = JSON.parse(await readFile("public/data/legacy/catalog.json", "utf8")).meta;
const peoples = JSON.parse(await readFile("public/data/peoples.json", "utf8"));
const compare = (a, b) => a.localeCompare(b, "pt-BR");
const board = (id) => C.buildChallenge(C.challengeById(id), meta, peoples, "pt", compare);

// 3 degraus × 7 recortes; ids únicos
assert.equal(C.CHALLENGES.length, 21);
assert.equal(new Set(C.CHALLENGES.map((item) => item.id)).size, 21);

// os 195 soberanos, cada um num continente; as Américas em duas
const world = board("paises-mundo");
const rows = world.groups.flatMap((group) => group.rows);
assert.equal(rows.length, 195);
assert.equal(world.total, 195);
const counts = Object.fromEntries(world.groups.map((group) => [group.continent, group.rows.length]));
assert.deepEqual(counts, { africa: 54, "america-do-norte": 23, "america-do-sul": 12, asia: 47, europa: 45, oceania: 14 });
assert.ok(rows.some((row) => row.id === "275"), "a Palestina entra");
assert.ok(rows.some((row) => row.id === "336"), "o Vaticano entra");
assert.equal(world.seconds, 15 * 60);
for (const scope of C.CONTINENTS) assert.equal(board(`paises-${scope}`).total, counts[scope]);

// a ficha: 5 células por país menos as lacunas (o Vaticano sem gentílico, a Palestina sem moeda própria)
const ficha = board("ficha-mundo");
assert.equal(ficha.total, 195 * 5 - 2);
assert.equal(ficha.seconds, 60 * 60);
assert.equal(board("capitais-mundo").total, 390);
// o tempo = folga fixa + segundos por país, de 30 em 30 s: o mundo não muda e os recortes pequenos ganham respiro por país
assert.equal(board("paises-america-do-sul").seconds, 90);
assert.equal(board("paises-oceania").seconds, 120);
assert.equal(board("capitais-america-do-sul").seconds, 150);
assert.equal(board("capitais-america-do-norte").seconds, 240);
assert.equal(board("ficha-america-do-sul").seconds, 300);
assert.equal(board("capitais-mundo").seconds, 25 * 60 + 30);
const perCountry = (id) => board(id).seconds / board(id).groups.reduce((sum, group) => sum + group.rows.length, 0);
assert.ok(perCountry("paises-america-do-sul") > perCountry("paises-mundo") + 2, "o recorte pequeno tem mais tempo por país");
for (const tier of C.CHALLENGE_TIERS) {
  const times = C.CONTINENTS.map((scope) => board(`${tier}-${scope}`)).sort((a, b) => a.total - b.total);
  for (let index = 1; index < times.length; index += 1) assert.ok(times[index].seconds >= times[index - 1].seconds, `${tier}: mais respostas, mais tempo`);
  for (const item of times) assert.equal(item.seconds % 30, 0);
}
const rowOf = (b, id) => b.groups.flatMap((group) => group.rows).find((row) => row.id === id);
assert.ok(!rowOf(ficha, "336").cells.some((cell) => cell.column === "gentilico"));
assert.ok(!rowOf(ficha, "275").cells.some((cell) => cell.column === "moeda"));

// a moeda é 1:1: o nome completo, em qualquer dos três idiomas; as duas moedas oficiais valem (Namíbia, Panamá)
const cell = (id, column) => rowOf(ficha, id).cells.find((item) => item.column === column);
assert.ok(C.cellAccepts(cell("516", "moeda"), "dolar namibiano"));
assert.ok(C.cellAccepts(cell("516", "moeda"), "Namibian dollar"));
assert.ok(C.cellAccepts(cell("516", "moeda"), "rand"));
assert.ok(!C.cellAccepts(cell("516", "moeda"), "dolar"));
assert.ok(C.cellAccepts(cell("840", "moeda"), "Dólar americano"));
assert.ok(!C.cellAccepts(cell("840", "moeda"), "dólar"));
assert.ok(C.cellAccepts(cell("591", "moeda"), "balboa"));
assert.ok(C.cellAccepts(cell("204", "moeda"), "franco CFA da África Ocidental"));
assert.ok(!C.cellAccepts(cell("204", "moeda"), "franco CFA da África Central"));
assert.ok(!C.cellAccepts(cell("204", "moeda"), "franco"));
// capital, idioma (qualquer oficial, com ou sem o parêntese) e gentílico
assert.ok(C.cellAccepts(cell("76", "capital"), "brasilia"));
assert.ok(C.cellAccepts(cell("756", "idioma"), "romanche"));
assert.ok(C.cellAccepts(cell("756", "idioma"), "alemão"));
assert.ok(C.cellAccepts(cell("710", "idioma"), "zulu"));
assert.ok(C.cellAccepts(cell("76", "gentilico"), "brasileiro"));
assert.ok(C.cellAccepts(cell("76", "gentilico"), "Brazilian"));
assert.ok(!C.cellAccepts(cell("76", "capital"), "rio de janeiro"));
// o gabarito mostra o idioma oficial mais comum entre os do país; os outros oficiais continuam valendo
assert.equal(cell("32", "idioma").answer, "Espanhol");
assert.equal(cell("600", "idioma").answer, "Espanhol");
assert.equal(cell("710", "idioma").answer, "Inglês");
assert.ok(C.cellAccepts(cell("600", "idioma"), "guarani"));

// o nome abre a linha; Níger primeiro, e Nigéria continua digitando com o Níger já aberto
assert.equal(C.matchCountry(world, "Brasil", new Set()), "76");
assert.equal(C.matchCountry(world, "brazil", new Set()), "76");
assert.equal(C.matchCountry(world, "Niger", new Set()), "562");
assert.equal(C.matchCountry(world, "Niger", new Set(["562"])), null);
assert.equal(C.matchCountry(world, "Nigeria", new Set(["562"])), "566");
assert.equal(C.matchCountry(world, "Bras", new Set()), null);
assert.equal(C.matchCountry(board("paises-europa"), "Brasil", new Set()), null, "fora do recorte não abre");
// nome que é o começo de outro espera o Enter (Níger/Nigéria, Guiné/Guiné-Bissau); com o outro já aberto, abre sozinho
assert.ok(C.countryWaits(world, "Niger", new Set()));
assert.ok(!C.countryWaits(world, "Niger", new Set(["566"])));
assert.ok(C.countryWaits(world, "Guine", new Set()));
assert.ok(!C.countryWaits(world, "Brasil", new Set()));
// o próprio apelido longo não faz esperar: "Estados Unidos" abre sozinho (o Enzo teve de escrever "da América", 23/10/2026)
assert.equal(C.matchCountry(world, "Estados Unidos", new Set()), "840");
assert.ok(!C.countryWaits(world, "Estados Unidos", new Set()));
// quem continua escrevendo a forma longa tem o resto engolido; a primeira tecla de outra coisa desliga
const usKeys = rows.find((row) => row.id === "840").cells[0].keys;
const spill = { base: "estadosunidos", longer: C.longerKeys(usKeys, "Estados Unidos") };
assert.ok(spill.longer.includes("estadosunidosdaamerica"));
assert.equal(C.spillOf(spill, " "), "estadosunidos");
assert.equal(C.spillOf(spill, " da"), "estadosunidosda");
assert.equal(C.spillOf(spill, "W"), null);
assert.ok(C.cellAccepts(cell("76", "moeda"), "real"));
assert.ok(C.longerKeys(cell("76", "moeda").keys, "real").includes("realbrasileiro"));
assert.deepEqual(C.longerKeys(cell("76", "capital").keys, "brasilia"), []);

// recorde e medalhas
const run = (correct, total, ms) => ({ id: `challenge-run:x:${ms}`, challenge: "x", correct, total, ms, end: "time", at: ms });
assert.equal(C.bestRun([run(10, 20, 500), run(12, 20, 900), run(12, 20, 700)]).ms, 700);
assert.equal(C.bestRun([]), null);
assert.equal(C.medalOf(run(20, 20, 1)), "ouro");
assert.equal(C.medalOf(run(16, 20, 1)), "prata");
assert.equal(C.medalOf(run(10, 20, 1)), "bronze");
assert.equal(C.medalOf(run(9, 20, 1)), null);
assert.equal(C.parseRun({ id: "challenge-run:paises-mundo:1", challenge: "paises-mundo", correct: 3, total: 195, ms: 10, end: "time", at: 1 }).correct, 3);
assert.equal(C.parseRun({ id: "preset:1" }), null);

// o campo único: qualquer resposta, em qualquer ordem
const sa = board("ficha-america-do-sul");
const none = new Set();
assert.deepEqual(C.matchAnswer(sa, "Brasília", none, null), { cell: "76:capital", row: "76", waits: false, ambiguous: false }, "a capital antes do país");
assert.equal(C.matchAnswer(sa, "Brasil", none, null).cell, "76:nome");
assert.equal(C.matchAnswer(sa, "real brasileiro", none, null).cell, "76:moeda");
assert.ok(C.matchAnswer(sa, "espanhol", none, null).ambiguous, "espanhol sem linha: ambíguo");
assert.equal(C.matchAnswer(sa, "espanhol", new Set(["152:capital"]), "152").cell, "152:idioma", "vai para a última linha mexida (Chile)");
assert.equal(C.matchAnswer(sa, "espanhol", new Set(["152:capital", "76:nome"]), "76").cell, "152:idioma", "o Brasil não aceita: a única outra linha aberta que aceita");
assert.ok(C.matchAnswer(sa, "espanhol", new Set(["152:capital", "32:nome"]), "76").ambiguous, "duas linhas abertas aceitam: ambíguo");
assert.equal(C.matchAnswer(sa, "dolar", none, null).cell, null);
const ficha2 = board("ficha-mundo");
assert.ok(!C.matchAnswer(ficha2, "Mali", none, null).waits, "Mali entra na hora (maliano é de outra coluna)");
assert.ok(!C.matchAnswer(ficha2, "Brasil", none, null).waits, "Brasil entra na hora (Brasília e brasileiro são de outras colunas)");
// quem continua escrevendo retoma: Brasil + i vira o começo de Brasília; real + espaço, a forma longa da moeda
assert.ok(C.continuesAnswer(ficha2, "Brasili", new Set(["76:nome"])));
assert.ok(C.continuesAnswer(ficha2, "Maliano", new Set(["466:nome"])));
assert.ok(!C.continuesAnswer(ficha2, "BrasilB", new Set(["76:nome"])));
assert.ok(C.continuesAnswer(ficha2, "real ", new Set(["76:moeda"]), rowOf(ficha, "76").cells.find((c) => c.column === "moeda").keys));
assert.ok(C.matchAnswer(ficha2, "Niger", none, null).waits);
assert.ok(!C.matchAnswer(ficha2, "Brasilia", none, null).waits);
// mesmo nome em duas colunas do mesmo país: a primeira vazia
assert.equal(C.matchAnswer(ficha2, "Singapura", none, null).cell, "702:nome");
assert.equal(C.matchAnswer(ficha2, "Singapura", new Set(["702:nome"]), "702").cell, "702:capital");

// recompensa: 40 moedas e 2 XP por acerto; o desafio do dia paga em dobro só a primeira tentativa do dia; cada medalha dá o bônus uma vez
const day = 86_400_000 * 20_000;
const dailyId = C.dailyChallenge(day).id;
const otherId = C.CHALLENGES.find((item) => item.id !== dailyId).id;
let reward = C.challengeReward({ challenge: otherId, correct: 178, total: 195, at: day, earlier: [], granted: new Set() });
assert.deepEqual([reward.coins, reward.xp, reward.daily], [178 * 40, 356, false]);
assert.deepEqual(reward.medals, ["bronze", "prata"]);
assert.equal(reward.medalBonus, 195 * (5 + 10));
reward = C.challengeReward({ challenge: otherId, correct: 195, total: 195, at: day, earlier: [], granted: new Set(["bronze", "prata"]) });
assert.deepEqual(reward.medals, ["ouro"]);
assert.equal(reward.medalBonus, 195 * 20);
reward = C.challengeReward({ challenge: dailyId, correct: 10, total: 20, at: day + 1000, earlier: [], granted: new Set() });
assert.equal(reward.coins, 10 * 40 * 2);
assert.ok(reward.daily);
reward = C.challengeReward({ challenge: dailyId, correct: 10, total: 20, at: day + 5000, earlier: [{ at: day + 1000 }], granted: new Set(["bronze"]) });
assert.equal(reward.coins, 10 * 40);
assert.ok(!reward.daily);
assert.deepEqual(reward.medals, []);
assert.equal(C.challengeReward({ challenge: otherId, correct: 9, total: 20, at: day, earlier: [], granted: new Set() }).medalBonus, 0);
// o XP das tentativas antigas (sem o campo) sai dos acertos; o campo novo é lido
assert.equal(C.runXp({ correct: 178 }), 356);
assert.equal(C.parseRun({ id: "challenge-run:x:1", challenge: "x", correct: 3, total: 10, ms: 5, end: "time", at: 1, coins: 120, xp: 6, daily: true, medalBonus: 0, missed: ["76:nome"] }).missed[0], "76:nome");

// o desafio do dia: muda de um dia para o outro e nunca é um dos dois maiores do mundo
const days = Array.from({ length: 60 }, (_, day) => C.dailyChallenge(day * 86_400_000 + 1000).id);
assert.ok(!days.includes("ficha-mundo") && !days.includes("capitais-mundo"));
for (let index = 1; index < days.length; index += 1) assert.notEqual(days[index], days[index - 1]);
assert.equal(new Set(days).size, C.DAILY_POOL.length);
// o tempo do Hub (só pelo catálogo) bate com o da tabela
for (const item of C.CHALLENGES) assert.equal(C.challengeSeconds(item, meta), board(item.id).seconds, item.id);

console.log("desafios: 21 desafios, 195 países, ficha com as lacunas, moeda 1:1, abrir linhas, recorde, medalhas e o dia ok");
