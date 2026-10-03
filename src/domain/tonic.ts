// Tônico de XP: o estado puro (quantas rodadas ainda valem XP em dobro). Sem IndexedDB — o armazenamento fica em tonic-store.ts.
import { TONIC_ROUNDS } from "./player-level.js";

export function createTonicState(initial = 0) {
  let left = Math.max(0, Math.min(TONIC_ROUNDS, Math.floor(Number(initial) || 0)));
  return {
    get left() { return left; },
    set(value: number) { left = Math.max(0, Math.min(TONIC_ROUNDS, Math.floor(Number(value) || 0))); },
    /** Ativa o Tônico: só com ele apagado (não empilha). Devolve se ativou. */
    activate() { if (left > 0) return false; left = TONIC_ROUNDS; return true; },
    /** Gasta uma rodada do Tônico. Devolve se a rodada que está sendo gravada é turbinada. */
    take() { if (left <= 0) return false; left -= 1; return true; },
  };
}
