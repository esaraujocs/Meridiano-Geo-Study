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
  idiomas: ["idioma-nome", "idioma-pais"],
  silhueta: ["silhueta", "silhueta-opcoes"],
  travel: ["travel"],
  gentilicos: ["gentilico-pais", "pais-gentilico"],
  moedas: ["pais-moeda", "moeda-pais"],
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
// Economia v2: só moedas (sem cobertura nem partidas) e preços em ordem crescente.
assert.deepEqual(
  Object.fromEntries(rules.POLICIES.map((policy) => [policy.key, [policy.cost, policy.coverage, policy.coverageCount, policy.sessions]])),
  {
    "mapa:mapa": [0, undefined, 0, 0],
    "bandeiras:bandeira-nome": [0, undefined, 0, 0],
    "capitais:capital-pais": [0, undefined, 0, 0],
    "capitais:pais-capital": [0, undefined, 0, 0],
    "escrita:escrita-pais": [5000, undefined, 0, 0],
    "gentilicos:gentilico-pais": [8000, undefined, 0, 0],
    "silhueta:silhueta-opcoes": [11000, undefined, 0, 0],
    "escrita:escrita-capital": [15000, undefined, 0, 0],
    "gentilicos:pais-gentilico": [18000, undefined, 0, 0],
    "moedas:pais-moeda": [22000, undefined, 0, 0],
    "silhueta:silhueta": [27000, undefined, 0, 0],
    "moedas:moeda-pais": [30000, undefined, 0, 0],
    "historicas:historica-nome": [36000, undefined, 0, 0],
    "idiomas:idioma-nome": [40000, undefined, 0, 0],
    "idiomas:idioma-pais": [48000, undefined, 0, 0],
    "travel:travel": [64000, undefined, 0, 0],
  },
);
const paid = rules.POLICIES.filter((policy) => policy.cost > 0).map((policy) => policy.cost);
assert.deepEqual(paid, [...paid].sort((x, y) => x - y), "preços em ordem crescente");
assert.equal(rules.canUnlock(rules.policyFor("travel", "travel", "mundo"), 64000, 0), true);
assert.equal(rules.canUnlock(rules.policyFor("travel", "travel", "mundo"), 63999, 0), false);
// escada suave: cada degrau custa de 1,1 a 2,2 vezes o anterior (sem amontoado e sem penhasco; as duas variantes de Idiomas ficam coladas)
for (let index = 1; index < paid.length; index += 1) {
  const step = paid[index] / paid[index - 1];
  assert.ok(step >= 1.1 && step <= 2.2, `degrau ${paid[index - 1]} → ${paid[index]} = ${step.toFixed(2)}×`);
}
console.log(`policy matrix: ${keys.size} explicit entries`);