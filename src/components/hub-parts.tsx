// Peças do Hub novo: carrossel dos modos, cartão do Duelo (a fila mora nele), Vitrine da Loja e Mecenato do Museu.
// Cada peça só recebe dados e devolve eventos; o Hub (screens.tsx) monta a grade.
import { Children, useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Icon } from "./icons";
import { useElapsed } from "./pvp-offer";
import type { PvpQueueView } from "../domain/pvp";
import type { LadderCard } from "../domain/duel-view";
import type { Ladder } from "../domain/duel-modes";
import { DIVISION_SPAN } from "../domain/league";
import { FEATURED_SUPPLIES, SUPPLY_COST } from "../domain/supplies";
import { SupplyArt } from "./supply-art";
import { leagueLabel, nextStep } from "../domain/duel-labels";
import type { EconomySnapshot } from "../domain/economy-store";
import { pickShowcaseTheme } from "../domain/hub-showcase";
import { missingCoins } from "../domain/themes";
import { MUSEUM_PIECES, museumPieceById, museumPieceText } from "../domain/museum";
import { ROUTES, activeExpeditions, emptyProgress, isBack, nextStage, remainingMs, routeById, stageCost } from "../domain/mecenato";
import { useMecenato } from "./use-mecenato";
import { duration } from "./mecenato-view";
import { formatNumber as money, t } from "../domain/i18n";

