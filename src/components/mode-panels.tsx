// Lateral da Mesa de jogo: o histórico do modo escolhido (precisão, partidas, recordes), a evolução da precisão e as partidas recentes.
// Lê só as sessões do banco (leitura leve) e refaz a conta quando o modo muda; a conta em si está em domain/mode-stats.ts.
import { useEffect, useId, useMemo, useState } from "react";
import { Icon } from "./icons";
import { querySessions } from "../domain/progress-surfaces";
import { modeStats, type ModeStats, type StatMode, type StatSession } from "../domain/mode-stats";
import { formatNumber, intlLocale, t } from "../domain/i18n";

const seconds = (ms: number) => `${new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 }).format(ms / 1000)} s`;
const dateText = (at: number) => new Intl.DateTimeFormat(intlLocale, { day: "2-digit", month: "2-digit" }).format(at);

/** A linha da precisão das últimas partidas, com a área sob ela e o último ponto marcado. */
function Spark({ points }: { points: ModeStats["trend"] }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const width = 320, height = 92, padX = 10, padY = 12;
  const values = points.map((point) => point.pct);
  const low = Math.max(0, Math.min(...values) - 10);
  const x = (index: number) => padX + (points.length === 1 ? (width - 2 * padX) / 2 : (index * (width - 2 * padX)) / (points.length - 1));
  const y = (value: number) => padY + (1 - (value - low) / Math.max(1, 100 - low)) * (height - 2 * padY);
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(point.pct).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${height - padY} L${x(0).toFixed(1)} ${height - padY} Z`;
  const last = points[points.length - 1];
  return <svg className="mz-spark" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t.config.evolutionAria(values.join(", "))}>
    <defs><linearGradient id={uid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".28" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
    <line x1={padX} x2={width - padX} y1={y(100)} y2={y(100)} className="mz-spark-top" />
    <path d={area} fill={`url(#${uid})`} />
    <path d={line} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    {points.map((point, index) => <circle key={index} cx={x(index)} cy={y(point.pct)} r={index === points.length - 1 ? 5 : 3} className={index === points.length - 1 ? "mz-spark-last" : "mz-spark-dot"} />)}
    <text x={x(points.length - 1) - 10} y={Math.max(12, y(last.pct) - 11)} textAnchor="end" className="mz-spark-label">{last.pct}%</text>
  </svg>;
}

export function ModePanels({ mode, label }: { mode: StatMode; label: string }) {
  const [sessions, setSessions] = useState<StatSession[] | null>(null);
  useEffect(() => {
    let alive = true;
    void querySessions().then((rows) => { if (alive) setSessions(rows); }).catch(() => { if (alive) setSessions([]); });
    return () => { alive = false; };
  }, []);
  const stats = useMemo(() => modeStats(sessions ?? [], mode), [sessions, mode.family, mode.variant, mode.flag, mode.country]);
  const accuracy = stats.accuracy;
  const average = stats.trend.length ? Math.round(stats.trend.reduce((sum, point) => sum + point.pct, 0) / stats.trend.length) : null;
  return <>
    <section className="mz-panel" aria-label={t.config.historyIn(label)}>
      <h2>{t.config.historyIn(label)}</h2>
      <div className="mz-history">
        <span className="mz-ring" style={{ ["--p" as string]: accuracy ?? 0 }} role="img" aria-label={accuracy != null ? t.hub.pillarAccuracy(accuracy) : t.config.noHistory}><b>{accuracy != null ? accuracy : "–"}</b></span>
        {stats.matches > 0
          ? <dl className="mz-kpis">
            <div><dt>{t.config.statMatches}</dt><dd>{formatNumber(stats.matches)}</dd></div>
            <div><dt>{t.config.statRounds}</dt><dd>{formatNumber(stats.rounds)}</dd></div>
            <div><dt>{t.config.statBest}</dt><dd>{stats.best ? `${stats.best.pct}%` : "–"}</dd></div>
            <div><dt>{t.config.statFast}</dt><dd>{stats.fastestMs ? seconds(stats.fastestMs) : "–"}</dd></div>
          </dl>
          : <p>{t.config.noHistory}</p>}
      </div>
    </section>
    <section className="mz-panel" aria-label={t.config.evolution}>
      <h2>{t.config.evolution}{stats.trend.length > 1 && <span>{t.config.evolutionSub(stats.trend.length)}{average != null && ` · ${t.config.average(average)}`}</span>}</h2>
      {stats.trend.length > 1
        ? <Spark points={stats.trend} />
        : <p className="mz-empty"><Icon type="progress" size={16} /> {t.config.evolutionEmpty}</p>}
    </section>
    <section className="mz-panel" aria-label={t.config.recent}>
      <h2>{t.config.recent}</h2>
      {stats.recent.length > 0
        ? <ul className="mz-recent">
          {stats.recent.map((item) => <li key={item.at}>
            <span className="mz-date">{dateText(item.at)}</span>
            <span className="mz-score"><b>{item.correct}/{item.rounds}</b>{item.duel && <em>{t.config.duelTag}</em>}</span>
            <span className="mz-meter" aria-hidden="true"><i style={{ width: `${item.pct}%` }} /></span>
            <span className="mz-pct">{item.pct}%</span>
          </li>)}
        </ul>
        : <p className="mz-empty"><Icon type="clock" size={16} /> {t.config.recentEmpty}</p>}
    </section>
  </>;
}
