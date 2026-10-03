import { useCallback, useEffect, useRef, useState } from "react";
import { AMPULHETA_BONUS_SECONDS, isArmedSupply, type SupplyCounts, type SupplyId } from "../domain/supplies";
import { useSupply } from "../domain/supplies-store";
import { activateTonic, loadTonic, onTonicChange, tonicLeft as tonicLeftNow } from "../domain/tonic-store";

export type SupplyRoundState = {
  counts: SupplyCounts;
  usedThisRound: ReadonlySet<SupplyId>;
  /** Suprimentos armados (Escudo e Segunda chance): ligados na bandeja e ainda sem gastar. Valem até o erro que os dispara, atravessando as rodadas. */
  armed: ReadonlySet<SupplyId>;
  /** Algum suprimento foi usado nesta rodada: a rodada paga menos e não conta pra maestria/domínio (ver spoils.ts/dominated.ts). */
  assisted: boolean;
  /** Segundos que a Ampulheta somou ao cronômetro desta rodada (soma se usada mais de uma vez, embora hoje só dê pra usar 1×). */
  bonusSeconds: number;
  /** Chame ao trocar de alvo: zera o que foi usado e o bônus de tempo, para a rodada nova começar limpa. O que está armado continua armado. */
  resetRound: () => void;
  /** Usa 1 unidade do suprimento (decrementa o estoque de verdade e marca a rodada como assistida). Devolve se usou de fato
   *  (falso sem estoque, já usado nesta rodada, ou com `enabled` falso — duelo e PvP nunca chamam isso). Não serve para os armados: eles usam `toggleArm`. */
  use: (id: SupplyId) => boolean;
  /** Liga ou desliga um suprimento armado. Não gasta nada: só o erro que o dispara gasta (`consumeArmed`). */
  toggleArm: (id: SupplyId) => void;
  /** O motor chama isto no momento do erro: se o suprimento estava armado, gasta 1 unidade, desarma e marca a rodada como assistida (devolve
   *  verdadeiro). O motor deve usar o retorno na hora para gravar a rodada — o estado `assisted` só muda no próximo render. */
  consumeArmed: (id: SupplyId) => boolean;
  /** Desarma tudo (ao recomeçar a partida). */
  clearArmed: () => void;
  /** Tônico de XP: quantas rodadas ainda valem XP em dobro (0 = apagado). Muda sozinho a cada rodada gravada. */
  tonicLeft: number;
};

/**
 * Estado dos suprimentos de expedição durante uma partida: o estoque começa com o que a pessoa já tinha ao entrar na tela (cada motor de
 * partida recebe o snapshot do app), usar decrementa localmente e no IndexedDB, e cada motor cuida do próprio efeito (a Lupa filtra as opções
 * erradas, a Bússola mostra o continente, o Pular manda o alvo para o fim do baralho...) — este hook só faz a contabilidade comum a todos.
 * Escudo e Segunda chance são "armados": o motor os consulta quando a pessoa erra.
 */
export function useSupplies(initialCounts: SupplyCounts, enabled: boolean): SupplyRoundState {
  const [counts, setCounts] = useState<SupplyCounts>(initialCounts);
  const [usedThisRound, setUsedThisRound] = useState<ReadonlySet<SupplyId>>(new Set());
  const [armed, setArmed] = useState<ReadonlySet<SupplyId>>(new Set());
  const [bonusSeconds, setBonusSeconds] = useState(0);
  const [tonicLeft, setTonicLeft] = useState(tonicLeftNow());
  useEffect(() => {
    void loadTonic().then(setTonicLeft);
    return onTonicChange(setTonicLeft);
  }, []);
  const countsRef = useRef(counts);
  countsRef.current = counts;
  const armedRef = useRef(armed);
  armedRef.current = armed;

  const resetRound = useCallback(() => {
    setUsedThisRound(new Set());
    setBonusSeconds(0);
  }, []);

  const spend = useCallback((id: SupplyId) => {
    const next = { ...countsRef.current, [id]: Math.max(0, countsRef.current[id] - 1) };
    countsRef.current = next;
    setCounts(next);
    setUsedThisRound((current) => new Set(current).add(id));
    void useSupply(id).catch(() => undefined);
  }, []);

  const use = useCallback((id: SupplyId) => {
    // Tônico de XP: gasta 1 do estoque e liga as próximas 50 rodadas; não mexe na rodada atual (não a torna assistida) e não empilha.
    if (id === "tonico") {
      if (!enabled || tonicLeftNow() > 0 || countsRef.current.tonico <= 0) return false;
      const next = { ...countsRef.current, tonico: countsRef.current.tonico - 1 };
      countsRef.current = next;
      setCounts(next);
      void useSupply("tonico").catch(() => undefined);
      void activateTonic();
      return true;
    }
    if (!enabled || isArmedSupply(id) || usedThisRound.has(id) || countsRef.current[id] <= 0) return false;
    spend(id);
    if (id === "ampulheta") setBonusSeconds((value) => value + AMPULHETA_BONUS_SECONDS);
    return true;
  }, [enabled, usedThisRound, spend]);

  const toggleArm = useCallback((id: SupplyId) => {
    if (!enabled || !isArmedSupply(id)) return;
    const next = new Set(armedRef.current);
    if (next.has(id)) next.delete(id);
    else if (countsRef.current[id] > 0) next.add(id);
    armedRef.current = next;
    setArmed(next);
  }, [enabled]);

  const consumeArmed = useCallback((id: SupplyId) => {
    if (!enabled || !armedRef.current.has(id) || countsRef.current[id] <= 0) return false;
    const next = new Set(armedRef.current);
    next.delete(id);
    armedRef.current = next;
    setArmed(next);
    spend(id);
    return true;
  }, [enabled, spend]);

  const clearArmed = useCallback(() => { armedRef.current = new Set(); setArmed(armedRef.current); }, []);

  return { counts, usedThisRound, armed, assisted: usedThisRound.size > 0, bonusSeconds, resetRound, use, toggleArm, consumeArmed, clearArmed, tonicLeft };
}
