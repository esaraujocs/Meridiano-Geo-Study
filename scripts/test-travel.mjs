// Travel no estilo do Travle (src/domain/travel.ts): vizinhança, rotas, cor dos chutes, folga e moedas, e o catálogo de verdade.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(process.cwd(), ".tmp-travel-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "src/domain/travel.ts", "--outDir", out, "--target", "ES2022", "--module", "ESNext", "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM", "--ignoreConfig"], { stdio: "inherit" });
const tv = await import(pathToFileURL(join(out, "travel.js")).href);

// uma linha A-B-C-D-E com um atalho B-X-D (o caminho por X tem o mesmo tamanho) e um ramo F pendurado em A
const meta = {
  a: { pt: "A", cca3: "AAA", un: true, borders: ["BBB", "FFF"] },
  b: { pt: "B", cca3: "BBB", un: true, borders: ["AAA", "CCC", "XXX"] },
  c: { pt: "C", cca3: "CCC", un: true, borders: ["BBB", "DDD"] },
  x: { pt: "X", cca3: "XXX", un: true, borders: ["BBB", "DDD"] },
  d: { pt: "D", cca3: "DDD", un: true, borders: ["CCC", "EEE", "XXX"] },
  e: { pt: "E", cca3: "EEE", un: true, borders: ["DDD"] },
  f: { pt: "F", cca3: "FFF", un: true, borders: ["AAA"] },
  z: { pt: "Z", cca3: "ZZZ", un: true, borders: [] },
};
const ids = Object.keys(meta);
const g = tv.travelGraph(meta, ids);
assert.ok(g.get("b").has("a") && g.get("a").has("b"), "simétrico");
assert.equal(g.get("z").size, 0);
assert.deepEqual(tv.bestRoute(g, "a", "e"), ["a", "b", "c", "d", "e"]);
const puzzle = { start: "a", end: "e", shortest: 3, budget: tv.travelBudget(3) };
assert.equal(puzzle.budget, 7);
assert.equal(tv.remainingCost(g, "a", "e", new Set()), 3);
// qualquer ordem: D primeiro é verde (encurta) mas não ligado; B depois é verde ligado; X fecha pelo atalho
assert.equal(tv.gradeGuess(g, puzzle, new Set(), "d"), "closer");
assert.equal(tv.gradeGuess(g, puzzle, new Set(["d"]), "b"), "linked");
assert.equal(tv.gradeGuess(g, puzzle, new Set(["d", "b"]), "x"), "linked");
assert.ok(tv.routeClosed(g, "a", "e", new Set(["d", "b", "x"])));
assert.ok(!tv.routeClosed(g, "a", "e", new Set(["d", "b"])));
// C depois de X: não encurta mais, mas está no caminho mais curto → laranja; F (1 a mais que o mais curto? A-F não leva a E) → vermelho; Z sem terra → vermelho
assert.equal(tv.gradeGuess(g, puzzle, new Set(["d", "b", "x"]), "c"), "near");
assert.equal(tv.gradeGuess(g, puzzle, new Set(), "f"), "far");
assert.equal(tv.gradeGuess(g, puzzle, new Set(), "z"), "far");
assert.deepEqual(tv.remainingRoute(g, puzzle, new Set(["d"])), ["b", "c"]);
// a folga do Travle
assert.deepEqual([1, 3, 4, 6, 7, 9, 10, 12, 13].map(tv.travelExtra), [4, 4, 5, 5, 6, 6, 7, 7, 8]);
// moedas: no mínimo, rota inteira; cada chute a mais ou pista −10%, até a metade; perdida não paga
assert.equal(tv.travelWeight(puzzle, 3, true), 3);
assert.equal(tv.travelWeight(puzzle, 5, true), 2.4);
assert.equal(tv.travelWeight(puzzle, 7, true), 1.8);
assert.equal(tv.travelWeight(puzzle, 9, true), 1.5);
assert.equal(tv.travelWeight(puzzle, 7, false), 0);
assert.equal(tv.travelWeight(puzzle, 3, true, "trilha"), 3.75);
assert.equal(tv.travelWeight(puzzle, 3, true, "exata"), 4.5);
// níveis: a folga diminui; a Trilha só aceita o que encosta na cadeia da origem; Em ordem, só o que encosta no último país aceito
assert.deepEqual([3, 4, 7].map((n) => tv.travelExtra(n, "trilha")), [2, 3, 3]);
assert.equal(tv.travelBudget(3, "exata"), 4);
assert.equal(tv.guessAllowed(g, puzzle, new Set(), "d", "livre"), true);
assert.equal(tv.guessAllowed(g, puzzle, new Set(), "d", "trilha"), false, "D não encosta na origem");
assert.equal(tv.guessAllowed(g, puzzle, new Set(), "b", "trilha"), true);
assert.equal(tv.guessAllowed(g, puzzle, new Set(), "f", "trilha"), true, "F encosta em A (longe do caminho, mas vale na Trilha)");
assert.equal(tv.guessAllowed(g, puzzle, new Set(["b"]), "c", "trilha"), true);
assert.equal(tv.guessAllowed(g, puzzle, new Set(), "f", "exata"), true, "F encosta na origem: desvio vale, só custa chute");
assert.equal(tv.guessAllowed(g, puzzle, new Set(), "b", "exata"), true);
assert.equal(tv.guessAllowed(g, puzzle, new Set(["b"]), "x", "exata", "b"), true, "X ou C: encostam no último");
assert.equal(tv.guessAllowed(g, puzzle, new Set(["b"]), "f", "exata", "b"), false, "F encosta na origem, mas a ponta agora é B");
assert.equal(tv.guessAllowed(g, puzzle, new Set(["b"]), "f", "trilha"), true, "na Trilha pode ramificar");
assert.equal(tv.guessAllowed(g, puzzle, new Set(["b"]), "d", "exata", "b"), false, "pular um país não vale");
// sorteio: determinístico, distância de 2 a 7 fronteiras, origem à distância sorteada
const p1 = tv.travelPuzzle(g, "e", 7), p2 = tv.travelPuzzle(g, "e", 7);
assert.deepEqual(p1, p2);
assert.equal(tv.distancesFrom(g, p1.end).get(p1.start), p1.shortest + 1);
assert.ok(p1.shortest >= 1 && p1.shortest <= 6);
assert.equal(tv.travelPuzzle(g, "z", 1), null);
assert.equal(tv.travelPuzzle(g, "e", 7, "exata").budget, p1.shortest + 1);

