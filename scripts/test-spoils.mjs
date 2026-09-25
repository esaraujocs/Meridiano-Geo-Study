import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "carta-cega-spoils-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", [
  "src/domain/spoils.ts",
  "src/domain/pace.ts",
  "src/domain/result-view.ts",
  "--outDir", out, "--target", "ES2022", "--module", "ESNext",
  "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM",
  "--ignoreConfig",
]);
const spoils = await import(`file://${out}/spoils.js`);
const pace = await import(`file://${out}/pace.js`);
const view = await import(`file://${out}/result-view.js`);

// ---- moedas por acerto: 32 (alternativas) até 96×1,25 (capital escrita, país difícil)
assert.equal(spoils.hitCoins("bandeira-nome", 1), 32);
assert.equal(spoils.hitCoins("bandeira-nome", 2), 36);
assert.equal(spoils.hitCoins("bandeira-nome", 3), 40);
assert.equal(spoils.hitCoins("escrita-capital", 1), 96);
assert.equal(spoils.hitCoins("escrita-capital", 3), 120);
assert.equal(spoils.hitCoins("escrita-capital", 1), spoils.hitCoins("bandeira-nome", 1) * 3, "capital escrita vale 3× o acerto com alternativas");
assert.deepEqual(spoils.hitRange("silhueta", "timed"), [88, 110]);
assert.deepEqual(spoils.hitRange("silhueta", "training"), [44, 55]);
const variants = ["mapa", "silhueta", "silhueta-opcoes", "travel", "bandeira-nome", "nome-bandeira", "capital-pais", "pais-capital", "escrita-pais", "escrita-capital", "historica-nome", "nome-historica", "idioma-nome", "idioma-pais"];
for (const variant of variants) {
  const base = spoils.baseCoins(variant);
  assert.ok(base >= 30 && base <= 120, `${variant}: ${base} moedas por acerto fora da faixa 30–120`);
}

// ---- espólios de uma partida
const perfect = Array.from({ length: 10 }, () => ({ correct: true, tier: 1 }));
const base = { variant: "bandeira-nome", rounds: perfect, complete: true, newCards: 0, levelUps: 0 };
const timed = spoils.computeSpoils({ ...base, pace: "timed" });
assert.equal(timed.hits.coins, 320);
assert.equal(timed.hits.count, 10);
assert.equal(timed.streak.best, 10);
assert.equal(timed.streak.coins, 53, "3% do acerto por acerto seguido: 32 × 0,03 × (1+2+…+10) = 52,8");
assert.equal(timed.completion.coins, 140, "90%+ → 14 por rodada");
assert.equal(timed.total, 320 + 53 + 140);
assert.equal(timed.total, timed.hits.coins + timed.streak.coins + timed.newCards.coins + timed.levelUps.coins + timed.completion.coins);
assert.ok(!("speed" in timed) && !("bonusSpeed" in timed), "sem bônus por velocidade");

// Treino paga 50%, em cada linha
const training = spoils.computeSpoils({ ...base, pace: "training" });
assert.equal(spoils.TRAINING_COIN_FACTOR, 0.5);
assert.equal(training.factor, 0.5);
assert.equal(training.hits.coins, 160);
assert.equal(training.streak.coins, 26);
assert.equal(training.completion.coins, 70);
assert.equal(training.total, 160 + 26 + 70);
assert.ok(training.total < timed.total * 0.55 && training.total > timed.total * 0.45, "treino paga perto da metade da partida");

