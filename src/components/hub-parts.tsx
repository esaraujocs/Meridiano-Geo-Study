// Peças do Hub novo: carrossel dos modos, cartão do Duelo (a fila mora nele), Vitrine da Loja e Mecenato do Museu.
// Cada peça só recebe dados e devolve eventos; o Hub (screens.tsx) monta a grade.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { useElapsed } from "./pvp-offer";
import type { ArenaSearch } from "./duel-arenas";
import type { LadderCard } from "../domain/duel-view";
import type { Ladder } from "../domain/duel-modes";
import { DIVISION_SPAN } from "../domain/league";
import { SUPPLY_COST } from "../domain/supplies";
import { leagueLabel, nextStep } from "../domain/duel-labels";
import type { EconomySnapshot } from "../domain/economy-store";
import { pickShowcaseTheme } from "../domain/hub-showcase";
import { missingCoins } from "../domain/themes";
import { MUSEUM_PIECES, museumPieceById, museumPieceText } from "../domain/museum";
import { queryMuseum, type MuseumSnapshot } from "../domain/museum-store";
import { formatNumber as money, t } from "../domain/i18n";

// Prévias do Hub de cada tema (geradas por scripts/build-theme-previews.mjs). Sem a imagem, a amostra de cores ocupa o lugar.
const PREVIEWS = import.meta.glob("../assets/themes/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const previewFor = (id: string) => PREVIEWS[`../assets/themes/${id}.webp`];

const reducedMotion = () => document.documentElement.dataset.reducedMotion === "true" || matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Faixa de cartões que desliza na horizontal (setas, névoa na borda e pontos de página). Quem monta decide quantos cartões cabem (CSS). */
export function HubCarousel({ label, children }: { label: string; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ prev: false, next: false, page: 0, pages: 1 });
  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pages = max > 4 ? Math.max(2, Math.ceil((el.scrollWidth - 1) / el.clientWidth)) : 1;
    const page = max <= 4 ? 0 : el.scrollLeft >= max - 4 ? pages - 1 : Math.min(pages - 1, Math.round(el.scrollLeft / el.clientWidth));
    setView((current) => (current.prev === el.scrollLeft > 4 && current.next === el.scrollLeft < max - 4 && current.page === page && current.pages === pages ? current : { prev: el.scrollLeft > 4, next: el.scrollLeft < max - 4, page, pages }));
  }, []);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);
  const scrollTo = (left: number) => track.current?.scrollTo({ left, behavior: reducedMotion() ? "auto" : "smooth" });
  const step = (direction: 1 | -1) => { const el = track.current; if (el) scrollTo(el.scrollLeft + direction * el.clientWidth); };
  const goTo = (page: number) => { const el = track.current; if (el) scrollTo(page >= view.pages - 1 ? el.scrollWidth : page * el.clientWidth); };
  return <div className="hx-car">
    <div className="hx-track" ref={track} onScroll={measure} role="region" aria-label={label}>{children}</div>
    {view.next && <i className="hx-fog" aria-hidden="true" />}
    {view.prev && <button type="button" className="hx-arrow is-prev" aria-label={t.hub.prevMode} onClick={() => step(-1)}><Icon type="chevron" size={20} /></button>}
    {view.next && <button type="button" className="hx-arrow is-next" aria-label={t.hub.nextMode} onClick={() => step(1)}><Icon type="chevron" size={20} /></button>}
    {view.pages > 1 && <div className="hx-dots" aria-label={t.hub.carouselPosition}>{Array.from({ length: view.pages }, (_, index) => <button key={index} type="button" aria-label={t.hub.goToFamily(index + 1)} aria-current={view.page === index ? "true" : undefined} onClick={() => goTo(index)} />)}</div>}
  </div>;
}

/** Progresso dentro da divisão atual (0 a 100). */
const divisionProgress = (card: LadderCard) => {
  const { status } = card;
  if (status.nextDivisionAt === null || status.division === null) return 100;
  const start = status.floor + (status.division - 1) * DIVISION_SPAN;
  return Math.min(100, Math.max(0, ((card.trophies - start) / (status.nextDivisionAt - start)) * 100));
};

const LADDER_KEY = "carta-hub-ladder";

/** O Duelo no Hub: a escada (Mapas ou Bandeiras), a liga e os últimos 5 resultados; "Duelar" entra na fila (valendo) e, enquanto espera,
 *  dá para duelar contra um bot. Amistoso, Ranking e Amigos ficam à mão no próprio cartão. */
