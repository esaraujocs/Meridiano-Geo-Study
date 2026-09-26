import { useEffect, useRef, useState } from "react";
import { Icon, type IconType } from "./icons";
import { xpSegments, type ResultChip, type ResultView } from "../domain/result-view";
import { formatKm } from "../domain/map-error";
import { formatNumber, t } from "../domain/i18n";
import type { DuelView } from "../domain/duel";
import { leagueLabel, milestoneLabel, styleLabel } from "../domain/duel-labels";
import { leagueOf } from "../domain/league";

type Props = { view: ResultView; onAgain: () => void; onAdjust: () => void; onHome: () => void; duel?: DuelView | null; onLeague?: () => void };
type LevelState = { level: number; span: number; progress: number };

const ARC = 2 * Math.PI * 15;
const RING = 2 * Math.PI * 58;
const CHIP_ICON: Record<ResultChip["key"], IconType> = { cards: "puzzle", levels: "trend", streak: "flame", timeouts: "clock" };
const format = formatNumber;
const reducedMotion = () =>
  (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) ||
  document.documentElement.dataset.reducedMotion === "true";
const center = (element: HTMLElement | null): [number, number] => {
  const box = element?.getBoundingClientRect();
  return box ? [box.left + box.width / 2, box.top + box.height / 2] : [0, 0];
};
const pulse = (element: HTMLElement | null, scale = 1.08) =>
  element?.animate([{ transform: "scale(1)" }, { transform: `scale(${scale})` }, { transform: "scale(1)" }], { duration: 240, easing: "ease-out" });

