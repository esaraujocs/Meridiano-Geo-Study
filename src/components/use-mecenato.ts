import { useEffect, useState } from "react";
import { cachedMecenato, onMecenatoChange, queryMecenato } from "../domain/mecenato-store";
import type { MecenatoView } from "../domain/mecenato";

/** O estado do Mecenato para o Hub (posto, moldura equipada, expedição no mar): lê o que já está em memória e atualiza quando muda. */
export function useMecenato(): MecenatoView | null {
  const [view, setView] = useState<MecenatoView | null>(() => cachedMecenato());
  useEffect(() => {
    const update = () => { const current = cachedMecenato(); setView(current ? { ...current } : null); };
    const off = onMecenatoChange(update);
    if (!cachedMecenato()) void queryMecenato().catch(() => undefined);
    else update();
    return off;
  }, []);
  return view;
}
