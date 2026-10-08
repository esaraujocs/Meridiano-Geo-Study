// Peças do Hub novo: carrossel dos modos, cartão do Duelo (a fila mora nele), Vitrine da Loja e Mecenato do Museu.
// Cada peça só recebe dados e devolve eventos; o Hub (screens.tsx) monta a grade.
import { Children, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Icon } from "./icons";
import { useElapsed } from "./pvp-offer";
import type { PvpQueueView } from "../domain/pvp";
import type { LadderCard } from "../domain/duel-view";
import type { Ladder } from "../domain/duel-modes";
import { DIVISION_SPAN } from "../domain/league";
import { SUPPLY_COST, type SupplyId } from "../domain/supplies";
import { SupplyArt } from "./supply-art";
import { leagueLabel, nextStep } from "../domain/duel-labels";
import { SHOWCASE_INTERVAL_MS, SUPPLY_SETS } from "../domain/hub-showcase";
import { MUSEUM_PIECES, museumPieceById, museumPieceText } from "../domain/museum";
import { ROUTES, activeExpeditions, emptyProgress, isBack, nextStage, remainingMs, routeById, stageCost } from "../domain/mecenato";
import { useMecenato } from "./use-mecenato";
import { duration } from "./mecenato-view";
import { formatNumber as money, t } from "../domain/i18n";

const reducedMotion = () => document.documentElement.dataset.reducedMotion === "true" || matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Carrossel em laço: a fila de cartões aparece três vezes e, quando o deslize termina, a posição volta em silêncio para a cópia do meio,
 *  então as setas (e o toque) nunca chegam a um fim. Os vizinhos espiam dos dois lados (`--peek` no CSS) e clicar neles avança.
 *  Só a cópia do meio é interativa; as outras duas são `inert`, por isso o leitor de tela e o Tab veem cada cartão uma vez. */
/** Onde cada carrossel parou: voltar de outra tela (Loja, Mesa, partida) abre o Hub no mesmo cartão. Vale até recarregar a página. */
const carouselMemory = new Map<string, number>();
export function HubCarousel({ label, children }: { label: string; children: ReactNode }) {
  const items = Children.toArray(children);
  const count = items.length;
  const loop = count > 1;
  const track = useRef<HTMLDivElement>(null);
  const remembered = Math.min(carouselMemory.get(label) ?? 0, Math.max(0, count - 1));
  const [active, setActive] = useState(remembered);
  /** Índice (entre as cópias) do cartão que está na frente: decide qual das cópias de cada modo é a clicável. */
  const [lead, setLead] = useState(count + remembered);
  const activeRef = useRef(remembered);
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
    carouselMemory.set(label, wrapped);
    setActive(wrapped);
    const home = (count + wrapped) * width;
    if (Math.abs(el.scrollLeft - home) > 1) el.scrollLeft = home;
    setLead(count + wrapped);
  }, [count, indexAt, label, loop, stepWidth]);
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
 *  dá para duelar contra um bot. Amistoso e Ranking ficam à mão no próprio cartão (Amigos fica no cabeçalho). */
