import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Legacy, Region } from "../domain/types";
import type { querySurfaces } from "../domain/progress-surfaces";
import type { EconomySnapshot } from "../domain/economy-store";
import { TITLE_IDS } from "../domain/hub-profile";
import {
  TITLE_GOAL, buildProgressDashboard, groupHistory,
  type Dashboard, type HistoryGroup, type PillarCard, type RegionRow, type ReviewItem, type SessionRow,
} from "../domain/progress-dashboard";
import { addDays, formatClock, formatSeconds, formatShortDate, type SessionGroup } from "../domain/session-view";
import { loadFlags, flagSource, type FlagCatalog } from "../domain/quiz";
import { Glyph } from "./achievement-art";
import { ProgressHero } from "./progress-hero";

type SurfaceState = Awaited<ReturnType<typeof querySurfaces>>;
export type TrainFamily = "mapa" | "bandeiras" | "capitais";
type Props = {
  state: SurfaceState;
  data: Legacy;
  economy: EconomySnapshot;
  onTrain: (family: TrainFamily) => void;
  onOpenCollection: (region: Region) => void;
  onGoHub: () => void;
};
type FlagOf = (code?: string) => string | undefined;

const LEVEL_COLORS = ["rgba(199,182,143,.7)", "#857b5f", "var(--rar-2, #2F6F6A)", "var(--rar-3, #AB7A1A)", "var(--rar-4, #B65F47)", "#C49345"];
const GROUP_ICON: Record<SessionGroup, string> = { bandeiras: "flag", mapa: "map", capitais: "pin", historicas: "flag", idiomas: "world" };
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

// ---------- topo ----------
function StageTrack({ hero }: { hero: Dashboard["hero"] }) {
  return <div className="pr-track" role="group" aria-label="Escala de maestria">
    <div className="pr-rail-wrap"><div className="pr-rail">
      <i style={{ width: `${hero.pct}%` }} />
      <span className="pr-you" style={{ left: `${hero.pct}%` }}><em>Você · {hero.pct}%</em></span>
      {hero.stages.map((stage, index) => {
        const reached = index <= hero.stageIndex;
        return <span key={stage.name} className={`pr-node${reached ? " done" : ""}${index === hero.stageIndex ? " now" : ""}`} style={{ left: `${index * 20}%` }} aria-current={index === hero.stageIndex ? "step" : undefined}>
          {reached && <Glyph name="check" size={12} stroke={3.2} />}
          <span className="pr-node-label"><b>{stage.name}</b><small>{stage.at}</small></span>
        </span>;
      })}
    </div></div>
  </div>;
}

function heroSummary(hero: Dashboard["hero"]): ReactNode {
  if (hero.stageTitle === "Cosmógrafo") return <>Você é <b>Cosmógrafo</b>: os três títulos de pilar são seus. O atlas continua aberto para dominar o resto.</>;
  const base = <>Você é <b>{hero.stageTitle}</b>: domina {hero.dominated} de {hero.total} países. </>;
  if (hero.next) return <>{base}<b>Próximo título:</b> {hero.next.name} aos {hero.next.at}%, {hero.missing === 0 ? "falta só fechar o próximo país" : `faltam ${hero.missing}`}.</>;
  return <>{base}<b>Próximo passo:</b> Cosmógrafo, com os três títulos de pilar.</>;
}

// ---------- números rápidos ----------
function Kpis({ kpis, onOpenCollection }: { kpis: Dashboard["kpis"]; onOpenCollection: () => void }) {
  const { album } = kpis;
  const stack = album.distribution.map((count, level) => count > 0 ? <i key={level} style={{ flex: count, background: LEVEL_COLORS[level] }} /> : null);
  const acc = kpis.accuracyDelta;
  const time = kpis.timeDeltaMs;
  return <div className="pr-kpis">
    <div className="pr-kpi" data-fam="idiomas"><span className="pr-k"><Glyph name="trend" size={15} /> Nível</span><b>{kpis.level}</b><div className="pr-mini" role="img" aria-label={`${kpis.xpInLevel} de ${kpis.xpSpan} XP`}><i style={{ width: `${Math.round((kpis.xpInLevel / kpis.xpSpan) * 100)}%` }} /></div><small>{kpis.xpInLevel} / {kpis.xpSpan} XP para o nível {kpis.level + 1}</small></div>
    <div className="pr-kpi" data-fam="capitais"><span className="pr-k"><Glyph name="coll" size={15} /> Coleção</span><b>{album.discovered}<em>/{album.total}</em></b><div className="pr-stack" aria-hidden="true">{stack}</div><small>cartas descobertas · <button type="button" className="pr-inline" onClick={onOpenCollection}>abrir</button></small></div>
    <div className="pr-kpi" data-fam="mapa"><span className="pr-k"><Glyph name="world" size={15} /> Partidas</span><b>{kpis.sessions}</b><small>{kpis.rounds} {plural(kpis.rounds, "rodada jogada", "rodadas jogadas")}</small></div>
    <div className="pr-kpi" data-fam="bandeiras"><span className="pr-k"><Glyph name="target" size={15} /> Precisão</span><b>{kpis.accuracyPct === null ? "—" : `${kpis.accuracyPct}%`}</b>
      {kpis.accuracyPct === null ? <small>aparece após a 1ª partida</small> : acc === null ? <small>todas as rodadas jogadas</small> : <small className={acc >= 0 ? "up" : "down"}>{acc >= 0 ? "▲" : "▼"} {Math.abs(acc)} pts nas últimas 5 partidas</small>}</div>
    <div className="pr-kpi" data-fam="idiomas"><span className="pr-k"><Glyph name="clock" size={15} /> Tempo médio</span><b>{kpis.avgTimeMs === null ? "—" : formatSeconds(kpis.avgTimeMs)}</b>
      {time === null || Math.abs(time) < 50 ? <small>por resposta</small> : <small className={time < 0 ? "up" : "down"}>{time < 0 ? "▼" : "▲"} {formatSeconds(Math.abs(time))} · por resposta</small>}</div>
  </div>;
}

