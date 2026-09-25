import assert from "node:assert/strict";
import {
  FRESH_START_ID,
  MAX_DEBUG_LEVEL,
  clampLevel,
  columnsForLevel,
  createdSinceFreshStart,
  debugFlagFromSearch,
  isStashId,
  levelForXp,
  modesForColumns,
  PURCHASE_DEBIT_PREFIX,
  purchasesToUndo,
  stashId,
  xpAdjustFor,
  xpForLevel,
} from "../.tmp-debug-rules/debug-rules.js";

// Nível <-> XP (mesma curva de queryEconomy: o nível N começa em 25·(N−1)·N).
assert.equal(xpForLevel(1), 0);
assert.equal(xpForLevel(2), 50);
assert.equal(xpForLevel(5), 500);
// marcos combinados: 10 ≈ 2.250, 20 ≈ 9.500, 30 ≈ 21.750, 40 ≈ 39.000, 50 ≈ 61.250
assert.deepEqual([10, 20, 30, 40, 50].map(xpForLevel), [2250, 9500, 21750, 39000, 61250]);
assert.equal(levelForXp(9031), 19, "perfil de 24/09 (9.031 XP) fica no nível 19");
for (let level = 1; level <= 40; level++) {
  assert.equal(levelForXp(xpForLevel(level)), level, `início do nível ${level}`);
  assert.equal(levelForXp(xpForLevel(level + 1) - 1), level, `fim do nível ${level}`);
}
assert.equal(clampLevel(0), 1);
assert.equal(clampLevel(-7), 1);
assert.equal(clampLevel(NaN), 1);
assert.equal(clampLevel(2.9), 2);
assert.equal(clampLevel(9999), MAX_DEBUG_LEVEL);

// O ajuste leva o XP calculado exatamente ao início do nível pedido, para qualquer XP real.
for (const realXp of [0, 37, 590, 4000, 250000]) {
  for (const target of [1, 2, 7, 23, 100]) {
    const xp = Math.max(0, realXp + xpAdjustFor(target, realXp));
    assert.equal(levelForXp(xp), target, `real ${realXp} -> nível ${target}`);
    assert.equal(xp, xpForLevel(target));
  }
}
assert.equal(xpAdjustFor(1, 590), -590, "zerar o nível anula o XP real");

// Cada nível de carta vem da menor evidência: 0 nada, 1 visto, 2/3/4 modos, 5 com escrita e capital x2.
assert.deepEqual(columnsForLevel(0), { bandeiras: 0, mapa: 0, capitais: 0 });
assert.deepEqual([1, 2, 3, 4].map((level) => modesForColumns(columnsForLevel(level))), [1, 2, 3, 4]);
assert.deepEqual(columnsForLevel(5), { bandeiras: 1, mapa: 1, capitais: 2, escrita: 2 });
assert.deepEqual(columnsForLevel(9), columnsForLevel(5), "limitado ao nível 5");
assert.deepEqual(columnsForLevel(-3), columnsForLevel(0));

// Registros de restauração e flag por URL.
assert.equal(stashId("progress", "current:76"), "debug-stash:progress:current:76");
assert.equal(isStashId("debug-stash:achievements:current:seq10"), true);
assert.equal(isStashId("economy-retroactive-v1"), false);
assert.equal(isStashId(undefined), false);
assert.equal(debugFlagFromSearch("?debug=1"), true);
assert.equal(debugFlagFromSearch("?x=2&debug=0"), false);
assert.equal(debugFlagFromSearch("?debug=talvez"), null);
assert.equal(debugFlagFromSearch(""), null);

// "Jogador novo": só o que foi criado depois dos testes sai; os originais guardados voltam no lugar.
assert.equal(FRESH_START_ID, "debug-fresh-start");
assert.equal(isStashId(FRESH_START_ID), false, "o marcador não é um registro guardado");
assert.deepEqual(createdSinceFreshStart(["a", "b", "c", "teste-1", "teste-2"], ["a", "b", "c"]), ["teste-1", "teste-2"]);
assert.deepEqual(createdSinceFreshStart(["a"], ["a", "b"]), [], "originais ainda não devolvidos não contam como novos");
assert.deepEqual(createdSinceFreshStart([], ["a"]), []);
assert.deepEqual(createdSinceFreshStart(["x"], []), ["x"], "loja que estava vazia: tudo é de teste");

// Saldo negativo depois de restaurar: as compras mais recentes voltam, só até o saldo não ser negativo.
const credit = (id, amount) => ({ id, kind: "credit", amount, source: "x", createdAt: 0 });
const purchase = (key, amount, createdAt) => ({ id: `debit:unlock:${key}`, kind: "debit", amount, source: key, createdAt });
assert.deepEqual(purchasesToUndo([credit("a", 500), purchase("theme:atlas", 300, 1)]), [], "saldo positivo: nada a desfazer");
assert.deepEqual(purchasesToUndo([]), []);
assert.deepEqual(
  purchasesToUndo([credit("real", 400), purchase("theme:atlas", 300, 1), purchase("theme:terra", 300, 2), purchase("theme:atelie", 400, 3)]).map((entry) => entry.source),
  ["theme:atelie", "theme:terra"],
  "saldo -600: desfaz da mais recente para a mais antiga até chegar a zero ou mais (a mais antiga cabia nas moedas reais)",
);
assert.deepEqual(
  purchasesToUndo([credit("real", 100), purchase("theme:atlas", 60, 1), purchase("theme:terra", 60, 2)]).map((entry) => entry.source),
  ["theme:terra"],
  "-20: basta a última compra; a anterior cabia nas moedas reais",
);
assert.deepEqual(purchasesToUndo([{ id: "outro", kind: "debit", amount: 50, createdAt: 1 }]), [], "débito que não é compra não é desfeito");
assert.equal(PURCHASE_DEBIT_PREFIX, "debit:unlock:");

console.log("debug rules: level curve, level adjust, card levels, restore keys, fresh start and negative-balance repair verified");
