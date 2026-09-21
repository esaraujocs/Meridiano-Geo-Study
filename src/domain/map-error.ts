// Erro médio de uma partida de clique no mapa. Lógica pura.
// Acerto vale 0 km; erro vale a distância do toque até o território pedido. Assim uma partida boa fica perto de 0,
// e o número mede a pontaria de verdade (contar só os erros tornava a meta impossível: quem erra pouco não tinha média).

/** Meta do troféu "Mão firme": erro médio abaixo disto, numa partida completa de mapa. */
export const MAP_ERROR_GOAL_KM = 500;
/** Rodadas mínimas para o erro médio valer como recorde e como troféu. */
export const MAP_ERROR_MIN_ROUNDS = 10;

export type MapErrorRound = { correct: boolean; distanceKm?: number | null };

/**
 * Média das distâncias (acerto = 0). Rodada sem distância (tempo esgotado) fica de fora.
 * Partida em que nenhum toque tem distância (silhueta, Travel, quizzes) não tem erro médio.
 */
export function meanMapErrorKm(rounds: readonly MapErrorRound[]): { km: number; rounds: number } | null {
  if (!rounds.some((round) => typeof round.distanceKm === "number")) return null;
  let sum = 0;
  let counted = 0;
  for (const round of rounds) {
    if (round.correct) { counted += 1; continue; }
    if (typeof round.distanceKm === "number" && round.distanceKm >= 0) { sum += round.distanceKm; counted += 1; }
  }
  return counted > 0 ? { km: sum / counted, rounds: counted } : null;
}

export const formatKm = (km: number) => `${Math.round(km).toLocaleString("pt-BR")} km`;
