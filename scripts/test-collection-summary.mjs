import assert from "node:assert/strict";
import { collectionSummary } from "../.tmp-collection-summary/collection-summary.js";

const summary = collectionSummary([
  { entityId: "inside", mastery: 2 },
  { entityId: "inside", mastery: 4 },
  { entityId: "outside", mastery: 5 },
  { entityId: "undiscovered", mastery: 0 },
], ["inside", "undiscovered"]);

assert.deepEqual(summary, { discovered: 1, total: 2 });
assert.ok(summary.discovered <= summary.total);
console.log("collection summary: canonical universe and upper bound verified");