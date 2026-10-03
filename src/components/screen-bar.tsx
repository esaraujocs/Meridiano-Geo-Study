// A barra do topo das telas internas (Loja, Mesa de jogo): marca, voltar, de onde se vem + título e saldo. Mesmo desenho do cabeçalho do Hub.
import type { ReactNode } from "react";
import { BrandLogo } from "./brand-logo";
import { formatNumber as money, t } from "../domain/i18n";

export function ScreenBar({ onBack, eyebrow, title, balance, badge }: { onBack: () => void; eyebrow: string; title: string; balance: number; badge?: ReactNode }) {
  return <header className="st-bar">
    <div className="st-brand" aria-hidden="true"><BrandLogo /><span>MERIDIANO</span></div>
    <button type="button" className="st-back" onClick={onBack}>{t.common.backHub}</button>
    {badge}
    <div className="st-crumb"><small>{eyebrow}</small><h1>{title}</h1></div>
    <span className="st-balance" aria-label={t.hub.coinAria(money(balance))}><i aria-hidden="true">$</i><b>{money(balance)}</b></span>
  </header>;
}
