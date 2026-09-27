import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "carta-cega-special-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", [
  "src/domain/special-data.ts", "--outDir", out, "--target", "ES2022",
  "--module", "ESNext", "--moduleResolution", "Bundler", "--skipLibCheck",
  "--lib", "ES2022,DOM", "--ignoreConfig",
], { stdio: "ignore" });
const rules = await import(`file://${out}/special-data.js`);
assert.equal(rules.normalizeAnswer("São Tomé e Príncipe"), "sao tome e principe");
assert.deepEqual(rules.acceptedWritingAnswers({ pt: "Brasil", en: "Brazil", al: "Brasil" }), ["brasil", "brazil", "brasil"]);
// Escrita menos rígida (28/09, o Enzo achou algumas entidades duras demais pra digitar): as grafias comuns entram como alias no catálogo (`al`/`capAl`),
// então `acceptedWritingAnswers`/`acceptedCapitalAnswers` já as aceitam sem mexer na regra de comparação (`normalizeAnswer` continua igual).
assert.ok(rules.acceptedWritingAnswers({ pt: "Ilhas Cocos (Keeling)", al: ["Ilhas Cocos", "Keeling"] }).includes("keeling"), "Keeling sozinho, sem o resto do nome");
assert.ok(rules.acceptedWritingAnswers({ pt: "São Martinho (Holanda)", al: ["São Martinho", "Sint Maarten"] }).includes("sao martinho"), "São Martinho sem o '(Holanda)'");
assert.ok(rules.acceptedCapitalAnswers({ cap: "N'Djamena", capAl: ["Ndjamena"] }).includes("ndjamena"), "N'Djamena sem apóstrofo nem espaço");
assert.ok(rules.acceptedCapitalAnswers({ cap: "Washington, D.C.", capAl: ["Washington", "Washington DC"] }).includes("washington"), "Washington sem o D.C.");
assert.equal(rules.specialInRegion({ reg: "Oceania" }, "pacifico"), true);
assert.equal(rules.specialInRegion({ sub: "Caribbean" }, "caribe"), true);
for (const [region, reg, sub] of [
  ["europa", "Europe", "Northern Europe"],
  ["africa", "Africa", "Western Africa"],
  ["asia", "Asia", "Eastern Asia"],
  ["america-do-sul", "Americas", "South America"],
  ["america-do-norte-central", "Americas", "Central America"],
]) {
  assert.equal(rules.specialInRegion({ reg, sub }, region), true);
}
assert.equal(rules.historicalPool([{ id: "a", pt: "A", reg: "Oceania" }], "pacifico").length, 1);
assert.equal(rules.languagePool([{ id: "l", idioma: "L", script: "x", paises: "P", reg: "Asia" }], "caribe").length, 0);
console.log("special data rules: ok");