// erro quebra a sequência; partida abandonada não ganha o bônus de partida
const mixed = spoils.computeSpoils({ variant: "mapa", pace: "timed", complete: true, newCards: 0, levelUps: 0, rounds: [
  { correct: true }, { correct: true }, { correct: false }, { correct: true },
] });
assert.equal(mixed.streak.coins, 6, "48 × 0,03 × (1+2+0+1) = 5,76");
assert.equal(mixed.streak.best, 2);
assert.equal(mixed.hits.count, 3);
assert.equal(mixed.completion.pct, 75);
assert.equal(mixed.completion.coins, 9 * 4);
const abandoned = spoils.computeSpoils({ variant: "mapa", pace: "timed", complete: false, newCards: 0, levelUps: 0, rounds: [{ correct: true }, { correct: true }, { correct: true }, { correct: true }] });
assert.equal(abandoned.completion.coins, 0);
assert.equal(abandoned.hits.coins, 4 * 48);
assert.equal(spoils.computeSpoils({ variant: "mapa", pace: "timed", complete: true, newCards: 0, levelUps: 0, rounds: [] }).total, 0);
assert.equal(spoils.completionPerRound(0.59), 0);
assert.equal(spoils.completionPerRound(0.6), 5);
assert.equal(spoils.completionPerRound(0.75), 9);
assert.equal(spoils.completionPerRound(0.9), 14);

// cartas novas e que subiram
const cards = spoils.computeSpoils({ variant: "escrita-pais", pace: "timed", complete: false, rounds: [], newCards: 3, levelUps: 2 });
assert.equal(cards.newCards.coins, 180);
assert.equal(cards.levelUps.coins, 60);
assert.equal(cards.total, 240);
assert.equal(spoils.computeSpoils({ variant: "escrita-pais", pace: "training", complete: false, rounds: [], newCards: 4, levelUps: 0 }).newCards.coins, 120);

// Travel: cada país da rota acertado vale moedas, mesmo com a rota aberta
const route = spoils.computeSpoils({ variant: "travel", pace: "timed", complete: true, newCards: 0, levelUps: 0, rounds: [
  { correct: false, weight: 2, tier: 1 }, { correct: true, weight: 3, tier: 2 },
] });
assert.equal(route.hits.coins, 2 * 64 + Math.round(64 * 1.12) * 3);
assert.equal(route.hits.count, 2);
assert.equal(route.streak.coins, 6, "só a rota fechada conta na sequência: 72 × 3 × 0,03");

// sequência proporcional: cresce 3% do acerto por acerto seguido e trava em +75% (25º acerto seguido)
const streakOf = (variant, hits, tier = 1) => spoils.computeSpoils({ variant, pace: "timed", complete: false, newCards: 0, levelUps: 0, rounds: Array.from({ length: hits }, () => ({ correct: true, tier })) }).streak.coins;
assert.equal(spoils.STREAK_STEP, 0.03);
assert.equal(spoils.STREAK_CAP, 0.75);
assert.equal(streakOf("bandeira-nome", 30), Math.round(32 * (0.03 * 325 + 5 * 0.75)), "25 acertos de subida + 5 no teto: 32 × (9,75 + 3,75)... = 432");
assert.equal(streakOf("bandeira-nome", 30), 432);
assert.equal(streakOf("bandeira-nome", 60) - streakOf("bandeira-nome", 30), 30 * 24, "depois do teto: +24 por acerto (75% de 32)");
// o modo difícil sempre paga mais sequência por acerto seguido que o fácil (o bônus não inverte o incentivo)
for (const hits of [5, 10, 25, 50]) {
  assert.ok(streakOf("escrita-capital", hits) > streakOf("bandeira-nome", hits) * 2.9, `${hits} acertos: escrita paga ~3× a sequência da bandeira`);
}
// e nunca passa de 75% do que os acertos já pagaram
const fifty = spoils.computeSpoils({ variant: "bandeira-nome", pace: "timed", complete: false, newCards: 0, levelUps: 0, rounds: Array.from({ length: 50 }, () => ({ correct: true, tier: 1 })) });
assert.ok(fifty.streak.coins < fifty.hits.coins * 0.75, "a sequência de uma série perfeita fica abaixo do teto de 75%");
assert.ok(fifty.streak.coins / fifty.hits.coins > 0.5, "mas numa série longa passa de 50% dos acertos");

