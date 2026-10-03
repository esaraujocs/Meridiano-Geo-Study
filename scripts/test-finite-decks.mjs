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
// Pular: a carta sorteada vai para o fim do baralho, sem aumentar o tamanho da partida nem repetir nada
const skipDeck = createFiniteDeck(big, 7, 5);
const first = skipDeck.draw();
assert.equal(skipDeck.defer(first), true);
assert.equal(skipDeck.size, 5, "pular não aumenta o tamanho da partida");
assert.equal(skipDeck.remaining, 5, "sobram as 4 de antes mais a que voltou");
const rest = [];
while (skipDeck.remaining) rest.push(skipDeck.draw());
assert.equal(rest.length, 5);
assert.equal(rest.at(-1), first, "a carta pulada volta por último");
assert.equal(new Set([...rest]).size, 5, "ninguém se repete");
assert.equal(skipDeck.size - skipDeck.remaining, 5, "o contador de rodada fecha no total");
// na última carta não há para onde mandar: o Pular fica indisponível
const last = createFiniteDeck(big, 7, 2);
last.draw(); last.draw();
assert.equal(last.defer("x"), false, "sem cartas restantes, não dá para pular");
assert.equal(last.remaining, 0);
// pular duas vezes seguidas empilha no fim, na ordem
const twice = createFiniteDeck(big, 7, 4);
const c1 = twice.draw(); twice.defer(c1);
const c2 = twice.draw(); twice.defer(c2);
assert.equal(twice.size, 4);
const order = []; while (twice.remaining) order.push(twice.draw());
assert.deepEqual(order.slice(-2), [c1, c2]);
console.log("finite decks: 8 engines + limite de rodadas + pular pass");