// ---------- pilares ----------
function PillarCardView({ pillar, onTrain }: { pillar: PillarCard; onTrain: () => void }) {
  const icon = pillar.key === "bandeiras" ? "flag" : pillar.key === "mapa" ? "map" : "pin";
  const empty = pillar.scorePct === null;
  return <article data-fam={pillar.key} className={`pr-pillar${pillar.earned ? " is-earned" : ""}${empty ? " is-empty" : ""}`}>
    <header>
      <span className="pr-picon"><Glyph name={icon} size={24} /></span>
      <div><h3>{pillar.label}</h3><small>{pillar.title}</small></div>
      <span className={`pr-status is-${pillar.tone}`}>{pillar.tone === "earned" && <Glyph name="trophy" size={13} stroke={2} />}{pillar.status}</span>
    </header>
    <div className="pr-acc"><b>{empty ? "—" : `${pillar.scorePct}%`}</b><span>de precisão</span></div>
    <div className="pr-goal" role="img" aria-label={empty ? "Sem rodadas" : `Precisão ${pillar.scorePct}%, meta ${pillar.goalPct}%`}><i style={{ width: `${pillar.scorePct ?? 0}%` }} /><s style={{ left: `${pillar.goalPct}%` }}><em>{pillar.goalPct}%</em></s></div>
    <p className="pr-goal-text">
      {empty ? <>Jogue {pillar.label} para medir sua precisão. A meta do título {pillar.title} é <b>{TITLE_GOAL}%</b>.</>
        : pillar.earned ? (pillar.scorePct !== null && pillar.scorePct < pillar.goalPct
          ? <>O título {pillar.title} já é seu; a precisão atual é {pillar.scorePct}%.</>
          : <>Meta de {pillar.goalPct}% batida: o título {pillar.title} é seu.</>)
        : <>Faltam <b>{pillar.gapPts} pts</b> para o título {pillar.title}.</>}
      {!empty && <span className="pr-raw"> {pillar.correct} {plural(pillar.correct, "acerto", "acertos")} em {pillar.seen} {plural(pillar.seen, "rodada", "rodadas")}.</span>}
    </p>
    <dl className="pr-pstats">
      <div><dt>Cobertura</dt><dd>{pillar.coverage}<em>/{pillar.coverageTotal} países</em></dd></div>
      <div><dt>Forma recente</dt><dd>{pillar.formPct === null ? "—" : `${pillar.formPct}%`}{pillar.formDelta !== null && pillar.formDelta !== 0 && <em className={pillar.formDelta > 0 ? "up" : "down"}>{pillar.formDelta > 0 ? "▲" : "▼"} {Math.abs(pillar.formDelta)}</em>}</dd></div>
    </dl>
    <p className={`pr-write ${pillar.writing ? (pillar.writing.ok ? "ok" : "no") : "na"}`}>
      {pillar.writing ? <><Glyph name={pillar.writing.ok ? "check" : "lock"} size={14} stroke={2.2} /> {pillar.writing.ok ? `Escrita validada · ${pillar.writing.count} ${plural(pillar.writing.count, "acerto escrito", "acertos escritos")}` : `Escrita ainda não validada · ${pillar.writing.needed - pillar.writing.count === 1 ? "falta 1 acerto escrito" : `faltam ${pillar.writing.needed - pillar.writing.count} acertos escritos`}`}</>
        : <><Glyph name="check" size={14} stroke={2.2} /> Este título não exige escrita</>}
    </p>
    <button type="button" className="pr-link" onClick={onTrain}>{empty ? "Começar" : "Treinar"} {pillar.label} <Glyph name="arrow" size={16} /></button>
  </article>;
}

