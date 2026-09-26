import { useId, type ReactNode } from "react";
import { t } from "../domain/i18n";

type Props = {
  value: number;
  total: number;
  ringLabel: string;
  eyebrow: string;
  title: string;
  lede?: string;
  summary: ReactNode;
  legendLabel: string;
  legend: ReactNode;
  /** texto do anel no lugar de "{value}" (ex.: "25%") e a legenda abaixo dele (padrão: "de {total}"). */
  ringValue?: string;
  ringCaption?: string;
  /** classe extra da legenda e faixa que ocupa a largura toda embaixo do topo. */
  legendClassName?: string;
  footer?: ReactNode;
};

// Topo compartilhado de Achievements e Coleção: anel de progresso, título e legenda.
export function ProgressHero({ value, total, ringLabel, eyebrow, title, lede, summary, legendLabel, legend, ringValue, ringCaption, legendClassName, footer }: Props) {
  const globe = `pg-globe-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const circumference = 2 * Math.PI * 58;
  return <div className="pg-hero">
    <svg className="pg-meridian" width="300" height="300" viewBox="0 0 170 170" aria-hidden="true">
      <defs><clipPath id={globe}><circle cx="85" cy="85" r="78" /></clipPath></defs>
      <circle cx="85" cy="85" r="78" fill="none" stroke="#2F6F6A" strokeWidth="1" opacity=".5" />
      <g clipPath={`url(#${globe})`} fill="none" stroke="#2F6F6A" strokeWidth=".8" opacity=".3"><ellipse cx="85" cy="85" rx="30" ry="78" /><ellipse cx="85" cy="85" rx="58" ry="78" /><line x1="85" y1="7" x2="85" y2="163" /><line x1="7" y1="85" x2="163" y2="85" /><line x1="15" y1="55" x2="155" y2="55" /><line x1="15" y1="115" x2="155" y2="115" /></g>
    </svg>
    <div className="pg-hero-main">
      <div className="pg-ring" role="img" aria-label={ringLabel}>
        <svg viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="58" fill="var(--paper)" stroke="rgba(199,182,143,.7)" strokeWidth="8" />{value > 0 && total > 0 && <circle cx="66" cy="66" r="58" fill="none" stroke="#2F6F6A" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${circumference * Math.min(1, value / total)} ${circumference}`} transform="rotate(-90 66 66)" />}</svg>
        <div><b>{ringValue ?? value}</b><span>{ringCaption ?? t.hero.of(total)}</span></div>
      </div>
      <div className="pg-title">
        <span className="pg-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {lede && <p className="pg-lede">{lede}</p>}
        <p>{summary}</p>
      </div>
    </div>
    <ul className={`pg-legend${legendClassName ? ` ${legendClassName}` : ""}`} aria-label={legendLabel}>{legend}</ul>
    {footer}
  </div>;
}
