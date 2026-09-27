import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { useEnterKey } from "./use-enter-key";
import type { PvpRun } from "../domain/pvp-run";
import { t } from "../domain/i18n";

/** Quanto a pessoa tem para ver o que vem a seguir antes de o 2º tempo começar sozinho (o mesmo tempo do duelo contra bot). */
export const PVP_INTERLUDE_SECONDS = 5;

// Intervalo entre os dois tempos do duelo com amigo: cada jogador segue no próprio ritmo (não precisa esperar o amigo). O 2º tempo começa sozinho depois
// de alguns segundos; o botão só adianta.
export function PvpInterlude({ run, onContinue }: { run: PvpRun; onContinue: () => void }) {
  const [left, setLeft] = useState(PVP_INTERLUDE_SECONDS);
  const go = useRef(onContinue);
  go.current = onContinue;
  useEffect(() => {
    const deadline = performance.now() + PVP_INTERLUDE_SECONDS * 1000;
    const timer = window.setInterval(() => {
      const remaining = deadline - performance.now();
      if (remaining <= 0) { window.clearInterval(timer); go.current(); return; }
      setLeft(Math.ceil(remaining / 1000));
    }, 200);
    return () => window.clearInterval(timer);
  }, []);
  useEnterKey(onContinue);
  const done = run.done[0];
  const next = run.legs[1];
  if (!done || !next) return null;
  return (
    <main className="content rv-page">
      <section className="rv-card pvp-card">
        <span className="eyebrow">{t.pvp.subtitle(t.duel.ladders[run.ladder])}</span>
        <h1>{t.pvp.interlude.title(1)}</h1>
        <div className="rv-done">
          <b>{t.pvp.interlude.score(done.playerCorrect, done.rounds)}</b>
          <small>{t.duel.groups[run.legs[0].group]}</small>
        </div>
        <span className="rv-k">{t.pvp.interlude.next}</span>
        <ul className="rv-legs">
          <li className="rv-leg">
            <span className="rv-n">2º</span>
            <span className="rv-mode"><b>{t.duel.groups[next.group]}</b></span>
          </li>
        </ul>
        <span className="rv-auto" aria-hidden="true"><i style={{ animationDuration: `${PVP_INTERLUDE_SECONDS}s` }} /></span>
        <p className="rv-note">{t.pvp.interlude.auto(left)}</p>
        <button type="button" className="rs-btn primary rv-go" onClick={onContinue}><Icon type="swords" />{t.pvp.interlude.go}</button>
      </section>
    </main>
  );
}
