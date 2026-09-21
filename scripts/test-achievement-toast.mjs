import assert from "node:assert/strict";
import { achievementToasts } from "../.tmp-achievement-toast/achievement-toast.js";

let calls = 0;
const stop = achievementToasts.subscribe(() => { calls++; });
const empty = achievementToasts.snapshot();
assert.deepEqual(empty, []);

achievementToasts.push([]);
assert.equal(calls, 0, "lista vazia não notifica");
assert.equal(achievementToasts.snapshot(), empty, "lista vazia não troca a referência");

achievementToasts.push([{ id: "a", name: "A", description: "a", rarity: 1 }, { id: "b", name: "B", description: "b", rarity: 3 }]);
const two = achievementToasts.snapshot();
assert.deepEqual(two.map((item) => item.id), ["a", "b"], "ordem de chegada");
assert.equal(new Set(two.map((item) => item.key)).size, 2, "cada aviso tem chave própria");
assert.equal(calls, 1);

achievementToasts.push([{ id: "a", name: "A", description: "a" }]);
assert.equal(achievementToasts.snapshot().length, 3, "o mesmo id pode voltar (chave diferente)");
assert.notEqual(achievementToasts.snapshot()[0].key, achievementToasts.snapshot()[2].key);

achievementToasts.shift();
assert.deepEqual(achievementToasts.snapshot().map((item) => item.id), ["b", "a"], "shift tira o primeiro");
achievementToasts.clear();
assert.deepEqual(achievementToasts.snapshot(), []);
const before = calls;
achievementToasts.shift();
achievementToasts.clear();
assert.equal(calls, before, "fila vazia: shift e clear não notificam");

stop();
achievementToasts.push([{ id: "z", name: "Z", description: "z" }]);
assert.equal(calls, before + 0, "depois de cancelar a inscrição não há chamadas");
achievementToasts.clear();

console.log("achievement toast: queue order, keys and subscriptions verified");