export function HubDuel({ cards, formatReady, formatCost, search, onLeague }: {
  cards: readonly LadderCard[];
  formatReady: boolean;
  formatCost: number;
  search: ArenaSearch;
  onLeague?: () => void;
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
      <div className="hx-duel-name"><h3>{t.duel.modeDuel}</h3></div>
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

/** Onde a Vitrine parou no rodízio: voltar ao Hub continua do mesmo set. */
let showcaseIndex = 0;
/**
 * Vitrine da Loja: só consumíveis (os temas ficam na Loja). Alterna os 3 conjuntos de `SUPPLY_SETS` em laço, trocando a cada SHOWCASE_INTERVAL_MS.
 * Para de trocar com o mouse ou o foco nela, com a aba escondida e com movimento reduzido (aí só os pontos trocam).
 */
export function HubShowcase({ onOpenStore, turn }: { onOpenStore: () => void; turn?: number }) {
  const [index, setIndex] = useState(() => showcaseIndex);
  const [paused, setPaused] = useState(false);
  const count = SUPPLY_SETS.length;
  const at = index % count;
  useEffect(() => { showcaseIndex = at; }, [at]);
  // no revezamento com o Mecenato quem troca o conjunto é a vez da Vitrine (`turn` sobe a cada vez dela), não o relógio daqui
  const first = useRef(true);
  useEffect(() => {
    if (turn === undefined) return;
    if (first.current) { first.current = false; return; }
    setIndex((value) => (value + 1) % count);
  }, [turn, count]);
  useEffect(() => {
    if (turn !== undefined || paused || reducedMotion()) return;
    const timer = window.setInterval(() => { if (!document.hidden) setIndex((value) => (value + 1) % count); }, SHOWCASE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [count, paused, turn]);
  const supplies = SUPPLY_SETS[at] as readonly SupplyId[];
  return <section className={`hx-showcase${turn !== undefined ? " is-turn" : ""}`} aria-label={t.hub.showcase} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <header><h3>{t.hub.showcase}</h3>
      <span className="hx-showcase-dots">{SUPPLY_SETS.map((_, dot) => <button key={dot} type="button" aria-current={dot === at} aria-label={t.hub.showcaseSet(dot + 1, count)} onClick={() => setIndex(dot)} />)}</span>
    </header>
    <div key={at} className="hx-showcase-slide">
      <ul className="hx-supplies">
        {supplies.map((id) => <li key={id}>
          <button type="button" onClick={onOpenStore} aria-label={`${t.supplies[id].name} · ${money(SUPPLY_COST[id])}`}>
            <span className="hx-supply-art" data-supply={id}><SupplyArt id={id} size={58} /></span>
            <b>{t.supplies[id].name}</b>
            <span className="hx-price"><i aria-hidden="true">$</i>{money(SUPPLY_COST[id])}</span>
          </button>
        </li>)}
      </ul>
    </div>
  </section>;
}

/** O Mecenato (v2): o que está acontecendo no porto — a expedição que voltou, a que está no mar ou a próxima etapa da rota aberta. Abre o Mecenato.
 *  No mar, o cartão mostra uma faixa de viagem (o navio anda na barra até o porto, com o tempo que falta, atualizado sozinho); de volta, a faixa vira
 *  "Voltou!" e o cartão pulsa até desembarcar. */
export function HubMecenato({ onOpen, onBack }: { onOpen: () => void; onBack?: (back: boolean) => void }) {
  const view = useMecenato();
  const [now, setNow] = useState(Date.now());
  const active = view ? activeExpeditions(view) : [];
  const backRecord = view ? active.find((record) => isBack(record, view.progress[record.id] ?? emptyProgress(), now)) : undefined;
  const sailingRecord = active.find((record) => record !== backRecord);
  useEffect(() => { onBack?.(Boolean(backRecord)); }, [backRecord, onBack]);
  // no mar o relógio anda a cada 15 s (no último minuto, a cada segundo); parado no porto, a cada minuto
  const left = sailingRecord && view ? remainingMs(sailingRecord, view.progress[sailingRecord.id] ?? emptyProgress(), now) : null;
  const tick = left === null ? 60_000 : left < 60_000 ? 1000 : 15_000;
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), tick); return () => window.clearInterval(timer); }, [tick]);
  const route = ROUTES.find((item) => item.open)!;
  const next = view ? nextStage(route, view) : 0;
  const pieceOf = (record?: { route: string; stage: number }) => (record ? museumPieceById(routeById(record.route)?.stages[record.stage]?.piece ?? "") : undefined);
  const shownRecord = backRecord ?? sailingRecord;
  const nextPiece = next !== null ? museumPieceById(route.stages[next]?.piece ?? "") : undefined;
  const piece = pieceOf(shownRecord) ?? nextPiece ?? MUSEUM_PIECES[0];
  const text = museumPieceText(piece);
  const eta = left !== null ? duration(left) : "";
  // quanto da viagem já foi (a viagem efetiva desconta o que os acertos cortaram)
  const total = sailingRecord && view ? Math.max(1, sailingRecord.durationMs - Math.min(view.progress[sailingRecord.id]?.cutMs ?? 0, sailingRecord.durationMs)) : 1;
  const pct = left !== null ? Math.min(100, Math.max(0, Math.round((1 - left / total) * 100))) : 0;
  const label = backRecord ? t.mecenato.hubBack : sailingRecord ? t.mecenato.hubSailing(eta) : next !== null ? t.mecenato.hubNext : t.mecenato.hubDone;
  return <button type="button" className={`hx-museum${backRecord ? " is-back" : sailingRecord ? " is-sailing" : ""}`} onClick={onOpen} aria-label={`${t.hub.museumName} · ${label} · ${text.title}`}>
    <span className="hx-museum-img" style={{ backgroundImage: `url(${piece.image})` }} aria-hidden="true" />
    <span className="hx-museum-text">
      <small>{shownRecord ? t.hub.museumName : label}</small>
      {backRecord && <span className="hx-voyage is-back" aria-hidden="true"><i className="hx-voyage-dot" /><b>{t.mecenato.hubLanded}</b></span>}
      {sailingRecord && !backRecord && <span className="hx-voyage" role="img" aria-label={t.mecenato.hubVoyageAria(pct, eta)}>
        <span className="hx-voyage-head"><b>{t.mecenato.hubAtSea}</b><em>{t.mecenato.hubEta(eta)}</em></span>
        <span className="hx-voyage-bar"><i style={{ width: `${pct}%` }} /><span className="hx-voyage-ship" style={{ left: `${pct}%` }}><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M2.5 10.5h11l-2.2 3H4.7z" fill="currentColor" /><path d="M7.5 1.8v7.6H3.2zM8.6 3.4l4 6H8.6z" fill="currentColor" opacity=".85" /></svg></span></span>
      </span>}
      <b>{text.title}</b>
      <span className="hx-museum-dots" aria-hidden="true">{MUSEUM_PIECES.map((item) => <i key={item.id} className={view?.ownedPieces.has(item.id) ? "on" : ""} />)}</span>
    </span>
    <span className="hx-museum-act">
      {!shownRecord && next !== null && <span className="hx-price"><i aria-hidden="true">$</i>{money(stageCost(route, next))}</span>}
      <span className="hx-btn is-light">{backRecord ? t.mecenato.land : shownRecord ? t.hub.museumVisit : next !== null ? t.mecenato.go : t.hub.museumVisit} <Icon type="arrow" size={14} /></span>
    </span>
  </button>;
}

