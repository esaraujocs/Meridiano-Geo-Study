import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Icon } from "./icons";
import { ThemeUnlockCard } from "./theme-unlock";
import type { DuelView } from "../domain/duel";
import { LADDER_BASE, LADDER_BASE_GROUP, groupDef, type ModeGroup } from "../domain/duel-modes";
import { clockOf, decisiveLeg, meterLayout, resultPlan, secondsPer, worstLeg, type Pill, type ResultTier } from "../domain/duel-view";
import { leagueLabel, milestoneLabel, nextStep } from "../domain/duel-labels";
import { DIVISION_SPAN, LEAGUES, divisionRoman, leagueOf } from "../domain/league";
import { baseCoins } from "../domain/spoils";
import type { ResultView } from "../domain/result-view";
import { formatNumber as format, intlLocale, t } from "../domain/i18n";

export const reducedMotion = () =>
  (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) ||
  document.documentElement.dataset.reducedMotion === "true";

const TIER_CLASS: Record<ResultTier, number> = { win: 1, perfect: 2, "division-up": 3, "league-up": 4, loss: 0, close: 0, "division-down": 0, "league-down": 0, draw: 0 };
const ease = (value: number) => 1 - Math.pow(1 - value, 3);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const signed = (value: number) => (value > 0 ? `+${format(value)}` : value < 0 ? `−${format(Math.abs(value))}` : "0");
const firstName = (name: string) => name.split(" ")[0] ?? name;
const WIN_COLORS: Record<number, string[]> = { 1: ["#4fe0a8", "#C49345", "#2F6F6A", "#F3E9D2"], 2: ["#4fe0a8", "#E9B970", "#C49345", "#F3E9D2", "#2F6F6A"], 3: ["#E9B970", "#C49345", "#4fe0a8", "#F3E9D2"], 4: ["#E9B970", "#5FA8A2", "#F3E9D2", "#4fe0a8", "#9CCFC9"] };
const ASH_COLORS = ["#8a7f6a", "#B65F47", "#d59685", "#a89d86"];

type Particle = { dx: number; dy: number; rotate: number; color: string; delay: number };
/** Confete na vitória (explode para todo lado) e cinzas na derrota (caem devagar). */
function makeParticles(count: number, tier: number, loss: boolean): Particle[] {
  return Array.from({ length: count }, (_, index) => {
    if (loss) return { dx: Math.round((Math.random() - 0.5) * 460), dy: Math.round(90 + Math.random() * 230), rotate: Math.round(Math.random() * 120), color: ASH_COLORS[index % ASH_COLORS.length], delay: Math.random() * 0.5 };
    const colors = WIN_COLORS[tier] ?? WIN_COLORS[1];
    const angle = Math.random() * Math.PI * 2;
    const distance = 120 + Math.random() * 230;
    return { dx: Math.round(Math.cos(angle) * distance), dy: Math.round(Math.sin(angle) * distance * 0.85 - 30), rotate: Math.round(Math.random() * 540 - 270), color: colors[index % colors.length], delay: Math.random() * 0.18 };
  });
}

type Props = {
  duel: DuelView;
  view: ResultView;
  lootCoinRef: RefObject<HTMLSpanElement | null>;
  xpChipRef: RefObject<HTMLSpanElement | null>;
  onAgain: () => void;
  onHome: () => void;
  onLeague?: () => void;
  /** Treinar o modo em que a pessoa mais ficou atrás (só se ela tem o modo). */
  onTrain?: (group: ModeGroup) => void;
  /** Modo de prévia: leva à Loja para conhecê-lo. */
  onStore?: () => void;
  /** Aplica o tema de liga conquistado neste duelo. */
  onEquipTheme?: (id: string) => void;
};