// dificuldade do país: terços de população; território pequeno sempre é difícil
const meta = {
  a: { pop: 1000000, area: 900000 }, b: { pop: 900000, area: 500000 },
  c: { pop: 500000, area: 300000 }, d: { pop: 400000, area: 200000 },
  e: { pop: 20000, area: 90000 }, f: { pop: 10000, area: 80000 },
  g: { pop: 5000000, area: 500 }, h: { pop: 3000000, area: 15000 },
};
assert.equal(spoils.entityTier(meta, "a"), 1);
assert.equal(spoils.entityTier(meta, "f"), 3);
assert.equal(spoils.entityTier(meta, "g"), 3, "área < 1.000 km² → difícil");
assert.ok(spoils.entityTier(meta, "h") >= 2, "área < 20.000 km² → no mínimo médio");
assert.equal(spoils.entityTier(meta, "nao-existe"), 1, "id fora do catálogo (histórica, idioma) usa o valor base");
assert.equal(spoils.entityTier(undefined, "a"), 1);

// ---- ritmo e rodadas
const tiers = ["short", "long", "fifty", "hundred", "all"];
assert.deepEqual(tiers.map((tier) => pace.roundLimitFor(tier, "mapa")), [10, 20, 50, 100, null]);
assert.deepEqual(tiers.map((tier) => pace.roundLimitFor(tier, "travel")), [5, 10, 25, 50, null], "Travel: rota inteira, cortes pela metade");
assert.deepEqual(pace.ROUND_UNLOCKS.map((item) => [item.key, item.cost]), [["rounds:20", 3000], ["rounds:50", 8000], ["rounds:100", 20000], ["rounds:all", 85000]]);
// cortes oferecidos por recorte: só até o que já cobre o baralho inteiro
const chips = (family, total) => pace.roundChips(family, total).map((chip) => `${chip.tier}:${chip.label}`);
assert.deepEqual(chips("mapa", 255), ["short:10", "long:20", "fifty:50", "hundred:100", "all:Todas · 255"]);
assert.deepEqual(chips("mapa", 59), ["short:10", "long:20", "fifty:50", "hundred:Todas · 59"], "Europa: o corte de 100 já cobre tudo");
assert.deepEqual(chips("mapa", 27), ["short:10", "long:20", "fifty:Todas · 27"], "Caribe: não oferece 100 nem baralho completo");
assert.deepEqual(chips("mapa", 20), ["short:10", "long:Todas · 20"]);
assert.deepEqual(chips("mapa", 8), ["short:8"], "recorte menor que 10 é todo grátis");
assert.deepEqual(chips("travel", 150), ["short:5", "long:10", "fifty:25", "hundred:50", "all:Todas · 150"]);
assert.equal(pace.coveringTier("mapa", 55), "hundred");
assert.equal(pace.displayTier("hundred", "mapa", 27), "fifty", "corte guardado maior aparece como o que cobre o recorte");
assert.equal(pace.displayTier("long", "mapa", 27), "long");
// comprar um corte maior inclui os menores
assert.equal(pace.isRoundTierUnlocked("short", []), true);
assert.equal(pace.isRoundTierUnlocked("long", []), false);
assert.equal(pace.isRoundTierUnlocked("long", ["rounds:20"]), true);
assert.equal(pace.isRoundTierUnlocked("long", ["rounds:50"]), true, "50 inclui 20");
assert.equal(pace.isRoundTierUnlocked("hundred", ["rounds:50"]), false);
assert.equal(pace.isRoundTierUnlocked("fifty", ["rounds:20"]), false);
assert.equal(pace.isRoundTierUnlocked("all", ["rounds:all"]), true);
assert.equal(pace.isRoundTierUnlocked("hundred", ["rounds:all"]), true);
// tempos: uma rede de segurança, não uma corrida
const seconds = { "bandeira-nome": 15, "nome-bandeira": 15, "pais-capital": 15, "historica-nome": 20, "nome-historica": 20, "idioma-nome": 15, "idioma-pais": 20, "silhueta-opcoes": 20, mapa: 20, "capital-pais": 15, "escrita-pais": 30, "escrita-capital": 30, silhueta: 30, travel: 120 };
for (const [variant, expected] of Object.entries(seconds)) assert.equal(pace.timerSecondsFor(variant), expected, variant);
assert.equal(pace.paceSecondsFor("training", "escrita-pais"), null, "Treino não tem cronômetro");
assert.equal(pace.paceSecondsFor("timed", "escrita-pais"), 30);
assert.deepEqual(pace.sessionSettings(undefined, "mapa"), { pace: "training", roundLimit: null, timerSeconds: null });
assert.deepEqual(pace.sessionSettings({ pace: "timed", roundLimit: 10 }, "silhueta"), { pace: "timed", roundLimit: 10, timerSeconds: 30 });
assert.equal(pace.isPace("timed") && pace.isPace("training") && !pace.isPace("x"), true);
assert.equal(pace.isRoundTier("long") && pace.isRoundTier("fifty") && pace.isRoundTier("hundred") && !pace.isRoundTier("20"), true);

