import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Icon } from "./icons";
import { LEGS, LEG_ROUNDS, type DuelLeg } from "../domain/duel-modes";
import { sideTotals, type PvpRoomView } from "../domain/pvp";
import { formatNumber as format, t } from "../domain/i18n";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const ease = (value: number) => 1 - Math.pow(1 - value, 3);
const firstName = (name: string) => name.split(" ")[0] ?? name;
const msLabel = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`);
const reducedMotion = () => (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) || document.documentElement.dataset.reducedMotion === "true";

// Confete na vitória, cinzas na derrota (mesma ideia do duelo contra bot, ver duel-result.tsx, mas sem depender de liga/divisão: aqui é sempre a
// mesma medalha de espadas, com a cor do próprio tema — --lg é ajustada por script no card).
const WIN_COLORS = ["#4fe0a8", "#C49345", "#2F6F6A", "#F3E9D2"];
const ASH_COLORS = ["#8a7f6a", "#B65F47", "#d59685", "#a89d86"];
type Particle = { dx: number; dy: number; rotate: number; color: string; delay: number };
function makeParticles(count: number, loss: boolean): Particle[] {
  return Array.from({ length: count }, (_, index) => {
    if (loss) return { dx: Math.round((Math.random() - 0.5) * 380), dy: Math.round(80 + Math.random() * 200), rotate: Math.round(Math.random() * 120), color: ASH_COLORS[index % ASH_COLORS.length], delay: Math.random() * 0.5 };
    const angle = Math.random() * Math.PI * 2, distance = 110 + Math.random() * 200;
    return { dx: Math.round(Math.cos(angle) * distance), dy: Math.round(Math.sin(angle) * distance * 0.85 - 26), rotate: Math.round(Math.random() * 540 - 270), color: WIN_COLORS[index % WIN_COLORS.length], delay: Math.random() * 0.18 };
  });
}

// Resultado do duelo com amigo: a mesma linguagem visual do duelo contra bot (medalha, confete/cinzas, placar que sobe animado, tabela dos dois tempos),
// sem o que só faz sentido pra liga (barra de troféus, prêmios). Ao vivo enquanto o amigo ainda está jogando: mostra o que já dá pra saber e completa
// sozinho quando o servidor fecha o resultado.
export function PvpResult({ room, legs, ratingDelta, coinsGained, xpGained, onRematch, onHome }: {
  room: PvpRoomView;
  /** Os dois tempos sorteados pela semente da sala (para o nome do modo na tabela); null se a semente não chegou (nunca deveria, com o duelo já em andamento). */
  legs: readonly DuelLeg[] | null;
  /** Quanto a força do valendo mudou (null no amistoso, ou enquanto o resultado não sai). */
  ratingDelta: number | null;
  coinsGained: number;
  xpGained: number;
  onRematch: () => void;
  onHome: () => void;
}) {
  const you = sideTotals(room.you.legs, room.you.forfeited);
  const opponent = sideTotals(room.opponent?.legs ?? [[], []], room.opponent?.forfeited ?? false);
  const done = Boolean(room.result);
  const outcome = room.result?.outcome ?? null;
  const opponentName = room.opponent?.name ?? t.pvp.result.opponent;
  const won = outcome === "win";
  const lost = outcome === "loss";
  // Enquanto o amigo não termina: quantas das 20 rodadas ele já respondeu (não o placar, só o andamento), para o "esperando" não ficar tão vago.
  const opponentAnswered = opponent.legs.reduce((sum, leg) => sum + leg.answered, 0);
  const opponentTotalRounds = LEGS * LEG_ROUNDS;

  const still = useMemo(() => reducedMotion(), []);
  const [score, setScore] = useState<[number, number]>(still || !done ? [you.correct, opponent.correct] : [0, 0]);
  const particles = useMemo(() => makeParticles(outcome === "draw" ? 0 : won ? 26 : 18, lost), [outcome]);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!done || still) return;
    try { navigator.vibrate?.(lost ? [40] : [18, 50, 18]); } catch { /* sem vibração */ }
    let raf = 0; let cancelled = false;
    const start = performance.now();
    const step = (now: number) => {
      if (cancelled) return;
      const progress = clamp01((now - start) / 700);
      setScore([Math.round(you.correct * ease(progress)), Math.round(opponent.correct * ease(progress))]);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [done]);
  // a cor da medalha (--lg) é a do próprio tema (verde), sem depender de liga: o card ainda usa o mesmo esqueleto do duelo contra bot.
  useEffect(() => { cardRef.current?.style.setProperty("--lg", getComputedStyle(document.documentElement).getPropertyValue("--green") || "#2F6F6A"); }, []);

  const title = !done ? t.pvp.result.title : outcome === "win" ? t.pvp.result.win : outcome === "loss" ? t.pvp.result.loss : t.pvp.result.draw;
  const cardClass = `rs-card dr-card vh-card tier-1${outcome ? ` is-${outcome === "win" ? "win" : outcome === "loss" ? "loss" : "draw"}` : ""}${still ? "" : " fx"}`;

  return (
    <main className="content rv-page">
      <section className={cardClass} data-league="prata" ref={cardRef} aria-labelledby="pvp-rs-title">
        <p className="sr-only" role="status">{`${title}. ${t.pvp.result.you} ${you.correct}, ${opponentName} ${opponent.correct}.`}</p>
        <div className="vh-shine" aria-hidden="true" />
        <div className="dr-col dr-col-a">
          <div className="vh-hero">
            <div className="vh-medalwrap" aria-hidden="true">
              <span className="vh-ripple" /><span className="vh-ripple r2" />
              <div className="vh-medal lg-frame"><Icon type="swords" size={52} /></div>
              <span className={`vh-burst${lost ? " vh-ash" : ""}`}>{particles.map((particle, index) => <i key={index} style={{ "--dx": `${particle.dx}px`, "--dy": `${particle.dy}px`, "--r": `${particle.rotate}deg`, "--c": particle.color, "--d": `${particle.delay.toFixed(2)}s` } as CSSProperties} />)}</span>
            </div>
            <span className="eyebrow">{t.duel.result.eyebrow(t.duel.ladders[room.ladder], opponentName)}</span>
            <h1 id="pvp-rs-title" className="vh-title">{title}</h1>
            <div className="vh-pills">
              <span className="vh-pill calm">{room.mode === "friendly" ? t.pvp.modeFriendly : t.pvp.modeRanked}</span>
              {room.result?.tiebreak && <span className="vh-pill calm">{t.duel.result.tiebreak}</span>}
              {done && room.mode === "ranked" && ratingDelta !== null && <span className={`vh-pill ${ratingDelta >= 0 ? "up" : "down"}`}>{t.pvp.result.ratingChange(ratingDelta)}</span>}
            </div>
          </div>
          <div className="vh-score">
            <span aria-hidden="true" className={!outcome ? "" : won ? "w" : "l"}><small>{t.pvp.result.you}</small><b>{score[0]}</b></span>
            <em aria-hidden="true">x</em>
            <span aria-hidden="true" className={!outcome ? "" : won ? "l" : "w"}><small>{firstName(opponentName)}</small><b>{score[1]}</b></span>
            <p>{you.forfeited ? t.pvp.result.youLeft : room.opponent?.forfeited ? t.pvp.result.opponentLeft : ""}</p>
          </div>
          {/* Enquanto o resultado não sai (o amigo ainda jogando): banner ao vivo, não só uma pílula discreta entre as outras. */}
          {!done && <div className="pvp-waiting" role="status" aria-live="polite">
            <span className="pvp-waiting-dot" aria-hidden="true" />
            <div><b>{t.pvp.result.waitingOpponent}</b><small>{t.pvp.result.waitingProgress(firstName(opponentName), opponentAnswered, opponentTotalRounds)}</small></div>
          </div>}
        </div>
        <div className="dr-col dr-col-b">
          {legs && legs.length > 0 && <table className="dr-legs">
            <thead><tr><th><span className="sr-only">{t.duel.result.colLeg}</span></th><th>{t.pvp.result.you}</th><th>{firstName(opponentName)}</th></tr></thead>
            <tbody>
              {legs.map((leg, index) => <tr key={index}>
                <td>{t.duel.result.legTitle(index + 1, t.duel.groups[leg.group])}</td>
                <td>{you.legs[index]?.correct ?? 0}<small>{msLabel(you.legs[index]?.ms ?? null)}</small></td>
                <td>{opponent.legs[index]?.correct ?? 0}<small>{msLabel(opponent.legs[index]?.ms ?? null)}</small></td>
              </tr>)}
              <tr className="dr-time"><td>{t.duel.result.timeTotal}</td><td>{msLabel(you.ms)}</td><td>{msLabel(opponent.ms)}</td></tr>
            </tbody>
          </table>}
          {lost && coinsGained > 0 && <p className="dr-consol">{t.duel.result.consol}</p>}
          {coinsGained > 0 && <div className="dr-loot">
            <span className="rs-coin rs-loot-coin" aria-hidden="true">$</span>
            <div><b>+{format(coinsGained)}</b>{xpGained > 0 && <small>+{xpGained} XP</small>}</div>
          </div>}
        </div>
        <div className="rs-actions">
          <button type="button" className="rs-btn primary" onClick={onRematch}><Icon type="swords" />{room.origin === "queue" ? t.pvp.result.searchAgain : t.pvp.result.rematch}</button>
          <button type="button" className="rs-btn" onClick={onHome}><Icon type="home" /><span className="rs-lbl">{t.pvp.result.home}</span></button>
        </div>
      </section>
    </main>
  );
}