// Resultado da partida: o essencial cabe numa tela (nota, moedas, XP e os botões); o resto fica em "Ver detalhes".
// As moedas voam do cartão para a carteira do topo e o XP enche a barra de nível, como uma prestação de contas.
export function ResultScreen({ view, onAgain, onAdjust, onHome, duel, onLeague }: Props) {
  const start = xpSegments(view.xpBefore, view.xpBefore)[0];
  const [balance, setBalance] = useState(view.balanceBefore);
  const [level, setLevel] = useState<LevelState>({ level: start.level, span: start.span, progress: start.from });
  const [open, setOpen] = useState(false);
  const [levelUp, setLevelUp] = useState(false);
  const chipRef = useRef<HTMLDivElement>(null);
  const walletCoinRef = useRef<HTMLSpanElement>(null);
  const lootCoinRef = useRef<HTMLSpanElement>(null);
  const xpChipRef = useRef<HTMLSpanElement>(null);
  const levelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    let cancelled = false;
    const flying = new Set<HTMLElement>();
    const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    const tween = (from: number, to: number, ms: number, apply: (value: number) => void) => new Promise<void>((resolve) => {
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / ms);
        apply(from + (to - from) * (1 - Math.pow(1 - k, 3)));
        if (k < 1 && !cancelled) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    const fly = (className: string, label: string, from: [number, number], to: [number, number], lift: number, duration: number, delay: number) => {
      const element = document.createElement("span");
      element.className = className;
      element.textContent = label;
      element.setAttribute("aria-hidden", "true");
      document.body.appendChild(element);
      flying.add(element);
      const [sx, sy] = from;
      const [tx, ty] = to;
      const jx = (Math.random() - 0.5) * 46;
      const jy = (Math.random() - 0.5) * 30;
      const mx = (sx + tx) / 2 + (Math.random() - 0.5) * 140;
      const my = Math.min(sy, ty) - lift - Math.random() * lift;
      const animation = element.animate([
        { transform: `translate(${sx + jx}px,${sy + jy}px) scale(.3)`, opacity: 0 },
        { transform: `translate(${sx + jx}px,${sy + jy}px) scale(1)`, opacity: 1, offset: 0.14 },
        { transform: `translate(${mx}px,${my}px) scale(1.15)`, opacity: 1, offset: 0.58 },
        { transform: `translate(${tx}px,${ty}px) scale(.55)`, opacity: 0.95 },
      ], { duration: duration + Math.random() * 200, delay, easing: "cubic-bezier(.45,.05,.25,1)", fill: "both" });
      return animation.finished.catch(() => undefined).then(() => { element.remove(); flying.delete(element); });
    };
    const settle = () => {
      setBalance(view.balanceAfter);
      const final = xpSegments(view.xpAfter, view.xpAfter)[0];
      setLevel({ level: final.level, span: final.span, progress: final.from });
    };
    // XP que não subiu (ou caiu) não anima: só mostra o estado final.
    const animateXp = view.xpGain > 0;

    (async () => {
      if (reducedMotion() || (view.coins <= 0 && !animateXp)) { settle(); return; }
      await wait(650);
      if (cancelled) return;
      if (view.coins > 0) {
        const count = Math.min(16, Math.max(2, Math.ceil(view.coins / 30)));
        const per = Math.floor(view.coins / count);
        let left = view.coins;
        const from = center(lootCoinRef.current);
        const to = center(walletCoinRef.current);
        lootCoinRef.current?.classList.add("is-glow");
        await Promise.all(Array.from({ length: count }, (_, index) => {
          const part = index === count - 1 ? left : per;
          left -= part;
          return fly("rs-fly rs-coin", "$", from, to, 60, 820, index * 55).then(() => {
            if (cancelled) return;
            setBalance((current) => current + part);
            pulse(chipRef.current);
          });
        }));
        lootCoinRef.current?.classList.remove("is-glow");
        if (cancelled) return;
      }
      setBalance(view.balanceAfter);
      if (animateXp) {
        await wait(150);
        const from = center(xpChipRef.current);
        const to = center(levelRef.current);
        await Promise.all(Array.from({ length: 8 }, (_, index) => fly("rs-fly rs-xpdot", "", from, to, 40, 700, index * 45)));
        if (cancelled) return;
        for (const segment of xpSegments(view.xpBefore, view.xpAfter)) {
          await tween(segment.from, segment.to, segment.levelUp ? 450 : 600, (value) => setLevel({ level: segment.level, span: segment.span, progress: value }));
          if (cancelled) return;
          if (segment.levelUp) {
            setLevelUp(true);
            pulse(levelRef.current, 1.1);
            window.setTimeout(() => setLevelUp(false), 1000);
          } else pulse(levelRef.current);
        }
      } else settle();
    })();
    return () => {
      cancelled = true;
      flying.forEach((element) => element.remove());
    };
  }, []);

  const fraction = level.span > 0 ? Math.min(1, level.progress / level.span) : 0;
  return <main className="rs-page" aria-labelledby="rs-title">
    <div className="rs-wallet">
      <button type="button" className="rs-back" onClick={onHome}>{t.common.backHub}</button>
      <div className="rs-hud">
        <div className={`rs-level${levelUp ? " is-levelup" : ""}`} ref={levelRef}>
          <svg viewBox="0 0 36 36" width="34" height="34" aria-hidden="true"><circle cx="18" cy="18" r="15" fill="none" stroke="rgba(199,182,143,.8)" strokeWidth="4" /><circle cx="18" cy="18" r="15" fill="none" stroke="#2F6F6A" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${ARC * fraction} ${ARC}`} transform="rotate(-90 18 18)" /></svg>
          <span><b>{t.result.level(level.level)}</b><small>{Math.round(level.progress)} / {level.span} XP</small></span>
        </div>
        <div className="rs-coinchip" ref={chipRef}><span className="rs-coin" ref={walletCoinRef} aria-hidden="true">$</span><strong>{format(balance)}<span className="sr-only"> {t.common.coins}</span></strong></div>
      </div>
    </div>

    <p className="sr-only" role="status">{t.result.srSummary(view.correct, view.total, view.coins, view.xpGain)}</p>
    <section className="rs-card">
      <span className="eyebrow">{view.eyebrow}</span>
      <h1 id="rs-title" className="rs-title">{view.title}</h1>
      <div className="rs-score">
        <div className="rs-ring" role="img" aria-label={t.result.pctAria(view.pct)}>
          <svg viewBox="0 0 132 132" width="88" height="88" aria-hidden="true"><circle cx="66" cy="66" r="58" fill="var(--paper)" stroke="rgba(199,182,143,.7)" strokeWidth="9" /><circle cx="66" cy="66" r="58" fill="none" stroke="#2F6F6A" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${RING * view.pct / 100} ${RING}`} transform="rotate(-90 66 66)" /></svg>
          <b>{view.pct}%</b>
        </div>
        <div className="rs-scoretext"><b>{t.result.score(view.correct, view.total)}</b><small>{view.duration} · {view.paceLabel}</small>{view.mapError && <small className="rs-maperr">{t.result.meanError} <b>{formatKm(view.mapError.km)}</b>{view.mapError.goalKm !== null && (view.mapError.km < view.mapError.goalKm ? t.result.withinGoal(formatKm(view.mapError.goalKm)) : t.result.goalAsks(formatKm(view.mapError.goalKm)))}</small>}</div>
        <div className="rs-loot">
          <span className="rs-coin rs-loot-coin" ref={lootCoinRef} aria-hidden="true">$</span>
          <div><b>+{format(view.coins)}</b><small>{t.result.coinsLine(format(view.balanceBefore), format(view.balanceAfter))}</small></div>
          {view.xpGain > 0 && <span className="rs-xp" ref={xpChipRef}>+{view.xpGain} XP</span>}
        </div>
      </div>
      {duel && <DuelPanel duel={duel} onLeague={onLeague} />}
      {view.training && <p className="rs-note">{t.result.trainingNote}</p>}
      {view.chips.length > 0 && <div className="rs-chips">{view.chips.map((chip) => <span key={chip.key}><Icon type={CHIP_ICON[chip.key]} />{chip.text}</span>)}</div>}
      {view.lines.length > 0 && <>
        <button type="button" className="rs-toggle" aria-expanded={open} aria-controls="rs-details" onClick={() => setOpen((value) => !value)}>{open ? t.result.hideDetails : t.result.showDetails} <Icon type="chevron" /></button>
        <div className={`rs-details${open ? " is-open" : ""}`} id="rs-details" hidden={!open}>
          <ul>{view.lines.map((line) => <li key={line.key}><span><b>{line.label}</b><small>{line.note}</small></span><strong>+{format(line.coins)}</strong></li>)}</ul>
        </div>
      </>}
      <div className="rs-actions">
        <button type="button" className="rs-btn primary" onClick={onAgain}><Icon type="repeat" />{t.result.again}<span className="rs-lbl">{t.result.againTail}</span></button>
        <button type="button" className="rs-btn" aria-label={t.result.adjustAria} onClick={onAdjust}><Icon type="sliders" /><span className="rs-lbl">{t.result.adjust}</span></button>
        <button type="button" className="rs-btn" aria-label={t.result.homeAria} onClick={onHome}><Icon type="home" /><span className="rs-lbl">{t.result.home}</span></button>
      </div>
    </section>
  </main>;
}

