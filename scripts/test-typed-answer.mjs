import assert from "node:assert/strict";
import { answerKey, matchTypedAnswer, normalizeTyped, sameCapitalName } from "../.tmp-typed/typed-answer.js";

assert.equal(normalizeTyped("São Tomé"), "sao tome");
assert.equal(matchTypedAnswer("Niger", ["Niger"]).autoCommit, true);
assert.equal(matchTypedAnswer("Niger", ["Niger", "Nigeria"], { requireUnambiguous: true }).autoCommit, false);
assert.equal(matchTypedAnswer("Nigeria", ["Niger", "Nigeria"], { requireUnambiguous: true }).autoCommit, true);
assert.equal(matchTypedAnswer("Nig", ["Niger", "Nigeria"], { requireUnambiguous: true }).autoCommit, false);
// Explicit Enter/blur/button commits are intentionally outside autoCommit.
assert.equal(matchTypedAnswer("Niger", ["Niger", "Nigeria"]).exact, true);
// Tolerância de grafia (28/09): apóstrofo, ponto e espaço não contam, e "Saint" = "St".
for (const typed of ["St. George's", "st georges", "St Georges", "saint georges", "Saint George’s", "stgeorges"]) {
  assert.equal(matchTypedAnswer(typed, ["St. George's"]).exact, true, typed);
}
assert.equal(matchTypedAnswer("st george", ["St. George's"]).exact, false);
assert.equal(matchTypedAnswer("cote d ivoire", ["Côte d'Ivoire"]).exact, true);
assert.equal(matchTypedAnswer("cote divoire", ["Côte d'Ivoire"]).exact, true);
assert.equal(matchTypedAnswer("Ndjamena", ["N'Djamena"]).exact, true);
assert.equal(answerKey("Sainte-Lucie"), "stelucie");
assert.equal(answerKey("São Tomé"), "saotome");
// Capitais com o mesmo nome valem no Capitais · clicar.
assert.equal(sameCapitalName("George Town", "Georgetown"), true);
assert.equal(sameCapitalName("Victoria", "Victoria"), true);
assert.equal(sameCapitalName("Kingston", "Kingstown"), false);
assert.equal(sameCapitalName("Victoria", undefined), false);
console.log("typed answers: exact, prefix, ambiguity, lenient spelling and capital twins pass");