// ---- resultado da partida
assert.equal(view.formatDuration(160000), "2 min 40 s");
assert.equal(view.formatDuration(48000), "48 s");
assert.equal(view.formatDuration(120000), "2 min");
assert.equal(view.formatDuration(-5), "0 s");
assert.deepEqual([0, 49, 50, 149, 150].map(view.levelAt), [1, 1, 2, 2, 3]);
assert.deepEqual(view.xpSegments(20, 40), [{ level: 1, span: 50, from: 20, to: 40, levelUp: false }]);
assert.deepEqual(view.xpSegments(45, 65), [
  { level: 1, span: 50, from: 45, to: 50, levelUp: true },
  { level: 2, span: 100, from: 0, to: 15, levelUp: false },
]);
assert.equal(view.xpSegments(45, 160).length, 3, "duas subidas de nível");
assert.equal(view.xpSegments(50, 50).length, 1);

const session = {
  variant: "silhueta", startedAt: 1000, endedAt: 161000, complete: true, pace: "timed", timerSeconds: 30,
  rounds: [...Array.from({ length: 8 }, () => ({ correct: true })), { correct: false }, { correct: false, timedOut: true }],
};
const result = spoils.computeSpoils({ variant: "silhueta", pace: "timed", complete: true, newCards: 4, levelUps: 2,
  rounds: session.rounds.map((round) => ({ ...round, tier: 1 })) });
const shown = view.buildResultView({ session, spoils: result, before: { balance: 8420, xp: 83, level: 1 }, after: { balance: 8420 + result.total, xp: 118, level: 1 }, regionLabel: "Europa" });
assert.equal(shown.title, "Partida concluída");
assert.equal(shown.eyebrow, "Silhueta · escrita · Europa");
assert.deepEqual([shown.correct, shown.total, shown.pct], [8, 10, 80]);
assert.equal(shown.duration, "2 min 40 s");
assert.equal(shown.paceLabel, "Partida · 30 s por pergunta");
assert.equal(shown.coins, result.total);
assert.equal(shown.balanceAfter - shown.balanceBefore, shown.coins);
assert.equal(shown.xpGain, 35);
assert.deepEqual(shown.chips.map((chip) => chip.text), ["4 cartas novas", "2 subiram de nível", "Melhor sequência 8", "1 tempo esgotado"]);
assert.deepEqual(shown.lines.map((line) => line.key), ["hits", "streak", "cards", "levels", "completion"]);
assert.equal(shown.lines.reduce((sum, line) => sum + line.coins, 0), result.total, "os detalhes somam o total");
assert.equal(shown.lines[2].note, "4 × 60");

