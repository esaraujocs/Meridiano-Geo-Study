import { Icon } from "./icons";
import { NameField } from "./pvp-lobby";
import { useElapsed } from "./pvp-offer";
import type { Ladder } from "../domain/duel-modes";
import type { PvpMode, PvpProfileView, PvpQueueNotice, PvpQueueView, QueuePrefs } from "../domain/pvp";
import { t } from "../domain/i18n";

// Entrada do duelo entre pessoas: o aviso de fase de testes e as duas portas — "Buscar duelo" (a fila) e "Convidar amigo" (o convite por código, sem
// mudança). Buscando, mostra há quanto tempo e quantos estão na fila; dá para ir jogar contra os bots enquanto isso (a proposta aparece em qualquer tela).
const LADDERS: readonly Ladder[] = ["mapas", "bandeiras"];
const MODES: readonly PvpMode[] = ["friendly", "ranked"];
const modeLabel = (mode: PvpMode) => (mode === "friendly" ? t.pvp.modeFriendly : t.pvp.modeRanked);

export function PvpHome({ prefs, onPrefsChange, name, onNameChange, queue, profile, busy, error, notice, onDismissNotice, onSearch, onCancel, onInvite, onPlayBots, onBack }: {
  prefs: QueuePrefs;
  onPrefsChange: (prefs: QueuePrefs) => void;
  name: string;
  onNameChange: (name: string) => void;
  queue: PvpQueueView;
  /** Força e V/D/E guardados no servidor (null enquanto não chegou ou sem conexão). */
  profile: PvpProfileView | null;
  busy: boolean;
  error: string | null;
  notice: PvpQueueNotice | null;
  onDismissNotice: () => void;
  onSearch: () => void;
  onCancel: () => void;
  onInvite: () => void;
  onPlayBots: () => void;
  onBack: () => void;
}) {
  const searching = queue.state !== "idle";
  const canSearch = name.trim().length > 0 && !busy;
  const wait = useElapsed(queue.since, queue.serverNow);
  const status = queue.state === "offer" ? t.pvp.home.offerOpen : queue.state === "matched" ? t.pvp.home.matched : t.pvp.home.waitingTitle;
  const steps = [t.pvp.home.how1, t.pvp.home.how2, t.pvp.home.how3];
  return (
    <main className="content rv-page pvp-page">
      <button type="button" className="back" onClick={onBack}>{t.common.backHub}</button>
      <div className="pvp-layout">
        <section className="rv-card pvp-card" aria-labelledby="pvp-home-title">
          <span className="eyebrow">{t.pvp.home.eyebrow}</span>
          <h1 id="pvp-home-title">{t.pvp.home.title}</h1>
          <p className="pvp-alpha" role="note">{t.pvp.home.alpha}</p>
          {notice && (
            <div className="pvp-notice" role="status">
              <span>{t.pvp.notice[notice.kind]}</span>
              <button type="button" onClick={onDismissNotice} aria-label={t.pvp.notice.dismiss}>×</button>
            </div>
          )}
          {!searching ? (
            <>
              <NameField name={name} onNameChange={onNameChange} />
              <h2 className="pvp-h2">{t.pvp.home.searchTitle}</h2>
              <div className="pvp-modes pvp-ladders" role="radiogroup" aria-label={t.pvp.home.ladderLabel}>
                {LADDERS.map((ladder) => (
                  <button key={ladder} type="button" role="radio" aria-checked={prefs.ladder === ladder} className={`pg-chip${prefs.ladder === ladder ? " is-active" : ""}`} onClick={() => onPrefsChange({ ...prefs, ladder })}>
                    <b>{t.duel.ladders[ladder]}</b>
                  </button>
                ))}
              </div>
              <div className="pvp-modes" role="radiogroup" aria-label={t.pvp.home.modeLabel}>
                {MODES.map((mode) => (
                  <button key={mode} type="button" role="radio" aria-checked={prefs.mode === mode} className={`pg-chip${prefs.mode === mode ? " is-active" : ""}`} onClick={() => onPrefsChange({ ...prefs, mode })}>
                    <b>{modeLabel(mode)}</b><small>{mode === "friendly" ? t.pvp.modeFriendlyNote : t.pvp.modeRankedNote}</small>
                  </button>
                ))}
              </div>
              <p className="pvp-hint pvp-search-note">{t.pvp.home.searchNote}</p>
              {error && <p className="pvp-error">{error}</p>}
              <button type="button" className="rs-btn primary rv-go" disabled={!canSearch} onClick={onSearch}><Icon type="swords" />{busy ? t.pvp.home.searching : t.pvp.home.search}</button>
              <div className="pvp-or" aria-hidden="true"><span>{t.pvp.home.or}</span></div>
              <button type="button" className="rs-btn pvp-invite-btn" onClick={onInvite}>
                <span><b>{t.pvp.home.invite}</b><small>{t.pvp.home.inviteNote}</small></span>
              </button>
            </>
          ) : (
            <>
              <div className="pvp-waiting" role="status" aria-live="polite">
                <span className="pvp-waiting-dot" aria-hidden="true" />
                <div>
                  <b>{status}</b>
                  {queue.prefs && <small>{t.pvp.home.waitingDetail(t.duel.ladders[queue.prefs.ladder], modeLabel(queue.prefs.mode), wait, queue.waiting)}</small>}
                </div>
              </div>
              {error && <p className="pvp-error">{error}</p>}
              <div className="pvp-actions pvp-queue-actions">
                <button type="button" className="rs-btn primary" onClick={onPlayBots}><Icon type="swords" />{t.pvp.home.playBots}</button>
                <button type="button" className="rs-btn" onClick={onCancel} disabled={busy || queue.state === "matched"}>{t.pvp.home.cancel}</button>
              </div>
            </>
          )}
        </section>
        <aside className="rv-card pvp-side">
          {profile && (
            <div className="pvp-rating">
              <span className="rv-k">{t.pvp.home.ratingTitle}</span>
              <strong>{profile.rating}</strong>
              <small>{t.pvp.home.record(profile.ranked.wins, profile.ranked.losses, profile.ranked.draws)}</small>
            </div>
          )}
          <h2>{t.pvp.home.howTitle}</h2>
          <ol className="pvp-steps">{steps.map(([title, note], index) => <li key={index}><b>{index + 1}</b><div><strong>{title}</strong><span>{note}</span></div></li>)}</ol>
        </aside>
      </div>
    </main>
  );
}
