// Seu ritmo e Modos do Progresso (domain/rhythm.ts) e a evolução do domínio (domainTimeline em dominated.ts).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const out = ".tmp-rhythm";
rmSync(out, { recursive: true, force: true });
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--ignoreConfig", "src/domain/rhythm.ts", "src/domain/dominated.ts", "--outDir", out, "--module", "ESNext", "--moduleResolution", "Bundler", "--target", "ES2022", "--skipLibCheck", "--lib", "ES2022,DOM"], { stdio: "inherit" });
const R = await import(pathToFileURL(join(out, "rhythm.js")).href);
const DOM = await import(pathToFileURL(join(out, "dominated.js")).href);

// família do Hub e modo de cada partida
assert.deepEqual(R.rhythmMode("bandeiras", "bandeira-nome"), { family: "bandeiras", mode: "atuais" });
assert.deepEqual(R.rhythmMode("historicas", "historica-nome"), { family: "bandeiras", mode: "historicas" });
assert.deepEqual(R.rhythmMode("escrita", "escrita-pais"), { family: "bandeiras", mode: "escrita-pais" });
assert.deepEqual(R.rhythmMode("escrita", "escrita-capital"), { family: "capitais", mode: "escrita-capital" });
assert.deepEqual(R.rhythmMode("silhueta", "silhueta"), { family: "mapa", mode: "silhueta" });
assert.deepEqual(R.rhythmMode("moedas", "pais-moeda"), { family: "povos", mode: "pais-moeda" });
assert.deepEqual(R.rhythmMode("brasil", "br-nome-bandeira"), { family: "divisoes", mode: "dv-bandeiras" }, "o legado do Brasil e os dois sentidos das bandeiras");
assert.deepEqual(R.rhythmMode("epocas", "dv-mapa"), { family: "epocas", mode: "dv-mapa" });
assert.equal(R.rhythmMode("desconhecida", "x"), null);

// relógio fixo (UTC) para o teste não depender do fuso da máquina
const clock = { hour: (t) => new Date(t).getUTCHours(), weekday: (t) => new Date(t).getUTCDay(), day: (t) => new Date(t).toISOString().slice(0, 10) };
const T0 = Date.UTC(2026, 9, 5); // segunda
const at = (day, h, m = 0) => T0 + day * 86_400_000 + h * 3_600_000 + m * 60_000;
const session = (family, variant, rounds, extra = {}) => ({ family, variant, startedAt: rounds[0]?.answeredAt ?? null, rounds, ...extra });
// bandeiras: 95% no normal; de tarde (15h) erra mais e responde mais rápido; de noite (23h) acerta tudo
const rounds = [];
for (let d = 0; d < 10; d += 1) {
  for (let i = 0; i < 40; i += 1) rounds.push({ correct: i % 5 !== 0, responseTimeMs: 1200, answeredAt: at(d, 15, i) }); // 80%, rápido
  for (let i = 0; i < 40; i += 1) rounds.push({ correct: true, responseTimeMs: 2000, answeredAt: at(d, 23, i % 59) }); // 100%, devagar
}
const sessions = [session("bandeiras", "nome-bandeira", rounds), session("bandeiras", "nome-bandeira", [{ correct: false, responseTimeMs: 9000, answeredAt: at(3, 9) }], { pace: "training" })];
const all = R.rhythmRounds(sessions);
assert.equal(all.length, 801);
assert.ok(all.every((r, i) => i === 0 || all[i - 1].at <= r.at), "em ordem");
const rh = R.buildRhythm(all, "todos", clock);
assert.equal(rh.total, 800, "o Treino fica de fora");
assert.equal(rh.hours[15].n, 400); assert.equal(rh.hours[23].n, 400); assert.equal(rh.hours[9].n, 0);
assert.ok(Math.abs(rh.hours[15].acc - 0.8) < 1e-9 && Math.abs(rh.hours[15].rel - (0.8 - 0.9)) < 1e-9, "acerto contra o normal do modo (90%)");
assert.ok(Math.abs(rh.hours[23].rel - 0.1) < 1e-9);
assert.ok(rh.hours[15].speed < 0 && rh.hours[23].speed >= 0, "mais rápido de tarde que o normal do modo (a mediana é a da noite)");
const tarde = rh.periods.find((p) => p.key === "tarde"), noite = rh.periods.find((p) => p.key === "noite");
assert.equal(tarde.n, 400); assert.equal(noite.n, 400); assert.equal(rh.periods.find((p) => p.key === "manha").n, 0);
assert.deepEqual(rh.insights.map((i) => i.kind).slice(0, 2), ["best", "worst"]);
assert.equal(rh.insights[0].period, "noite"); assert.equal(rh.insights[1].period, "tarde");
assert.equal(rh.insights[1].faster, true, "o pior período é pressa (mais rápido que o normal)");
assert.equal(rh.week[1][2].n, 80, "as duas segundas à tarde (10 dias a partir de uma segunda)");
assert.equal(rh.nights.count, 20, "duas sessões por dia, separadas por mais de 45 min");
// filtro por família e totais
assert.equal(R.buildRhythm(all, "mapa", clock).total, 0);
assert.deepEqual(R.rhythmTotals(all).todos, 800); assert.equal(R.rhythmTotals(all).bandeiras, 800); assert.equal(R.rhythmTotals(all).mapa, 0);
// com poucos dados não há frase
assert.deepEqual(R.buildRhythm(all.slice(0, 50), "todos", clock).insights, []);
// aquecimento: começa mal e melhora depois de 20 min
const warm = [];
for (let d = 0; d < 12; d += 1) for (let m = 0; m < 60; m += 1) warm.push({ correct: m >= 20 || m % 3 !== 0, responseTimeMs: 1500, answeredAt: at(d, 21, m) });
const wr = R.buildRhythm(R.rhythmRounds([session("mapa", "mapa", warm)]), "todos", clock);
const ins = wr.insights.find((i) => i.kind === "warmup");
assert.ok(ins && ins.low.from < 20 && ins.high.from >= 20 && ins.high.rel > ins.low.rel, "a curva da noite vira frase");
assert.equal(wr.warmup[0].n, 120); assert.equal(wr.warmup[4].n, 0);

