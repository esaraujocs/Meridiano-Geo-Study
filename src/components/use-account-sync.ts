import { useEffect } from "react";
import { runAccountSync } from "../domain/account-sync-client";

// Quando sincronizar o progresso com a conta (só se este aparelho está numa conta; sem conta, `runAccountSync` não faz nada):
//  - pouco depois de abrir a página (e, se chegou progresso de outro aparelho e a pessoa ainda não começou nada, recarrega UMA vez para o app ler o que chegou);
//  - de 5 em 5 minutos com a página à vista, e quando a página vai para o segundo plano (melhor esforço: o navegador pode cortar o pedido ao fechar).
// Se o aparelho ainda precisa de uma escolha (primeiro envio com progresso dos dois lados), nada é enviado: a linha "Conta" das Opções mostra a pergunta.
const STARTUP_DELAY_MS = 2500;
const EVERY_MS = 5 * 60 * 1000;
const RELOAD_FLAG = "carta-sync-reloaded";

// Há uma partida (ou a tela de montar uma) aberta? Aí não recarrega a página por baixo da pessoa.
const somethingInProgress = () => Boolean(document.querySelector("canvas.maplibregl-canvas, .quiz-options, .rv-page, .gs"));

export function useAccountSync() {
  useEffect(() => {
    let alive = true;
    const run = async (startup: boolean) => {
      const outcome = await runAccountSync();
      if (!alive || !startup || outcome.status !== "ok" || !outcome.changedFromAccount) return;
      try {
        if (somethingInProgress() || sessionStorage.getItem(RELOAD_FLAG)) return;
        sessionStorage.setItem(RELOAD_FLAG, "1");
      } catch { return; }
      window.location.reload();
    };
    const startup = window.setTimeout(() => void run(true), STARTUP_DELAY_MS);
    const every = window.setInterval(() => { if (document.visibilityState === "visible") void run(false); }, EVERY_MS);
    const onVisibility = () => { if (document.visibilityState === "hidden") void runAccountSync(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { alive = false; window.clearTimeout(startup); window.clearInterval(every); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);
}