// Prévias do Hub de cada tema (geradas por scripts/build-theme-previews.mjs). Sem a imagem, a amostra de cores ocupa o lugar.
const PREVIEWS = import.meta.glob("../assets/themes/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const previewFor = (id: string) => PREVIEWS[`../assets/themes/${id}.webp`];

const reducedMotion = () => document.documentElement.dataset.reducedMotion === "true" || matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Carrossel em laço: a fila de cartões aparece três vezes e, quando o deslize termina, a posição volta em silêncio para a cópia do meio,
 *  então as setas (e o toque) nunca chegam a um fim. Os vizinhos espiam dos dois lados (`--peek` no CSS) e clicar neles avança.
 *  Só a cópia do meio é interativa; as outras duas são `inert`, por isso o leitor de tela e o Tab veem cada cartão uma vez. */
export function HubCarousel({ label, children }: { label: string; children: ReactNode }) {
  const items = Children.toArray(children);
  const count = items.length;
  const loop = count > 1;
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  /** Índice (entre as cópias) do cartão que está na frente: decide qual das cópias de cada modo é a clicável. */
  const [lead, setLead] = useState(count);
  const activeRef = useRef(0);
  const target = useRef<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const stepWidth = useCallback(() => {
    const slides = track.current?.querySelectorAll<HTMLElement>(".hx-slide");
    // getBoundingClientRect devolve o passo fracionário; offsetLeft arredonda e o erro cresce a cada cartão
    return slides && slides.length > 1 ? slides[1].getBoundingClientRect().left - slides[0].getBoundingClientRect().left : 0;
  }, []);
  const indexAt = useCallback((width: number) => Math.round((track.current?.scrollLeft ?? 0) / width), []);
  /** Terminado o deslize: volta para a cópia do meio e guarda qual cartão está na frente. Se uma seta mandou rolar para um destino e a animação
   *  ainda não chegou (quadros lentos), espera mais um pouco em vez de cortá-la. */
  const settle = useCallback((attempt = 0) => {
    const el = track.current;
    const width = stepWidth();
    if (!el || !width || !loop) return;
    if (target.current !== null && Math.abs(el.scrollLeft - target.current * width) > Math.max(4, width * 0.04) && attempt < 15) {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => settle(attempt + 1), 100);
      return;
    }
    target.current = null;
    const wrapped = ((indexAt(width) % count) + count) % count;
    activeRef.current = wrapped;
    setActive(wrapped);
    const home = (count + wrapped) * width;
    if (Math.abs(el.scrollLeft - home) > 1) el.scrollLeft = home;
    setLead(count + wrapped);
  }, [count, indexAt, loop, stepWidth]);
  useLayoutEffect(() => {
    const el = track.current;
    if (!el || !loop) return;
    // só a LARGURA muda o passo; a altura mudar (barra de endereço do celular, janela baixa) não pode interromper um deslize em andamento
    let lastWidth = -1;
    const align = () => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      const width = stepWidth();
      if (width) el.scrollLeft = (count + activeRef.current) * width;
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(el);
    return () => observer.disconnect();
  }, [count, loop, stepWidth]);
  useEffect(() => {
    const el = track.current;
    if (!el || !loop) return;
    const done = () => settle();
    el.addEventListener("scrollend", done);
    return () => { el.removeEventListener("scrollend", done); window.clearTimeout(timer.current); };
  }, [loop, settle]);
  const onScroll = () => {
    const width = stepWidth();
    if (!loop || !width) return;
    const at = indexAt(width);
    setLead(at);
    setActive(((at % count) + count) % count);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => settle(), 120);
  };
  const move = (delta: number) => {
    const width = stepWidth();
    if (!width) return;
    target.current = (target.current ?? indexAt(width)) + delta;
    track.current?.scrollTo({ left: target.current * width, behavior: reducedMotion() ? "auto" : "smooth" });
    // não depende do evento de rolagem (que só vem junto de um quadro desenhado): o assentar também é agendado aqui
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => settle(), 160);
  };
  const goTo = (index: number) => {
    let delta = index - active;
    if (delta > count / 2) delta -= count;
    if (delta < -count / 2) delta += count;
    if (delta !== 0) move(delta);
  };
  /** Clicar num cartão que só aparece pela metade leva ele para a frente em vez de abri-lo. */
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const el = track.current;
    if (!el || !loop) return;
    const box = el.getBoundingClientRect();
    const peek = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    const slide = [...el.querySelectorAll<HTMLElement>(".hx-slide")].find((node) => { const rect = node.getBoundingClientRect(); return event.clientX >= rect.left && event.clientX <= rect.right; });
    if (!slide) return;
    const rect = slide.getBoundingClientRect();
    const toLeft = rect.left < box.left + peek - 3;
    const toRight = rect.right > box.right - peek + 3;
    if (!toLeft && !toRight) return;
    event.preventDefault();
    event.stopPropagation();
    move(toLeft ? -1 : 1);
  };
  // Um cartão de cada modo é o clicável: os `count` seguidos a partir do vizinho da esquerda. Atrelar ao "copy do meio" deixava inertes os cartões
  // que, depois de voltar para a esquerda no começo, caíam na cópia da direita (botões de Jogar sem resposta).
  const live = (copy: number, index: number) => !loop || (copy * count + index >= lead - 1 && copy * count + index <= lead - 2 + count);
  return <div className="hx-car" data-loop={loop ? "true" : undefined}>
    <div className="hx-track" ref={track} onScroll={onScroll} onClickCapture={onClickCapture} onPointerDown={() => { target.current = null; }} onWheel={() => { target.current = null; }} role="region" aria-label={label}>
      {Array.from({ length: loop ? 3 : 1 }, (_, copy) => items.map((child, index) => <div key={`${copy}-${index}`} className="hx-slide" aria-hidden={live(copy, index) ? undefined : true} inert={!live(copy, index)}>{child}</div>))}
    </div>
    {loop && <>
      <button type="button" className="hx-arrow is-prev" aria-label={t.hub.prevMode} onClick={() => move(-1)}><Icon type="chevron" size={20} /></button>
      <button type="button" className="hx-arrow is-next" aria-label={t.hub.nextMode} onClick={() => move(1)}><Icon type="chevron" size={20} /></button>
      <div className="hx-dots" aria-label={t.hub.carouselPosition}>{items.map((_, index) => <button key={index} type="button" aria-label={t.hub.goToFamily(index + 1)} aria-current={active === index ? "true" : undefined} onClick={() => goTo(index)} />)}</div>
    </>}
  </div>;
}

/** O que a arena faz com a fila de pessoas. "Duelar" busca uma pessoa (valendo) na escada; enquanto espera dá para duelar contra um bot (vale
 *  troféu, na transição) e, se alguém aparecer, a proposta chega em qualquer tela (aceitar anula o duelo contra o bot). */
export type ArenaSearch = {
  queue: PvpQueueView;
  /** Erro ao entrar na fila (sem conexão, por exemplo), na escada em que foi pedido: a arena oferece o bot direto. */
  error: { ladder: Ladder; message: string } | null;
  busy: boolean;
  onSearch: (ladder: Ladder) => void;
  onCancel: () => void;
  onBot: (ladder: Ladder) => void;
  onFriendly: (ladder: Ladder) => void;
};

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

