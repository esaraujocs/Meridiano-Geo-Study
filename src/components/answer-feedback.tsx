import { useState } from "react";
import { t } from "../domain/i18n";

export type Verdict = "" | "correct" | "wrong";

/** Classes de uma alternativa depois da resposta: a certa fica verde, a errada escolhida fica terracota, as outras esmaecem. */
export function optionClass(isTarget: boolean, isPicked: boolean, verdict: Verdict) {
  return [
    "quiz-option",
    verdict && isTarget ? "correct" : "",
    verdict === "correct" && isTarget ? "is-hit" : "",
    verdict === "wrong" && isTarget ? "is-reveal" : "",
    verdict === "wrong" && isPicked ? "wrong" : "",
    verdict && !isTarget && !isPicked ? "is-dim" : "",
  ].filter(Boolean).join(" ");
}

/** Selo dentro da alternativa: ✓ na certa (com a etiqueta "Resposta certa" quando a pessoa errou) e ✕ na errada escolhida. */
export function OptionMarks({ isTarget, isPicked, verdict }: { isTarget: boolean; isPicked: boolean; verdict: Verdict }) {
  if (!verdict) return null;
  if (isTarget) {
    return <>
      <span className="opt-mark" aria-hidden="true">✓</span>
      {verdict === "wrong" && <span className="opt-tag">{t.feedback.rightAnswer}</span>}
      <span className="sr-only">{t.feedback.rightAnswerSr}</span>
    </>;
  }
  if (isPicked) return <><span className="opt-mark opt-mark-miss" aria-hidden="true">✕</span><span className="sr-only">{t.feedback.wrongPickSr}</span></>;
  return null;
}

/** Cartão com a resposta certa, para os modos de escrita: no erro fica visível para a pessoa comparar com o que digitou. */
export function AnswerReveal({ verdict, expected, typed, timedOut }: { verdict: Exclude<Verdict, "">; expected: string; typed?: string; timedOut?: boolean }) {
  if (verdict === "correct") {
    return <div className="reveal reveal-ok" aria-hidden="true"><span className="reveal-mark">✓</span><div><small>{t.feedback.correct}</small><b>{expected}</b></div></div>;
  }
  const shown = typed?.trim();
  return <div className="reveal reveal-miss" aria-hidden="true">
    <div><small>{t.feedback.rightAnswer}</small><b>{expected}</b>{shown && !timedOut ? <em>{t.feedback.youTyped(shown)}</em> : null}</div>
    <span className="reveal-skip">{t.feedback.tapToContinue}</span>
  </div>;
}

/** Vibração curta no celular quando acerta (a de erro seria ruído). */
export function cueCorrect() {
  if (document.documentElement.dataset.reducedMotion === "true") return;
  try { navigator.vibrate?.(18); } catch { /* aparelho sem vibração */ }
}

/**
 * Bandeira dentro de uma alternativa: preenche a caixa inteira (a maioria das bandeiras é 4:3 ou parecida, então quase nada é cortado).
 * Formatos muito diferentes (quadradas, faixas 2:1 ou mais) ficam inteiros sobre um fundo desfocado da própria bandeira, sem cortar o desenho.
 */
export function OptionFlag({ src, alt }: { src: string; alt: string }) {
  const [wide, setWide] = useState(false);
  return <>
    {wide && <img className="opt-flag-bg" src={src} alt="" aria-hidden="true" />}
    <img
      className={wide ? "opt-flag fit-contain" : "opt-flag"}
      src={src}
      alt={alt}
      onLoad={(event) => {
        const { naturalWidth: w, naturalHeight: h } = event.currentTarget;
        if (w > 0 && h > 0) setWide(w / h < 1.2 || w / h > 1.95);
      }}
    />
  </>;
}
