import assert from "node:assert/strict";
import { createFiniteDeck, shuffleSeeded } from "../.tmp-finite/finite-deck.js";

const engines = ["mapa", "bandeira-nome", "nome-bandeira", "capital-pais", "pais-capital", "escrita", "silhueta", "travel"];
for (const engine of engines) {
  const pool = Array.from({ length: 17 }, (_, index) => `${engine}-${index}`);
  const a = createFiniteDeck(pool, 1234);
  const b = createFiniteDeck(pool, 1234);
  assert.deepEqual(a.values(), b.values(), `${engine}: seeded order`);
  const drawn = [];
  while (a.remaining) drawn.push(a.draw());
  assert.equal(drawn.length, pool.length, `${engine}: exact size`);
  assert.equal(new Set(drawn).size, pool.length, `${engine}: no repeats`);
  assert.equal(a.draw(), null, `${engine}: exhaustion`);
}
assert.notDeepEqual(shuffleSeeded(["a", "b", "c", "d", "e", "f", "g"], 1), shuffleSeeded(["a", "b", "c", "d", "e", "f", "g"], 2));
console.log("finite decks: 8 engines pass");