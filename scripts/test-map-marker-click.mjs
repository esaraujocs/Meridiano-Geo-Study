import assert from "node:assert/strict";
import { resolveMarkerClick } from "../.tmp-marker/map-marker-click.js";

const sanMarino = { properties: { carta_id: "674" } };

assert.deepEqual(resolveMarkerClick(sanMarino, "674"), {
  answerId: "674",
  correct: true,
});
assert.deepEqual(resolveMarkerClick(sanMarino, "336"), {
  answerId: "674",
  correct: false,
});

console.log("marker click: San Marino correct/wrong paths verified");