function Pillars({ pillars, onTrain }: { pillars: PillarCard[]; onTrain: (family: TrainFamily) => void }) {
  const [active, setActive] = useState(0);
  return <section aria-labelledby="pr-pilares">
    <h2 className="pr-sec" id="pr-pilares">Pilares <small>o que cada modo exige</small></h2>
    <div className="pr-pillars" onScroll={(event) => {
      const list = event.currentTarget;
      const first = list.firstElementChild as HTMLElement | null;
      const step = first ? first.offsetWidth + 12 : 1;
      setActive(Math.min(pillars.length - 1, Math.max(0, Math.round(list.scrollLeft / step))));
    }}>{pillars.map((pillar) => <PillarCardView key={pillar.key} pillar={pillar} onTrain={() => onTrain(pillar.key)} />)}</div>
    <div className="pr-dots" aria-hidden="true">{pillars.map((pillar, index) => <i key={pillar.key} className={index === active ? "on" : ""} />)}</div>
  </section>;
}

// ---------- recortes ----------
function Regions({ rows, onOpen }: { rows: RegionRow[]; onOpen: (region: Region) => void }) {
  const [measure, setMeasure] = useState<"domain" | "found">("domain");
  return <section className="pr-card pr-regions" aria-labelledby="pr-recortes">
    <header>
      <div><h2 id="pr-recortes">{measure === "domain" ? "Domínio por recorte" : "Descobertas por recorte"}</h2><p>{measure === "domain" ? "Países dominados: as 3 últimas respostas certas, em 2 ou mais modos." : "Países com pelo menos um acerto: as cartas já descobertas."}</p></div>
      <div className="pr-seg" role="group" aria-label="Medida"><button type="button" aria-pressed={measure === "domain"} onClick={() => setMeasure("domain")}>Domínio</button><button type="button" aria-pressed={measure === "found"} onClick={() => setMeasure("found")}>Descobertas</button></div>
    </header>
    <ul>{rows.map((row) => {
      const value = measure === "domain" ? row.found : row.discovered;
      const pct = row.total ? Math.round((value / row.total) * 100) : 0;
      const tag = measure === "domain" ? row.tag : null;
      return <li key={row.key} className={row.world ? "is-world" : ""}>
        <button type="button" className={tag === "warn" ? "has-tag-warn" : ""} onClick={() => onOpen(row.key as Region)} aria-label={`${row.label}: ${value} de ${row.total}, ${pct}%. Abrir a Coleção neste recorte`}>
          <span className="pr-rname"><b>{row.label}</b><small>{value} de {row.total}{tag && <span className={`pr-tag ${tag}`}>{tag === "good" ? "melhor" : "comece por aqui"}</span>}</small></span>
          <span className="pr-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
          <strong>{pct}%</strong>
          <span className="pr-chev"><Glyph name="chevron" size={16} stroke={2} /></span>
        </button>
      </li>;
    })}</ul>
  </section>;
}

// ---------- para revisar ----------
function Review({ review, flagOf }: { review: Dashboard["review"]; flagOf: FlagOf }) {
  const [all, setAll] = useState(false);
  const items: ReviewItem[] = all ? review.items : review.items.slice(0, 5);
  return <section className="pr-card pr-review" aria-labelledby="pr-revisar">
    <header><div><h2 id="pr-revisar">Para revisar</h2><p>{review.total > 0 ? `${review.total} ${plural(review.total, "país com menos de 50% de acerto", "países com menos de 50% de acerto")}.` : "Nada abaixo de 50% de acerto."}</p></div></header>
    {review.total === 0
      ? <div className="pr-empty"><Glyph name="check" size={40} stroke={1.4} /><b>Nenhum país para revisar</b><p>Países com 3 ou mais tentativas e menos da metade de acertos aparecem aqui.</p></div>
      : <ul className={all ? "is-all" : undefined}>{items.map((item) => {
        const src = flagOf(item.flag);
        return <li key={item.id}>
          {src ? <img className="pr-flag" src={src} alt="" width={44} height={30} loading="lazy" decoding="async" /> : <span className="pr-flag" />}
          <div className="pr-rv-name"><b>{item.name}</b><small>{item.place}</small>{item.weak.length > 0 && <em>Fraco em: {item.weak.join(" · ")}</em>}</div>
          <div className="pr-rv-acc"><b>{item.pct}%</b><small>{item.correct} de {item.tries}</small></div>
        </li>;
      })}</ul>}
    {review.total > 5 && <button type="button" className="pr-link pr-link-center" aria-expanded={all} onClick={() => setAll((value) => !value)}>{all ? "Mostrar só os 5 piores" : `Ver a lista completa (${review.items.length}${review.total > review.items.length ? "+" : ""})`}</button>}
  </section>;
}

