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
  silhueta: ["silhueta", "silhueta-opcoes"],
  travel: ["travel"],
};
const regions = ["caribe", "mundo", "pacifico", "europa", "africa", "asia", "america-do-sul", "america-do-norte-central"];
const keys = new Set();
for (const [family, variants] of Object.entries(expectedFamilies)) {
  for (const variant of variants) {
    for (const region of regions) {
      const policy = rules.policyFor(family, variant, region);
      assert.ok(policy, `missing policy ${family}/${variant}/${region}`);
       const canonical = family === "bandeiras" && variant === "nome-bandeira"
         ? "bandeira-nome"
         : family === "historicas" && variant === "nome-historica"
           ? "historica-nome"
           : variant;
       assert.equal(policy.key, `${family}:${canonical}`);
      keys.add(policy.key);
      assert.ok(policy.cost >= 0 && policy.sessions >= 0);
    }
  }
}
assert.equal(keys.size, rules.POLICIES.length);
assert.equal(rules.policyFor("bandeiras", "nome-bandeira", "caribe").cost, 0);
assert.equal(rules.policyFor("bandeiras", "nome-bandeira", "mundo").key, rules.policyFor("bandeiras", "bandeira-nome", "mundo").key);
assert.equal(rules.policyFor("capitais", "capital-pais", "mundo").cost, 0);
assert.deepEqual(
  Object.fromEntries(rules.POLICIES.map((policy) => [policy.key, [policy.cost, policy.coverage, policy.coverageCount]])),
  {
    "mapa:mapa": [0, undefined, 0],
    "bandeiras:bandeira-nome": [0, undefined, 0],
    "capitais:capital-pais": [0, undefined, 0],
    "capitais:pais-capital": [0, undefined, 0],
    "silhueta:silhueta": [4, "mapa", 12],
    "silhueta:silhueta-opcoes": [4, "mapa", 12],
    "travel:travel": [6, "mapa", 20],
    "escrita:escrita-pais": [3, "bandeiras", 10],
    "historicas:historica-nome": [5, "bandeiras", 20],
    "escrita:escrita-capital": [4, "capitais", 10],
    "idiomas:idioma-pais": [5, "bandeiras", 15],
  },
);
console.log(`policy matrix: ${keys.size} explicit entries`);