import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { formatNumber, t } from "../domain/i18n";

type Verb = "leave" | "restart";
type Single = { kind: "single"; run: () => void; verb: Verb };
type Sheet = { kind: "sheet"; onLeave: () => void; onRestart?: () => void; coins: number; xp: number };
type Pending = Single | Sheet;

/**
 * Sair (ou recomeçar) no meio da partida não paga moedas nem XP: só quem termina o baralho ganha.
 * Com pelo menos uma resposta dada, o botão pede confirmação antes de largar a partida.
 * `guard` é a confirmação simples (modos com o menu ⋯); `ask` abre a folha completa do novo topo do jogo,
 * que mostra o que ficaria pendente e oferece recomeçar.
 */
export function useLeaveGuard(): {
  noteAnswer: () => void;
  reset: () => void;
  guard: (action: () => void, verb?: Verb) => void;
  ask: (options: { onLeave: () => void; onRestart?: () => void; coins: number; xp: number }) => void;
  asking: boolean;
  dialog: ReactNode;
} {
  const answered = useRef(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const noteAnswer = useCallback(() => { answered.current += 1; }, []);
  const reset = useCallback(() => { answered.current = 0; }, []);
  const guard = useCallback((action: () => void, verb: Verb = "leave") => {
    if (answered.current > 0) setPending({ kind: "single", run: action, verb });
    else action();
  }, []);
  const ask = useCallback((options: { onLeave: () => void; onRestart?: () => void; coins: number; xp: number }) => {
    if (answered.current > 0) setPending({ kind: "sheet", ...options });
    else options.onLeave();
  }, []);
  const close = () => setPending(null);
  const dialog = !pending ? null
    : pending.kind === "single"
      ? <LeaveDialog rounds={answered.current} verb={pending.verb} onStay={close} onLeave={() => { const { run } = pending; close(); run(); }} />
      : <LeaveDialog
        rounds={answered.current}
        verb="leave"
        coins={pending.coins}
        xp={pending.xp}
        onStay={close}
        onLeave={() => { const { onLeave } = pending; close(); onLeave(); }}
        onRestart={pending.onRestart ? () => { const run = pending.onRestart!; close(); run(); } : undefined}
      />;
  return { noteAnswer, reset, guard, ask, asking: pending !== null, dialog };
}

function LeaveDialog({ rounds, verb, coins, xp, onStay, onLeave, onRestart }: {
  rounds: number; verb: Verb; coins?: number; xp?: number; onStay: () => void; onLeave: () => void; onRestart?: () => void;
}) {
  const stayRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    stayRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onStay(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStay]);
  const restart = verb === "restart";
  const sheet = coins !== undefined;
  return <div className="leave-backdrop" onPointerDown={(event) => event.stopPropagation()}>
    <div className="leave-card" role="alertdialog" aria-modal="true" aria-labelledby="leave-title" aria-describedby="leave-text">
      <h2 id="leave-title">{restart ? t.leave.restartTitle : t.leave.leaveTitle}</h2>
      <p id="leave-text">
        {t.leave.body(rounds, restart)}
        {" "}{t.leave.kept}
      </p>
      {sheet && <div className="leave-pending">
        <div><small>{t.leave.pendingCoins}</small><b>$ {formatNumber(coins!)}</b></div>
        <div><small>{t.leave.xpOnFinish}</small><b>+{xp}</b></div>
      </div>}
      <div className="leave-actions">
        <button ref={stayRef} type="button" className="button" onClick={onStay}>{t.leave.stay}</button>
        {onRestart && <button type="button" className="button leave-secondary" onClick={onRestart}>{t.leave.restart}</button>}
        <button type="button" className="button leave-quit" onClick={onLeave}>{restart ? t.leave.restartNoGain : t.leave.leaveNoGain}</button>
      </div>
    </div>
  </div>;
}
