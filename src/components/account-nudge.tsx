import { useEffect, useState } from "react";
import { ACCOUNT_INTENT_KEY } from "../domain/pvp-account";
import { pvpAccountName } from "../domain/pvp-client";
import { isDebugEnabled } from "../domain/debug-flag";
import { t } from "../domain/i18n";

// Pop-up "Não perca seus dados, crie uma conta": aparece no Hub toda vez que a página abre, para quem ainda não tem conta, até a pessoa criar a conta ou marcar "Não mostrar de novo".
// "Agora não" (ou Esc, ou clicar fora) só o fecha até a página abrir ou recarregar de novo: não volta a aparecer ao navegar pelo app. Não aparece em modo debug nem em navegador automatizado
// (testes e auditorias; `?nudge=1` força), nem quando a pessoa abriu um convite de duelo (?duelo=), para não atrapalhar. Reaproveita o visual do diálogo do PvP (pvp-offer).
const NEVER_KEY = "carta-account-nudge";
// Já fechado nesta carga da página? Fica só na memória do módulo (não em sessionStorage, que sobrevive a recarregar a página): navegar pelo app não o traz de volta, mas abrir ou recarregar a página sim.
let dismissedThisLoad = false;
const DELAY_MS = 1200;

function shouldShow(): boolean {
  try {
    if (pvpAccountName()) return false; // já tem conta (o app lembra do usuário neste aparelho)
    if (localStorage.getItem(NEVER_KEY) === "never") return false;
    if (dismissedThisLoad) return false;
    const params = new URLSearchParams(window.location.search);
    if (params.has("duelo")) return false;
    // navegador automatizado (puppeteer/Playwright: `navigator.webdriver`) e modo debug (npm run dev, ?debug=1) não veem o pop-up, para não cobrir o Hub nos testes e auditorias;
    // `?nudge=1` na URL força (é como o próprio pop-up é testado)
    if (params.get("nudge") !== "1" && (isDebugEnabled() || navigator.webdriver)) return false;
    return true;
  } catch { return false; }
}

export function AccountNudge({ onGo }: {
  /** Leva à linha Conta das Opções, com o formulário certo já aberto. */
  onGo: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [never, setNever] = useState(false);

  useEffect(() => {
    if (!shouldShow()) return;
    const timer = window.setTimeout(() => { if (shouldShow()) setOpen(true); }, DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const close = (remember: boolean) => {
    dismissedThisLoad = true;
    try { if (remember) localStorage.setItem(NEVER_KEY, "never"); } catch { /* sem armazenamento: o aviso volta na próxima abertura */ }
    setOpen(false);
  };
  const go = (intent: "create" | "signIn") => {
    try { sessionStorage.setItem(ACCOUNT_INTENT_KEY, intent); } catch { /* sem armazenamento: abre as Opções sem o formulário */ }
    close(false);
    onGo();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(never); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, never]);

  if (!open) return null;
  return (
    <div className="pvp-offer-backdrop" onClick={() => close(never)}>
      <div className="pvp-offer is-dialog acct-nudge" role="dialog" aria-modal="true" aria-labelledby="acct-nudge-title" onClick={(event) => event.stopPropagation()}>
        <span className="eyebrow pvp-offer-kicker">{t.account.nudge.kicker}</span>
        <strong id="acct-nudge-title" className="pvp-offer-title">{t.account.nudge.title}</strong>
        <span className="pvp-offer-detail">{t.account.nudge.detail}</span>
        <div className="pvp-offer-actions">
          <button type="button" className="rs-btn primary" autoFocus onClick={() => go("create")}>{t.account.nudge.create}</button>
          <button type="button" className="rs-btn" onClick={() => go("signIn")}>{t.account.nudge.haveAccount}</button>
        </div>
        <div className="acct-nudge-foot">
          <label className="acct-nudge-never"><input type="checkbox" checked={never} onChange={(event) => setNever(event.target.checked)} /><span>{t.account.nudge.never}</span></label>
          <button type="button" className="acct-nudge-later" onClick={() => close(never)}>{t.account.nudge.later}</button>
        </div>
      </div>
    </div>
  );
}
