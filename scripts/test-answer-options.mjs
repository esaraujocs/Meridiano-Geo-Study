import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

execFileSync("node_modules/.bin/tsc", [
  "src/domain/answer-options.ts",
  "src/domain/finite-deck.ts",
  "--outDir", "/tmp/carta-cega-answer-options-test",
  "--target", "ES2022",
  "--module", "NodeNext",
  "--moduleResolution", "NodeNext",
  "--skipLibCheck",
  "--ignoreConfig",
], { stdio: "ignore" });

const { shuffleAnswerOptions } = await import(
  "file:///tmp/carta-cega-answer-options-test/answer-options.js"
);
const { seededRandom } = await import(
  "file:///tmp/carta-cega-answer-options-test/finite-deck.js"
);

const engines = [
  "bandeiras atuais: bandeira → nome",
  "bandeiras atuais: nome → bandeira",
  "bandeiras históricas: bandeira → nome",
  "bandeiras históricas: nome → bandeira",
  "capitais",
  "idiomas",
  "silhueta",
];

engines.forEach((engine, engineIndex) => {
  const frequency = [0, 0, 0, 0];
  const random = seededRandom(0x51f15e + engineIndex * 997);
  for (let round = 0; round < 200; round += 1) {
    const options = shuffleAnswerOptions(
      ["correct", "wrong-1", "wrong-2", "wrong-3"],
      random,
    );
    frequency[options.indexOf("correct")] += 1;
  }
  frequency.forEach((count, position) => {
    const ratio = count / 200;
    assert.ok(
      ratio >= 0.15 && ratio <= 0.35,
      `${engine}: posição ${position + 1} apareceu em ${(ratio * 100).toFixed(1)}%`,
    );
  });
});

console.log("answer options: 200 rounds per engine within 15%-35% per position");