/** A Vitrine: um tema da Loja em destaque (o mais caro que cabe no saldo ou, se nenhum cabe, o mais perto). Com todos os temas comprados, destaca os suprimentos. */
export function HubShowcase({ economy, onOpenStore, onOpenThemes }: { economy: EconomySnapshot | null | undefined; onOpenStore: () => void; onOpenThemes?: () => void }) {
  const theme = economy ? pickShowcaseTheme(economy.balance, economy.unlocked) : null;
  const preview = theme ? previewFor(theme.id) : undefined;
  const missing = theme && economy ? missingCoins(theme.cost, economy.balance) : 0;
  return <section className={`hx-showcase${theme ? "" : " is-supplies"}`} aria-label={t.hub.showcase}>
    <header><h3>{t.hub.showcase}</h3><button type="button" className="hx-link" onClick={onOpenStore}>{t.hub.showcaseAll} <Icon type="arrow" size={14} /></button></header>
    {theme
      ? <button type="button" className="hx-showcase-body" onClick={onOpenThemes ?? onOpenStore} aria-label={`${theme.name} · ${money(theme.cost)}`}>
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
      : <>
        <p className="hx-showcase-done"><i className="hx-tag">{t.hub.showcaseDone}</i></p>
        <ul className="hx-supplies">
          {FEATURED_SUPPLIES.map((id) => <li key={id}>
            <button type="button" onClick={onOpenStore} aria-label={`${t.supplies[id].name} · ${money(SUPPLY_COST[id])}`}>
              <span className="hx-supply-art" data-supply={id}><SupplyArt id={id} size={58} /></span>
              <b>{t.supplies[id].name}</b>
              <small>{t.supplies[id].short}</small>
              <span className="hx-price"><i aria-hidden="true">$</i>{money(SUPPLY_COST[id])}</span>
            </button>
          </li>)}
        </ul>
      </>}
  </section>;
}

/** O Mecenato (v2): o que está acontecendo no porto — a expedição que voltou, a que está no mar ou a próxima etapa da rota aberta. Abre o Mecenato. */
export function HubMecenato({ onOpen }: { onOpen: () => void }) {
  const view = useMecenato();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const active = view ? activeExpeditions(view) : [];
  const backRecord = view ? active.find((record) => isBack(record, view.progress[record.id] ?? emptyProgress(), now)) : undefined;
  const sailingRecord = active.find((record) => record !== backRecord);
  const route = ROUTES.find((item) => item.open)!;
  const next = view ? nextStage(route, view) : 0;
  const pieceOf = (record?: { route: string; stage: number }) => (record ? museumPieceById(routeById(record.route)?.stages[record.stage]?.piece ?? "") : undefined);
  const shownRecord = backRecord ?? sailingRecord;
  const nextPiece = next !== null ? museumPieceById(route.stages[next]?.piece ?? "") : undefined;
  const piece = pieceOf(shownRecord) ?? nextPiece ?? MUSEUM_PIECES[0];
  const text = museumPieceText(piece);
  const label = backRecord ? t.mecenato.hubBack : sailingRecord && view ? t.mecenato.hubSailing(duration(remainingMs(sailingRecord, view.progress[sailingRecord.id] ?? emptyProgress(), now))) : next !== null ? t.mecenato.hubNext : t.mecenato.hubDone;
  const owned = view ? MUSEUM_PIECES.filter((item) => view.ownedPieces.has(item.id)).length : 0;
  return <button type="button" className={`hx-museum${backRecord ? " is-back" : ""}`} onClick={onOpen} aria-label={`${t.hub.museumName} · ${label} · ${text.title}`}>
    <span className="hx-museum-img" style={{ backgroundImage: `url(${piece.image})` }} aria-hidden="true" />
    <span className="hx-museum-text">
      <small>{t.hub.museumName} · {label}</small>
      <b>{text.title}</b>
      <span>{text.subtitle}</span>
      <span className="hx-museum-dots" aria-hidden="true">{MUSEUM_PIECES.map((item) => <i key={item.id} className={view?.ownedPieces.has(item.id) ? "on" : ""} />)}<em>{t.mecenato.archiveCount(owned, MUSEUM_PIECES.length)}</em></span>
    </span>
    <span className="hx-museum-act">
      {!shownRecord && next !== null && <span className="hx-price"><i aria-hidden="true">$</i>{money(stageCost(route, next))}</span>}
      <span className="hx-btn is-light">{backRecord ? t.mecenato.land : shownRecord ? t.hub.museumVisit : next !== null ? t.mecenato.go : t.hub.museumVisit} <Icon type="arrow" size={14} /></span>
    </span>
  </button>;
}