export function HubDuel({ cards, formatReady, formatCost, search, onLeague, onFriends }: {
  cards: readonly LadderCard[];
  formatReady: boolean;
  formatCost: number;
  search: ArenaSearch;
  onLeague?: () => void;
  onFriends?: () => void;
}) {
  const best = cards.reduce((top, card) => (card.trophies > top.trophies ? card : top), cards[0]);
  const [picked, setPicked] = useState<Ladder>(() => {
    try { const saved = localStorage.getItem(LADDER_KEY); if (cards.some((card) => card.ladder === saved)) return saved as Ladder; } catch { /* sem armazenamento */ }
    return best.ladder;
  });
  const { queue } = search;
  const searching = queue.state !== "idle" && queue.prefs !== null;
  // enquanto a fila está aberta o cartão acompanha a escada em que ela foi pedida
  const ladder: Ladder = searching ? (queue.prefs as { ladder: Ladder }).ladder : picked;
  const card = cards.find((item) => item.ladder === ladder) ?? best;
  const { status } = card;
  const label = leagueLabel(status.league, status.division);
  const step = nextStep(status);
  const errorHere = !searching && search.error?.ladder === card.ladder ? search.error.message : null;
  const choose = (next: Ladder) => { setPicked(next); try { localStorage.setItem(LADDER_KEY, next); } catch { /* sem armazenamento */ } };
  return <section className="hx-duel" data-fam="duelo" data-league={status.league} aria-label={t.duel.modeDuel}>
    <div className="hx-duel-top">
      <span className="hx-duel-ic" aria-hidden="true"><Icon type="swords" size={26} /></span>
      <div className="hx-duel-name"><h3>{t.duel.modeDuel}</h3><p>{t.hub.duelSub}</p></div>
      <button type="button" className="hx-pill" onClick={onLeague} aria-label={t.duel.chipAria(money(card.trophies), label)}><Icon type="achievements" size={13} /> {label} · {money(card.trophies)}</button>
    </div>
    <div className="hx-duel-mid">
      <div className="hx-ladder" role="group" aria-label={t.hub.ladderAria}>
        {cards.map((item) => <button key={item.ladder} type="button" aria-pressed={item.ladder === card.ladder} disabled={searching} onClick={() => choose(item.ladder)}>{t.duel.ladders[item.ladder]}</button>)}
      </div>
      <span className="hx-duel-form">
        {card.form.length === 0
          ? <small>{t.duel.arenas.noDuelsYet}</small>
          : <span className="ar-form" aria-label={t.duel.arenas.lastFive}>{card.form.map((outcome, index) => <i key={index} className={outcome} role="img" aria-label={t.duel.arenas.formAria[outcome]}>{t.duel.arenas.form[outcome]}</i>)}</span>}
      </span>
    </div>
    <div className="hx-duel-step" title={step ? t.duel.arenas.toNext(money(step.remaining), step.label) : t.duel.arenas.topLeague}>
      <span className="hx-dbar"><i style={{ width: `${divisionProgress(card)}%` }} /></span>
      <small>{step ? t.duel.arenas.toNext(money(step.remaining), step.label) : t.duel.arenas.topLeague}</small>
    </div>
    {searching ? <Searching ladder={card.ladder} search={search} formatReady={formatReady} formatCost={formatCost} /> : <div className="hx-duel-foot">
      <button type="button" className="hx-go" disabled={search.busy} onClick={() => search.onSearch(card.ladder)}><Icon type="swords" size={17} /> {t.duel.arenas.duel}</button>
      <div className="hx-duel-acts">
        <button type="button" onClick={() => search.onFriendly(card.ladder)}>{t.hub.duelFriendly}</button>
        {onLeague && <button type="button" onClick={onLeague}>{t.hub.duelRanking}</button>}
        {onFriends && <button type="button" onClick={onFriends}>{t.hub.duelFriends}</button>}
      </div>
      {errorHere && <div className="hx-duel-err" role="alert"><p>{errorHere}</p><button type="button" onClick={() => search.onBot(card.ladder)}>{t.duel.arenas.botNow}{!formatReady && <Icon type="lock" size={13} />}</button></div>}
    </div>}
  </section>;
}

function Searching({ ladder, search, formatReady, formatCost }: { ladder: Ladder; search: ArenaSearch; formatReady: boolean; formatCost: number }) {
  const { queue } = search;
  const wait = useElapsed(queue.since, queue.serverNow);
  const mode = queue.prefs?.mode === "friendly" ? t.pvp.modeFriendly : t.pvp.modeRanked;
  const status = queue.state === "offer" ? t.pvp.home.offerOpen : queue.state === "matched" ? t.pvp.home.matched : t.duel.arenas.searching;
  return <div className="hx-duel-foot is-search">
    <div className="hx-search" role="status" aria-live="polite"><span className="pvp-waiting-dot" aria-hidden="true" /><div><b>{status}</b><small>{t.duel.arenas.searchingDetail(mode, wait, queue.waiting)}</small></div></div>
    <div className="hx-duel-acts is-search">
      <button type="button" disabled={queue.state === "matched"} onClick={() => search.onBot(ladder)}>{t.duel.arenas.botWhileWaiting}{!formatReady && <Icon type="lock" size={13} />}</button>
      <button type="button" disabled={search.busy || queue.state === "matched"} onClick={search.onCancel}>{t.pvp.home.cancel}</button>
    </div>
    {!formatReady && <small className="hx-need">{t.duel.arenas.needFormat(money(formatCost))}</small>}
  </div>;
}

