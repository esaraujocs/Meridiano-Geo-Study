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