// Modos: volume, picos
const many = Array.from({ length: 150 }, (_, i) => ({ correct: i < 20 ? i % 2 === 0 : true, responseTimeMs: i < 60 ? 3000 : 1500, answeredAt: at(0, 10) + i * 1000 }));
const ov = R.modesOverview(R.rhythmRounds([session("mapa", "mapa", many), session("capitais", "capital-pais", [{ correct: true, responseTimeMs: 2000, answeredAt: at(1, 10) }], { duelId: "d" })]));
const mapa = ov.find((m) => m.mode === "mapa");
assert.equal(ov[0].mode, "mapa", "do maior volume para o menor");
assert.equal(mapa.rounds, 150); assert.equal(mapa.streak.len, 130, "da 21ª rodada em diante (a 20ª errou)");
assert.equal(mapa.best.acc, 1); assert.equal(mapa.best.med, 1500, "no empate de 100%, a janela mais rápida");
assert.equal(ov.find((m) => m.mode === "capital-pais").duel, 1);
assert.equal(ov.find((m) => m.mode === "capital-pais").best, null, "menos de 100 rodadas não tem pico");

// Seus reflexos: a mediana das certas por alvo (4 acertos ou mais), fora do Treino e das assistidas; o texto mais digitado nas escritas
{
  const rounds = [];
  for (let k = 0; k < 12; k += 1) for (let r = 0; r < 4; r += 1) rounds.push({ targetId: `p${k}`, correct: true, responseTimeMs: 1000 + k * 300 + r * 10, answeredAt: at(2, 10) + k * 100 + r });
  rounds.push({ targetId: "p0", correct: false, responseTimeMs: 50, answeredAt: at(2, 11) }, { targetId: "solo", correct: true, responseTimeMs: 900, answeredAt: at(2, 12) });
  const typedRounds = rounds.map((round, i) => ({ ...round, selectedId: round.targetId === "p3" ? "spain" : "x" + i }));
  const rx = R.reflexes(R.rhythmRounds([session("bandeiras", "nome-bandeira", rounds), session("escrita", "escrita-pais", typedRounds), session("mapa", "mapa", rounds, { pace: "training" })]));
  const flags = rx.find((m) => m.key === "bandeiras:atuais");
  assert.equal(flags.count, 12, "só alvos com 4 acertos ou mais");
  assert.deepEqual(flags.fast.map((i) => i.id), ["p0", "p1", "p2", "p3", "p4"]); assert.deepEqual(flags.slow.map((i) => i.id), ["p11", "p10", "p9", "p8", "p7"]);
  assert.equal(flags.fast[0].n, 4); assert.equal(flags.fast[0].typed, undefined, "nas alternativas não há texto digitado");
  assert.equal(rx.find((m) => m.key === "bandeiras:escrita-pais").fast[3].typed, "spain", "o texto mais digitado");
  assert.equal(rx.find((m) => m.key === "mapa:mapa"), undefined, "o Treino fica de fora");
}

// evolução do domínio: só sobe, um ponto por dia (com teto de pontos)
const timeline = DOM.domainTimeline([], clock.day);
assert.deepEqual(timeline, []);
const fake = Array.from({ length: 90 }, (_, d) => ({ startedAt: at(d, 12), family: "mapa", variant: "mapa", complete: true, rounds: [] }));
const tl = DOM.domainTimeline(fake, clock.day, 30);
assert.ok(tl.length <= 31 && tl.at(-1).day === clock.day(at(89, 12)), "até 30 pontos e o último dia sempre entra");
assert.ok(tl.every((p) => p.dominated === 0));

rmSync(out, { recursive: true, force: true });
console.log("seu ritmo: modos, horas, períodos, aquecimento, semana, frases, picos e a evolução do domínio ok");
