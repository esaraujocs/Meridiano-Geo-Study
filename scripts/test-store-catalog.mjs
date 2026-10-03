import assert from "node:assert/strict";
import { storeModes, storeRounds, storeCounts, storeSuggestions } from "../.tmp-store-catalog/store-catalog.js";
import { SHOP_THEMES, themeUnlockKey } from "../.tmp-store-catalog/themes.js";

// modos: só os pagos, do mais barato ao mais caro; o que o jogador tem vem marcado
const none = storeModes([]);
assert.ok(none.length >= 7, "os modos pagos entram");
assert.deepEqual(none.map((mode) => mode.price), [...none.map((mode) => mode.price)].sort((a, b) => a - b), "ordenados por preço");
assert.ok(none.every((mode) => !mode.owned && mode.price > 0));
const withOne = storeModes([none[0].key]);
assert.equal(withOne[0].owned, true, "o modo comprado vem marcado");
assert.equal(withOne.filter((mode) => mode.owned).length, 1);

// rodadas: comprar um corte maior inclui os menores
assert.deepEqual(storeRounds([]).map((item) => item.owned), [false, false, false, false]);
assert.deepEqual(storeRounds(["rounds:50"]).map((item) => item.owned), [true, true, false, false], "50 inclui 20");
assert.deepEqual(storeRounds(["rounds:all"]).map((item) => item.owned), [true, true, true, true]);

// contadores das abas
const fresh = storeCounts([]);
assert.equal(fresh.themes, SHOP_THEMES.filter((theme) => theme.cost > 0).length);
assert.equal(fresh.modes, none.length);
assert.equal(fresh.rounds, 4);
assert.equal(storeCounts(["rounds:all"]).rounds, 0);

// sugestões: uma de cada tipo, o tema em destaque não repete, e some o que já é do jogador
const featured = SHOP_THEMES.find((theme) => theme.cost > 0).id;
const s = storeSuggestions(0, [], featured);
assert.deepEqual(s.map((item) => item.kind), ["mode", "theme", "rounds", "supply"]);
assert.notEqual(s.find((item) => item.kind === "theme").theme.id, featured);
assert.equal(s.find((item) => item.kind === "mode").mode.price, none[0].price, "o modo mais barato");
assert.equal(s.find((item) => item.kind === "rounds").rounds.key, "rounds:20", "o corte mais barato");
const allOwned = ["rounds:all", ...none.map((mode) => mode.key), ...SHOP_THEMES.map((theme) => themeUnlockKey(theme.id))];
assert.deepEqual(storeSuggestions(0, allOwned, null).map((item) => item.kind), ["supply"], "só os suprimentos nunca acabam");
console.log("store catalog: modos, rodadas, contadores e sugestões verificados");