// ---------- atividade ----------
const heatClass = (rounds: number) => (rounds < 0 ? "hlf" : rounds === 0 ? "hl0" : rounds < 10 ? "hl1" : rounds < 25 ? "hl2" : rounds < 50 ? "hl3" : "hl4");
const DAYS = ["seg", "", "qua", "", "sex", "", ""];
function Activity({ activity }: { activity: Dashboard["activity"] }) {
  const [range, setRange] = useState<12 | 5>(12);
  const total = activity.weeks.length;
  const from = total - range;
  const weeks = activity.weeks.slice(from);
  const months = activity.months.slice(from).map((label, index) => (index === 0 && !label ? activity.months.slice(0, from + 1).reverse().find(Boolean) ?? "" : label));
  const pct = activity.daysTotal ? Math.round((activity.activeDays / activity.daysTotal) * 100) : 0;
  return <section className="pr-card pr-activity" aria-labelledby="pr-atividade">
    <header>
      <div><h2 id="pr-atividade">Atividade</h2><p>Rodadas por dia nas últimas {range} semanas.</p></div>
      <div className="pr-seg" role="group" aria-label="Período"><button type="button" aria-pressed={range === 12} onClick={() => setRange(12)}>12 semanas</button><button type="button" aria-pressed={range === 5} onClick={() => setRange(5)}>5 semanas</button></div>
    </header>
    <div className="pr-act-body">
      <div className="pr-heat" style={{ ["--weeks" as string]: range }}>
        <div className="pr-months" aria-hidden="true">{months.map((label, index) => <span key={index}>{label}</span>)}</div>
        <div className="pr-heat-grid">
          <div className="pr-days" aria-hidden="true">{DAYS.map((label, index) => <span key={index}>{label}</span>)}</div>
          <div className="pr-cells" role="img" aria-label={`${activity.activeDays} dias com partidas nas últimas 12 semanas`}>{weeks.flatMap((week, weekIndex) => week.map((rounds, dayIndex) => {
            const stamp = addDays(activity.start, (from + weekIndex) * 7 + dayIndex);
            return <i key={`${weekIndex}-${dayIndex}`} className={heatClass(rounds)} title={rounds < 0 ? undefined : `${formatShortDate(stamp)}: ${rounds} ${plural(rounds, "rodada", "rodadas")}`} />;
          }))}</div>
        </div>
        <div className="pr-heat-legend" aria-hidden="true"><span>menos</span><i className="hl0" /><i className="hl1" /><i className="hl2" /><i className="hl3" /><i className="hl4" /><span>mais</span></div>
      </div>
      <dl className="pr-act-stats">
        <div><dt>Sequência</dt><dd><span className="pr-big">{activity.streak}<em> {plural(activity.streak, "dia", "dias")}</em></span><small>melhor: {activity.bestStreak} {plural(activity.bestStreak, "dia", "dias")}</small></dd></div>
        <div><dt>Esta semana</dt><dd><span className="pr-big">{activity.weekRounds}<em> {plural(activity.weekRounds, "rodada", "rodadas")}</em></span><small>{activity.weekAccuracy === null ? "sem partidas ainda" : `${activity.weekAccuracy}% de acerto`}</small></dd></div>
        <div><dt>Dias ativos</dt><dd><span className="pr-big">{activity.activeDays}<em> de {activity.daysTotal}</em></span><small>{pct}% das últimas 12 semanas</small></dd></div>
      </dl>
    </div>
  </section>;
}

// ---------- recordes ----------
function Records({ records }: { records: Dashboard["records"] }) {
  const tiles: Array<[string, string, string, string]> = [
    ["flame", "Melhor sequência", records.bestStreak ? String(records.bestStreak.value) : "—", records.bestStreak ? `acertos seguidos · ${records.bestStreak.when}` : "ainda sem marca"],
    ["target", "Melhor partida", records.bestSession ? `${records.bestSession.pct}%` : "—", records.bestSession ? `${records.bestSession.rounds} rodadas · ${records.bestSession.when}` : "ainda sem marca"],
    ["bolt", "Resposta mais rápida", records.fastest ? formatSeconds(records.fastest.ms) : "—", records.fastest ? `${records.fastest.family} · ${records.fastest.when}` : "ainda sem marca"],
    ["map", "Menor erro médio", records.bestMapError ? `${Math.round(records.bestMapError.km)} km` : "—", records.bestMapError ? `Mapa · ${records.bestMapError.when}` : "ainda sem marca"],
  ];
  return <section className="pr-card pr-records" aria-labelledby="pr-recordes">
    <header><div><h2 id="pr-recordes">Recordes</h2><p>Suas melhores marcas.</p></div></header>
    <div className="pr-rec-grid">{tiles.map(([icon, label, value, sub]) => <div className="pr-rec" key={label}><span className="pr-ricon"><Glyph name={icon} size={20} /></span><small>{label}</small><b>{value}</b><em>{sub}</em></div>)}</div>
  </section>;
}

