import assert from "node:assert/strict";
import { matchTypedAnswer, normalizeTyped } from "../.tmp-typed/typed-answer.js";

assert.equal(normalizeTyped("São Tomé"), "sao tome");
assert.equal(matchTypedAnswer("Niger", ["Niger"]).autoCommit, true);
assert.equal(matchTypedAnswer("Niger", ["Niger", "Nigeria"], { requireUnambiguous: true }).autoCommit, false);
assert.equal(matchTypedAnswer("Nigeria", ["Niger", "Nigeria"], { requireUnambiguous: true }).autoCommit, true);
assert.equal(matchTypedAnswer("Nig", ["Niger", "Nigeria"], { requireUnambiguous: true }).autoCommit, false);
// Explicit Enter/blur/button commits are intentionally outside autoCommit.
assert.equal(matchTypedAnswer("Niger", ["Niger", "Nigeria"]).exact, true);
console.log("typed answers: exact, prefix and ambiguity pass");