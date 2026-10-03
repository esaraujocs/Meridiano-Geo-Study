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

// ---- catálogo: todo suprimento tem preço, entra no estoque vazio e os destaques existem
for (const id of supplies.SUPPLY_IDS) {
  assert.ok(supplies.SUPPLY_COST[id] > 0, `${id} tem preço`);
  assert.equal(supplies.emptySupplyCounts()[id], 0, `${id} começa zerado no estoque`);
}
assert.equal(new Set(supplies.SUPPLY_IDS).size, 9, "são nove suprimentos, sem repetição");
assert.equal(Object.keys(supplies.emptySupplyCounts()).length, supplies.SUPPLY_IDS.length);
assert.ok(supplies.FEATURED_SUPPLIES.every((id) => supplies.SUPPLY_IDS.includes(id)), "os destaques da vitrine são suprimentos de verdade");
assert.deepEqual([...supplies.ARMED_SUPPLIES].sort(), ["escudo", "retorno"], "só Escudo e Segunda chance ficam armados");

// ---- aplicabilidade dos novos: Primeira letra só onde se digita; Pular e Escudo em tudo; Segunda chance em tudo menos o Travel
for (const variant of ["escrita-pais", "escrita-capital", "silhueta"]) assert.equal(supplies.supplyApplies("letra", variant), true, `Primeira letra em ${variant}`);
for (const variant of ["mapa", "capital-pais", "bandeira-nome", "nome-bandeira", "pais-capital", "silhueta-opcoes", "historica-nome", "nome-historica", "idioma-nome", "idioma-pais", "travel"]) {
  assert.equal(supplies.supplyApplies("letra", variant), false, `Primeira letra não faz sentido em ${variant}`);
}
const everyVariant = ["mapa", "capital-pais", "bandeira-nome", "nome-bandeira", "pais-capital", "silhueta", "silhueta-opcoes", "travel", "escrita-pais", "escrita-capital", "historica-nome", "nome-historica", "idioma-nome", "idioma-pais"];
for (const variant of everyVariant) {
  assert.equal(supplies.supplyApplies("pular", variant), true, `Pular em ${variant}`);
  assert.equal(supplies.supplyApplies("escudo", variant), true, `Escudo em ${variant}`);
  assert.equal(supplies.supplyApplies("retorno", variant), variant !== "travel", `Segunda chance em ${variant}`);
  // nenhum deles depende do cronômetro: no Treino continuam valendo
  assert.equal(supplies.supplyApplies("pular", variant, false), true);
  assert.equal(supplies.supplyApplies("escudo", variant, false), true);
}
const all = { lupa: 1, bussola: 1, lanterna: 1, vizinho: 1, letra: 1, pular: 1, retorno: 1, escudo: 1, ampulheta: 1 };
assert.deepEqual(supplies.usableSupplies(all, "escrita-pais"), ["vizinho", "letra", "pular", "retorno", "escudo", "ampulheta"], "hotbar da escrita, na ordem de sempre");
assert.deepEqual(supplies.usableSupplies(all, "mapa"), ["bussola", "lanterna", "vizinho", "pular", "retorno", "escudo", "ampulheta"]);
assert.deepEqual(supplies.usableSupplies(all, "bandeira-nome"), ["lupa", "vizinho", "pular", "retorno", "escudo", "ampulheta"]);
assert.deepEqual(supplies.usableSupplies(all, "idioma-nome"), ["lupa", "pular", "retorno", "escudo", "ampulheta"], "idiomas não falam de países vizinhos");
assert.deepEqual(supplies.usableSupplies(all, "travel", false), ["pular", "escudo"], "Travel no Treino: só Pular e Escudo");

// ---- Primeira letra: só a inicial, o resto vira ponto; espaços e pontuação ficam
assert.equal(supplies.letterHint("Costa do Marfim"), "C•••• •• ••••••");
assert.equal(supplies.letterHint("Brasil"), "B•••••");
assert.equal(supplies.letterHint("são tomé"), "S•• ••••", "a inicial sai em maiúscula, acento conta como uma letra");
assert.equal(supplies.letterHint("Guiné-Bissau"), "G••••-••••••", "o hífen fica");
assert.equal(supplies.letterHint("Timor-Leste"), "T••••-•••••");
assert.equal(supplies.letterHint("  Peru "), "P•••", "espaços nas pontas não contam");
assert.equal(supplies.letterHint(""), "");
assert.equal(supplies.letterHint(undefined), "");

