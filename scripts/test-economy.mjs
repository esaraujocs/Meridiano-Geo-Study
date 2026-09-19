import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "carta-cega-economy-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", [
  "src/domain/economy-rules.ts",
  "src/domain/types.ts",
  "--outDir", out, "--target", "ES2022", "--module", "ESNext",
  "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM",
  "--ignoreConfig",
]);
const rules = await import(`file://${out}/economy-rules.js`);
assert.equal(rules.firstCorrectReward("a", "mapa", true, 0).amount, 2);
assert.equal(rules.firstCorrectReward("a", "mapa", true, 1), null);
assert.equal(rules.firstCorrectReward("a", "mapa", false, 0), null);
const world = rules.policyFor("mapa", "mapa", "mundo");
assert.equal(rules.canUnlock(world, 2, 1), false);
assert.equal(rules.canUnlock(world, 3, 1), true);
assert.equal(rules.canUnlock(world, 3, 0), false);
console.log("economy rules: ok");