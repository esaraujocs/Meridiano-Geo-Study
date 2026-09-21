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
  stashId,
  xpAdjustFor,
  xpForLevel,
} from "../.tmp-debug-rules/debug-rules.js";

// Nível <-> XP (mesma curva de queryEconomy: nível N pede 50·N·(N+1) no total).
assert.equal(xpForLevel(1), 0);
assert.equal(xpForLevel(2), 100);
assert.equal(xpForLevel(5), 1000);
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

console.log("debug rules: level curve, level adjust, card levels, restore keys and fresh start verified");
