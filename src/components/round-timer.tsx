import { useEffect, useRef, useState } from "react";

type Props = {
  /** Segundos da pergunta; sem valor (Treino) o cronômetro nem aparece. */
  seconds: number | null;
  /** Corre enquanto a pergunta está aberta; ao responder, congela onde parou. */
  running: boolean;
  /** Muda a cada pergunta e devolve o tempo cheio. */
  resetKey: string | number;
  onExpire: () => void;
};

const LOW_MS = 3000;
const MAX_STEP_MS = 500;

// Barra de tempo curta e centrada junto da pergunta (uma barra larga varrendo a tela dá a sensação de que o tempo voa).
// Esvazia dos dois lados para o centro, sem números nem pulso. Só este componente atualiza a cada quadro.
// O tempo pausa sozinho quando o app sai de cena (aba escondida ou janela sem foco), para uma
// notificação no celular não roubar tempo do jogador.
export function RoundTimer({ seconds, running, resetKey, onExpire }: Props) {
  const total = (seconds ?? 0) * 1000;
  const remaining = useRef(total);
  const [left, setLeft] = useState(total);
  const expire = useRef(onExpire);
  expire.current = onExpire;

  useEffect(() => {
    remaining.current = total;
    setLeft(total);
  }, [resetKey, total]);

  useEffect(() => {
    if (seconds === null || !running) return;
    const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
      || document.documentElement.dataset.reducedMotion === "true";
    let last = performance.now();
    let away = document.hidden;
    let raf = 0;
    let timer = 0;
    let fired = false;
    const schedule = () => {
      if (calm) timer = window.setTimeout(step, 250);
      else raf = requestAnimationFrame(step);
    };
    function step() {
      const now = performance.now();
      if (!away) remaining.current -= Math.min(now - last, MAX_STEP_MS);
      last = now;
      if (remaining.current <= 0) {
        remaining.current = 0;
        setLeft(0);
        if (!fired) { fired = true; expire.current(); }
        return;
      }
      setLeft(remaining.current);
      schedule();
    }
    const away$ = (value: boolean) => () => { away = value || document.hidden; last = performance.now(); };
    const onVisibility = away$(false);
    const onBlur = away$(true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onVisibility);
    schedule();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onVisibility);
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [seconds, running, resetKey]);

  if (seconds === null) return null;
  const fraction = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const low = left <= LOW_MS;
  const early = fraction > 0.5;
  return <div className={`round-timer${low ? " is-low" : ""}${early ? " is-early" : ""}${running ? "" : " is-idle"}`} role="timer" aria-label={`Tempo da pergunta: ${seconds} segundos`}>
    <i style={{ transform: `scaleX(${fraction})` }} />
  </div>;
}
