import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { useEnterKey } from "./use-enter-key";
import { previewLegs, type DuelRun } from "../domain/duel-run";
import { LADDER_BASE_GROUP } from "../domain/duel-modes";
import { policyFor } from "../domain/economy-rules";
import { baseCoins } from "../domain/spoils";
import { formatNumber as money, t } from "../domain/i18n";

/** Quanto a pessoa tem para ver o próximo modo antes de o 2º tempo começar sozinho. */
export const INTERLUDE_SECONDS = 5;

// Intervalo entre os dois tempos: o que foi o 1º tempo e o que vem a seguir (com a regra de moedas, se for prévia).
// O 2º tempo começa sozinho depois de alguns segundos (o botão só adianta).
export function DuelInterlude({ run, unlocked, onContinue }: { run: DuelRun; unlocked: readonly string[]; onContinue: () => void }) {
  const [left, setLeft] = useState(INTERLUDE_SECONDS);
  const go = useRef(onContinue);
  go.current = onContinue;
  useEffect(() => {
    const deadline = performance.now() + INTERLUDE_SECONDS * 1000;
    const timer = window.setInterval(() => {
      const remaining = deadline - performance.now();
      if (remaining <= 0) { window.clearInterval(timer); go.current(); return; }
      setLeft(Math.ceil(remaining / 1000));
    }, 200);
    return () => window.clearInterval(timer);
  }, []);
  useEnterKey(onContinue);
  const done = run.done[0];
  const legs = previewLegs(run, unlocked);
  const first = legs[0];
  const next = legs[1];
  if (!done || !next) return null;
  const baseLabel = t.duel.groups[LADDER_BASE_GROUP[run.ladder]];
  const price = policyFor(next.leg.family, next.leg.variant, "mundo")?.cost ?? 0;
  return (
    <main className="content rv-page">
      <section className="rv-card">
        <span className="eyebrow">{t.duel.reveal.eyebrow(t.duel.ladders[run.ladder])}</span>
        <h1>{t.duel.interlude.done(1)}</h1>
        <div className="rv-done">
          <b>{t.duel.interlude.score(done.playerCorrect, done.rounds)}</b>
          <small>{t.duel.groups[first.leg.group]}</small>
        </div>
        <span className="rv-k">{t.duel.interlude.next}</span>
        <ul className="rv-legs">
          <li className={`rv-leg${next.owned ? "" : " is-prev"}`}>
            <span className="rv-n">2º</span>
            <span className="rv-mode">
              <b>{t.duel.groups[next.leg.group]}</b>
              <small>{next.owned ? t.duel.reveal.ownLine(next.leg.rounds, baseCoins(next.coin.variant)) : t.duel.reveal.previewLine(next.leg.rounds, baseLabel, baseCoins(next.coin.variant))}</small>
            </span>
            <span className="rv-tag">{!next.owned && <Icon type="lock" size={12} />}{next.owned ? t.duel.reveal.ownMode : t.duel.reveal.preview}</span>
            {!next.owned && price > 0 && <span className="rv-buy">{t.duel.reveal.getMode(money(price))}</span>}
          </li>
        </ul>
        <span className="rv-auto" aria-hidden="true"><i style={{ animationDuration: `${INTERLUDE_SECONDS}s` }} /></span>
        <p className="rv-note">{t.duel.interlude.auto(left)} {t.duel.interlude.leaveNote}</p>
        <button type="button" className="rs-btn primary rv-go" onClick={onContinue}><Icon type="swords" />{t.duel.interlude.go(2)}</button>
      </section>
    </main>
  );
}