/** A Vitrine: um tema da Loja em destaque (o mais caro que cabe no saldo ou, se nenhum cabe, o mais perto). */
export function HubShowcase({ economy, onOpenStore }: { economy: EconomySnapshot | null | undefined; onOpenStore: () => void }) {
  const theme = economy ? pickShowcaseTheme(economy.balance, economy.unlocked) : null;
  const preview = theme ? previewFor(theme.id) : undefined;
  const missing = theme && economy ? missingCoins(theme.cost, economy.balance) : 0;
  return <section className="hx-showcase" aria-label={t.hub.showcase}>
    <header><h3>{t.hub.showcase}</h3><button type="button" className="hx-link" onClick={onOpenStore}>{t.hub.showcaseAll} <Icon type="arrow" size={14} /></button></header>
    {theme
      ? <button type="button" className="hx-showcase-body" onClick={onOpenStore} aria-label={`${theme.name} · ${money(theme.cost)}`}>
        <span className="hx-showcase-img" style={preview ? { backgroundImage: `url(${preview})` } : { background: `linear-gradient(90deg,${theme.swatches.map((color, index) => `${color} ${index * 25}% ${(index + 1) * 25}%`).join(",")})` }}>
          <i className="hx-tag">{t.hub.featured}</i>
        </span>
        <span className="hx-showcase-info">
          <span className="hx-showcase-name"><b>{theme.name}</b><span className="store-swatches" aria-hidden="true">{theme.swatches.map((color) => <i key={color} style={{ background: color }} />)}</span></span>
          <span className="hx-showcase-buy">
            <span className="hx-price"><i aria-hidden="true">$</i>{money(theme.cost)}</span>
            <span className={`hx-btn${missing > 0 ? " is-missing" : ""}`}>{missing > 0 ? t.store.missing(money(missing)) : t.store.buy}</span>
          </span>
        </span>
      </button>
      : <button type="button" className="hx-showcase-body is-supply" onClick={onOpenStore} aria-label={`${t.supplies.lupa.name} · ${money(SUPPLY_COST.lupa)}`}>
        <span className="hx-showcase-img is-supply"><Icon type="search" size={44} /><i className="hx-tag">{t.hub.showcaseDone}</i></span>
        <span className="hx-showcase-info">
          <span className="hx-showcase-name"><b>{t.supplies.lupa.name}</b></span>
          <span className="hx-showcase-buy"><span className="hx-price"><i aria-hidden="true">$</i>{money(SUPPLY_COST.lupa)}</span><span className="hx-btn">{t.store.buy}</span></span>
        </span>
      </button>}
  </section>;
}

/** O Mecenato: a próxima peça do Museu Meridiano (ou o acervo completo). Abre o Museu. */
export function HubMuseum({ balance, onOpen }: { balance: number; onOpen: () => void }) {
  const [snapshot, setSnapshot] = useState<MuseumSnapshot | null>(null);
  useEffect(() => { void queryMuseum().then(setSnapshot).catch(() => undefined); }, [balance]);
  const next = snapshot?.nextId ? museumPieceById(snapshot.nextId) : undefined;
  const shown = next ?? (snapshot ? MUSEUM_PIECES[MUSEUM_PIECES.length - 1] : MUSEUM_PIECES[0]);
  const text = museumPieceText(shown);
  const owned = new Set(snapshot?.owned ?? []);
  const done = Boolean(snapshot) && !next;
  return <button type="button" className="hx-museum" onClick={onOpen} aria-label={`${t.hub.museumName} · ${text.title}`}>
    <span className="hx-museum-img" style={{ backgroundImage: `url(${shown.image})` }} aria-hidden="true" />
    <span className="hx-museum-text">
      <small>{t.hub.museumName}</small>
      <b>{done ? t.hub.museumDone : text.title}</b>
      <span>{done ? t.hub.museumCount(owned.size, MUSEUM_PIECES.length) : `${text.subtitle}`}</span>
      <span className="hx-museum-dots" aria-hidden="true">{MUSEUM_PIECES.map((piece) => <i key={piece.id} className={owned.has(piece.id) ? "on" : ""} />)}<em>{t.hub.museumCount(owned.size, MUSEUM_PIECES.length)}</em></span>
    </span>
    <span className="hx-museum-act">
      {!done && next && <span className="hx-price"><i aria-hidden="true">$</i>{money(next.cost)}</span>}
      <span className="hx-btn is-light">{done ? t.hub.museumVisit : t.hub.museumReveal} <Icon type="arrow" size={14} /></span>
    </span>
  </button>;
}
