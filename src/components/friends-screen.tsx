import { useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "./icons";
import type { Ladder } from "../domain/duel-modes";
import type { PvpMode } from "../domain/pvp";
import { FRIEND_CODE_LENGTH, normalizeFriendCode, type FriendView, type FriendsView } from "../domain/pvp-social";
import { formatNumber, t } from "../domain/i18n";

const LADDERS: readonly Ladder[] = ["mapas", "bandeiras"];
const MODES: readonly PvpMode[] = ["friendly", "ranked"];
const modeLabel = (mode: PvpMode) => (mode === "friendly" ? t.pvp.modeFriendly : t.pvp.modeRanked);

/** Círculo com a inicial do jogador (o nível com moldura fica só para o próprio perfil, ver level-badge.tsx). */
export function PlayerInitial({ name, online, size = "md" }: { name: string; online?: boolean; size?: "md" | "lg" }) {
  return (
    <span className={`fr-av${size === "lg" ? " is-lg" : ""}`} aria-hidden="true">
      {(name.trim().charAt(0) || "?").toUpperCase()}
      {online !== undefined && <i className={online ? "is-on" : ""} />}
    </span>
  );
}

// Amigos: o seu código, adicionar por código, pedidos recebidos e enviados, a lista (online, troféus, perfil, desafiar) e o desafio direto.
export function FriendsScreen({ view, loading, error, message, busy, onAdd, onRespond, onRemove, onOpenPlayer, onChallenge, onBack }: {
  view: FriendsView | null;
  loading: boolean;
  error: string | null;
  /** Resultado da última ação (pedido enviado, amizade feita…). */
  message: string | null;
  busy: boolean;
  onAdd: (code: string) => void;
  onRespond: (code: string, accept: boolean) => void;
  onRemove: (code: string) => void;
  onOpenPlayer: (code: string) => void;
  onChallenge: (code: string, ladder: Ladder, mode: PvpMode) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [ladder, setLadder] = useState<Ladder>("mapas");
  const [mode, setMode] = useState<PvpMode>("friendly");
  const clean = normalizeFriendCode(code).slice(0, FRIEND_CODE_LENGTH);
  const copy = async () => {
    if (!view) return;
    try { await navigator.clipboard.writeText(view.code); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* sem área de transferência */ }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (clean.length === FRIEND_CODE_LENGTH) { onAdd(clean); setCode(""); } };
  const how = [t.social.how1, t.social.how2, t.social.how3];
  return (
    <main className="content rv-page pvp-page fr-page">
      <button type="button" className="back" onClick={onBack}>{t.common.backHub}</button>
      <div className="pvp-layout">
        <section className="rv-card pvp-card fr-card" aria-labelledby="fr-title">
          <span className="eyebrow">{t.social.eyebrow}</span>
          <h1 id="fr-title">{t.social.title}</h1>
          {loading && !view && <p className="pvp-hint" role="status">{t.social.loading}</p>}
          {error && <p className="pvp-error" role="alert">{error}</p>}
          {message && <p className="pvp-notice fr-msg" role="status">{message}</p>}
          {view && <>
            <div className="fr-code">
              <div><span className="rv-k">{t.social.yourCode}</span><strong>{view.code}</strong><small>{t.social.codeHint}</small></div>
              <div className="fr-code-actions">
                <button type="button" className="rs-btn" onClick={() => void copy()}>{copied ? t.social.copied : t.social.copy}</button>
                <button type="button" className="rs-btn" onClick={() => onOpenPlayer(view.code)}>{t.social.myProfile}</button>
              </div>
            </div>
            <form className="fr-add" onSubmit={submit}>
              <label htmlFor="fr-add-code">{t.social.addTitle}</label>
              <div>
                <input id="fr-add-code" type="text" value={code} onChange={(event) => setCode(event.target.value)} placeholder={t.social.addPlaceholder} maxLength={10} autoComplete="off" autoCapitalize="characters" spellCheck={false} data-1p-ignore data-lpignore="true" />
                <button type="submit" className="rs-btn primary" disabled={busy || clean.length !== FRIEND_CODE_LENGTH}>{t.social.add}</button>
              </div>
            </form>
            {view.incoming.length > 0 && <FriendList title={t.social.incomingTitle} items={view.incoming} render={(friend) => <>
              <button type="button" className="rs-btn primary" disabled={busy} onClick={() => onRespond(friend.code, true)}>{t.social.accept}</button>
              <button type="button" className="rs-btn" disabled={busy} onClick={() => onRespond(friend.code, false)}>{t.social.decline}</button>
            </>} onOpenPlayer={onOpenPlayer} />}
            <FriendList title={t.social.friendsTitle(view.friends.length)} items={view.friends} empty={t.social.empty} showStatus render={(friend) => <>
              <button type="button" className="rs-btn primary" disabled={busy || !friend.online} title={friend.online ? undefined : t.social.challengeOffline} onClick={() => onChallenge(friend.code, ladder, mode)}><Icon type="swords" />{t.social.challenge}</button>
            </>} onOpenPlayer={onOpenPlayer} />
            {view.outgoing.length > 0 && <FriendList title={t.social.outgoingTitle} items={view.outgoing} render={(friend) => <>
              <button type="button" className="rs-btn" disabled={busy} onClick={() => onRemove(friend.code)}>{t.social.cancel}</button>
            </>} onOpenPlayer={onOpenPlayer} />}
          </>}
        </section>
        <aside className="rv-card pvp-side">
          <h2>{t.social.challengeTitle}</h2>
          <p className="pvp-hint">{t.social.challengeNote}</p>
          <div className="pvp-modes pvp-ladders" role="radiogroup" aria-label={t.pvp.home.ladderLabel}>
            {LADDERS.map((item) => <button key={item} type="button" role="radio" aria-checked={ladder === item} className={`pg-chip${ladder === item ? " is-active" : ""}`} onClick={() => setLadder(item)}><b>{t.duel.ladders[item]}</b></button>)}
          </div>
          <div className="pvp-modes" role="radiogroup" aria-label={t.pvp.home.modeLabel}>
            {MODES.map((item) => <button key={item} type="button" role="radio" aria-checked={mode === item} className={`pg-chip${mode === item ? " is-active" : ""}`} onClick={() => setMode(item)}><b>{modeLabel(item)}</b><small>{item === "friendly" ? t.pvp.modeFriendlyNote : t.pvp.modeRankedNote}</small></button>)}
          </div>
          <h2>{t.social.howTitle}</h2>
          <ol className="pvp-steps">{how.map(([title, note], index) => <li key={index}><b>{index + 1}</b><div><strong>{title}</strong><span>{note}</span></div></li>)}</ol>
        </aside>
      </div>
    </main>
  );
}

function FriendList({ title, items, empty, showStatus, render, onOpenPlayer }: {
  title: string;
  items: readonly FriendView[];
  empty?: string;
  showStatus?: boolean;
  render: (friend: FriendView) => ReactNode;
  onOpenPlayer: (code: string) => void;
}) {
  return (
    <section className="fr-list" aria-label={title}>
      <h2 className="pvp-h2">{title}</h2>
      {items.length === 0
        ? <p className="pvp-hint">{empty}</p>
        : <ul>{items.map((friend) => <li key={friend.code}>
          <button type="button" className="fr-who" onClick={() => onOpenPlayer(friend.code)} aria-label={t.social.openProfile(friend.name)}>
            <PlayerInitial name={friend.name} online={showStatus ? friend.online : undefined} />
            <span><b>{friend.name}</b><small>{showStatus ? `${friend.online ? t.social.online : t.social.offline} · ` : ""}{friend.ladders ? t.social.trophiesLine(formatNumber(friend.ladders.mapas.trophies), formatNumber(friend.ladders.bandeiras.trophies)) : t.social.noTrophies}</small></span>
          </button>
          <span className="fr-actions">{render(friend)}</span>
        </li>)}</ul>}
    </section>
  );
}
