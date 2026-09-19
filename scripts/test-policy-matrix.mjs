import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "carta-cega-policy-test");
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
const expectedFamilies = {
  mapa: ["mapa"],
  bandeiras: ["bandeira-nome", "nome-bandeira"],
  capitais: ["capital-pais", "pais-capital"],
  escrita: ["escrita-pais", "escrita-capital"],
  historicas: ["historica-nome", "nome-historica"],
  idiomas: ["idioma-pais"],
  silhueta: ["silhueta"],
  travel: ["travel"],
};
const regions = ["caribe", "mundo", "pacifico"];
const keys = new Set();
for (const [family, variants] of Object.entries(expectedFamilies)) {
  for (const variant of variants) {
    for (const region of regions) {
      const policy = rules.policyFor(family, variant, region);
      assert.ok(policy, `missing policy ${family}/${variant}/${region}`);
      assert.equal(policy.key, `${family}:${variant}:${region}`);
      assert.ok(!keys.has(policy.key), `duplicate policy ${policy.key}`);
      keys.add(policy.key);
      assert.ok(policy.cost >= 0 && policy.sessions >= 0);
    }
  }
}
assert.equal(keys.size, rules.POLICIES.length);
assert.equal(rules.policyFor("bandeiras", "nome-bandeira", "caribe").cost, 2);
assert.equal(rules.policyFor("capitais", "capital-pais", "mundo").cost, 0);
console.log(`policy matrix: ${keys.size} explicit entries`);