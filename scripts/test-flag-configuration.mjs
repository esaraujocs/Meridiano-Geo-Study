import assert from "node:assert/strict";
import {
  flagDirectionFromVariant,
  flagSelection,
} from "../.tmp-flag-config/flag-configuration.js";

assert.deepEqual(flagSelection("current"), {
  family: "bandeiras",
  variant: "nome-bandeira",
});
assert.deepEqual(flagSelection("current", "flag-to-name"), {
  family: "bandeiras",
  variant: "bandeira-nome",
});
assert.deepEqual(flagSelection("historical", "name-to-flag"), {
  family: "historicas",
  variant: "nome-historica",
});
assert.deepEqual(flagSelection("historical", "flag-to-name"), {
  family: "historicas",
  variant: "historica-nome",
});
assert.deepEqual(flagSelection("writing"), {
  family: "escrita",
  variant: "escrita-pais",
});
assert.equal(flagDirectionFromVariant("nome-bandeira"), "name-to-flag");
assert.equal(flagDirectionFromVariant("historica-nome"), "flag-to-name");
console.log("flag configuration: categories, directions and default verified");