// ---- Escudo: a rodada coberta sai da sequência e da precisão, mas o que foi acertado dentro dela (rota do Travel) ainda paga
const run = (rounds) => spoils.computeSpoils({ variant: "bandeira-nome", pace: "timed", complete: true, newCards: 0, levelUps: 0, rounds });
const hit = (extra = {}) => ({ correct: true, tier: 1, ...extra });
const missShielded = { correct: false, tier: 1, assisted: true, shielded: true };
const missPlain = { correct: false, tier: 1 };
assert.equal(run([hit(), hit(), missShielded, hit(), hit()]).streak.best, 4, "com o Escudo a sequência segue: 2 + 2 = 4");
assert.equal(run([hit(), hit(), missPlain, hit(), hit()]).streak.best, 2, "sem o Escudo o erro quebra a sequência");
assert.ok(run([hit(), hit(), missShielded, hit(), hit()]).streak.coins > run([hit(), hit(), missPlain, hit(), hit()]).streak.coins, "e o bônus de sequência é maior");
assert.equal(run([hit(), hit(), missShielded]).completion.pct, 100, "a rodada coberta não entra na precisão da partida");
assert.equal(run([hit(), hit(), missPlain]).completion.pct, 67);
assert.equal(run([hit(), missShielded]).hits.count, 1, "o erro coberto não paga acerto");
const travelShielded = { correct: false, tier: 1, weight: 2, assisted: true, shielded: true };
assert.equal(spoils.computeSpoils({ variant: "travel", pace: "timed", complete: true, newCards: 0, levelUps: 0, rounds: [travelShielded] }).hits.count, 1, "a rota do Travel coberta paga o que foi acertado nela");
// erro coberto + rodada assistida: continua fora do domínio (o Escudo é um suprimento como os outros)
const shieldedForDomain = { complete: true, rounds: [
  { targetId: "BRA", correct: true, column: "mapa", answeredAt: 1 },
  { targetId: "BRA", correct: false, column: "mapa", answeredAt: 2, assisted: true, shielded: true },
  { targetId: "BRA", correct: true, column: "capitais", answeredAt: 3 },
  { targetId: "BRA", correct: true, column: "mapa", answeredAt: 4 },
] };
assert.ok(dominated.dominatedIdsFromSessions([shieldedForDomain]).has("BRA"), "o erro coberto não zera a evidência de domínio (nem conta como acerto)");
console.log("novos suprimentos ok");

// ---- Lanterna e Pista de vizinhos: onde valem
for (const variant of ["mapa", "capital-pais"]) assert.equal(supplies.supplyApplies("lanterna", variant), true);
for (const variant of ["bandeira-nome", "silhueta", "silhueta-opcoes", "escrita-pais", "travel", "idioma-nome"]) assert.equal(supplies.supplyApplies("lanterna", variant), false, `Lanterna só no mapa (${variant})`);
for (const variant of ["mapa", "capital-pais", "bandeira-nome", "nome-bandeira", "pais-capital", "silhueta", "silhueta-opcoes", "escrita-pais", "escrita-capital"]) assert.equal(supplies.supplyApplies("vizinho", variant), true, `Vizinhos em ${variant}`);
for (const variant of ["travel", "historica-nome", "nome-historica", "idioma-nome", "idioma-pais"]) assert.equal(supplies.supplyApplies("vizinho", variant), false, `Vizinhos não em ${variant}`);
assert.equal(supplies.supplyApplies("lanterna", "mapa", false), true, "sem cronômetro (Treino) a Lanterna segue valendo");
assert.equal(supplies.supplyApplies("vizinho", "mapa", false), true);

// ---- Lanterna: o zoom enquadra ~1.200 km na largura da tela
const z0 = supplies.lanternZoom(0, 1440);
assert.ok(z0 > 6.4 && z0 < 6.7, `no equador, 1440 px cobrem ~1.200 km (zoom ${z0.toFixed(2)})`);
assert.ok(supplies.lanternZoom(60, 1440) < z0, "perto dos polos, o mesmo zoom cobre menos terra: precisa afastar");
assert.ok(supplies.lanternZoom(0, 390) < z0, "tela estreita, zoom menor para ainda caber os 1.200 km");
assert.ok(supplies.lanternZoom(0, 1440) <= 7.5 && supplies.lanternZoom(0, 5000) === 7.5, "nunca passa de 7,5");
assert.ok(supplies.lanternZoom(89, 200) >= 3, "nunca fica abaixo de 3");