// o catálogo de verdade
const catalog = JSON.parse(await readFile("public/data/legacy/catalog.json", "utf8"));
const pool = tv.travelPool(catalog.meta);
const real = tv.travelGraph(catalog.meta, pool);
const byName = (name) => pool.find((id) => catalog.meta[id].pt === name);
const [fr, uk, dk, se, ma, mr, eh, ru, kp, sg, my, br] = ["França", "Reino Unido", "Dinamarca", "Suécia", "Marrocos", "Mauritânia", "Saara Ocidental", "Rússia", "Coreia do Norte", "Singapura", "Malásia", "Brasil"].map(byName);
assert.ok(pool.length >= 195, `pool ${pool.length}`);
assert.ok(!pool.some((id) => catalog.meta[id].substitui), "as nações do Reino Unido viram o Reino Unido");
assert.deepEqual(tv.travelFeatureIds(catalog.meta, uk).sort(), ["gb-eng", "gb-nir", "gb-sct", "gb-wls"]);
assert.deepEqual(tv.travelFeatureIds(catalog.meta, fr), [fr]);
assert.ok(real.get(fr).has(uk), "Eurotúnel");
assert.ok(real.get(dk).has(se), "Øresund");
assert.ok(real.get(sg).has(my), "Singapura–Malásia");
assert.ok(!real.get(ma).has(mr), "Marrocos e Mauritânia não se tocam");
assert.ok(real.get(eh).has(ma) && real.get(eh).has(mr));
assert.ok(real.get(ru).has(kp), "Rússia–Coreia do Norte");
const [pl, lt, tr, az, ao, cg, es] = ["Polônia", "Lituânia", "Turquia", "Azerbaijão", "Angola", "Congo", "Espanha"].map(byName);
assert.ok(real.get(pl).has(ru) && real.get(lt).has(ru), "Kaliningrado liga a Rússia à Polônia e à Lituânia");
assert.ok(real.get(tr).has(az) && real.get(ao).has(cg) && real.get(es).has(ma), "Nakhchivan, Cabinda, Ceuta e Melilla ligam");
assert.ok(!real.get(fr).has(br), "a Guiana Francesa não liga a França ao Brasil");
assert.ok(!tv.travelPool(catalog.meta, true).includes(eh), "só países tira o Saara Ocidental");
const dests = tv.travelDestinations(real);
assert.ok(dests.length > 140, `destinos ${dests.length}`);
const hops = new Map();
for (const end of dests) for (let seed = 0; seed < 5; seed++) {
  const p = tv.travelPuzzle(real, end, seed);
  assert.ok(p && p.start !== p.end);
  const route = tv.bestRoute(real, p.start, p.end);
  assert.equal(route.length - 2, p.shortest);
  hops.set(p.shortest + 2, (hops.get(p.shortest + 2) ?? 0) + 1);
}
console.log("rotas por tamanho (países):", [...hops].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(" "));
console.log(`travel ok · ${pool.length} países, ${dests.length} destinos`);
await rm(out, { recursive: true, force: true });
