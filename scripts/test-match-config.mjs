import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "carta-cega-match-config-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", [
  "src/domain/match-config.ts",
  "--outDir", out, "--target", "ES2022", "--module", "ESNext",
  "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM",
  "--ignoreConfig",
]);
const config = await import(`file://${out}/match-config.js`);

// modos de cada família (o mesmo conjunto de antes, agora numa linha só: Silhueta e Direção deixam de ser controles à parte)
assert.deepEqual(config.modesFor("mapa").map((mode) => mode.key), ["mapa", "silhueta-opcoes", "silhueta", "travel"]);
assert.deepEqual(config.modesFor("bandeiras").map((mode) => mode.key), ["atuais", "escrita-pais", "historicas"]);
assert.deepEqual(config.modesFor("capitais").map((mode) => mode.key), ["capital-pais", "escrita-capital"]);
assert.deepEqual(config.modesFor("idiomas").map((mode) => mode.key), ["idioma-nome", "idioma-pais"]);
for (const top of ["mapa", "bandeiras", "capitais", "idiomas"]) {
  for (const mode of config.modesFor(top)) assert.ok(mode.label && mode.hint && mode.icon, `${top}/${mode.key} incompleto`);
}
// só Atuais e Históricas escolhem o sentido
assert.deepEqual(config.modesFor("bandeiras").filter((mode) => mode.direction).map((mode) => mode.key), ["atuais", "historicas"]);

// modo escolhido a partir do estado do app
assert.equal(config.selectedMode("mapa", "mapa", "mapa").key, "mapa");
assert.equal(config.selectedMode("mapa", "silhueta", "silhueta-opcoes").key, "silhueta-opcoes");
assert.equal(config.selectedMode("mapa", "silhueta", "silhueta").key, "silhueta");
assert.equal(config.selectedMode("mapa", "travel", "travel").key, "travel");
assert.equal(config.selectedMode("bandeiras", "bandeiras", "nome-bandeira").key, "atuais");
assert.equal(config.selectedMode("bandeiras", "bandeiras", "bandeira-nome").key, "atuais");
assert.equal(config.selectedMode("bandeiras", "escrita", "escrita-pais").key, "escrita-pais");
assert.equal(config.selectedMode("bandeiras", "historicas", "historica-nome").key, "historicas");
assert.equal(config.selectedMode("capitais", "escrita", "escrita-capital").key, "escrita-capital");
assert.equal(config.selectedMode("capitais", "capitais", "capital-pais").key, "capital-pais");
assert.equal(config.selectedMode("idiomas", "idiomas", "idioma-pais").key, "idioma-pais");
assert.equal(config.selectedMode("idiomas", "idiomas", "idioma-nome").key, "idioma-nome");
assert.equal(config.selectedMode("capitais", "escrita", "escrita-pais").key, "capital-pais", "estado incoerente cai no primeiro modo");

// textos do ritmo
assert.equal(config.paceHint("training", "mapa"), "Sem cronômetro. Rende só 50% das moedas. Cada país perguntado fica marcado no mapa com o nome, acertando ou errando.");
assert.equal(config.paceHint("training", "capital-pais"), "Sem cronômetro. Rende só 50% das moedas. Cada país perguntado fica marcado no mapa com o nome, acertando ou errando.");
assert.equal(config.paceHint("training", "nome-bandeira"), "Sem cronômetro. Rende só 50% das moedas.", "só marca no mapa nos modos que clicam nele");
assert.equal(config.paceHint("timed", "mapa"), "20 s por pergunta. Acabou o tempo, conta como erro.");
assert.equal(config.paceHint("timed", "nome-bandeira"), "15 s por pergunta. Acabou o tempo, conta como erro.");
assert.equal(config.paceHint("timed", "travel"), "2 min por rota. Acabou o tempo, a rota conta como erro.");
assert.equal(config.formatSeconds(30, "silhueta"), "30 s");
assert.equal(config.formatSeconds(120, "travel"), "2 min por rota");

// resumo da barra de baixo
const atuais = config.modesFor("bandeiras")[0];
const timed = config.configSummary({ mode: atuais, direction: "name-to-flag", variant: "nome-bandeira", pace: "timed", rounds: 10, regionText: "Mundo", count: 250 });
assert.equal(timed.title, "Atuais · Nome → bandeira");
assert.equal(timed.sub, "Partida 15 s · 10 rodadas · Mundo (250)");
assert.equal(timed.earn, "32 a 40");
assert.equal(timed.earnUnit, "moedas por acerto");
const training = config.configSummary({ mode: atuais, direction: "flag-to-name", variant: "bandeira-nome", pace: "training", rounds: 10, regionText: "Europa", count: 55 });
assert.equal(training.title, "Atuais · Bandeira → nome");
assert.equal(training.sub, "Treino · 10 rodadas · Europa (55)");
assert.equal(training.earn, "16 a 20");
assert.equal(training.earnUnit, "moedas por acerto · 50%");
const silhouette = config.configSummary({ mode: config.modesFor("mapa")[1], variant: "silhueta-opcoes", pace: "timed", rounds: 20, regionText: "2 recortes", count: 82 });
assert.equal(silhouette.title, "Silhueta · alternativas", "modo sem sentido não leva a direção");
assert.equal(silhouette.earn, "56 a 70");
assert.equal(silhouette.sub, "Partida 20 s · 20 rodadas · 2 recortes (82)");
const travel = config.configSummary({ mode: config.modesFor("mapa")[3], variant: "travel", pace: "timed", rounds: 5, regionText: "Mundo", count: 150 });
assert.equal(travel.sub, "Partida 2 min · 5 rodadas · Mundo (150)");
assert.equal(travel.earnUnit, "moedas por país da rota");

// Idiomas, povos e moedas: um cartão só para os três temas; abre no último jogado, senão no primeiro com modo liberado, senão em Idiomas
assert.deepEqual([...config.PEOPLES_GROUP], ["idiomas", "gentilicos", "moedas"]);
assert.equal(config.isPeoplesTopic("moedas"), true); assert.equal(config.isPeoplesTopic("mapa"), false); assert.equal(config.isPeoplesTopic("divisoes"), false);
assert.equal(config.peoplesEntry("moedas", () => false), "moedas", "o último jogado, mesmo bloqueado depois");
assert.equal(config.peoplesEntry(null, (topic) => topic === "gentilicos"), "gentilicos", "sem histórico, o primeiro com modo liberado");
assert.equal(config.peoplesEntry("mapa", (topic) => topic === "moedas"), "moedas", "um valor estranho guardado é ignorado");
assert.equal(config.peoplesEntry(null, () => false), "idiomas", "nada liberado: Idiomas");
for (const topic of config.PEOPLES_GROUP) assert.equal(config.modesFor(topic).length, 2, `${topic}: os 2 sentidos`);
console.log("match config: modos, modo escolhido, ritmo, resumo e o grupo Idiomas, povos e moedas verificados");
