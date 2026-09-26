// Nível do jogador a partir do XP. Lógica pura, fonte única da curva e do XP ganho (economia, resultado e debug usam esta).
// O nível N começa em XP_STEP·(N−1)·N: subir de N para N+1 custa 2·XP_STEP·N. Sem teto.
// XP: XP_PER_ROUND por rodada de partida completa + XP_PER_DOMINATED por país que já esteve dominado (nunca cai).
// 26/09: tudo em dobro (ganho e curva), só para inflar os números; a proporção e os níveis são os mesmos de antes.
// Marcos: nível 10 = 4.500 XP, 20 = 19.000, 30 = 43.500, 40 = 78.000, 50 = 122.500.
export const XP_STEP = 50;
export const XP_PER_ROUND = 2;
export const XP_PER_DOMINATED = 50;

export const xpForLevel = (level: number) => XP_STEP * (level - 1) * level;
export const xpFrom = (rounds: number, everDominated: number) => rounds * XP_PER_ROUND + everDominated * XP_PER_DOMINATED;

export function levelForXp(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return level;
}