/** Os Desafios (06–08/10/2026, mocks hub-v20 a v24): o terceiro pilar, listas contra o relógio para quem já domina os modos. No Hub só a porta de
 *  entrada, no lugar da Vitrine e abaixo do Duelo (hierarquia: modos > Duelo > Desafios): fachada de arcos, título em inscrição e "Desafiar"
 *  (sem desafio em destaque, pedido do Enzo). A tela própria ainda não existe: o cartão diz "em breve" e o botão fica desativado. */
export function HubChallenges() {
  return <section className="hx-duel hx-chal" aria-label={t.hub.challengesAria}>
    <div className="hx-duel-top">
      <span className="hx-duel-ic" aria-hidden="true"><Icon type="arches" size={24} /></span>
      <div className="hx-duel-name"><h3>{t.hub.challenges}</h3></div>
      <span className="hx-pill">{t.hub.challengesSoon}</span>
    </div>
    <button type="button" className="hx-go" disabled><Icon type="arches" size={16} /> {t.hub.challengesGo}</button>
  </section>;
}

/** Em que vez o revezamento parou: voltar ao Hub continua dela. */
let turnIndex = 0;
/** Mecenato e Vitrine no mesmo lugar (o do Mecenato), revezando a cada SHOWCASE_INTERVAL_MS, com o nome de cada um no rótulo para escolher.
 *  Para com o mouse ou o foco, com a aba escondida e com movimento reduzido; com uma expedição de volta fica no Mecenato até desembarcar. Cada vez
 *  da Vitrine mostra o conjunto seguinte de suprimentos. */
export function HubTurns({ onOpenMuseum, onOpenStore }: { onOpenMuseum: () => void; onOpenStore: () => void }) {
  const [turn, setTurn] = useState(() => turnIndex);
  const [paused, setPaused] = useState(false);
  const [back, setBack] = useState(false);
  const ids = useId();
  useEffect(() => { turnIndex = turn; }, [turn]);
  useEffect(() => {
    if (paused || back || reducedMotion()) return;
    const timer = window.setInterval(() => { if (!document.hidden) setTurn((value) => value + 1); }, SHOWCASE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused, back]);
  const showcase = !back && turn % 2 === 1;
  const pick = (wantShowcase: boolean) => { if (wantShowcase !== showcase) setTurn((value) => value + 1); };
  const tab = (isShowcase: boolean, label: string) => <button type="button" role="tab" id={`${ids}-${isShowcase ? "s" : "m"}`} className="hx-turn-tab"
    aria-selected={isShowcase === showcase} aria-controls={`${ids}-panel`} tabIndex={isShowcase === showcase ? 0 : -1} onClick={() => pick(isShowcase)}
    onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { pick(!isShowcase); (event.currentTarget.parentElement?.querySelector(`#${CSS.escape(`${ids}-${isShowcase ? "m" : "s"}`)}`) as HTMLElement | null)?.focus(); } }}>{label}</button>;
  return <section className="hx-cell hx-mecenato hx-turns" aria-label={t.hub.turnsAria} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} onPointerDown={() => setPaused(true)}>
    <div className="section-label" role="tablist" aria-label={t.hub.turnsAria}>{tab(false, t.hub.mecenato)}{tab(true, t.hub.showcase)}</div>
    <div className="hx-turn-panel" id={`${ids}-panel`} role="tabpanel" aria-labelledby={`${ids}-${showcase ? "s" : "m"}`}>
      <div className="hx-turn" hidden={showcase}><HubMecenato onOpen={onOpenMuseum} onBack={setBack} /></div>
      <div className="hx-turn" hidden={!showcase}><HubShowcase onOpenStore={onOpenStore} turn={Math.floor(turn / 2)} /></div>
    </div>
  </section>;
}
