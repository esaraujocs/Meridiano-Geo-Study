import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

execFileSync("node_modules/.bin/tsc", [
  "src/domain/map-round-engine.ts",
  "--outDir", "/tmp/carta-cega-map-round-test",
  "--target", "ES2022",
  "--module", "ESNext",
  "--moduleResolution", "Bundler",
  "--skipLibCheck",
  "--lib", "ES2022,DOM",
  "--ignoreConfig",
], { stdio: "ignore" });

const { createMapRoundEngine } = await import(
  "file:///tmp/carta-cega-map-round-test/map-round-engine.js"
);

for (const family of ["mapa", "capitais"]) {
  const completed = [];
  const engine = createMapRoundEngine(["a", "b", "c", "d"], {
    onComplete: (rounds) => completed.push(rounds),
  });
  const seen = [];
  const answers = [
    ["contour", true],
    ["marker", true],
    ["contour", false],
    ["marker", false],
  ];
  answers.forEach(([kind, correct], index) => {
    const target = engine.current();
    seen.push(target);
    const result = engine.answer(correct ? target : "wrong", kind);
    assert.equal(result.progress, index + 1, `${family}/${kind}: progresso deve avançar`);
    if (index < answers.length - 1) engine.reconcile(["a", "b", "c", "d"]);
  });
  assert.equal(new Set(seen).size, 4, `${family}: nenhum alvo pode repetir`);
  assert.equal(engine.progress(), 4, `${family}: progresso final deve ser N/N`);
  assert.deepEqual(completed, [4], `${family}: sessão deve fechar completa ao esgotar`);
}

console.log("map round engine: contour, marker, wrong answers and completion verified");