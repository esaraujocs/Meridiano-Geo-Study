import { useCallback, useEffect, useRef } from "react";

type Pending = { run: () => void; timer: number; skipAt: number; manual: boolean };

// Passa para a próxima pergunta depois do retorno da resposta: sozinho quando o tempo do retorno acaba, ou antes se a pessoa
// tocar na tela ou apertar Enter/Espaço (só depois de um instante mínimo, para não pular o retorno sem querer).
// No modo `manual` (Idiomas: dá para ler o cartão à vontade) não há tempo nem toque solto na tela: só o botão Continuar ou Enter/Espaço.
export function useAdvance() {
  const pending = useRef<Pending | null>(null);
  const cancel = useCallback(() => {
    if (pending.current) { window.clearTimeout(pending.current.timer); pending.current = null; }
  }, []);
  const schedule = useCallback((run: () => void, delayMs: number, skipAfterMs = delayMs, manual = false) => {
    cancel();
    const entry: Pending = {
      run,
      manual,
      skipAt: Date.now() + skipAfterMs,
      timer: manual ? 0 : window.setTimeout(() => { if (pending.current === entry) { pending.current = null; run(); } }, delayMs),
    };
    pending.current = entry;
  }, [cancel]);
  const skip = useCallback((fromTap = false) => {
    const entry = pending.current;
    if (entry?.manual && fromTap) return false;
    if (!entry || Date.now() < entry.skipAt) return false;
    if (document.querySelector('[role="alertdialog"]')) return false;
    window.clearTimeout(entry.timer);
    pending.current = null;
    entry.run();
    return true;
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.key === "Enter" || event.key === " ") && skip()) event.preventDefault(); };
    const onPointer = () => { skip(true); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
      cancel();
    };
  }, [skip, cancel]);
  return { schedule, cancel, skip };
}