const practice = view.buildResultView({
  session: { ...session, pace: "training", timerSeconds: null, complete: false, variant: "travel" },
  spoils: spoils.computeSpoils({ variant: "travel", pace: "training", complete: false, newCards: 4, levelUps: 0, rounds: [{ correct: true }] }),
  before: { balance: 100, xp: 50, level: 1 }, after: { balance: 150, xp: 40, level: 1 }, regionLabel: "Mundo" });
assert.equal(practice.title, "Treino encerrado");
assert.equal(practice.paceLabel, "Treino · sem tempo");
assert.equal(practice.training, true);
assert.equal(practice.xpGain, 0, "XP que caiu não vira ganho");
assert.equal(practice.lines.find((line) => line.key === "cards")?.note, "4 × 30", "Treino mostra o valor reduzido por carta");
assert.equal(view.buildResultView({ session: { ...session, variant: "travel", timerSeconds: 120 }, spoils: null, before: { balance: 0, xp: 0, level: 1 }, after: { balance: 0, xp: 0, level: 1 }, regionLabel: "Mundo" }).paceLabel, "Partida · 2 min por rota");
assert.equal(view.buildResultView({ session: { ...session, complete: false }, spoils: null, before: { balance: 0, xp: 0, level: 1 }, after: { balance: 0, xp: 0, level: 1 }, regionLabel: "Mundo" }).title, "Partida encerrada");
assert.equal(view.buildResultView({ session: { ...session, rounds: [] }, spoils: null, before: { balance: 0, xp: 0, level: 1 }, after: { balance: 0, xp: 0, level: 1 }, regionLabel: "Mundo" }).pct, 0);

// erro médio no resultado: só nos modos de clicar no mapa
const mapRounds = [
  ...Array.from({ length: 6 }, () => ({ correct: true, distanceKm: 0 })),
  { correct: false, distanceKm: 400 }, { correct: false, distanceKm: 800 },
  { correct: false, distanceKm: 2000 }, { correct: false, timedOut: true },
];
const shell = { before: { balance: 0, xp: 0, level: 1 }, after: { balance: 0, xp: 0, level: 1 }, regionLabel: "Mundo", spoils: null };
const tapped = view.buildResultView({ ...shell, session: { ...session, variant: "mapa", rounds: mapRounds } });
assert.equal(Math.round(tapped.mapError.km), 356, "(0×6 + 400 + 800 + 2000) ÷ 9 rodadas com distância; tempo esgotado fica de fora");
assert.equal(tapped.mapError.goalKm, 500, "a meta de Mão firme aparece no modo Clicar no mapa");
assert.equal(view.buildResultView({ ...shell, session: { ...session, variant: "capital-pais", rounds: mapRounds } }).mapError.goalKm, null, "capital no mapa mostra o erro, sem a meta do troféu");
assert.equal(view.buildResultView({ ...shell, session: { ...session, variant: "silhueta-opcoes", rounds: mapRounds } }).mapError, null, "outros modos não mostram erro médio");
assert.equal(view.buildResultView({ ...shell, session: { ...session, variant: "mapa", rounds: [{ correct: true }, { correct: false }] } }).mapError, null, "sem nenhuma distância gravada não há erro médio");

// partida abandonada no meio: nenhuma moeda (o crédito só existe para partida completa)
for (const paceName of ["timed", "training"]) {
  const empty = spoils.emptySpoils(paceName);
  assert.equal(empty.total, 0, "abandonar não paga nada");
  assert.equal(empty.hits.coins + empty.streak.coins + empty.newCards.coins + empty.levelUps.coins + empty.completion.coins, 0);
  assert.equal(empty.pace, paceName);
}
assert.ok(spoils.computeSpoils({ variant: "nome-bandeira", pace: "timed", rounds: [{ correct: true }, { correct: true }], complete: true, newCards: 1, levelUps: 0 }).total > 0, "a partida completa continua pagando");
console.log("spoils, pace e result-view: ok");
