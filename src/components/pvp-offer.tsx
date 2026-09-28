import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Icon } from "./icons";
import type { Ladder } from "../domain/duel-modes";
import type { PvpMode, PvpOfferView, PvpQueueNotice, PvpQueueView } from "../domain/pvp";
import { t } from "../domain/i18n";

// A camada da fila por cima de qualquer tela: a proposta ("Adversário encontrado!"), o indicador de busca ativa e os avisos da fila.
// Fora de uma partida, a proposta é um diálogo. Dentro de uma partida é uma faixa que não cobre o jogo nem rouba o foco ou o Enter: no duelo o
// cronômetro nunca pausa, e um diálogo por cima custaria tempo de resposta.

/** O que aceitar a proposta encerra: nada, uma partida solo (sem moedas, como sair no meio) ou um duelo contra bot (anulado, sem troféus). */
export type OfferActivity = "none" | "solo" | "bot-duel";

export const formatClock = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/** Há quanto tempo (m:ss) a pessoa está na fila, andando sozinho a cada segundo a partir da última visão do servidor. */
export function useElapsed(since: number | null, serverNow: number): string {
  const base = useMemo(() => ({ at: performance.now(), elapsed: since === null ? 0 : Math.max(0, serverNow - since) }), [since, serverNow]);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (since === null) return;
    const timer = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  return formatClock(base.elapsed + Math.max(0, now - base.at));
}

/** Segundos que faltam, contados no relógio do aparelho a partir do que faltava quando a visão chegou. */
function useSecondsLeft(remainingMs: number): number {
  const [deadline] = useState(() => performance.now() + remainingMs);
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil(remainingMs / 1000)));
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - performance.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return left;
}

const otherLadder = (ladder: Ladder): Ladder => (ladder === "mapas" ? "bandeiras" : "mapas");
const otherMode = (mode: PvpMode): PvpMode => (mode === "friendly" ? "ranked" : "friendly");
const modeLabel = (mode: PvpMode) => (mode === "friendly" ? t.pvp.modeFriendly : t.pvp.modeRanked);

export function PvpQueueLayer({ queue, inGame, activity, showPill, notice, onAccept, onDecline, onOpenHome, onDismissNotice }: {
  queue: PvpQueueView;
  /** Numa partida (motor do jogo na tela): a proposta vira faixa. */
  inGame: boolean;
  activity: OfferActivity;
  /** Mostrar o indicador "Buscando duelo" (fora da tela da fila e fora de partidas). */
  showPill: boolean;
  /** Aviso da fila a mostrar (a tela da fila mostra os dela no próprio cartão). */
  notice: PvpQueueNotice | null;
  onAccept: () => void;
  onDecline: () => void;
  onOpenHome: () => void;
  onDismissNotice: () => void;
}) {
  const offer = queue.state === "offer" ? queue.offer : null;
  return (
    <>
      {offer && <OfferCard key={offer.id} offer={offer} serverNow={queue.serverNow} inGame={inGame} activity={activity} onAccept={onAccept} onDecline={onDecline} />}
      {!offer && showPill && queue.state === "waiting" && <QueuePill since={queue.since} serverNow={queue.serverNow} onOpen={onOpenHome} />}
      {!offer && notice && <NoticeToast notice={notice} onDismiss={onDismissNotice} />}
    </>
  );
}

function OfferCard({ offer, serverNow, inGame, activity, onAccept, onDecline }: { offer: PvpOfferView; serverNow: number; inGame: boolean; activity: OfferActivity; onAccept: () => void; onDecline: () => void }) {
  const left = useSecondsLeft(offer.expiresAt - serverNow);
  const dialogRef = useRef<HTMLDivElement>(null);
  // diálogo: o foco entra nele (leitor de tela anuncia); faixa dentro da partida: o foco fica onde está
  useEffect(() => { if (!inGame) dialogRef.current?.focus(); }, [inGame]);
  const switching = offer.switchLadder || offer.switchMode;
  const ladder = t.duel.ladders[offer.ladder];
  const mode = modeLabel(offer.mode);
  const swaps = [
    offer.switchLadder ? t.pvp.offer.switchTo(ladder, t.duel.ladders[otherLadder(offer.ladder)]) : null,
    offer.switchMode ? t.pvp.offer.switchTo(mode, modeLabel(otherMode(offer.mode))) : null,
  ].filter((item): item is string => Boolean(item));
  const titleId = `pvp-offer-title-${offer.id}`;
  const body = (
    <>
      <span className="eyebrow pvp-offer-kicker">{t.pvp.offer.kicker}</span>
      <strong id={titleId} className="pvp-offer-title">{t.pvp.offer.title(offer.opponent.name)}</strong>
      <span className="pvp-offer-detail">{t.pvp.offer.detail(ladder, mode, offer.opponent.rating)}</span>
      {switching && <p className="pvp-offer-switch"><b>{t.pvp.offer.switchTitle}:</b> {swaps.join(" · ")}</p>}
      {!offer.youAccepted && activity === "bot-duel" && <p className="pvp-offer-warn">{t.pvp.offer.endsBotDuel}</p>}
      {!offer.youAccepted && activity === "solo" && <p className="pvp-offer-warn">{t.pvp.offer.endsSolo}</p>}
      <div className="pvp-offer-actions">
        {offer.youAccepted
          ? <span className="pvp-offer-wait" role="status">{t.pvp.offer.waitingOther(offer.opponent.name)}</span>
          : <button type="button" className="rs-btn primary" onClick={onAccept}><Icon type="swords" />{t.pvp.offer.accept}</button>}
        <button type="button" className="rs-btn" onClick={onDecline}>{switching ? t.pvp.offer.declineSwitch : t.pvp.offer.decline}</button>
        <span className="pvp-offer-timer" aria-hidden="true">{t.pvp.offer.expires(left)}</span>
      </div>
    </>
  );
  if (inGame) return <aside className="pvp-offer is-banner" aria-label={t.pvp.offer.label} aria-live="polite">{body}</aside>;
  // Enter com o foco no próprio diálogo não pode chegar ao "Enter faz o botão principal" da tela de baixo (use-enter-key.ts ignora evento já cancelado)
  const holdEnter = (event: ReactKeyboardEvent<HTMLDivElement>) => { if (event.key === "Enter" && event.target === event.currentTarget) event.preventDefault(); };
  return (
    <div className="pvp-offer-backdrop">
      <div className="pvp-offer is-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef} onKeyDown={holdEnter}>{body}</div>
    </div>
  );
}

function QueuePill({ since, serverNow, onOpen }: { since: number | null; serverNow: number; onOpen: () => void }) {
  const wait = useElapsed(since, serverNow);
  return <button type="button" className="pvp-pill" onClick={onOpen}><span className="pvp-waiting-dot" aria-hidden="true" />{t.pvp.home.pill(wait)}</button>;
}

function NoticeToast({ notice, onDismiss }: { notice: PvpQueueNotice; onDismiss: () => void }) {
  // some sozinho depois de alguns segundos (o botão fecha antes)
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 8000);
    return () => window.clearTimeout(timer);
  }, [notice.at]);
  return (
    <div className="pvp-toast" role="status">
      <span>{t.pvp.notice[notice.kind]}</span>
      <button type="button" onClick={onDismiss} aria-label={t.pvp.notice.dismiss}>×</button>
    </div>
  );
}
