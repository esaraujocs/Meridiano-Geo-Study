import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "carta-cega-map-nearest-test");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("node_modules/.bin/tsc", [
  "src/domain/map-nearest.ts",
  "src/domain/map-error.ts",
  "--outDir", out, "--target", "ES2022", "--module", "ESNext",
  "--moduleResolution", "Bundler", "--skipLibCheck", "--lib", "ES2022,DOM",
  "--ignoreConfig",
]);
const near = await import(`file://${out}/map-nearest.js`);
const error = await import(`file://${out}/map-error.js`);

// ---- distância entre pontos
assert.ok(Math.abs(near.haversineKm(38.72, -9.14, 40.42, -3.7) - 502) < 6, "Lisboa–Madri ≈ 502 km");
assert.equal(near.haversineKm(10, 10, 10, 10), 0);

// ---- território mais perto de um toque na água (projeção de teste: 10 px por grau, y para baixo)
const project = ([lng, lat]) => ({ x: lng * 10, y: -lat * 10 });
const square = (lng, lat, size = 1) => ({ type: "Polygon", coordinates: [[[lng, lat], [lng + size, lat], [lng + size, lat + size], [lng, lat + size], [lng, lat]]] });
assert.equal(near.SEA_TAP_PX, 22);
assert.equal(Math.round(near.geometryDistancePx(square(0, 0, 2), project, 30, -10)), 10, "10 px da borda direita do quadrado");
assert.equal(Math.round(near.geometryDistancePx(square(0, 0, 2), project, 10, -10)), 10, "de dentro, a distância é até a borda mais perto (quem trata o toque em terra é o clique, não esta função)");
assert.equal(Math.round(near.geometryDistancePx({ type: "Point", coordinates: [3, 4] }, project, 30, -50)), 10, "ponto");
const islands = [
  { answerId: "A", geometry: square(0, 0, 1) },
  { answerId: "B", geometry: square(5, 0, 1) },
];
assert.equal(near.nearestWithin(islands, project, 20, -5)?.answerId, "A", "mar entre as duas: a ilha A está a 10 px");
assert.equal(near.nearestWithin(islands, project, 35, -5)?.answerId, "B", "e aqui a ilha B está a 15 px");
assert.equal(near.nearestWithin(islands, project, 200, -5), null, "longe demais: continua sendo erro");
assert.equal(near.nearestWithin(islands, project, 30, -5)?.answerId, "A", "empate a 20 px de cada uma: fica a primeira da lista");
assert.equal(near.nearestWithin(islands, project, 20, -5, 5), null, "alcance menor que a distância");
assert.equal(near.nearestWithin([{ answerId: "", geometry: square(0, 0) }], project, 5, -5), null, "candidato sem id não responde");
// perto da linha de data: a ilha está na cópia do mundo ao lado
const fiji = { answerId: "FJ", geometry: square(179, 0, 1) };
assert.equal(near.nearestWithin([fiji], project, -1805, -5)?.answerId, "FJ", "toque em −180,5° alcança a ilha em 179°–180° (cópia do mundo)");
assert.equal(near.nearestWithin([fiji], project, -1500, -5), null);

// ---- distância em km do toque ao território pedido
const polygon = square(10, 10, 2);
assert.equal(near.distanceToGeometriesKm([polygon], 11, 11), 0, "dentro do país");
const east = near.distanceToGeometriesKm([polygon], 13, 11);
assert.ok(Math.abs(east - Math.cos((11 * Math.PI) / 180) * 111.195) < 3, `1° a leste ≈ 109 km (deu ${east})`);
const north = near.distanceToGeometriesKm([polygon], 11, 13);
assert.ok(Math.abs(north - 111.2) < 2, `1° ao norte ≈ 111 km (deu ${north})`);
const far = near.distanceToGeometriesKm([polygon], 11, 30);
assert.ok(Math.abs(far - 18 * 111.2) < 25, `18° ao norte ≈ 2.000 km (deu ${far})`);
const holed = { type: "Polygon", coordinates: [polygon.coordinates[0], [[10.5, 10.5], [11.5, 10.5], [11.5, 11.5], [10.5, 11.5], [10.5, 10.5]]] };
assert.ok(near.distanceToGeometriesKm([holed], 11, 11) > 40, "no buraco do polígono o toque não é 'dentro'");
assert.ok(Math.abs(near.distanceToGeometriesKm([{ type: "Point", coordinates: [0, 0] }], 0, 1) - 111.2) < 2);
assert.ok(near.distanceToGeometriesKm([square(179, 0, 1)], -179.5, 0.5) < 60, "linha de data: 0,5° de distância");
assert.equal(near.distanceToGeometriesKm([], 0, 0), null);
assert.equal(near.distanceToGeometriesKm([{ type: "Polygon", coordinates: [] }], 0, 0), null);
const multi = { type: "MultiPolygon", coordinates: [square(0, 0, 1).coordinates, square(20, 0, 1).coordinates] };
assert.ok(near.distanceToGeometriesKm([multi], 21.5, 0.5) < 60, "MultiPolygon: usa a parte mais perto");
// o menor entre várias geometrias (país + marcador)
assert.ok(near.distanceToGeometriesKm([square(50, 50, 1), { type: "Point", coordinates: [1, 1] }], 1, 2) < 115);

// ---- erro médio da partida (acerto = 0 km)
assert.equal(error.MAP_ERROR_GOAL_KM, 500);
assert.equal(error.MAP_ERROR_MIN_ROUNDS, 10);
assert.equal(error.meanMapErrorKm([]), null);
assert.equal(error.meanMapErrorKm([{ correct: true }, { correct: false }]), null, "sem distância nenhuma (silhueta, Travel, quizzes)");
const mixed = [...Array.from({ length: 6 }, () => ({ correct: true })), ...Array.from({ length: 4 }, () => ({ correct: false, distanceKm: 300 }))];
assert.deepEqual(error.meanMapErrorKm(mixed), { km: 120, rounds: 10 });
assert.deepEqual(error.meanMapErrorKm([...mixed.slice(0, 9), { correct: false, timedOut: true }]), { km: (3 * 300) / 9, rounds: 9 }, "tempo esgotado não tem toque e fica de fora");
assert.deepEqual(error.meanMapErrorKm(Array.from({ length: 10 }, () => ({ correct: true, distanceKm: 0 }))), { km: 0, rounds: 10 }, "partida perfeita: 0 km");
assert.equal(error.formatKm(1240.4), "1.240 km");
assert.equal(error.formatKm(0), "0 km");

console.log("map nearest/error: toque no mar, distância ao território e erro médio verificados");
