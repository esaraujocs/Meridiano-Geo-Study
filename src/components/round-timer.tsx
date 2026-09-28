import { useEffect, useRef, useState } from "react";
import { t } from "../domain/i18n";

type Props = {
  /** Segundos da pergunta; sem valor (Treino) o cronômetro nem aparece. */
  seconds: number | null;
  /** Corre enquanto a pergunta está aberta; ao responder, congela onde parou. */
  running: boolean;
  /** Muda a cada pergunta e devolve o tempo cheio. */
  resetKey: string | number;
  onExpire: () => void;
  /** Falso no duelo: o tempo corre sempre, mesmo com a janela sem foco (não dá para ganhar tempo saindo da tela). */
  pausable?: boolean;
  /** Segundos extras somados pela Ampulheta nesta rodada (suprimento de expedição): soma ao tempo que falta, sem reiniciar a barra. */
  bonusSeconds?: number;
};

const LOW_MS = 3000;
const MAX_STEP_MS = 500;

// Barra de tempo curta e centrada junto da pergunta (uma barra larga varrendo a tela dá a sensação de que o tempo voa).
// Esvazia dos dois lados para o centro, sem números nem pulso. Só este componente atualiza a cada quadro.
// O tempo pausa sozinho quando o app sai de cena (aba escondida ou janela sem foco), para uma
// notificação no celular não roubar tempo do jogador. No duelo (`pausable` falso) nada pausa o tempo: nem a janela sem foco
// nem o aviso de sair; o relógio segue o tempo real, mesmo que o navegador congele os quadros.
export function RoundTimer({ seconds, running, resetKey, onExpire, pausable = true, bonusSeconds = 0 }: Props) {
  const base = (seconds ?? 0) * 1000;
  const remaining = useRef(base);
  const [left, setLeft] = useState(base);
  const expire = useRef(onExpire);
  expire.current = onExpire;
  const appliedBonus = useRef(0);

  useEffect(() => {
    remaining.current = base;
    setLeft(base);
    appliedBonus.current = 0;
  }, [resetKey, base]);

  // A Ampulheta soma ao tempo que falta na hora (sem reiniciar a barra); `total` (usado na fração) cresce junto para o cálculo continuar certo.
  useEffect(() => {
    const addedMs = (bonusSeconds - appliedBonus.current) * 1000;
    appliedBonus.current = bonusSeconds;
    if (addedMs > 0) {
      remaining.current += addedMs;
      setLeft(remaining.current);
    }
  }, [bonusSeconds]);
  const total = base + bonusSeconds * 1000;

  useEffect(() => {
    if (seconds === null || !running) return;
    const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
      || document.documentElement.dataset.reducedMotion === "true";
    let last = performance.now();
    let away = pausable && document.hidden;
    let raf = 0;
    let timer = 0;
    let fired = false;
    const schedule = () => {
      if (calm) timer = window.setTimeout(step, 250);
      else raf = requestAnimationFrame(step);
    };
    function step() {
      const now = performance.now();
      if (!away) remaining.current -= pausable ? Math.min(now - last, MAX_STEP_MS) : now - last;
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
    const away$ = (value: boolean) => () => { if (!pausable) return; away = value || document.hidden; last = performance.now(); };
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
  }, [seconds, running, resetKey, pausable]);

  if (seconds === null) return null;
  const fraction = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const low = left <= LOW_MS;
  const early = fraction > 0.5;
  return <div className={`round-timer${low ? " is-low" : ""}${early ? " is-early" : ""}${running ? "" : " is-idle"}`} role="timer" aria-label={t.timer.aria(seconds)}>
    <i style={{ transform: `scaleX(${fraction})` }} />
  </div>;
}
