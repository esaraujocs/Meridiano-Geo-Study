import { useEffect, useMemo, useRef, useState } from "react";
import { MUSEUM_PIECES, museumPieceRights, museumPieceText, type MuseumPiece } from "../domain/museum";
import { fundMuseumExpedition, queryMuseum, type MuseumSnapshot } from "../domain/museum-store";
import { formatNumber, locale } from "../domain/i18n";
import { museumCopy } from "./museum-copy";
import "./museum-view.css";

type Props = { onEconomyRefresh?: () => void | Promise<void> };
const copy = museumCopy[locale];
const money = (amount: number) => formatNumber(amount);

function ArtifactDialog({ piece, onClose }: { piece: MuseumPiece; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    bodyRef.current?.focus({ preventScroll: true });
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  const text = museumPieceText(piece);
  return <dialog ref={ref} className="museum-dialog" aria-labelledby="museum-dialog-title" onClose={onClose}
    onClick={(event) => { if (event.target === event.currentTarget) ref.current?.close(); }}>
    <div className="museum-dialog-inner" ref={bodyRef} tabIndex={-1}>
      <div className="museum-dialog-image"><img src={piece.image} alt={`${text.title} · ${text.subtitle}`} /></div>
      <div className="museum-dialog-content">
        <div className="museum-dialog-top"><span className="museum-label">{copy.detail}</span><button className="museum-btn" type="button" onClick={() => ref.current?.close()}>{copy.close}</button></div>
        <h2 id="museum-dialog-title">{text.title}</h2><p className="museum-subtitle">{text.subtitle}</p>
        <p className="museum-detail">{text.detail}</p>
        <div className="museum-facts">
          <span className="museum-fact"><small>{copy.author}</small><b>{piece.author}</b></span>
          <span className="museum-fact"><small>{copy.institution}</small><b>{piece.institution}</b></span>
          <span className="museum-fact"><small>{copy.year}</small><b>{piece.year}</b></span>
        </div>
        <div className="museum-dialog-links">
          <a href={piece.sourceUrl} target="_blank" rel="noopener noreferrer">{copy.source}</a>
          <a href={piece.rightsUrl} target="_blank" rel="noopener noreferrer">{copy.rights}</a>
          <p>{museumPieceRights(piece)}</p>
        </div>
      </div>
    </div>
  </dialog>;
}

export function MuseumView({ onEconomyRefresh }: Props) {
  const [snapshot, setSnapshot] = useState<MuseumSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success" | "pending" | "refresh-error"; text: string } | null>(null);
  const [selected, setSelected] = useState<MuseumPiece | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const lastTrigger = useRef<HTMLElement | null>(null);
  const owned = useMemo(() => new Set(snapshot?.owned ?? []), [snapshot?.owned]);
  const next = snapshot?.nextId ? MUSEUM_PIECES.find((piece) => piece.id === snapshot.nextId) : undefined;
  const load = async () => {
    setLoadError(false);
    try { setSnapshot(await queryMuseum()); }
    catch { setLoadError(true); }
  };
  const refreshCommittedPurchase = async () => {
    const outcomes = await Promise.allSettled([
      Promise.resolve().then(() => onEconomyRefresh?.()),
      queryMuseum().then((fresh) => { setSnapshot(fresh); }),
    ]);
    const ok = outcomes.every((outcome) => outcome.status === "fulfilled");
    setNotice(ok ? { kind: "success", text: copy.success } : { kind: "refresh-error", text: copy.refreshFailed });
    return ok;
  };
  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!selected) {
      const trigger = lastTrigger.current;
      if (trigger?.isConnected) requestAnimationFrame(() => trigger.focus());
      return;
    }
    const id = selected.id;
    return () => {
      if (lastTrigger.current?.dataset.museumPiece === id) {
        const trigger = lastTrigger.current;
        requestAnimationFrame(() => { if (trigger.isConnected) trigger.focus(); });
      }
    };
  }, [selected]);

  const openArtifact = (piece: MuseumPiece, trigger: HTMLElement) => {
    lastTrigger.current = trigger;
    setSelected(piece);
  };
  const purchase = async () => {
    if (!next || !snapshot || !confirming || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice({ kind: "pending", text: copy.funding });
    try {
      const success = await fundMuseumExpedition(next.id);
      if (!success) {
        const refreshed = await queryMuseum().catch(() => null);
        if (refreshed) setSnapshot(refreshed);
        setConfirming(false);
        setNotice(refreshed?.owned.includes(next.id)
          ? { kind: "success", text: copy.ownershipUpdated }
          : { kind: "error", text: (refreshed?.balance ?? snapshot.balance) < next.cost ? copy.fundingInsufficient : copy.fundingError });
        return;
      }
      const updatedOwned = [...snapshot.owned, next.id];
      setSnapshot({
        balance: snapshot.balance - next.cost,
        owned: updatedOwned,
        nextId: MUSEUM_PIECES.find((piece) => !updatedOwned.includes(piece.id))?.id ?? null,
        spent: snapshot.spent + next.cost,
      });
      setConfirming(false);
      setNotice({ kind: "success", text: copy.success });
      setRevealedId(next.id);
      window.setTimeout(() => setRevealedId((current) => current === next.id ? null : current), 1400);
      await refreshCommittedPurchase();
    } catch {
      setNotice({ kind: "error", text: copy.fundingError });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (loadError) return <section className="museum" aria-label={copy.title}>
    <div className="museum-load-error" role="alert"><p>{copy.loadError}</p><button className="museum-btn primary" type="button" onClick={() => void load()}>{copy.retry}</button></div>
  </section>;
  if (!snapshot) return <section className="museum" aria-label={copy.title} aria-busy="true"><div className="museum-skeleton"><span className="museum-sr-only" role="status">{copy.loading}</span></div></section>;

  const count = owned.size;
  const remaining = next ? Math.max(0, snapshot.balance - next.cost) : snapshot.balance;
  return <section className="museum" aria-label={copy.title}>
    <header className="museum-hero">
      <div><span className="museum-kicker">{copy.eyebrow}</span><h2>{copy.title}</h2><p>{copy.intro}</p></div>
      <div className="museum-progress" aria-live="polite"><strong>{String(count).padStart(2, "0")} / {MUSEUM_PIECES.length}</strong><span>{copy.owned(count, MUSEUM_PIECES.length)}</span></div>
    </header>
    <aside className="museum-note"><p>{copy.noGameplay}</p><p>{copy.unavailable}</p><p>{copy.localStorage}</p></aside>

    {next ? <section aria-labelledby="museum-expedition-title">
      <div className="museum-section-head"><h3 id="museum-expedition-title">{copy.expedition}</h3><span>{copy.archive} · {count + 1}/{MUSEUM_PIECES.length}</span></div>
      <article className="museum-expedition">
        <div className="museum-expedition-art" aria-hidden="true"><span className="museum-orbit" /></div>
        <div className="museum-expedition-copy">
          <span className="museum-label">{copy.next}</span><h4>{museumPieceText(next).title}</h4><p className="museum-subtitle">{museumPieceText(next).subtitle}</p>
          <p className="museum-teaser">{museumPieceText(next).description}</p>
          <div className="museum-facts">
            <span className="museum-fact"><small>{copy.cost}</small><b>{money(next.cost)}</b></span>
            <span className="museum-fact"><small>{copy.balance}</small><b>{money(snapshot.balance)}</b></span>
            {snapshot.balance >= next.cost && <span className="museum-fact"><small>{copy.remaining(money(remaining))}</small><b>{money(remaining)}</b></span>}
          </div>
          {snapshot.balance < next.cost && <p className="museum-alert" role="status">{copy.shortfall(money(next.cost - snapshot.balance))}</p>}
          {confirming && <div className="museum-confirm" role="group" aria-label={copy.confirmLine(museumPieceText(next).title, money(next.cost))}>
            <p>{copy.confirmLine(museumPieceText(next).title, money(next.cost))}</p>
            <div className="museum-actions">
              <button className="museum-btn primary" data-action="museum-confirm" type="button" disabled={busy || snapshot.balance < next.cost} onClick={() => void purchase()}>{busy ? copy.funding : copy.confirm}</button>
              <button className="museum-btn" data-action="museum-cancel" type="button" disabled={busy} onClick={() => setConfirming(false)}>{copy.cancel}</button>
            </div>
          </div>}
          {!confirming && <div className="museum-actions"><button className="museum-btn primary" data-action="museum-prepare" type="button" disabled={busy || snapshot.balance < next.cost} onClick={() => { setNotice(null); setConfirming(true); }}>{copy.reveal}</button></div>}
        </div>
      </article>
    </section> : <div className="museum-end">{copy.fullCollection}<p>{copy.collectionEnd}</p></div>}

    {notice && <p className={`museum-alert ${notice.kind === "success" ? "success" : ""}`} role={notice.kind === "pending" ? "status" : notice.kind === "error" || notice.kind === "refresh-error" ? "alert" : "status"}>{notice.text}
      {notice.kind === "error" && <button className="museum-btn" data-action="museum-retry" type="button" disabled={busy} onClick={() => { setConfirming(false); setNotice(null); void load(); }}>{copy.retry}</button>}
      {notice.kind === "refresh-error" && <button className="museum-btn" data-action="museum-refresh" type="button" disabled={busy} onClick={() => void refreshCommittedPurchase()}>{copy.refreshRetry}</button>}
    </p>}

    <div className="museum-section-head"><h3>{copy.archive}</h3><span>{copy.owned(count, MUSEUM_PIECES.length)}</span></div>
    <div className="museum-grid">
      {MUSEUM_PIECES.map((piece, index) => {
        const isOwned = owned.has(piece.id);
        const isNext = piece.id === next?.id;
        const text = museumPieceText(piece);
        return <article className={`museum-piece${isOwned ? " is-owned" : ""}${revealedId === piece.id ? " is-reveal" : ""}`} key={piece.id} data-museum-piece-card={piece.id}>
          <div className="museum-piece-art">
            {isOwned ? <img src={piece.image} alt="" loading="lazy" decoding="async" /> : <span className="museum-lock-mark" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>}
          </div>
          <div className="museum-piece-copy">
            <div className="museum-piece-top"><span>{piece.year} · {isOwned ? copy.acquired : copy.locked}</span>{isNext && <span>{copy.expedition}</span>}</div>
            <h4>{text.title}</h4><p>{isOwned ? text.subtitle : text.description}</p>
            {isOwned && <button className="museum-btn" type="button" data-museum-piece={piece.id} aria-haspopup="dialog" onClick={(event) => openArtifact(piece, event.currentTarget)}>{copy.open}</button>}
          </div>
        </article>;
      })}
    </div>
    {selected && owned.has(selected.id) && <ArtifactDialog piece={selected} onClose={() => setSelected(null)} />}
  </section>;
}