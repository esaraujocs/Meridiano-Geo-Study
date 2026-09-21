import assert from "node:assert/strict";
import {
  RARITY_LABELS,
  categoryTally,
  formatUnlockDate,
  freshUnlocks,
  nearAchievements,
  progressRatio,
  rarityBreakdown,
  rarityLevel,
} from "../.tmp-achievement-summary/achievement-summary.js";

const items = [
  { id: "a", category: "hab", rarity: 1, unlocked: true, target: 1, current: 1 },
  { id: "b", category: "hab", rarity: 3, unlocked: false, target: 10, current: 7 },
  { id: "c", category: "conh", rarity: 2, unlocked: false, target: 50, current: 38 },
  { id: "d", category: "conh", rarity: 4, unlocked: false, target: 150, current: 38 },
  { id: "e", category: "desc", rarity: 3, unlocked: false, hidden: true, target: 5, current: 4 },
  { id: "f", category: "exp", rarity: 5, unlocked: false, target: 1, current: 0 },
  { id: "g", category: "exp", rarity: 2, unlocked: false, target: 7, current: 0 },
];

assert.deepEqual(RARITY_LABELS.slice(1), ["Comum", "Incomum", "Rara", "Épica", "Lendária"]);
assert.equal(rarityLevel(undefined), 1);
assert.equal(rarityLevel(9), 1, "raridade fora da escala cai em Comum");
assert.equal(rarityLevel(5), 5);

assert.deepEqual(rarityBreakdown(items), [
  { rarity: 1, unlocked: 1, total: 1 },
  { rarity: 2, unlocked: 0, total: 2 },
  { rarity: 3, unlocked: 0, total: 2 },
  { rarity: 4, unlocked: 0, total: 1 },
  { rarity: 5, unlocked: 0, total: 1 },
]);
assert.deepEqual(categoryTally(items, "hab"), { unlocked: 1, total: 2 });
assert.deepEqual(categoryTally(items, "nada"), { unlocked: 0, total: 0 });

assert.equal(progressRatio({ id: "x", unlocked: false, target: 50, current: 38 }), 0.76);
assert.equal(progressRatio({ id: "x", unlocked: false, target: 0, current: 3 }), 0, "sem alvo não divide por zero");
assert.equal(progressRatio({ id: "x", unlocked: false, target: 10, current: 99 }), 1, "limitado a 100%");

// Quase lá: só alvo > 1, já iniciada, não oculta; mais adiantadas primeiro.
// c = 76%, b = 70%, d = 25%; "e" é oculta, "f" e "g" não começaram, "a" já está desbloqueada.
assert.deepEqual(nearAchievements(items).map((item) => item.id), ["c", "b", "d"]);
assert.deepEqual(nearAchievements(items, 2).map((item) => item.id), ["c", "b"], "respeita o limite");
assert.deepEqual(nearAchievements([]), []);

// Data de desbloqueio: sem ano no ano corrente, com ano fora dele.
const now = new Date(2026, 8, 19);
assert.equal(formatUnlockDate(new Date(2026, 8, 12).getTime(), now), "12 set");
assert.equal(formatUnlockDate(new Date(2025, 11, 3).getTime(), now), "3 dez 2025");
assert.equal(formatUnlockDate(undefined, now), "");
assert.equal(formatUnlockDate(Number.NaN, now), "");

// Novas conquistas: só o que passou a estar desbloqueado desde a última leitura.
const base = [{ id: "a", unlocked: true }, { id: "b", unlocked: false }, { id: "c", unlocked: false }];
const first = freshUnlocks(null, base);
assert.deepEqual(first.fresh, [], "primeira leitura não anuncia o que já estava desbloqueado");
assert.equal(first.count, 1);
assert.deepEqual([...first.next], ["a"]);
const after = freshUnlocks(first.next, [{ id: "a", unlocked: true }, { id: "b", unlocked: true }, { id: "c", unlocked: false }]);
assert.deepEqual(after.fresh.map((item) => item.id), ["b"], "só a que acabou de abrir");
assert.equal(after.count, 2);
assert.deepEqual(freshUnlocks(after.next, [{ id: "a", unlocked: true }, { id: "b", unlocked: true }, { id: "c", unlocked: false }]).fresh, [], "sem mudança, sem aviso");
assert.deepEqual(freshUnlocks(new Set(), [{ id: "x", unlocked: true }, { id: "y", unlocked: true }]).fresh.map((item) => item.id), ["x", "y"], "várias de uma vez, na ordem");

console.log("achievement summary: rarity, near-unlock ranking, unlock date and fresh unlocks verified");
