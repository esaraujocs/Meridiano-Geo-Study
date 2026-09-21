import { useCallback, useEffect, useRef } from "react";

type Pending = { run: () => void; timer: number; skipAt: number };

// Passa para a próxima pergunta depois do retorno da resposta: sozinho quando o tempo do retorno acaba, ou antes se a pessoa
// tocar na tela ou apertar Enter/Espaço (só depois de um instante mínimo, para não pular o retorno sem querer).
export function useAdvance() {
  const pending = useRef<Pending | null>(null);
  const cancel = useCallback(() => {
    if (pending.current) { window.clearTimeout(pending.current.timer); pending.current = null; }
  }, []);
  const schedule = useCallback((run: () => void, delayMs: number, skipAfterMs = delayMs) => {
    cancel();
    const entry: Pending = {
      run,
      skipAt: Date.now() + skipAfterMs,
      timer: window.setTimeout(() => { if (pending.current === entry) { pending.current = null; run(); } }, delayMs),
    };
    pending.current = entry;
  }, [cancel]);
  const skip = useCallback(() => {
    const entry = pending.current;
    if (!entry || Date.now() < entry.skipAt) return false;
    if (document.querySelector('[role="alertdialog"]')) return false;
    window.clearTimeout(entry.timer);
    pending.current = null;
    entry.run();
    return true;
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.key === "Enter" || event.key === " ") && skip()) event.preventDefault(); };
    const onPointer = () => { skip(); };
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
