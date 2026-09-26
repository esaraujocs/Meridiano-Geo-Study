import { useEffect, useRef } from "react";

/**
 * Enter faz o mesmo que o botão principal da tela (Começar duelo, Começar o 2º tempo). Ignora a tecla mantida apertada e os primeiros instantes
 * (o Enter que confirmou a última resposta não pode pular a tela seguinte) e deixa em paz botões, links e campos: quem está com foco num botão
 * já tem o Enter nativo dele.
 */
export function useEnterKey(onEnter: () => void, delayMs = 700) {
  const handler = useRef(onEnter);
  handler.current = onEnter;
  useEffect(() => {
    const armedAt = performance.now() + delayMs;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || event.defaultPrevented || performance.now() < armedAt) return;
      const target = event.target as HTMLElement | null;
      if (target && (["BUTTON", "A", "INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
      event.preventDefault();
      handler.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [delayMs]);
}
