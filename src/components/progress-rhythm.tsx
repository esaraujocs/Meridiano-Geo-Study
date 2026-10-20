// Seu ritmo (20/10/2026): quando você joga melhor. O relógio do dia no desktop e a faixa do dia no celular (o Enzo escolheu as duas), as frases,
// os 5 períodos, a curva da noite, a semana, os picos de cada modo e o calendário. Regras em domain/rhythm.ts.
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { MIN_FAMILY, MIN_HOUR, PERIODS, RHYTHM_FAMILIES, buildRhythm, rhythmTotals, type Cell, type Insight, type ModeOverview, type PeriodCell, type RhythmFilter, type RhythmRound } from "../domain/rhythm";
import { formatSeconds } from "../domain/session-view";
import { formatNumber, intlLocale, t } from "../domain/i18n";
import { modeLabel } from "./progress-profile";

type Metric = "acc" | "speed" | "volume";
const signed = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value * 100).toLocaleString(intlLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
/** A cor de uma hora (ou período): verde acima do normal, terracota abaixo, neutro no normal; pelas variáveis do tema. */
function tone(cell: Cell, metric: Metric, maxN: number): string {
  if (cell.n < MIN_HOUR) return "var(--pf-few)";
  if (metric === "volume") return `color-mix(in srgb, var(--green) ${Math.round(25 + 75 * Math.sqrt(cell.n / maxN))}%, var(--pf-neutral))`;
  const value = metric === "acc" ? cell.rel : cell.speed === null ? null : -cell.speed / 4;
  if (value === null) return "var(--pf-neutral)";
  const strength = Math.round(Math.min(1, Math.abs(value) / 0.045) * 100);
  return `color-mix(in srgb, var(${value >= 0 ? "--green" : "--terracotta"}) ${strength}%, var(--pf-neutral))`;
}
const periodName = (key: PeriodCell["key"]) => t.profile.periods[key];
/** Frases com **negrito** (os números) vindas do texto traduzido. */
const rich = (text: string) => text.split("**").map((part, index) => (index % 2 ? <b key={index}>{part}</b> : <Fragment key={index}>{part}</Fragment>));
function insightText(insight: Insight) {
  if (insight.kind === "best") return t.profile.insightBest(periodName(insight.period).toLowerCase(), signed(insight.rel), formatNumber(insight.n));
  if (insight.kind === "worst") return t.profile.insightWorst(periodName(insight.period), signed(insight.rel), insight.faster);
  const range = (cell: { from: number; to: number }) => (Number.isFinite(cell.to) ? t.profile.warmBetween(cell.from, cell.to) : t.profile.warmAfter(cell.from));
  return t.profile.insightWarm(range(insight.low), signed(insight.low.rel ?? 0), range(insight.high), signed(insight.high.rel ?? 0));
}

// ---------- relógio do dia (desktop) ----------
function DayClock({ hours, periods, metric, best }: { hours: Cell[]; periods: PeriodCell[]; metric: Metric; best: PeriodCell | null }) {
  const maxN = Math.max(1, ...hours.map((cell) => cell.n));
  const cx = 230, cy = 230, r0 = 96, span = 108;
  const ang = (h: number) => ((h / 24) * 360 - 90) * (Math.PI / 180);
  const pt = (r: number, a: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const sector = (h: number, r1: number) => {
    const a0 = ang(h) + 0.025, a1 = ang(h + 1) - 0.025;
    const [x0, y0] = pt(r0, a0), [x1, y1] = pt(r1, a0), [x2, y2] = pt(r1, a1), [x3, y3] = pt(r0, a1);
    return `M${x0},${y0}L${x1},${y1}A${r1},${r1} 0 0 1 ${x2},${y2}L${x3},${y3}A${r0},${r0} 0 0 0 ${x0},${y0}Z`;
  };
  return <svg className="pf-clock" viewBox="-40 -40 540 540" role="img" aria-label={t.profile.dialAria(best ? periodName(best.key).toLowerCase() : "—")}>
    {hours.map((cell, h) => <path key={h} d={sector(h, r0 + 8 + span * Math.sqrt(cell.n / maxN))} style={{ fill: tone(cell, metric, maxN) }} className="pf-slice" />)}
    {periods.map((p) => {
      const R = r0 + span + 26, a0 = ang(p.from) + 0.02, a1 = ang(p.to) - 0.02;
      const [x0, y0] = pt(R, a0), [x1, y1] = pt(R, a1), [lx, ly] = pt(R + 14, ang((p.from + p.to) / 2));
      const anchor = Math.abs(lx - cx) < 30 ? "middle" : lx < cx ? "end" : "start";
      return <g key={p.key}><path d={`M${x0},${y0}A${R},${R} 0 ${p.to - p.from > 12 ? 1 : 0} 1 ${x1},${y1}`} className="pf-arc" style={{ stroke: tone(p, metric, Math.max(1, ...periods.map((q) => q.n))) }} />
        <text x={lx} y={ly + (ly < cy ? 0 : 10)} textAnchor={anchor} className="pf-arc-t">{periodName(p.key)}</text></g>;
    })}
    {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => { const [x, y] = pt(r0 - 13, ang(h)); return <text key={h} x={x} y={y + 4} textAnchor="middle" className={`pf-axis${h % 6 ? "" : " is-main"}`}>{h}h</text>; })}
    <circle cx={cx} cy={cy} r={r0 - 26} className="pf-hub" />
    {best && <><text x={cx} y={cy - 16} textAnchor="middle" className="pf-axis pf-kicker">{t.profile.best.toUpperCase()}</text>
      <text x={cx} y={cy + 8} textAnchor="middle" className="pf-hub-t">{periodName(best.key)}</text>
      <text x={cx} y={cy + 28} textAnchor="middle" className="pf-hub-v">{signed(best.rel ?? 0)} pts</text></>}
  </svg>;
}

// ---------- faixa do dia (celular) ----------
function DayBand({ hours, periods, metric }: { hours: Cell[]; periods: PeriodCell[]; metric: Metric }) {
  const maxN = Math.max(1, ...hours.map((cell) => cell.n));
  const W = 480, base = 150, top = 14, bw = W / 24;
  return <svg className="pf-band" viewBox={`0 0 ${W} ${base + 66}`} role="img" aria-label={t.profile.bandAria}>
    <defs><linearGradient id="pf-sky" x1="0" x2="1"><stop offset="0" className="pf-sky-n" /><stop offset=".22" className="pf-sky-n" /><stop offset=".3" className="pf-sky-d" /><stop offset=".42" className="pf-sky-l" /><stop offset=".7" className="pf-sky-l" /><stop offset=".8" className="pf-sky-d" /><stop offset=".9" className="pf-sky-n" /><stop offset="1" className="pf-sky-n" /></linearGradient></defs>
    <rect x="0" y="0" width={W} height={base + 4} rx="12" fill="url(#pf-sky)" className="pf-sky" />
    {hours.map((cell, h) => { const hh = (base - top - 6) * Math.sqrt(cell.n / maxN); return <rect key={h} x={h * bw + 2.5} y={base - hh} width={bw - 5} height={Math.max(2, hh)} rx="3" style={{ fill: tone(cell, metric, maxN) }} className="pf-slice" />; })}
    {[0, 6, 12, 18].map((h) => <text key={h} x={h * bw + 2} y={base + 16} className="pf-axis">{h}h</text>)}
    {periods.map((p) => <g key={p.key}><line x1={p.from * bw} x2={p.from * bw} y1={base + 24} y2={base + 62} className="pf-grid" />
      <text x={((p.from + p.to) / 2) * bw} y={base + 38} textAnchor="middle" className="pf-band-t">{p.to - p.from >= 6 ? periodName(p.key) : periodName(p.key).split(" ")[0]}</text>
      {p.rel !== null && p.n >= MIN_HOUR && <text x={((p.from + p.to) / 2) * bw} y={base + 54} textAnchor="middle" className={`pf-band-v ${p.rel >= 0 ? "is-up" : "is-down"}`}>{signed(p.rel)}</text>}</g>)}
  </svg>;
}

export function RhythmTab({ rounds, modes, calendar }: { rounds: readonly RhythmRound[]; modes: readonly ModeOverview[]; calendar: ReactNode }) {
  const [filter, setFilter] = useState<RhythmFilter>("todos");
  const [metric, setMetric] = useState<Metric>("acc");
  const totals = useMemo(() => rhythmTotals(rounds), [rounds]);
  const rhythm = useMemo(() => buildRhythm(rounds, filter), [rounds, filter]);
  const solid = rhythm.periods.filter((p) => p.n >= 300 && p.rel !== null);
  const best = solid.length ? [...solid].sort((a, b) => (b.rel as number) - (a.rel as number))[0] : null;
  const worst = solid.length > 1 ? [...solid].sort((a, b) => (a.rel as number) - (b.rel as number))[0] : null;
  const chips: RhythmFilter[] = ["todos", ...RHYTHM_FAMILIES];
  const enough = rhythm.total >= MIN_FAMILY;
  const peaks = modes.filter((mode) => mode.best && mode.best.acc >= 0.95 && (filter === "todos" || mode.family === filter)).slice(0, 4);
  const maxWeek = Math.max(1, ...rhythm.week.flat().map((cell) => cell.n));
  const weekOrder = [1, 2, 3, 4, 5, 6, 0];
  const CW = 520, CH = 220, zero = CH / 2 + 6, scale = 2600;
  const metricButtons = ([["acc", t.profile.metricAccuracy], ["speed", t.profile.metricSpeed], ["volume", t.profile.metricVolume]] as const);
  const legend = metric === "volume" ? null : <ul className="pf-legend is-center">
    <li><i style={{ background: "var(--green)" }} aria-hidden="true" />{metric === "acc" ? t.profile.above : t.profile.faster}</li>
    <li><i style={{ background: "var(--pf-neutral)" }} aria-hidden="true" />{t.profile.normal}</li>
    <li><i style={{ background: "var(--terracotta)" }} aria-hidden="true" />{metric === "acc" ? t.profile.below : t.profile.slower}</li>
    <li><i style={{ background: "var(--pf-few)" }} aria-hidden="true" />{t.profile.few}</li>
  </ul>;
  return <div className="pf-rhythm">
    <div className="pf-filter" role="group" aria-label={t.profile.tabRhythm}>
      {chips.map((key) => <button type="button" key={key} aria-pressed={filter === key} disabled={totals[key] < MIN_FAMILY && key !== filter} onClick={() => setFilter(key)}>{key === "todos" ? t.profile.all : t.profile.families[key]}</button>)}
      <span className="pf-note">{t.profile.outsideTraining(formatNumber(rhythm.total))}</span>
    </div>
    {!enough ? <section className="pr-card pf-empty"><p>{filter === "todos" ? t.profile.empty : t.profile.emptyFamily}</p></section> : <>
      <div className="pf-row pf-row-a">
        <section className="pr-card pf-day" aria-labelledby="pf-day">
          <header className="pf-head">
            <div><h2 id="pf-day"><span className="pf-desk">{t.profile.clockTitle}</span><span className="pf-mob">{t.profile.bandTitle}</span></h2><p><span className="pf-desk">{t.profile.clockSub}</span><span className="pf-mob">{t.profile.bandSub}</span></p></div>
            <div className="pr-seg" role="group" aria-label={t.profile.clockTitle}>{metricButtons.map(([key, label]) => <button type="button" key={key} aria-pressed={metric === key} onClick={() => setMetric(key)}>{label}</button>)}</div>
          </header>
          <div className="pf-desk pf-clock-wrap"><DayClock hours={rhythm.hours} periods={rhythm.periods} metric={metric} best={best} /></div>
          <div className="pf-mob"><DayBand hours={rhythm.hours} periods={rhythm.periods} metric={metric} /></div>
          {legend}
        </section>
        <section className="pr-card pf-says" aria-labelledby="pf-says">
          <header className="pf-head"><div><h2 id="pf-says">{t.profile.saysTitle}</h2><p>{t.profile.saysSub}</p></div></header>
          {rhythm.insights.length > 0 && <ul className="pf-insights">{rhythm.insights.map((insight, index) => <li key={index} className={`is-${insight.kind}`}><span aria-hidden="true">{insight.kind === "best" ? "☀" : insight.kind === "worst" ? "☾" : "↗"}</span><p>{rich(insightText(insight))}</p></li>)}</ul>}
          <table className="pf-table pf-periods">
            <thead><tr><th scope="col"><span className="sr-only">{t.profile.colPeriod}</span></th><th scope="col">{t.profile.colPeriod}</th><th scope="col">{t.profile.colAccuracy}</th><th scope="col">{t.profile.colTime}</th><th scope="col" className="pf-opt"><span className="sr-only">{t.profile.best}</span></th></tr></thead>
            <tbody>{rhythm.periods.map((p) => <tr key={p.key}>
              <td><i className="pf-sw" style={{ background: tone(p, "acc", 1) }} aria-hidden="true" /></td>
              <th scope="row"><b>{periodName(p.key)}</b><small>{t.profile.periodShare(p.from, p.to, rhythm.total ? Math.round((p.n / rhythm.total) * 100) : 0)}</small></th>
              <td className={`pf-rel ${p.n < MIN_HOUR || p.rel === null ? "" : p.rel >= 0 ? "is-up" : "is-down"}`}>{p.n < MIN_HOUR || p.rel === null ? "—" : signed(p.rel)}</td>
              <td className="pf-time">{p.med ? formatSeconds(p.med) : "—"}</td>
              <td className="pf-opt">{p === best ? <span className="pf-tag is-best">{t.profile.tagBest}</span> : p === worst ? <span className="pf-tag is-worst">{t.profile.tagWorst}</span> : p.n < 300 ? <span className="pf-tag">{t.profile.few}</span> : null}</td>
            </tr>)}</tbody>
          </table>
        </section>
      </div>
      <div className="pf-row pf-row-b">
        <section className="pr-card pf-curve" aria-labelledby="pf-curve">
          <header className="pf-head"><div><h2 id="pf-curve">{t.profile.curveTitle}</h2><p>{t.profile.curveSub(Math.round(rhythm.nights.medianMinutes ?? 0))}</p></div></header>
          <svg className="pf-chart" viewBox={`0 0 ${CW} ${CH + 28}`} role="img" aria-label={t.profile.curveAria}>
            <line x1="10" x2={CW - 10} y1={zero} y2={zero} className="pf-zero" /><text x={CW - 10} y={zero - 7} textAnchor="end" className="pf-axis">{t.profile.yourNormal}</text>
            {rhythm.warmup.map((cell, index) => {
              const slot = (CW - 60) / rhythm.warmup.length, x = 30 + index * slot, w = slot - 18;
              const rel = cell.n >= MIN_HOUR ? cell.rel ?? 0 : 0, h = Math.min(zero - 18, Math.abs(rel) * scale);
              const up = rel >= 0;
              return <g key={index}>
                <rect x={x} y={up ? zero - h : zero} width={w} height={Math.max(2, h)} rx="6" className={cell.n < MIN_HOUR ? "pf-bar-few" : up ? "pf-bar-up" : "pf-bar-down"} />
                {cell.n >= MIN_HOUR && <text x={x + w / 2} y={up ? zero - h - 8 : zero + h + 18} textAnchor="middle" className={`pf-val ${up ? "is-up" : "is-down"}`}>{signed(rel)}</text>}
                <text x={x + w / 2} y={CH + 22} textAnchor="middle" className="pf-axis">{Number.isFinite(cell.to) ? t.profile.minutes(cell.from, cell.to) : t.profile.minutesPlus(cell.from)}</text>
              </g>;
            })}
          </svg>
        </section>
        <section className="pr-card pf-week" aria-labelledby="pf-week">
          <header className="pf-head"><div><h2 id="pf-week">{t.profile.weekTitle}</h2><p>{t.profile.weekSub}</p></div></header>
          <div className="pf-week-grid" role="img" aria-label={t.profile.weekAria}>
            <span />{PERIODS.map((p) => <span key={p.key} className="pf-wh">{periodName(p.key)}</span>)}
            {weekOrder.map((day) => <Fragment key={day}><span className="pf-wd">{t.profile.weekdays[day]}</span>{rhythm.week[day].map((cell, index) => { const size = cell.n ? 8 + 22 * Math.sqrt(cell.n / maxWeek) : 0; return <span key={index} className="pf-wc">{size > 0 && <i style={{ width: size, height: size, background: tone(cell, metric === "volume" ? "volume" : metric, maxWeek) }} />}</span>; })}</Fragment>)}
          </div>
        </section>
        <section className="pr-card pf-peaks" aria-labelledby="pf-peaks">
          <header className="pf-head"><div><h2 id="pf-peaks">{t.profile.peaksTitle}</h2><p>{t.profile.peaksSub}</p></div></header>
          <ul>{peaks.map((mode) => {
            const from = new Date(mode.best!.from), to = new Date(mode.best!.to);
            return <li key={`${mode.family}:${mode.mode}`}>
              <span className="pf-peak-h" aria-hidden="true">{from.getHours()}h<small>{t.profile.weekdays[from.getDay()]}</small></span>
              <div><p>{rich(t.profile.peakLine(`**${modeLabel(mode, true)}**`, Math.round(mode.best!.acc * 100), mode.best!.med ? formatSeconds(mode.best!.med).replace(" ", "\u00a0") : "—"))}</p>
                <small>{`${t.profile.weekdays[from.getDay()]} ${String(from.getDate()).padStart(2, "0")}/${String(from.getMonth() + 1).padStart(2, "0")} · ${from.getHours()}h${to.getHours() !== from.getHours() ? `–${to.getHours()}h` : ""}`}</small></div>
            </li>;
          })}</ul>
        </section>
      </div>
    </>}
    {calendar}
  </div>;
}
