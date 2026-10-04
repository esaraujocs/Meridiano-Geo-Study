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

// ---- rodízio de 3 sets: temas à venda primeiro, suprimentos completam
const { showcaseSets, SUPPLY_SETS } = await import("../.tmp-hub-showcase/hub-showcase.js");
const rich = showcaseSets(10_000_000, []);
assert.equal(rich.length, 3);
assert.ok(rich.every((set) => set.kind === "theme"), "com vários temas à venda, os 3 sets são temas");
assert.equal(rich[0].theme.id, pickShowcaseTheme(10_000_000, []).id, "o primeiro é o tema em destaque de sempre");
assert.equal(new Set(rich.map((set) => set.theme.id)).size, 3);
const allOwned = forSale.map((theme) => themeUnlockKey(theme.id));
const none = showcaseSets(10_000_000, allOwned);
assert.deepEqual(none.map((set) => set.kind), ["supplies", "supplies", "supplies"], "sem temas a comprar, os 3 conjuntos de suprimentos");
assert.deepEqual(none.map((set) => set.ids), SUPPLY_SETS);
const oneLeft = showcaseSets(10_000_000, allOwned.filter((key) => key !== themeUnlockKey(cheapest.id)));
assert.deepEqual(oneLeft.map((set) => set.kind), ["theme", "supplies", "supplies"], "um tema à venda + 2 conjuntos de suprimentos");
assert.equal(new Set(SUPPLY_SETS.flat()).size, 9, "os conjuntos não repetem suprimento");
console.log("hub showcase: rodízio dos 3 sets verificado");
