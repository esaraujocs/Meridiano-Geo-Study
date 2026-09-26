// Simulador dos troféus do Duelo (ferramenta de ajuste, não é teste): joga milhares de duelos de jogadores com uma "habilidade" fixa
// (na escala dos troféus: habilidade 1250 empata com os bots do Ouro) e mostra como a subida se comporta com a tabela de mmr.ts.
// Uso: node scripts/sim-trophies.mjs [jogadores por habilidade]
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
const SKILLS = [300, 600, 900, 1250, 1600, 2000, 2400, 3000, 3600];
const CHECK = [25, 50, 100, 200, 400, 1000];
const LONG = 3000;
const MAX_WIN_RATE = 0.85;

const mulberry32 = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (random) => { let u = 0; while (u === 0) u = random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random()); };
const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
// o bot sai da liga do MMR (matchmaking), presa perto da liga em troféus
const botRating = (trophies, mmr) => { const match = M.matchmaking(trophies, mmr); return L.leagueFloor(match.index) + (match.division ? (match.division - 1) * L.DIVISION_SPAN + L.DIVISION_SPAN / 2 : L.LEAGUE_SPAN / 2); };

function play(skill, games, seed) {
  const random = mulberry32(seed);
  let trophies = 0, mmr = 0, streak = 0;
  const path = [0];
  const reached = new Array(L.LEAGUES.length).fill(null);
  reached[0] = 0;
  let wins = 0, gapSum = 0, above = 0;
  for (let game = 1; game <= games; game += 1) {
    const bot = botRating(trophies, mmr);
    // ninguém vence mais de 85% dos duelos: o bot do Mestre acerta 96% e a pessoa só o vence por acertos ou pelo tempo
    const win = random() < Math.min(MAX_WIN_RATE, M.expectedScore(skill, bot));
    const advantage = (skill - bot) / 100;
    const size = (mean) => Math.max(1, Math.min(15, Math.round(mean + gauss(random) * 2)));
    const margin = win ? size(3 + advantage) : -size(3 - advantage);
    const outcome = win ? "win" : "loss";
    const change = M.trophyChange({ trophies, mmr, streak, outcome, margin });
    gapSum += mmr - trophies;
    if (bot > botRatingAt(trophies)) above += 1;
    const mmrAfter = Math.max(0, mmr + M.mmrChange(mmr, bot, outcome, margin));
    trophies = Math.max(0, trophies + change.delta);
    mmr = mmrAfter;
    streak = win ? streak + 1 : 0;
    if (win) wins += 1;
    path.push(trophies);
    const index = L.leagueOf(trophies).index;
    for (let i = 0; i <= index; i += 1) if (reached[i] === null) reached[i] = game;
  }
  return { path, reached, wins, meanGap: gapSum / games, above: above / games };
}

// nota do bot que a pessoa enfrentaria sem matchmaking (na própria divisão dela)
const botRatingAt = (trophies) => { const home = L.leagueOf(trophies); return L.leagueFloor(home.index) + (home.division ? (home.division - 1) * L.DIVISION_SPAN + L.DIVISION_SPAN / 2 : L.LEAGUE_SPAN / 2); };
const pad = (value, size) => String(value).padStart(size);
console.log(`Troféus por habilidade (mediana de ${RUNS} jogadores). Habilidade 1250 = empata com os bots do Ouro.`);
console.log(["habil.", ...CHECK.map((n) => pad(`${n} jg`, 7)), pad(`${LONG} jg`, 8), pad("vit%", 5), pad("acima%", 7), pad("gap", 6), pad("liga", 9), "  jogos até cada liga (Prata, Ouro, Platina, Diamante, Mestre)"].join(" "));
for (const skill of SKILLS) {
  const runs = Array.from({ length: RUNS }, (_, index) => play(skill, LONG, skill * 1000 + index));
  const at = (n) => Math.round(median(runs.map((run) => run.path[n])));
  const late = Math.round(median(runs.map((run) => median(run.path.slice(LONG - 500)))));
  const win = Math.round((runs.reduce((sum, run) => sum + run.wins, 0) / (RUNS * LONG)) * 100);
  const reached = [1, 2, 3, 4, 5].map((i) => { const games = runs.map((run) => run.reached[i]).filter((g) => g !== null); return games.length >= RUNS / 2 ? String(median(games)) : "—"; });
  console.log([pad(skill, 6), ...CHECK.map((n) => pad(at(n), 7)), pad(late, 8), pad(win, 5), pad(Math.round(runs.reduce((sum, run) => sum + run.above, 0) / RUNS * 100), 7), pad(Math.round(median(runs.map((run) => run.meanGap))), 6), pad(L.leagueOf(late).league, 9), "  " + reached.join(" / ")].join(" "));
}
