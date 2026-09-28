import { useCallback, useRef, useState } from "react";
import { AMPULHETA_BONUS_SECONDS, type SupplyCounts, type SupplyId } from "../domain/supplies";
import { useSupply } from "../domain/supplies-store";

export type SupplyRoundState = {
  counts: SupplyCounts;
  usedThisRound: ReadonlySet<SupplyId>;
  /** Algum suprimento foi usado nesta rodada: a rodada paga menos e não conta pra maestria/domínio (ver spoils.ts/dominated.ts). */
  assisted: boolean;
  /** Segundos que a Ampulheta somou ao cronômetro desta rodada (soma se usada mais de uma vez, embora hoje só dê pra usar 1×). */
  bonusSeconds: number;
  /** Chame ao trocar de alvo: zera o que foi usado e o bônus de tempo, para a rodada nova começar limpa. */
  resetRound: () => void;
  /** Usa 1 unidade do suprimento (decrementa o estoque de verdade e marca a rodada como assistida). Devolve se usou de fato
   *  (falso sem estoque, já usado nesta rodada, ou com `enabled` falso — Treino e duelo nunca chamam isso). */
  use: (id: SupplyId) => boolean;
};

/**
 * Estado dos suprimentos de expedição durante uma partida (Lupa/Bússola/Ampulheta): o estoque começa com o que a pessoa já tinha ao entrar na
 * tela (cada motor de partida recebe o snapshot do app), usar decrementa localmente e no IndexedDB, e cada motor cuida do próprio efeito (a
 * Lupa filtra as opções erradas, a Bússola mostra o continente) — este hook só faz a contabilidade comum a todos.
 */
export function useSupplies(initialCounts: SupplyCounts, enabled: boolean): SupplyRoundState {
  const [counts, setCounts] = useState<SupplyCounts>(initialCounts);
  const [usedThisRound, setUsedThisRound] = useState<ReadonlySet<SupplyId>>(new Set());
  const [bonusSeconds, setBonusSeconds] = useState(0);
  const countsRef = useRef(counts);
  countsRef.current = counts;

  const resetRound = useCallback(() => {
    setUsedThisRound(new Set());
    setBonusSeconds(0);
  }, []);

  const use = useCallback((id: SupplyId) => {
    if (!enabled || usedThisRound.has(id) || countsRef.current[id] <= 0) return false;
    setUsedThisRound((current) => new Set(current).add(id));
    setCounts((current) => ({ ...current, [id]: Math.max(0, current[id] - 1) }));
    if (id === "ampulheta") setBonusSeconds((value) => value + AMPULHETA_BONUS_SECONDS);
    void useSupply(id).catch(() => undefined);
    return true;
  }, [enabled, usedThisRound]);

  return { counts, usedThisRound, assisted: usedThisRound.size > 0, bonusSeconds, resetRound, use };
}
