import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Icon } from "./icons";
import type { SocialEvent } from "../domain/pvp-social";
import { t } from "../domain/i18n";

type Challenge = Extract<SocialEvent, { kind: "challenge" }>;

// Avisos de amizade (pedido recebido, pedido aceito) e o desafio de um amigo, por cima de qualquer tela. O desafio espera o fim da partida em andamento
// (quem chama só passa `challenge` fora do jogo): o convite fica aberto 20 min no servidor, então não precisa interromper ninguém.
export function SocialLayer({ notice, challenge, onDismissNotice, onOpenFriends, onJoin, onDeclineChallenge }: {
  notice: Exclude<SocialEvent, Challenge> | null;
  challenge: Challenge | null;
  onDismissNotice: () => void;
  onOpenFriends: () => void;
  onJoin: (challenge: Challenge) => void;
  onDeclineChallenge: () => void;
}) {
  return (
    <>
      {challenge && <ChallengeDialog key={`${challenge.room}:${challenge.at}`} challenge={challenge} onJoin={() => onJoin(challenge)} onDecline={onDeclineChallenge} />}
      {!challenge && notice && <SocialToast key={notice.at} notice={notice} onDismiss={onDismissNotice} onOpen={onOpenFriends} />}
    </>
  );
}

function ChallengeDialog({ challenge, onJoin, onDecline }: { challenge: Challenge; onJoin: () => void; onDecline: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const holdEnter = (event: ReactKeyboardEvent<HTMLDivElement>) => { if (event.key === "Enter" && event.target === event.currentTarget) event.preventDefault(); };
  const mode = challenge.mode === "friendly" ? t.pvp.modeFriendly : t.pvp.modeRanked;
  return (
    <div className="pvp-offer-backdrop">
      <div className="pvp-offer is-dialog" role="alertdialog" aria-modal="true" aria-labelledby="social-challenge-title" tabIndex={-1} ref={ref} onKeyDown={holdEnter}>
        <span className="eyebrow pvp-offer-kicker">{t.social.challengeKicker}</span>
        <strong id="social-challenge-title" className="pvp-offer-title">{t.social.challengedBy(challenge.from.name)}</strong>
        <span className="pvp-offer-detail">{t.pvp.invite.detail(t.duel.ladders[challenge.ladder], mode)}</span>
        <div className="pvp-offer-actions">
          <button type="button" className="rs-btn primary" onClick={onJoin}><Icon type="swords" />{t.pvp.invite.join}</button>
          <button type="button" className="rs-btn" onClick={onDecline}>{t.pvp.invite.decline}</button>
        </div>
      </div>
    </div>
  );
}

function SocialToast({ notice, onDismiss, onOpen }: { notice: Exclude<SocialEvent, Challenge>; onDismiss: () => void; onOpen: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 8000);
    return () => window.clearTimeout(timer);
  }, [notice.at]);
  return (
    <div className="pvp-toast social-toast" role="status">
      <span>{notice.kind === "request" ? t.social.toastRequest(notice.from.name) : t.social.toastAccepted(notice.from.name)}</span>
      <button type="button" className="social-open" onClick={onOpen}>{t.social.seeFriends}</button>
      <button type="button" onClick={onDismiss} aria-label={t.pvp.notice.dismiss}>×</button>
    </div>
  );
}
