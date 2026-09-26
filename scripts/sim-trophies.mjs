// Simulador dos troféus do Duelo (ferramenta de ajuste, não é teste): joga milhares de duelos de jogadores com uma "habilidade" fixa
// (na escala dos troféus: habilidade 1250 empata com os bots do Ouro) e mostra como a subida se comporta com as regras de mmr.ts: MMR com
// incerteza e surpresa, matchmaking pelo rating e força contínua do bot.
// Uso: node scripts/sim-trophies.mjs [jogadores por habilidade] [taxa máxima de vitória, 0,85] [troféus de bônus por liga acima, 10]
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(tmpdir(), "carta-cega-sim-trophies");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node", ["node_modules/typescript/bin/tsc", "src/domain/league.ts", "src/domain/mmr.ts", "--outDir", out, "--module", "ES2022", "--target", "ES2022", "--moduleResolution", "Bundler", "--skipLibCheck", "--ignoreConfig"], { stdio: "inherit" });
const L = await import(pathToFileURL(join(out, "league.js")).href);
const M = await import(pathToFileURL(join(out, "mmr.js")).href);

const RUNS = Number(process.argv[2] || 200);
// ninguém vence mais de 85% dos duelos: o bot do Mestre acerta ~96% e a pessoa só o vence por acertos ou pelo tempo
const MAX_WIN_RATE = Number(process.argv[3] || 0.85);
const LEAD_BONUS = process.argv[4] ? Number(process.argv[4]) : M.LEAD_PER_LEAGUE;
const SKILLS = [300, 600, 900, 1250, 1600, 2000, 2400, 2700, 3000, 3600];
const CHECK = [25, 50, 100, 200, 400, 1000];
const LONG = 3000;

const mulberry32 = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (random) => { let u = 0; while (u === 0) u = random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random()); };
const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };

function play(skill, games, seed) {
  const random = mulberry32(seed);
  let trophies = 0, mmr = 0, streak = 0, sigma = M.SIGMA_START;
  const samples = [];
  const path = [0];
  const reached = new Array(L.LEAGUES.length).fill(null);
  reached[0] = 0;
  let wins = 0, gapSum = 0, above = 0, big = 0, best = 0, bigEarly = 0;
  for (let game = 1; game <= games; game += 1) {
    const z = M.surprise(samples);
    const rating = M.matchRating(trophies, mmr, sigma, z);
    const win = random() < Math.min(MAX_WIN_RATE, M.expectedScore(skill, rating));
    const advantage = (skill - rating) / 100;
    const size = (mean) => Math.max(1, Math.min(15, Math.round(mean + gauss(random) * 2)));
    const margin = win ? size(3 + advantage) : -size(3 - advantage);
    const outcome = win ? "win" : "loss";
    const lead = M.leadOf(rating, trophies);
    const change = M.trophyChange({ trophies, mmr, streak, outcome, margin, lead, leadBonus: LEAD_BONUS });
    if (change.delta >= 60) { big += 1; if (game <= 60) bigEarly += 1; }
    best = Math.max(best, change.delta);
    gapSum += mmr - trophies;
    if (lead > 0) above += 1;
    const expected = M.expectedScore(mmr, rating);
    const mmrAfter = Math.max(0, mmr + M.mmrChange(mmr, rating, outcome, margin, sigma));
    samples.push({ score: win ? 1 : 0, expected });
    sigma = M.sigmaNext(sigma, samples);
    trophies = Math.max(0, trophies + change.delta);
    mmr = mmrAfter;
    streak = win ? streak + 1 : 0;
    if (win) wins += 1;
    path.push(trophies);
    const index = L.leagueOf(trophies).index;
    for (let i = 0; i <= index; i += 1) if (reached[i] === null) reached[i] = game;
  }
  return { path, reached, wins, meanGap: gapSum / games, above: above / games, big: big / games, best, bigEarly: bigEarly / Math.min(60, games) };
}

const pad = (value, size) => String(value).padStart(size);
console.log(`Troféus por habilidade (mediana de ${RUNS} jogadores). Habilidade 1250 = empata com os bots do Ouro.`);
console.log(["habil.", ...CHECK.map((n) => pad(`${n} jg`, 7)), pad(`${LONG} jg`, 8), pad("vit%", 5), pad("acima%", 7), pad("≥60%", 5), pad("máx", 4), pad("≥60 1as60", 10), pad("gap", 6), pad("liga", 9), "  jogos até cada liga (Prata, Ouro, Platina, Diamante, Mestre)"].join(" "));
for (const skill of SKILLS) {
  const runs = Array.from({ length: RUNS }, (_, index) => play(skill, LONG, skill * 1000 + index));
  const at = (n) => Math.round(median(runs.map((run) => run.path[n])));
  const late = Math.round(median(runs.map((run) => median(run.path.slice(LONG - 500)))));
  const win = Math.round((runs.reduce((sum, run) => sum + run.wins, 0) / (RUNS * LONG)) * 100);
  const reached = [1, 2, 3, 4, 5].map((i) => { const games = runs.map((run) => run.reached[i]).filter((g) => g !== null); return games.length >= RUNS / 2 ? String(median(games)) : "—"; });
  console.log([pad(skill, 6), ...CHECK.map((n) => pad(at(n), 7)), pad(late, 8), pad(win, 5), pad(Math.round(runs.reduce((sum, run) => sum + run.above, 0) / RUNS * 100), 7), pad((runs.reduce((sum, run) => sum + run.big, 0) / RUNS * 100).toFixed(1), 5), pad(Math.max(...runs.map((run) => run.best)), 4), pad((runs.reduce((sum, run) => sum + run.bigEarly, 0) / RUNS * 100).toFixed(0) + "%", 10), pad(Math.round(median(runs.map((run) => run.meanGap))), 6), pad(L.leagueOf(late).league, 9), "  " + reached.join(" / ")].join(" "));
}
