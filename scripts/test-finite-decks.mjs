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
// limite de rodadas: o baralho da partida é um pedaço do embaralhado, sem repetir e sem passar do tamanho
const big = Array.from({ length: 50 }, (_, index) => `item-${index}`);
const ten = createFiniteDeck(big, 99, 10);
assert.equal(ten.size, 10);
assert.equal(ten.remaining, 10);
assert.deepEqual(ten.values(), createFiniteDeck(big, 99).values().slice(0, 10), "o limite corta o mesmo embaralhado");
const seen = [];
while (ten.remaining) seen.push(ten.draw());
assert.equal(new Set(seen).size, 10);
assert.equal(ten.draw(), null);
assert.equal(createFiniteDeck(big, 99, null).size, 50, "sem limite entra tudo");
assert.equal(createFiniteDeck(big, 99, undefined).size, 50);
assert.equal(createFiniteDeck(big, 99, 0).size, 50, "limite zero não esvazia o baralho");
assert.equal(createFiniteDeck(big.slice(0, 6), 99, 10).size, 6, "recorte menor que o limite usa tudo");
console.log("finite decks: 8 engines + limite de rodadas pass");