// ---- Pista de vizinhos, com o catálogo de verdade
import { readFileSync } from "node:fs";
const catalog = JSON.parse(readFileSync("public/data/legacy/catalog.json", "utf8"));
const meta = catalog.meta;
const idOf = (cca3) => Object.keys(meta).find((id) => meta[id].cca3 === cca3);
const byCca3 = (hint) => hint && meta[hint.id].cca3;
const br = supplies.neighborHint(meta, idOf("BRA"));
assert.equal(br.sea, false);
assert.ok(meta[idOf("BRA")].borders.includes(byCca3(br)), "o vizinho do Brasil é de fato um país com que ele faz fronteira");
assert.deepEqual(supplies.neighborHint(meta, idOf("BRA")), br, "o mesmo alvo dá sempre a mesma pista");
assert.equal(byCca3(supplies.neighborHint(meta, idOf("PRT"))), "ESP", "Portugal só tem a Espanha");
assert.equal(byCca3(supplies.neighborHint(meta, idOf("LSO"))), "ZAF", "Lesoto só tem a África do Sul");
// ilhas: sem fronteira por terra, vale o país mais próximo e a pista avisa que é por mar
for (const code of ["JPN", "NZL", "MDG", "ISL", "CUB", "AUS"]) {
  const hint = supplies.neighborHint(meta, idOf(code));
  assert.ok(hint, `${code} tem pista`);
  assert.equal(hint.sea, true, `${code} é ilha: pista por mar`);
  assert.notEqual(hint.id, idOf(code), "nunca devolve o próprio alvo");
  assert.ok(meta[hint.id].un, "o vizinho por mar é membro da ONU, não um território obscuro");
}
assert.equal(byCca3(supplies.neighborHint(meta, idOf("JPN"))) !== "JPN", true);
// todo país do mapa com fronteira devolve um vizinho que existe e que não é ele mesmo; nenhum devolve nulo
let checked = 0;
for (const id of catalog.mapEntityIds.map(String)) {
  const hint = supplies.neighborHint(meta, id);
  if (!meta[id]?.ll && !(meta[id]?.borders ?? []).length) continue;
  assert.ok(hint, `${meta[id].pt} (${id}) tem pista`);
  assert.ok(meta[hint.id] && hint.id !== id, "o vizinho existe e não é o próprio alvo");
  checked += 1;
}
assert.ok(checked > 190, `conferiu ${checked} países`);
assert.equal(supplies.neighborHint(meta, "inexistente"), null);
console.log("lote 2 ok (" + checked + " países com pista)");

// ---- Lupa: sobram duas alternativas (a certa e uma errada); a errada que fica é uma ainda não tentada
const first = (items) => items;
const noTried = new Set();
const hide4 = supplies.lupaToHide(["a", "b", "c", "d"], "a", new Set(), noTried, first);
assert.equal(hide4.length, 2, "de 4 alternativas, esconde 2");
assert.ok(!hide4.includes("a"), "nunca esconde a certa");
const hideTried = supplies.lupaToHide(["a", "b", "c", "d"], "a", new Set(), new Set(["b"]), first);
assert.ok(hideTried.includes("b"), "a que a Segunda chance já riscou sai junto");
assert.equal(hideTried.length, 2, "e ainda sobram a certa e uma errada nova");
assert.ok(!hideTried.includes("a"));
const alreadyHidden = supplies.lupaToHide(["a", "b", "c", "d"], "a", new Set(["c"]), noTried, first);
assert.equal(alreadyHidden.length, 1, "o que já estava escondido não conta");
assert.deepEqual(supplies.lupaToHide(["a", "b"], "a", new Set(), noTried, first), [], "com uma errada só, não há o que esconder");
assert.deepEqual(supplies.lupaToHide(["a", "b", "c"], "a", new Set(), new Set(["b", "c"]), first).length, 1, "tudo tentado: sobra uma das tentadas");
console.log("lupa ok");
