import assert from "node:assert/strict";
import { SHOP_THEMES, themeUnlockKey } from "../.tmp-hub-showcase/themes.js";
import { pickShowcaseTheme } from "../.tmp-hub-showcase/hub-showcase.js";

const forSale = SHOP_THEMES.filter((theme) => theme.cost > 0);
const cheapest = forSale.reduce((a, b) => (b.cost < a.cost ? b : a));
const dearest = forSale.reduce((a, b) => (b.cost > a.cost ? b : a));

// sem moedas: o mais barato que falta (o mais perto)
assert.equal(pickShowcaseTheme(0, []).id, cheapest.id);
// com moedas de sobra: o mais caro que cabe no saldo
assert.equal(pickShowcaseTheme(10_000_000, []).id, dearest.id);
// saldo no meio: o mais caro que ainda cabe
const mid = 30_000;
const picked = pickShowcaseTheme(mid, []);
assert.ok(picked.cost <= mid);
assert.ok(forSale.filter((theme) => theme.cost <= mid).every((theme) => theme.cost <= picked.cost));
// o que já é do jogador nunca aparece
const owned = [themeUnlockKey(dearest.id)];
assert.notEqual(pickShowcaseTheme(10_000_000, owned).id, dearest.id);
// tudo comprado: nada a mostrar
assert.equal(pickShowcaseTheme(10_000_000, forSale.map((theme) => themeUnlockKey(theme.id))), null);
console.log("hub showcase: escolha do tema em destaque verificada");

// ---- a Vitrine do Hub é só de consumíveis. No Hub antigo (coluna): 3 conjuntos de 3, sem repetir suprimento
const { SUPPLY_SETS, SUPPLY_GRID_SETS } = await import("../.tmp-hub-showcase/hub-showcase.js");
const { SUPPLY_IDS } = await import("../.tmp-hub-showcase/supplies.js");
assert.equal(SUPPLY_SETS.length, 3);
assert.ok(SUPPLY_SETS.every((ids) => ids.length === 3));
assert.equal(new Set(SUPPLY_SETS.flat()).size, 9, "os conjuntos não repetem suprimento");
// no Hub em faixa: grade 2×3, conjuntos de 6 sem repetir dentro do conjunto, e os 10 suprimentos aparecem
assert.ok(SUPPLY_GRID_SETS.length >= 2);
assert.ok(SUPPLY_GRID_SETS.every((ids) => ids.length === 6 && new Set(ids).size === 6), "cada conjunto enche a grade 2×3 sem repetir");
assert.deepEqual([...new Set(SUPPLY_GRID_SETS.flat())].sort(), [...SUPPLY_IDS].sort(), "a grade mostra todos os suprimentos");
assert.ok([...SUPPLY_SETS.flat(), ...SUPPLY_GRID_SETS.flat()].every((id) => SUPPLY_IDS.includes(id)));
console.log("hub showcase: conjuntos de suprimentos verificados");
