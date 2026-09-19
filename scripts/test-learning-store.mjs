import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outputDir = join(tmpdir(), "carta-cega-learning-store-test");
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
execFileSync(
  "node_modules/.bin/tsc",
  [
    "src/domain/learning-rules.ts",
    "--outDir",
    outputDir,
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--skipLibCheck",
    "--lib",
    "ES2022,DOM",
    "--ignoreConfig",
  ],
  { stdio: "ignore" },
);

const learning = await import(`file://${outputDir}/learning-rules.js`);
const legacy = {
  id: "legacy:76",
  entityId: "76",
  seen: 7,
  correct: 6,
  columns: { bandeiras: 1, mapa: 1, capitais: 2, escrita: 2 },
  latest: 600,
  mastery: 5,
  source: "legacy-v1",
};

const mergedWrong = learning.mergeProgressRecord(
  legacy,
  "76",
  "mapa",
  false,
  700,
);
assert.equal(mergedWrong.seen, 8);
assert.equal(mergedWrong.correct, 6);
assert.equal(mergedWrong.latest, 600);
assert.equal(mergedWrong.source, "combined");
assert.equal(mergedWrong.mastery, 5);

const mergedCorrect = learning.mergeProgressRecord(
  mergedWrong,
  "76",
  "bandeiras",
  true,
  800,
);
assert.equal(mergedCorrect.seen, 9);
assert.equal(mergedCorrect.correct, 7);
assert.equal(mergedCorrect.columns.bandeiras, 2);
assert.equal(mergedCorrect.latest, 800);
assert.equal(mergedCorrect.mastery, 5);

const fresh = learning.mergeProgressRecord(
  undefined,
  "new",
  "mapa",
  true,
  100,
);
assert.equal(fresh.mastery, 1);
assert.equal(fresh.source, "current-v2");
assert.equal(
  learning.masteryForProgress({
    seen: 1,
    correct: 0,
    columns: { bandeiras: 0, mapa: 1, capitais: 0, escrita: 0 },
  }),
  1,
);
assert.equal(
  learning.masteryForProgress({
    seen: 8,
    correct: 8,
    columns: { bandeiras: 1, mapa: 1, capitais: 2, escrita: 2 },
  }),
  5,
);

console.log("learning store merge: ok");