// ---------- evolução ----------
function EvolutionChart({ points, width, height, ticks, className }: { points: Array<{ pct: number; when: string }>; width: number; height: number; ticks: boolean; className: string }) {
  const gradient = `pr-evg-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const pl = 34, pr = 14, pt = 14, pb = 26;
  const x = (index: number) => pl + (points.length > 1 ? (index * (width - pl - pr)) / (points.length - 1) : 0);
  const y = (value: number) => pt + ((100 - value) / 60) * (height - pt - pb);
  const clamp = (value: number) => Math.max(40, Math.min(100, value));
  const coords = points.map((point, index) => [x(index), y(clamp(point.pct))] as const);
  const line = coords.map(([cx, cy], index) => `${index ? "L" : "M"}${cx.toFixed(1)} ${cy.toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${height - pb} L${pl} ${height - pb}Z`;
  const avg = points.reduce((sum, point) => sum + point.pct, 0) / points.length;
  const last = coords[coords.length - 1];
  return <svg viewBox={`0 0 ${width} ${height}`} className={`pr-chart ${className}`} role="img" aria-label={`Precisão nas últimas ${points.length} partidas, de ${points[0].pct}% a ${points[points.length - 1].pct}%`}>
    <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2F6F6A" stopOpacity=".28" /><stop offset="1" stopColor="#2F6F6A" stopOpacity="0" /></linearGradient></defs>
    {[40, 60, 80, 100].map((value) => <g key={value}><line x1={pl} x2={width - pr} y1={y(value)} y2={y(value)} stroke="rgba(199,182,143,.6)" strokeDasharray={value === 100 ? "0" : "3 4"} /><text x={pl - 8} y={y(value) + 4} textAnchor="end">{value}%</text></g>)}
    <path d={area} fill={`url(#${gradient})`} />
    <line x1={pl} x2={width - pr} y1={y(clamp(avg))} y2={y(clamp(avg))} stroke="#AB7A1A" strokeWidth="1.5" strokeDasharray="6 5" />
    <text x={pl + 8} y={y(clamp(avg)) - 7} className="avg">média {Math.round(avg)}%</text>
    <path d={line} fill="none" stroke="#2F6F6A" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
    {coords.map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r={index === coords.length - 1 ? 5.5 : 3.4} fill={index === coords.length - 1 ? "#2F6F6A" : "var(--paper)"} stroke="#2F6F6A" strokeWidth="2"><title>{`${points[index].when}: ${points[index].pct}%`}</title></circle>)}
    <text x={last[0] - 4} y={last[1] - 12} textAnchor="end" className="lastv">{points[points.length - 1].pct}%</text>
    <text x={pl} y={height - 6} textAnchor="start">{points[0].when}</text>
    {ticks && points.length > 4 && <text x={(width + pl) / 2} y={height - 6} textAnchor="middle">partida {Math.ceil(points.length / 2)}</text>}
    <text x={width - pr} y={height - 6} textAnchor="end">hoje</text>
  </svg>;
}
function Evolution({ evolution }: { evolution: Dashboard["evolution"] }) {
  const { delta } = evolution;
  return <section className="pr-card pr-evo" aria-labelledby="pr-evolucao">
    <header>
      <div><h2 id="pr-evolucao">Evolução da precisão</h2><p>Acerto por partida, das mais antigas para hoje.</p></div>
      {delta !== null && <span className={`pr-delta${delta < 0 ? " down" : ""}`}>{delta >= 0 ? "▲ +" : "▼ −"}{Math.abs(delta)} pts <small>vs. as {evolution.deltaOver} primeiras</small></span>}
    </header>
    {evolution.points.length >= 2
      ? <><EvolutionChart points={evolution.points} width={600} height={178} ticks className="pr-chart-d" /><EvolutionChart points={evolution.points} width={330} height={168} ticks={false} className="pr-chart-m" /></>
      : <div className="pr-empty"><Glyph name="trend" size={40} stroke={1.3} /><b>Complete 2 partidas para ver a curva</b><p>A linha compara suas partidas ao longo do tempo e mostra se você está evoluindo.</p></div>}
  </section>;
}

// ---------- partidas recentes ----------
function Recent({ rows, onHistory, onGoHub }: { rows: SessionRow[]; onHistory: () => void; onGoHub: () => void }) {
  return <section className="pr-card pr-recent" aria-labelledby="pr-recentes">
    <header><div><h2 id="pr-recentes">Partidas recentes</h2></div></header>
    {rows.length === 0
      ? <div className="pr-empty"><b>Nenhuma partida ainda</b><p>Escolha um modo no Hub e jogue a primeira rodada.</p><button type="button" className="pr-cta-line" onClick={onGoHub}>Ir para os modos <Glyph name="arrow" size={16} /></button></div>
      : <ul>{rows.map((row) => <li key={row.id}>
        <span className="pr-sicon"><Glyph name={GROUP_ICON[row.group]} size={20} /></span>
        <div className="pr-s-main"><b>{row.title}</b><small>{row.region} · {row.rounds} {plural(row.rounds, "rodada", "rodadas")}{row.duration ? ` · ${row.duration}` : ""}</small></div>
        <div className={`pr-s-res${row.pct !== null && row.pct < 60 ? " low" : ""}`}><b>{row.pct ?? 0}%</b><div className="pr-mini"><i style={{ width: `${row.pct ?? 0}%` }} /></div><small>{row.when}</small></div>
      </li>)}</ul>}
    {rows.length > 0 && <button type="button" className="pr-link pr-link-center" onClick={onHistory}>Ver todo o histórico <Glyph name="arrow" size={16} /></button>}
  </section>;
}

// ---------- histórico ----------
const PAGE = 20;
function SessionItem({ row, group, open, onToggle, flagOf }: { row: SessionRow; group: string; open: boolean; onToggle: () => void; flagOf: FlagOf }) {
  const when = group === "hoje" || group === "ontem" ? formatClock(row.startedAt) : formatShortDate(row.startedAt);
  const pct = row.pct ?? 0;
  return <article className={`pr-sess${open ? " is-open" : ""}`}>
    <button type="button" className="pr-sess-row" aria-expanded={open} onClick={onToggle}>
      <span className="pr-sicon"><Glyph name={GROUP_ICON[row.group]} size={20} /></span>
      <span className="pr-s-main"><b>{row.title}</b><small>{row.region} · {row.rounds} {plural(row.rounds, "rodada", "rodadas")}{row.duration ? ` · ${row.duration}` : ""} · {when}{!row.complete && <> · <span className="pr-inc">incompleta · não conta</span></>}</small></span>
      <span className={`pr-s-res${pct < 60 ? " low" : ""}`}><b>{pct}%</b><span className="pr-mini"><i style={{ width: `${pct}%` }} /></span></span>
      <span className={`pr-chev${open ? " down" : ""}`}><Glyph name="chevron" size={18} stroke={2} /></span>
    </button>
    {open && <div className="pr-sess-detail">
      <div className="pr-sd-top">
        {row.pattern && <div className="pr-strip" role="img" aria-label={`${row.pattern.split("").filter((c) => c === "1").length} acertos em ${row.pattern.length} rodadas`}>{row.pattern.split("").map((c, index) => <i key={index} className={c === "1" ? "ok" : "no"} />)}</div>}
        <dl>
          <div><dt>Tempo médio</dt><dd>{row.avgTimeMs === null ? "—" : formatSeconds(row.avgTimeMs)}</dd></div>
          <div><dt>Maior sequência</dt><dd>{row.bestStreak}</dd></div>
          <div><dt>Duração</dt><dd>{row.duration ?? "—"}</dd></div>
        </dl>
      </div>
      <div className="pr-sd-miss">{row.misses.length === 0
        ? <span>{row.pattern ? "Sem erros nesta partida." : "Esta partida antiga guarda só o resumo, sem as rodadas."}</span>
        : <><span>Você errou:</span>{row.misses.slice(0, 8).map((miss) => { const src = flagOf(miss.flag); return <span className="pr-miss" key={miss.id}>{src ? <img className="pr-flag" src={src} alt="" width={26} height={18} loading="lazy" decoding="async" /> : null}{miss.name}</span>; })}{row.misses.length > 8 && <span>+{row.misses.length - 8}</span>}</>}</div>
    </div>}
  </article>;
}

function History({ rows, now, flagOf }: { rows: SessionRow[]; now: number; flagOf: FlagOf }) {
  const [filter, setFilter] = useState<"todas" | SessionGroup>("todas");
  const [region, setRegion] = useState("todos");
  const [onlyComplete, setOnlyComplete] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(rows[0]?.id ?? null);
  const counts = useMemo(() => {
    const map = new Map<SessionGroup, number>();
    rows.forEach((row) => map.set(row.group, (map.get(row.group) ?? 0) + 1));
    return map;
  }, [rows]);
  const regions = useMemo(() => [...new Set(rows.map((row) => row.region))].sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);
  const filtered = useMemo(() => rows.filter((row) => (filter === "todas" || row.group === filter) && (region === "todos" || row.region === region) && (!onlyComplete || row.complete)), [rows, filter, region, onlyComplete]);
  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);
  const groups: HistoryGroup[] = useMemo(() => groupHistory(shown, now), [shown, now]);
  const chips: Array<{ key: "todas" | SessionGroup; label: string; icon?: string; count: number }> = [
    { key: "todas", label: "Todas", count: rows.length },
    { key: "bandeiras", label: "Bandeiras", icon: "flag", count: counts.get("bandeiras") ?? 0 },
    { key: "mapa", label: "Mapa", icon: "map", count: counts.get("mapa") ?? 0 },
    { key: "capitais", label: "Capitais", icon: "pin", count: counts.get("capitais") ?? 0 },
    { key: "historicas", label: "Históricas", count: counts.get("historicas") ?? 0 },
    { key: "idiomas", label: "Idiomas", count: counts.get("idiomas") ?? 0 },
  ];
  if (rows.length === 0) return <div className="pr-card"><div className="pr-empty"><b>Nenhuma partida ainda</b><p>Suas partidas aparecem aqui, agrupadas por dia, com os países que você errou em cada uma.</p></div></div>;
  return <>
    <div className="pr-hist-bar">
      <div className="pg-chips pr-filters" role="group" aria-label="Filtrar por modo">{chips.filter((chip) => chip.key === "todas" || chip.count > 0).map((chip) => <button key={chip.key} type="button" className="pg-chip" aria-pressed={filter === chip.key} onClick={() => { setFilter(chip.key); setVisible(PAGE); }}>{chip.icon && <Glyph name={chip.icon} size={16} />}{chip.label} <em>{chip.count}</em></button>)}</div>
      <div className="pr-hist-right">
        <label className="pr-select-wrap"><span className="sr-only">Recorte</span><select className="pr-select" value={region} onChange={(event) => { setRegion(event.target.value); setVisible(PAGE); }}><option value="todos">Recorte: todos</option>{regions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label className="pr-toggle"><input type="checkbox" checked={onlyComplete} onChange={(event) => { setOnlyComplete(event.target.checked); setVisible(PAGE); }} /><i /> Só completas</label>
      </div>
    </div>
    {groups.length === 0 && <div className="pr-card"><div className="pr-empty"><b>Nenhuma partida com esses filtros</b><p>Tire um filtro para ver mais partidas.</p></div></div>}
    {groups.map((group) => <div className="pr-day" key={group.key}>
      <h2>{group.label} <small>{group.sessions} {plural(group.sessions, "partida", "partidas")} · {group.rounds} {plural(group.rounds, "rodada", "rodadas")}{group.pct !== null ? ` · ${group.pct}%` : ""}</small></h2>
      {group.rows.map((row) => <SessionItem key={row.id} row={row} group={group.key} open={openId === row.id} onToggle={() => setOpenId((current) => (current === row.id ? null : row.id))} flagOf={flagOf} />)}
    </div>)}
    {filtered.length > visible && <button type="button" className="pr-link pr-link-center pr-more" onClick={() => setVisible((value) => value + PAGE)}>Carregar partidas mais antigas ({filtered.length - visible})</button>}
  </>;
}

// ---------- perfil novo ----------
function EmptySummary({ dashboard, onTrain }: { dashboard: Dashboard; onTrain: (family: TrainFamily) => void }) {
  const { kpis, hero } = dashboard;
  return <>
    <div className="pr-kpis">
      <div className="pr-kpi" data-fam="idiomas"><span className="pr-k"><Glyph name="trend" size={15} /> Nível</span><b>{kpis.level}</b><div className="pr-mini"><i style={{ width: 0 }} /></div><small>{kpis.xpInLevel} / {kpis.xpSpan} XP para o nível {kpis.level + 1}</small></div>
      <div className="pr-kpi" data-fam="capitais"><span className="pr-k"><Glyph name="coll" size={15} /> Coleção</span><b>{kpis.album.discovered}<em>/{kpis.album.total}</em></b><div className="pr-stack" aria-hidden="true"><i style={{ flex: 1, background: LEVEL_COLORS[0] }} /></div><small>cartas descobertas</small></div>
      <div className="pr-kpi" data-fam="mapa"><span className="pr-k"><Glyph name="world" size={15} /> Partidas</span><b>{kpis.sessions}</b><small>nenhuma rodada ainda</small></div>
      <div className="pr-kpi" data-fam="bandeiras"><span className="pr-k"><Glyph name="target" size={15} /> Precisão</span><b>—</b><small>aparece após a 1ª partida</small></div>
      <div className="pr-kpi" data-fam="idiomas"><span className="pr-k"><Glyph name="clock" size={15} /> Tempo médio</span><b>—</b><small>por resposta</small></div>
    </div>
    <Pillars pillars={dashboard.pillars} onTrain={onTrain} />
    <div className="pr-card pr-first"><div className="pr-empty"><Glyph name="compass" size={44} stroke={1.2} /><b>Sua primeira partida acende tudo aqui</b><p>Recortes, países para revisar, atividade, recordes e a curva de evolução aparecem conforme você joga. {hero.next ? `Para chegar a ${hero.next.name}, domine ${hero.missing} ${plural(hero.missing ?? 0, "país", "países")}.` : ""}</p></div></div>
  </>;
}

// ---------- como funciona ----------
function HowDialog({ dialog }: { dialog: RefObject<HTMLDialogElement | null> }) {
  return <dialog ref={dialog} className="pr-dialog" aria-labelledby="pr-how-title" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
    <div className="pr-dialog-body">
      <header><h2 id="pr-how-title">Como o progresso é calculado</h2><button type="button" className="pr-x" aria-label="Fechar" onClick={() => dialog.current?.close()}><Glyph name="x" size={20} stroke={2} /></button></header>
      <dl>
        <div><dt>País dominado</dt><dd>As 3 últimas respostas certas sobre o país, vindas de 2 ou mais modos diferentes (por exemplo, mapa e bandeira).</dd></div>
        <div><dt>Maestria e estágios</dt><dd>É a parte do atlas que você domina. Novato até 19%, Aprendiz a partir de 20%, Explorador 40%, Navegador 60%, Geógrafo 80%. Cosmógrafo exige os três títulos de pilar.</dd></div>
        <div><dt>Títulos de pilar</dt><dd>Cada pilar (Bandeiras, Mapa, Capitais) tem uma precisão que leva em conta quantas rodadas você jogou: com poucas rodadas ela sobe devagar, de propósito. A meta é {TITLE_GOAL}%. Vexilólogo e Diplomata também pedem escrita validada (2 acertos digitados).</dd></div>
        <div><dt>Nível e XP</dt><dd>1 XP por rodada e 25 XP por país dominado.</dd></div>
        <div><dt>Para revisar</dt><dd>Países com 3 ou mais tentativas e menos de 50% de acerto, do pior para o menos ruim.</dd></div>
      </dl>
    </div>
  </dialog>;
}

// ---------- tela ----------
export function ProgressView({ state, data, economy, onTrain, onOpenCollection, onGoHub }: Props) {
  const [tab, setTab] = useState<"resumo" | "historico">("resumo");
  const [flags, setFlags] = useState<FlagCatalog>({});
  const howRef = useRef<HTMLDialogElement | null>(null);
  useEffect(() => { loadFlags().then(setFlags).catch(() => undefined); }, []);
  const now = useMemo(() => Date.now(), [state]);
  const dashboard = useMemo(() => buildProgressDashboard({
    now,
    sessions: state.sessions,
    records: state.progress.records ?? [],
    meta: data.meta,
    universe: data.mapEntityIds,
    dominatedIds: state.dominatedIds,
    titleIds: state.achievements.filter((item) => item.unlocked && TITLE_IDS.includes(item.id)).map((item) => item.id),
    pillars: state.progress.pillars,
    album: { discovered: state.progress.discovered, total: state.progress.total, distribution: state.progress.distribution },
    economy,
  }), [now, state, data, economy]);
  const flagOf: FlagOf = (code) => { const value = code ? flags[code.toLowerCase()] : undefined; return value ? flagSource(value) : undefined; };
  const { hero } = dashboard;
  const openCollection = () => onOpenCollection("mundo");

  return <section className="pr" aria-label="Progresso">
    <ProgressHero
      value={hero.pct} total={100} ringValue={`${hero.pct}%`} ringCaption="maestria" ringLabel={`Maestria ${hero.pct}%`}
      eyebrow="Perfil local · Progresso" title="Progresso"
      summary={<>{heroSummary(hero)}<button type="button" className="pr-how" onClick={() => howRef.current?.showModal()}><Glyph name="info" size={16} /> <span className="pr-d">Como o progresso é calculado</span><span className="pr-m">Como funciona?</span></button></>}
      legendLabel="Títulos de pilar" legendClassName="pr-titles"
      legend={hero.titles.map((title) => <li key={title.id} className={title.earned ? "is-earned" : "is-locked"}><span className="pr-medal"><Glyph name={title.earned ? "trophy" : "lock"} size={14} stroke={2} /></span><b>{title.label}</b><span className="sr-only">{title.earned ? " conquistado" : " bloqueado"}</span></li>)}
      footer={<StageTrack hero={hero} />}
    />
    <div className="pg-chips pr-tabs" role="group" aria-label="Seções">
      <button type="button" className="pg-chip" aria-pressed={tab === "resumo"} onClick={() => setTab("resumo")}><Glyph name="bars" size={17} /> Resumo</button>
      <button type="button" className="pg-chip" aria-pressed={tab === "historico"} onClick={() => setTab("historico")}><Glyph name="clock" size={17} /> Histórico {dashboard.history.length > 0 && <em>{dashboard.history.length}</em>}</button>
    </div>
    {tab === "historico" ? <History rows={dashboard.history} now={now} flagOf={flagOf} />
      : dashboard.empty ? <EmptySummary dashboard={dashboard} onTrain={onTrain} />
      : <>
        <Kpis kpis={dashboard.kpis} onOpenCollection={openCollection} />
        <Pillars pillars={dashboard.pillars} onTrain={onTrain} />
        <div className="pr-row pr-row-a"><Regions rows={dashboard.regions} onOpen={onOpenCollection} /><Review review={dashboard.review} flagOf={flagOf} /></div>
        <div className="pr-row pr-row-b"><Activity activity={dashboard.activity} /><Records records={dashboard.records} /></div>
        <div className="pr-row pr-row-c"><Evolution evolution={dashboard.evolution} /><Recent rows={dashboard.recent} onHistory={() => setTab("historico")} onGoHub={onGoHub} /></div>
      </>}
    <HowDialog dialog={howRef} />
  </section>;
}
