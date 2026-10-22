// Aba "Duelos" do Progresso (src/domain/duel-stats.ts): desempenho, força estimada, por modo, por jeito, rivais e pessoas.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(process.cwd(), ".tmp-duel-stats");
await rm(out, { recursive: true, force: true });
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--ignoreConfig", "src/domain/duel-stats.ts", "--outDir", out, "--module", "ESNext", "--moduleResolution", "Bundler", "--target", "ES2022", "--skipLibCheck"], { stdio: "inherit" });
const S = await import(pathToFileURL(join(out, "duel-stats.js")).href);
const D = await import(pathToFileURL(join(out, "duel.js")).href);

// desempenho: metade das vitórias contra 2.000 dá 2.000; tudo ganho fica bem acima
assert.equal(S.performanceRating([{ opp: 2000, score: 1 }, { opp: 2000, score: 0 }]), 2000);
assert.equal(S.performanceRating([{ opp: 2000, score: 1 }, { opp: 2000, score: 1 }, { opp: 2000, score: 0.5 }]), 2280, "83% contra 2.000: +280");
assert.equal(S.performanceRating([]), null);

// duelos sintéticos de Bandeiras: a pessoa acerta 19/20 em ~1,5 s; contra o Cosmo (rápido) e a Lúcia (precisa)
const at = Date.UTC(2026, 9, 21);
const duel = (i, botId, outcome, playerCorrect, botCorrect, exp, extra = {}) => ({
  id: `duel:t${i}`, sessionId: `t${i}`, at: at + i * 60_000, botId, ladder: "bandeiras", family: "bandeiras", variant: "nome-bandeira",
  playerCorrect, total: 20, botCorrect, outcome, tiebreak: playerCorrect === botCorrect, delta: outcome === "win" ? 20 : -30,
  mmrDelta: outcome === "win" ? 10 : -15, mmrVersion: D.MMR_MODEL, mmrSigma: 60, mmrExp: exp,
  legs: [{ group: "atuais", playerCorrect: Math.min(10, playerCorrect - 9), botCorrect: Math.min(10, botCorrect - 9), total: 10, playerMs: 15_000, botMs: 30_000 },
    { group: "historicas", playerCorrect: 9, botCorrect: 9, total: 10, playerMs: 28_000, botMs: 40_000 }], ...extra,
});
const duels = Array.from({ length: 24 }, (_, i) => i % 6 === 5 ? duel(i, "bot-mestre-1", "loss", 18, 19, 0.6) : duel(i, i % 2 ? "bot-mestre-2" : "bot-mestre-1", "win", 19, 18, 0.6));
duels.push(duel(30, "bot-mestre-2", "win", 19, 17, 0.6, { abandoned: true }));
duels.push({ ...duel(31, "bot-mestre-2", "win", 19, 17, 0.6), ladder: "mapas" });
const stats = S.ladderStats(duels, duels, "bandeiras");
assert.equal(stats.duels, 24, "o abandonado e o de Mapas ficam fora");
assert.equal(stats.wins, 20); assert.equal(stats.losses, 4);
assert.equal(stats.last20.duels, 20);
assert.ok(stats.perf20 !== null && stats.windows.length >= 1 && stats.windows.at(-1).perf === stats.perf20, "a última janela é a dos últimos 20");
const atuais = stats.modes.find((mode) => mode.group === "atuais");
assert.equal(atuais.rounds, 240); assert.equal(atuais.msRounds, 240);
assert.ok(atuais.youMs < atuais.botMs);
const hist = stats.modes.find((mode) => mode.group === "historicas");
assert.equal(hist.legWins, 24, "empate nos acertos, decidido no tempo");
assert.equal(stats.rivals[0].botId, "bot-mestre-1"); assert.equal(stats.rivals[0].losses, 4);
assert.ok(stats.styles.length >= 1 && stats.styles.every((style) => style.wins <= style.duels));

// força pelos acertos e pelo tempo: determinística e no alto para 19/20 em ~2 s
const skill = S.estimatedSkill(duels.filter((d) => d.ladder === "bandeiras"));
assert.equal(skill, S.estimatedSkill(duels.filter((d) => d.ladder === "bandeiras")), "mesma semente, mesmo número");
assert.ok(skill > 2800 && skill < 4300, `força ${skill}`);
assert.equal(S.estimatedSkill(duels.slice(0, 3)), null, "menos de 5 duelos: sem estimativa");

// pessoas
const people = S.peopleStats([
  { id: "pvp:A", code: "A", at, ladder: "mapas", mode: "friendly", opponentName: "Beto", opponentCode: "XYZ", opponentRating: 1000, youCorrect: 18, opponentCorrect: 10, totalRounds: 20, outcome: "win", tiebreak: false, youForfeited: false, opponentForfeited: false, youMs: 60_000, opponentMs: 80_000, ratingDelta: null },
  { id: "pvp:C", code: "C", at: at - 1, ladder: "mapas", mode: "friendly", opponentName: "Beto", opponentRating: 1000, youCorrect: 15, opponentCorrect: 6, totalRounds: 20, outcome: "win", tiebreak: false, youForfeited: false, opponentForfeited: false, youMs: null, opponentMs: null, ratingDelta: null },
  { id: "pvp:B", code: "B", at: at + 1, ladder: "bandeiras", mode: "ranked", opponentName: "Beto", opponentCode: "XYZ", opponentRating: 1000, youCorrect: 12, opponentCorrect: 14, totalRounds: 20, outcome: "loss", tiebreak: false, youForfeited: false, opponentForfeited: false, youMs: 40_000, opponentMs: null, ratingDelta: -12 },
]);
assert.equal(people.duels, 3); assert.equal(people.ranked, 1); assert.equal(people.wins, 2); assert.equal(people.losses, 1);
assert.equal(people.you, 15); assert.equal(people.youMs, 3000, "tempo só dos duelos com os dois tempos");
assert.deepEqual(people.rivals.map((r) => [r.name, r.code, r.duels, r.wins, r.losses]), [["Beto", "XYZ", 3, 2, 1]], "o registro antigo sem código junta pelo nome");
console.log(`duel-stats ok · desempenho ${stats.perf20}, força ${skill}`);
await rm(out, { recursive: true, force: true });
