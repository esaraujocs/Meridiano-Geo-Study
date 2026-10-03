import assert from "node:assert/strict";
import { modeStats, sessionInMode } from "../.tmp-mode-stats/mode-stats.js";

const round = (correct, ms = 2000, assisted = false) => ({ correct, responseTimeMs: ms, assisted });
const session = (family, variant, startedAt, flags, extra = {}) => ({ family, variant, startedAt, complete: true, roundCount: flags.length, correct: flags.filter(Boolean).length, rounds: flags.map((f) => round(f)), ...extra });

// o modo "Atuais" das bandeiras junta os dois sentidos; "Escrita" é outro motor
const flagMode = { family: "bandeiras", variant: "nome-bandeira", flag: "current" };
assert.ok(sessionInMode(session("bandeiras", "bandeira-nome", 1, [true]), flagMode));
assert.ok(!sessionInMode(session("escrita", "escrita-pais", 1, [true]), flagMode));
assert.ok(!sessionInMode(session("mapa", "mapa", 1, [true]), { family: "mapa", variant: "silhueta" }));

const none = modeStats([], flagMode);
assert.equal(none.matches, 0); assert.equal(none.accuracy, null); assert.equal(none.best, null); assert.deepEqual(none.trend, []); assert.deepEqual(none.recent, []);

const ten = (n) => Array.from({ length: 10 }, (_, i) => i < n);
const list = [
  session("mapa", "mapa", 1000, ten(6)),
  session("mapa", "mapa", 3000, ten(9), { duelId: "d1" }),
  session("mapa", "mapa", 2000, ten(8)),
  session("mapa", "silhueta", 2500, ten(10)), // outro modo: não conta
  { ...session("mapa", "mapa", 4000, ten(10)), complete: false }, // abandonada: não conta
  session("mapa", "mapa", 5000, [true, true, true]), // curta demais para recorde e evolução, mas conta nas rodadas
];
const stats = modeStats(list, { family: "mapa", variant: "mapa" });
assert.equal(stats.matches, 4);
assert.equal(stats.rounds, 33);
assert.equal(stats.accuracy, Math.round((6 + 8 + 9 + 3) / 33 * 100));
assert.deepEqual(stats.best, { pct: 90, correct: 9, rounds: 10, at: 3000 });
assert.deepEqual(stats.trend.map((point) => point.pct), [60, 80, 90]);
assert.equal(stats.recent.length, 4);
assert.equal(stats.recent[0].at, 5000); // a mais nova primeiro
assert.equal(stats.recent[1].duel, true);

// sequência: segue entre partidas, na ordem do tempo, e o suprimento não entra
const seq = modeStats([
  { ...session("capitais", "capital-pais", 1, [true, true, false]), rounds: [round(true), round(true), round(false)] },
  { ...session("capitais", "capital-pais", 2, [true, true, true, true, true]), rounds: [round(true), round(true), round(true, 900), round(true, 1500, true), round(true)] },
], { family: "capitais", variant: "capital-pais" });
assert.equal(seq.bestStreak, 4); // 3 + 1: a rodada assistida fica de fora sem quebrar a sequência
assert.equal(seq.fastestMs, 900); // a rápida assistida não vale recorde

console.log("mode stats: modo, precisão, recordes, sequência, evolução e recentes verificados");
