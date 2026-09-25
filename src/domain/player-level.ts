// Nível do jogador a partir do XP. Lógica pura, fonte única da curva (economia, resultado e debug usam esta).
// O nível N começa em XP_STEP·(N−1)·N: subir de N para N+1 custa 2·XP_STEP·N. Sem teto.
// Calibração (24/09): nível 10 ≈ 2.250 XP, 20 ≈ 9.500, 30 ≈ 21.750, 40 ≈ 39.000, 50 ≈ 61.250.
export const XP_STEP = 25;

export const xpForLevel = (level: number) => XP_STEP * (level - 1) * level;

export function levelForXp(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return level;
}
