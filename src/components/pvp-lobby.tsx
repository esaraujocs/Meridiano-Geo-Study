import { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons";
import { useEnterKey } from "./use-enter-key";
import { drawLegs, type Ladder } from "../domain/duel-modes";
import { inviteLink, PLAYER_NAME_MAX, type PvpInvite, type PvpMode, type PvpRoomView } from "../domain/pvp";
import { t } from "../domain/i18n";

// As três telas de antes do duelo com amigo começar: criar o convite (anfitrião), ver e aceitar o convite (amigo) e o lobby (os dois, pronto/pronto
// e a contagem regressiva). Depois que o servidor avisa "playing", o app.tsx troca de tela para o motor do jogo de sempre.
export type PvpLobbyView =
  | { kind: "setup"; ladder: Ladder; mode: PvpMode; busy: boolean; error: string | null }
  | { kind: "invite"; invite: PvpInvite | null; loading: boolean; busy: boolean; error: string | null }
  | { kind: "room"; room: PvpRoomView };

export function PvpLobby({ view, name, onNameChange, onModeChange, onCreate, onJoin, onDecline, onReady, onLeave, onBack }: {
  view: PvpLobbyView;
  name: string;
  onNameChange: (name: string) => void;
  onModeChange: (mode: PvpMode) => void;
  onCreate: () => void;
  onJoin: () => void;
  onDecline: () => void;
  onReady: (ready: boolean) => void;
  onLeave: () => void;
  onBack: () => void;
}) {
  if (view.kind === "setup") return <PvpSetup view={view} name={name} onNameChange={onNameChange} onModeChange={onModeChange} onCreate={onCreate} onBack={onBack} />;
  if (view.kind === "invite") return <PvpInviteScreen view={view} name={name} onNameChange={onNameChange} onJoin={onJoin} onDecline={onDecline} />;
  return <PvpRoom room={view.room} onReady={onReady} onLeave={onLeave} />;
}

// Painel "como funciona": preenche o vão ao lado do cartão no desktop (o cartão sozinho fica curto e sobra tela) e ajuda quem nunca desafiou um amigo.
function PvpHowItWorks() {
  const steps = [t.pvp.how.step1, t.pvp.how.step2, t.pvp.how.step3];
  return (
    <aside className="rv-card pvp-side">
      <h2>{t.pvp.how.title}</h2>
      <ol className="pvp-steps">{steps.map(([title, note], index) => <li key={index}><b>{index + 1}</b><div><strong>{title}</strong><span>{note}</span></div></li>)}</ol>
    </aside>
  );
}

const NameField = ({ name, onNameChange }: { name: string; onNameChange: (name: string) => void }) => (
  <label className="pvp-name">
    <span>{t.pvp.nameLabel}</span>
    <input type="text" value={name} maxLength={PLAYER_NAME_MAX} placeholder={t.pvp.namePlaceholder} onChange={(event) => onNameChange(event.target.value)} autoFocus name="pvp-nickname" autoComplete="off" data-1p-ignore data-lpignore="true" />
  </label>
);

function PvpSetup({ view, name, onNameChange, onModeChange, onCreate, onBack }: { view: Extract<PvpLobbyView, { kind: "setup" }>; name: string; onNameChange: (name: string) => void; onModeChange: (mode: PvpMode) => void; onCreate: () => void; onBack: () => void }) {
  const canCreate = name.trim().length > 0 && !view.busy;
  useEnterKey(() => { if (canCreate) onCreate(); });
  return (
    <main className="content rv-page pvp-page">
      <button type="button" className="back" onClick={onBack}>← {t.pvp.back}</button>
      <div className="pvp-layout">
      <section className="rv-card pvp-card">
        <span className="eyebrow">{t.pvp.subtitle(t.duel.ladders[view.ladder])}</span>
        <h1>{t.pvp.title}</h1>
        <NameField name={name} onNameChange={onNameChange} />
        <div className="pvp-modes" role="radiogroup" aria-label={t.pvp.title}>
          <button type="button" role="radio" aria-checked={view.mode === "friendly"} className={`pg-chip${view.mode === "friendly" ? " is-active" : ""}`} onClick={() => onModeChange("friendly")}>
            <b>{t.pvp.modeFriendly}</b><small>{t.pvp.modeFriendlyNote}</small>
          </button>
          <button type="button" role="radio" aria-checked={view.mode === "ranked"} className={`pg-chip${view.mode === "ranked" ? " is-active" : ""}`} onClick={() => onModeChange("ranked")}>
            <b>{t.pvp.modeRanked}</b><small>{t.pvp.modeRankedNote}</small>
          </button>
        </div>
        {view.error && <p className="pvp-error">{view.error}</p>}
        <button type="button" className="rs-btn primary rv-go" disabled={!canCreate} onClick={onCreate}><Icon type="swords" />{view.busy ? t.pvp.creating : t.pvp.create}</button>
      </section>
      <PvpHowItWorks />
      </div>
    </main>
  );
}

function PvpInviteScreen({ view, name, onNameChange, onJoin, onDecline }: { view: Extract<PvpLobbyView, { kind: "invite" }>; name: string; onNameChange: (name: string) => void; onJoin: () => void; onDecline: () => void }) {
  const canJoin = Boolean(view.invite && !view.invite.full && view.invite.phase === "open" && name.trim().length > 0 && !view.busy);
  useEnterKey(() => { if (canJoin) onJoin(); });
  return (
    <main className="content rv-page">
      <section className="rv-card pvp-card">
        {view.loading
          ? <p className="pvp-status">{t.pvp.invite.loading}</p>
          : !view.invite
            ? <>
              <h1>{t.pvp.invite.notFound}</h1>
              <button type="button" className="rs-btn primary" onClick={onDecline}>{t.common.backHub}</button>
            </>
            : <>
              <span className="eyebrow">{t.pvp.invite.detail(t.duel.ladders[view.invite.ladder], view.invite.mode === "friendly" ? t.pvp.modeFriendly : t.pvp.modeRanked)}</span>
              <h1>{t.pvp.invite.title(view.invite.hostName)}</h1>
              {view.invite.full || view.invite.phase !== "open"
                ? <p className="pvp-error">{t.pvp.invite.full}</p>
                : <>
                  <NameField name={name} onNameChange={onNameChange} />
                  {view.error && <p className="pvp-error">{view.error}</p>}
                  <div className="pvp-actions">
                    <button type="button" className="rs-btn primary rv-go" disabled={!canJoin} onClick={onJoin}><Icon type="swords" />{view.busy ? t.pvp.invite.joining : t.pvp.invite.join}</button>
                    <button type="button" className="rs-btn" onClick={onDecline}>{t.pvp.invite.decline}</button>
                  </div>
                </>}
            </>}
      </section>
    </main>
  );
}

function PvpRoom({ room, onReady, onLeave }: { room: PvpRoomView; onReady: (ready: boolean) => void; onLeave: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = inviteLink(location.origin, room.code);
  const copyLink = () => {
    navigator.clipboard?.writeText(link).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }).catch(() => undefined);
  };
  const shareLink = () => { if (navigator.share) void navigator.share({ url: link }).catch(() => undefined); else copyLink(); };
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (room.phase !== "countdown" || room.startAt === null) { setCountdown(null); return; }
    const remainingAt = room.startAt - room.serverNow;
    const deadline = performance.now() + remainingAt;
    const tick = () => setCountdown(Math.max(0, Math.ceil((deadline - performance.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [room.phase, room.startAt, room.serverNow]);

  if (room.phase === "closed") {
    const reason = room.closedReason === "host-left" ? t.pvp.lobby.hostLeft : room.closedReason === "expired" ? t.pvp.lobby.expired : t.pvp.lobby.cancelled;
    return <main className="content rv-page"><section className="rv-card pvp-card"><h1>{reason}</h1><button type="button" className="rs-btn primary" onClick={onLeave}>{t.common.backHub}</button></section></main>;
  }
  const bothReady = room.you.ready && room.opponent?.ready;
  // Os 2 tempos, assim que a semente chega (a partir do lobby, com o amigo já dentro): os dois veem os mesmos modos antes de ficar pronto.
  const legs = useMemo(() => (room.seed ? drawLegs(room.ladder, room.seed) : null), [room.seed, room.ladder]);
  return (
    <main className={`content rv-page${room.opponent ? "" : " pvp-page"}`}>
      <button type="button" className="back" onClick={onLeave}>← {t.pvp.lobby.leave}</button>
      <div className={room.opponent ? "" : "pvp-layout"}>
      <section className="rv-card pvp-card">
        <span className="eyebrow">{t.pvp.subtitle(t.duel.ladders[room.ladder])} · {room.mode === "friendly" ? t.pvp.modeFriendly : t.pvp.modeRanked}</span>
        <h1>{t.pvp.title}</h1>
        {!room.opponent && (
          <div className="pvp-share">
            <span className="pvp-code">{room.code}</span>
            <div className="pvp-actions">
              <button type="button" className="rs-btn primary" onClick={shareLink}><Icon type="swords" />{t.pvp.shareLink}</button>
              <button type="button" className="rs-btn" onClick={copyLink}>{copied ? t.pvp.linkCopied : t.pvp.copyLink}</button>
            </div>
            <p className="pvp-hint">{t.pvp.shareHint}</p>
            <p className="pvp-status">{t.pvp.waitingFriend}</p>
          </div>
        )}
        {room.opponent && (
          <>
            <div className="rv-vs">
              <div className="rv-side">
                <div className="ar-emblem lg-frame"><Icon type="achievements" size={30} /></div>
                <strong>{t.pvp.lobby.you}</strong>
                <small>{room.you.ready ? t.pvp.lobby.ready : t.pvp.lobby.opponentWaiting}</small>
              </div>
              <span className="rv-x">VS</span>
              <div className="rv-side">
                <div className="ar-emblem lg-frame"><b>{room.opponent.name.charAt(0).toUpperCase()}</b></div>
                <strong>{room.opponent.name}</strong>
                <small>{!room.opponent.connected ? t.pvp.lobby.disconnected : room.opponent.ready ? t.pvp.lobby.ready : t.pvp.lobby.opponentWaiting}</small>
              </div>
            </div>
            {legs && <div className="pvp-legs-preview">
              <span className="rv-k">{t.pvp.lobby.legsTitle}</span>
              <ul className="rv-legs">
                {legs.map((leg, index) => <li className="rv-leg" key={index}>
                  <span className="rv-n">{index + 1}º</span>
                  <span className="rv-mode"><b>{t.duel.groups[leg.group]}</b></span>
                </li>)}
              </ul>
            </div>}
            {countdown !== null
              ? <p className="pvp-countdown">{t.pvp.lobby.startingIn(countdown)}</p>
              : <button type="button" className={`rs-btn primary rv-go${room.you.ready ? " is-ready" : ""}`} onClick={() => onReady(!room.you.ready)}>
                <Icon type="swords" />{room.you.ready ? t.pvp.lobby.unready : t.pvp.lobby.notReady}
              </button>}
            {bothReady && countdown === null && <p className="pvp-status">{t.pvp.lobby.bothReady}</p>}
          </>
        )}
      </section>
      {!room.opponent && <PvpHowItWorks />}
      </div>
    </main>
  );
}