const signedTrophies = (value: number) => (value > 0 ? `+${format(value)}` : value < 0 ? `−${format(Math.abs(value))}` : "0");
const leagueTitle = (trophies: number) => { const status = leagueOf(trophies); return leagueLabel(status.league, status.division); };

// Placar do duelo, troféus ganhos ou perdidos, mudança de liga e marcos que renderam moedas.
function DuelPanel({ duel, onLeague }: { duel: DuelView; onLeague?: () => void }) {
  const before = leagueOf(duel.trophiesBefore);
  const after = leagueOf(duel.trophiesAfter);
  const moved = after.index !== before.index ? (after.index > before.index ? "up" : "down") : null;
  return <section className={`rs-duel is-${duel.outcome}`} aria-label={t.duel.result.eyebrow(duel.botName)}>
    <div className="rs-duel-head"><Icon type="swords" /><span><b>{t.duel.result[duel.outcome]}</b><small>{t.duel.result.eyebrow(duel.botName)} · {styleLabel(duel.botStyle, duel.botSpecialty)}</small></span></div>
    <div className="rs-duel-vs" role="img" aria-label={`${t.duel.result.you} ${duel.playerCorrect}, ${duel.botName} ${duel.botCorrect}`}>
      <span><small>{t.duel.result.you}</small><b>{duel.playerCorrect}</b></span><em>x</em><span><small>{duel.botName}</small><b>{duel.botCorrect}</b></span>
    </div>
    <div className="rs-duel-trophies"><Icon type="achievements" /><b>{signedTrophies(duel.delta)}</b><small>{t.duel.result.trophies} · {t.duel.result.total(format(duel.trophiesAfter))} · {leagueTitle(duel.trophiesAfter)}</small></div>
    {duel.tiebreak && <p className="rs-duel-note">{t.duel.result.tiebreak}</p>}
    {moved && <p className={`rs-duel-note is-${moved}`}>{moved === "up" ? t.duel.result.promoted(leagueTitle(duel.trophiesAfter)) : t.duel.result.demoted(leagueTitle(duel.trophiesAfter))}</p>}
    {duel.milestones.map((milestone) => <p key={milestone.id} className="rs-duel-note is-up rs-duel-milestone"><Icon type="star" size={15} />{t.duel.result.milestone(milestoneLabel(milestone), format(milestone.coins))}</p>)}
    {onLeague && <button type="button" className="rs-duel-link" onClick={onLeague}>{t.duel.result.openLeague}</button>}
  </section>;
}
