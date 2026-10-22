import { useEffect } from "react";
import { onRemoteChange, requestAccountSync, watchLocalWrites } from "../domain/account-live";

// Conta ao vivo (22/10/2026; regras em domain/account-live.ts): sincroniza sozinho, sem botão.
//  - ao abrir, ao voltar para a aba e quando a internet volta;
//  - logo depois de cada gravação local que vai para a conta (partida, compra, conquista…);
//  - quando o servidor avisa que outro aparelho mudou a conta (canal do jogador, evento "account");
//  - e, de segurança, a cada minuto com a aba à vista.
// O que chega de outro aparelho atualiza as telas sem recarregar a página (o app ouve "carta-account-updated").
const STARTUP_DELAY_MS = 800;
const SAFETY_MS = 60_000;

export function useAccountSync() {
  useEffect(() => {
    watchLocalWrites();
    requestAccountSync(STARTUP_DELAY_MS);
    const onWrite = () => requestAccountSync();
    const onRemote = (event: Event) => onRemoteChange(Number((event as CustomEvent<{ rev: number }>).detail?.rev) || 0);
    const onOnline = () => requestAccountSync(0);
    const onVisibility = () => { if (document.visibilityState === "visible") requestAccountSync(300); else requestAccountSync(0); };
    const every = window.setInterval(() => { if (document.visibilityState === "visible") requestAccountSync(0); }, SAFETY_MS);
    window.addEventListener("carta-local-write", onWrite);
    window.addEventListener("carta-account-remote", onRemote);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(every);
      window.removeEventListener("carta-local-write", onWrite);
      window.removeEventListener("carta-account-remote", onRemote);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}
