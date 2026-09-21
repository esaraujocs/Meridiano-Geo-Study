import assert from "node:assert/strict";
import {
  MARKER_OVER_LAND_PX,
  MARKER_TOUCH_PX,
  MARKER_DOT_PX,
  chooseClickAnswer,
  markerWinsClick,
  resolveMarkerClick,
} from "../.tmp-marker/map-marker-click.js";

const sanMarino = { properties: { carta_id: "674" } };

assert.deepEqual(resolveMarkerClick(sanMarino, "674"), {
  answerId: "674",
  correct: true,
});
assert.deepEqual(resolveMarkerClick(sanMarino, "336"), {
  answerId: "674",
  correct: false,
});

// Guadalupe (312) é absorvida: o clique vale pelo soberano (França, 250), nunca por ela mesma.
const guadeloupe = { properties: { carta_id: "312", answer_id: "250" } };
assert.deepEqual(resolveMarkerClick(guadeloupe, "250"), { answerId: "250", correct: true });
assert.deepEqual(resolveMarkerClick(guadeloupe, "312"), { answerId: "250", correct: false });
assert.deepEqual(resolveMarkerClick(guadeloupe, "674"), { answerId: "250", correct: false });

// Prioridade marcador x terreno: um país grande não pode "cair" no marcador vizinho.
assert.equal(MARKER_TOUCH_PX, 14);
assert.equal(MARKER_OVER_LAND_PX, 9);
assert.equal(markerWinsClick(12, "bahrein", ""), true, "água aberta: marcador dentro do raio de toque");
assert.equal(markerWinsClick(16, "bahrein", ""), false, "água aberta: fora do raio de toque");
assert.equal(markerWinsClick(30, "bahrein", "ira"), false, "Irã não cai em Bahrein a 30 px do ponto");
assert.equal(markerWinsClick(12, "brunei", "malasia"), false, "Malásia não cai em Brunei a 12 px do ponto");
assert.equal(markerWinsClick(8, "brunei", "malasia"), true, "clique no núcleo do ponto de Brunei vale Brunei");
assert.equal(markerWinsClick(13, "malta", "malta"), true, "terreno do próprio país não bloqueia o marcador");
assert.equal(markerWinsClick(9, "singapura", "indonesia"), true, "limite do núcleo do ponto");
assert.equal(markerWinsClick(10, "singapura", "indonesia"), false, "Indonésia não cai em Singapura a 10 px do ponto");

// Escolha completa: ponto tocado > marcador do país sob o toque > marcador ao alcance > terreno.
assert.equal(MARKER_DOT_PX, 4);
const pick = (markers, land) => chooseClickAnswer(markers, land).answerId;
assert.equal(pick([{ answerId: "bahrein", distancePx: 6 }, { answerId: "catar", distancePx: 7 }], "catar"), "catar",
  "clique no polígono do Catar não é roubado pelo ponto do Bahrein");
assert.equal(pick([{ answerId: "bahrein", distancePx: 3 }], "catar"), "bahrein", "tocou no desenho do ponto do Bahrein");
assert.equal(pick([{ answerId: "bahrein", distancePx: 30 }], "ira"), "ira", "fora do alcance vale o terreno");
assert.equal(pick([{ answerId: "bahrein", distancePx: 12 }], "ira"), "ira", "sobre o Irã só o núcleo do ponto vale");
assert.equal(pick([{ answerId: "bahrein", distancePx: 12 }], ""), "bahrein", "água aberta: raio de toque");
assert.equal(pick([{ answerId: "bahrein", distancePx: 20 }], ""), "", "água aberta longe de tudo: sem resposta de marcador");
assert.equal(pick([{ answerId: "brunei", distancePx: 8 }], "malasia"), "brunei", "núcleo do ponto de Brunei");
assert.equal(pick([{ answerId: "", distancePx: 1 }], "malasia"), "malasia", "marcador sem id é ignorado");
assert.deepEqual(chooseClickAnswer([{ answerId: "malta", distancePx: 5, coordinates: [14.4, 35.9] }], "malta").marker?.coordinates, [14.4, 35.9]);

console.log("marker click: San Marino, absorbed Guadeloupe and marker-vs-land priority verified");