// Resultado do duelo: a festa cresce com a importância (vitória, perfeita, divisão, liga) e a derrota tem o mesmo cuidado, com tom de
// consolo. A barra de troféus anda do valor de antes ao de depois (e troca de liga no meio, se for o caso).
export function DuelResultCard({ duel, view, lootCoinRef, xpChipRef, onAgain, onHome, onLeague, onTrain, onStore, onEquipTheme }: Props) {
  const legs = duel.legs ?? [];
  const plan = useMemo(() => resultPlan({
    outcome: duel.outcome, playerCorrect: duel.playerCorrect, botCorrect: duel.botCorrect, total: duel.total,
    before: duel.trophiesBefore, after: duel.trophiesAfter, streakAfter: duel.streakAfter, streakBefore: duel.streakBefore, milestones: duel.milestones.length, streakBonus: duel.streakBonus, perfBonus: duel.perfBonus,
  }), [duel]);
  const still = useMemo(() => reducedMotion(), []);
  const [progress, setProgress] = useState(still ? 1 : 0);
  const [score, setScore] = useState<[number, number]>(still ? [duel.playerCorrect, duel.botCorrect] : [0, 0]);
  const [thud, setThud] = useState(false);
  const [glow, setGlow] = useState(false);
  const lastLeague = useRef<string | null>(null);
  const particles = useMemo(() => makeParticles(plan.particles, TIER_CLASS[plan.tier], plan.kind === "loss"), [plan]);

  useEffect(() => {
    if (still) return;
    try { navigator.vibrate?.(plan.kind === "loss" ? [40] : TIER_CLASS[plan.tier] >= 3 ? [18, 50, 18, 50, 30] : [18, 50, 18]); } catch { /* sem vibração */ }
    let raf = 0;
    let cancelled = false;
    const start = performance.now();
    const step = (now: number) => {
      if (cancelled) return;
      const elapsed = now - start;
      const counting = clamp01((elapsed - 750) / 650);
      setScore([Math.round(duel.playerCorrect * ease(counting)), Math.round(duel.botCorrect * ease(counting))]);
      const moving = clamp01((elapsed - plan.delayMs) / plan.durationMs);
      setProgress(moving);
      if (moving < 1 || counting < 1) raf = requestAnimationFrame(step);
      else if (plan.kind === "loss") setThud(true);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, []);

  const frame = meterLayout(plan, progress);
  const status = frame.status;
  const afterStatus = leagueOf(duel.trophiesAfter);
  const beforeStatus = leagueOf(duel.trophiesBefore);
  const afterName = leagueLabel(afterStatus.league, afterStatus.division);
  const nowName = leagueLabel(status.league, status.division);
  const pip = divisionRoman(status.division) || "M";

  // a moldura brilha quando a liga muda no meio da animação
  useEffect(() => {
    const previous = lastLeague.current;
    lastLeague.current = status.league;
    if (previous && previous !== status.league) { setGlow(true); const timer = window.setTimeout(() => setGlow(false), 900); return () => window.clearTimeout(timer); }
  }, [status.league]);

  const decisive = decisiveLeg(legs, plan.kind);
  const margin = Math.abs(plan.margin);
  const title = (() => {
    const r = t.duel.result;
    switch (plan.tier) {
      case "win": return r.win;
      case "perfect": return r.perfect;
      case "division-up": return r.promoted(afterName);
      case "league-up": return frame.phase === 1 ? r.promoted(afterName) : r.win;
      case "loss": return duel.abandoned ? r.left : r.loss;
      case "close": return duel.abandoned ? r.left : r.close;
      case "division-down": return r.demoted(afterName);
      case "league-down": return frame.phase === 1 ? r.backTo(afterName) : r.loss;
      default: return r.draw;
    }
  })();
  const note = (() => {
    const r = t.duel.result;
    if (duel.abandoned && plan.kind === "loss") return r.noteLeft;
    if (duel.tiebreak && plan.kind !== "draw") return r.tiebreak;
    switch (plan.tier) {
      case "win": return r.noteWin(decisive ? decisive.index + 1 : null);
      case "perfect": return r.notePerfect(duel.total);
      case "division-up": return r.noteDivisionUp(divisionRoman(afterStatus.division));
      case "league-up": return r.noteLeagueUp;
      case "loss": return r.noteLoss(margin, decisive ? decisive.index + 1 : null);
      case "close": return r.noteClose(margin);
      case "division-down": return r.noteDivisionDown(divisionRoman(beforeStatus.division));
      case "league-down": return r.noteLeagueDown;
      default: return r.noteDraw;
    }
  })();
  const pillText = (pill: Pill) => {
    const r = t.duel.result;
    const value = pill.value ?? 0;
    switch (pill.key) {
      case "delta": return value === 0 ? r.pillNoLoss : r.pillTrophies(signed(value));
      case "perf": return r.pillPerf(value);
      case "boost": return r.pillBoost(value);
      case "streak": return r.pillStreak(value);
      case "perfect": return r.pillPerfect(duel.playerCorrect, duel.total);
      case "division": return r.pillDivision;
      case "league": return r.pillLeague;
      case "broken": return r.pillBroken(value);
      case "stay": return r.pillStay(afterName);
      case "close": return r.pillClose(value);
      case "kept": return r.pillKept;
      default: return r.pillMarks(value);
    }
  };

  const step = nextStep(status);
  const rangeStatus = leagueOf(frame.floor);
  const lo = `${leagueLabel(rangeStatus.league, rangeStatus.division)} · ${format(frame.floor)}`;
  const hi = rangeStatus.index < LEAGUES.length - 1 ? `${leagueLabel(LEAGUES[rangeStatus.index + 1])} · ${format(frame.floor + frame.span)}` : "";
  const sub = step ? `${t.duel.result.nowIn(nowName)} ${t.duel.league.toNext(format(step.remaining), step.label)}` : t.duel.league.top;
  const botFirst = firstName(duel.botName);
  const ladder = duel.ladder ?? "mapas";
  const baseLabel = t.duel.groups[LADDER_BASE_GROUP[ladder]];
  const previewLabels = legs.filter((_, index) => duel.legPreview?.[index]).map((leg) => t.duel.groups[groupDef(leg.group).group]);
  const completion = view.lines.find((line) => line.key === "completion");
  const legTime = (ms: number | null | undefined) => (ms === null || ms === undefined ? "—" : clockOf(ms));
  const perAnswer = (ms: number | null | undefined) => { const seconds = secondsPer(ms, duel.total); return seconds === null ? "" : t.duel.result.perAnswer(seconds.toLocaleString(intlLocale, { maximumFractionDigits: 1 })); };
  const worst = plan.kind === "loss" && !duel.abandoned ? worstLeg(legs) : null;
  const worstOwned = worst ? !duel.legPreview?.[worst.index] : false;
  const worstLabel = worst ? t.duel.groups[groupDef(legs[worst.index].group).group] : "";
  const prizesVisible = progress >= (plan.cross ? 0.62 : 0.97);
  const won = plan.kind === "win";
  const meterLoss = plan.to < plan.from;
  const cardClass = `rs-card dr-card vh-card tier-${TIER_CLASS[plan.tier]} is-${plan.kind}${still ? "" : " fx"}`;

  return <section className={cardClass} data-league={status.league} aria-labelledby="rs-title">
    <p className="sr-only" role="status">{`${title}. ${t.duel.result.you} ${duel.playerCorrect}, ${duel.botName} ${duel.botCorrect}.`}</p>
    <div className="vh-shine" aria-hidden="true" />
    <div className="dr-col dr-col-a">
    <div className="vh-hero">
      <div className="vh-medalwrap" aria-hidden="true">
        <span className="vh-ripple" /><span className="vh-ripple r2" />
        <div className={`vh-medal lg-frame${thud ? " dr-shake" : ""}`}><Icon type="achievements" size={62} /><span key={pip} className="lg-pip vh-pip dr-pop">{pip}</span></div>
        <span className={`vh-burst${plan.kind === "loss" ? " vh-ash" : ""}`}>{particles.map((particle, index) => <i key={index} style={{ "--dx": `${particle.dx}px`, "--dy": `${particle.dy}px`, "--r": `${particle.rotate}deg`, "--c": particle.color, "--d": `${particle.delay.toFixed(2)}s` } as CSSProperties} />)}</span>
      </div>
      <span className="eyebrow">{t.duel.result.eyebrow(t.duel.ladders[ladder], duel.botName)}</span>
      <h1 id="rs-title" className="vh-title">{title}</h1>
      <div className="vh-pills">{plan.pills.map((pill) => <span key={pill.key} className={`vh-pill ${pill.tone}`}>{pillText(pill)}</span>)}</div>
    </div>

    <div className="vh-score">
      <span aria-hidden="true" className={plan.kind === "draw" ? "" : won ? "w" : "l"}><small>{t.duel.result.you}</small><b>{score[0]}</b></span>
      <em aria-hidden="true">x</em>
      <span aria-hidden="true" className={plan.kind === "draw" ? "" : won ? "l" : "w"}><small>{botFirst}</small><b>{score[1]}</b></span>
      <p>{note}</p>
    </div>
    {duel.themeUnlocked && <ThemeUnlockCard themeId={duel.themeUnlocked} onEquip={onEquipTheme} />}
    {worst && legs.length > 1 && <section className="vl-read" aria-label={t.duel.result.readTitle}>
      <header><b>{t.duel.result.readTitle}</b><small>{t.duel.result.readSub}</small></header>
      <ul>{legs.map((leg, index) => {
        const legMargin = leg.playerCorrect - leg.botCorrect;
        const total = Math.max(1, leg.total);
        return <li key={index} className={index === worst.index ? "key" : ""}>
          <span className="t">{t.duel.result.legTitle(index + 1, t.duel.groups[groupDef(leg.group).group])}{duel.legPreview?.[index] && <em><Icon type="lock" size={11} />{t.duel.reveal.preview}</em>}</span>
          <span className="bars" aria-hidden="true"><i className="me" style={{ width: `${(leg.playerCorrect / total) * 100}%` }} /><i className="bot" style={{ width: `${(leg.botCorrect / total) * 100}%` }} /></span>
          <span className="n">{leg.playerCorrect} x {leg.botCorrect}</span>
          {legMargin < 0 ? <span className="flag">{signed(legMargin)}</span> : <span className="flag" />}
        </li>;
      })}</ul>
      <p>
        <span>{decisive ? t.duel.result.readDiff(decisive.index + 1, Math.abs(decisive.margin)) : t.duel.result.readBoth}</span>
        {worstOwned
          ? onTrain && <button type="button" className="rs-btn" onClick={() => onTrain(legs[worst.index].group)}><Icon type="repeat" />{t.duel.result.train(worstLabel)}</button>
          : onStore && <button type="button" className="rs-btn" onClick={onStore}><Icon type="lock" />{t.duel.result.seeStore(worstLabel)}</button>}
      </p>
    </section>}
    </div>
    <div className="dr-col dr-col-b">
    <div className={`dr-meter is-${meterLoss ? "loss" : "win"}`}>
      <div className={`dr-emb lg-frame${glow ? " dr-glow" : ""}${thud ? " dr-shake" : ""}`}><b>{signed(frame.shown)}</b><small>{t.duel.result.trophies}</small><span key={pip} className="lg-pip dr-pop">{pip}</span></div>
      <div className="dr-side">
        <div className="dr-nums"><span>{format(duel.trophiesBefore)}</span><i>→</i><strong>{format(Math.round(frame.value))}</strong></div>
        <div className="dr-track" role="img" aria-label={t.duel.result.total(format(duel.trophiesAfter))}>
          <i className="dr-fill" style={{ width: `${frame.fill}%` }} />
          <em className="dr-delta" style={{ left: `${frame.deltaFrom}%`, width: `${Math.max(0, frame.deltaTo - frame.deltaFrom)}%` }} />
          {status.division !== null && [1, 2].map((division) => <span key={division} className={`dr-tick${frame.ticks[division - 1] ? " hit" : ""}`} style={{ left: `${(division * DIVISION_SPAN / frame.span) * 100}%` }}><s>{divisionRoman((division + 1) as 2 | 3)}</s></span>)}
        </div>
        <div className="dr-ends"><span>{lo}</span><span>{hi}</span></div>
        <p className="dr-sub">{sub}{onLeague && <> <button type="button" className="pr-link dr-league-link" onClick={onLeague}>{t.duel.result.openLeague} →</button></>}</p>
      </div>
    </div>

    <div className={`dr-prizes${duel.milestones.length > 0 && prizesVisible ? "" : " is-hidden"}`}>
      {duel.milestones.map((milestone) => <div key={milestone.id} className="dr-prize"><span className="pz-ico"><Icon type="star" size={16} /></span><div><b>{t.duel.result.milestone(milestoneLabel(milestone), format(milestone.coins))}</b></div></div>)}
    </div>


    {legs.length > 0 && <table className="dr-legs">
      <thead><tr><th><span className="sr-only">{t.duel.result.colLeg}</span></th><th>{t.duel.result.you}</th><th>{botFirst}</th><th>{t.duel.result.colCoins}</th></tr></thead>
      <tbody>
        {legs.map((leg, index) => {
          const preview = Boolean(duel.legPreview?.[index]);
          const def = groupDef(leg.group);
          const rate = baseCoins(preview ? LADDER_BASE[ladder].variant : def.variants[0].variant);
          return <tr key={index}>
            <td>{t.duel.result.legTitle(index + 1, t.duel.groups[def.group])}{preview && <span className="rv-tag"><Icon type="lock" size={12} />{t.duel.reveal.preview}</span>}<small>{preview ? t.duel.result.legPreview(baseLabel) : t.duel.result.legPerHit(rate)}</small></td>
            <td>{leg.playerCorrect}<small>{legTime(duel.legTimes?.[index]?.playerMs)}</small></td><td>{leg.botCorrect}<small>{legTime(duel.legTimes?.[index]?.botMs)}</small></td><td>+{format(duel.legCoins?.[index] ?? 0)}</td>
          </tr>;
        })}
        {duel.legTimes && <tr className="dr-time"><td>{t.duel.result.timeTotal}</td><td>{legTime(duel.playerMs)}<small>{perAnswer(duel.playerMs)}</small></td><td>{legTime(duel.botMs)}<small>{perAnswer(duel.botMs)}</small></td><td /></tr>}
        {completion && <tr className="dr-bonus"><td>{completion.label}<small>{completion.note}</small></td><td /><td /><td>+{format(completion.coins)}</td></tr>}
      </tbody>
    </table>}

    {plan.kind === "loss" && view.coins > 0 && <p className="dr-consol">{t.duel.result.consol}</p>}
    <div className="dr-loot">
      <span className="rs-coin rs-loot-coin" ref={lootCoinRef} aria-hidden="true">$</span>
      <div><b>+{format(view.coins)}</b><small>{t.result.coinsLine(format(view.balanceBefore), format(view.balanceAfter))}</small></div>
      {view.xpGain > 0 && <span className="rs-xp" ref={xpChipRef}>+{view.xpGain} XP</span>}
    </div>
    {previewLabels.length > 0 && <p className="dr-rule"><Icon type="info" size={16} /><span>{t.duel.result.previewRule(previewLabels.join(" · "), baseLabel)}</span></p>}
    </div>

    <div className="rs-actions">
      <button type="button" className="rs-btn primary" onClick={onAgain}><Icon type="repeat" />{plan.kind === "loss" ? t.duel.result.retry : t.duel.result.again}</button>
      <button type="button" className="rs-btn" disabled title={t.duel.arenas.friendTitle}><Icon type="swords" /><span className="rs-lbl">{t.duel.arenas.friend}</span></button>
      <button type="button" className="rs-btn" aria-label={t.result.homeAria} onClick={onHome}><Icon type="home" /><span className="rs-lbl">{t.result.home}</span></button>
    </div>
  </section>;
}
