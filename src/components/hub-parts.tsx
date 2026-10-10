// Peças do Hub novo: carrossel dos modos, cartão do Duelo (a fila mora nele), Vitrine da Loja e Mecenato do Museu.
// Cada peça só recebe dados e devolve eventos; o Hub (screens.tsx) monta a grade.
import { Children, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { Icon } from "./icons";
import { useElapsed } from "./pvp-offer";
import type { PvpQueueView } from "../domain/pvp";
import type { LadderCard } from "../domain/duel-view";
import type { Ladder } from "../domain/duel-modes";
import { DIVISION_SPAN } from "../domain/league";
import { SUPPLY_COST } from "../domain/supplies";
import { SupplyArt } from "./supply-art";
import { leagueLabel, nextStep } from "../domain/duel-labels";
import { SHOWCASE_INTERVAL_MS, SUPPLY_GRID_SETS, SUPPLY_SETS } from "../domain/hub-showcase";
import { MUSEUM_PIECES, museumPieceById, museumPieceText } from "../domain/museum";
import { ROUTES, activeExpeditions, emptyProgress, isBack, nextStage, remainingMs, routeById, stageCost } from "../domain/mecenato";
import { useMecenato } from "./use-mecenato";
import { duration } from "./mecenato-view";
import { formatNumber as money, t } from "../domain/i18n";

const reducedMotion = () => document.documentElement.dataset.reducedMotion === "true" || matchMedia("(prefers-reduced-motion: reduce)").matches;

/** O título do jogador no cabeçalho do Hub (09/10/2026, pedido do Enzo: "Cosmógrafo" saía cortado com reticências ao lado das medalhas). A fonte
 *  encolhe até o título caber inteiro no espaço que sobra; se nem com TITLE_MIN px cabe (título longo, como "Cosmographer", e as três medalhas), as
 *  medalhas saem do cabeçalho (seguem no Progresso, como na janela baixa) e o título volta a crescer; só no limite TITLE_FLOOR voltam as
 *  reticências. Mede de novo quando a janela ou a peça mudam de largura e quando as fontes terminam de carregar. */
const TITLE_MIN = 16;
const TITLE_FLOOR = 13;
export function HubTitle({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // "important" porque o cabeçalho do celular fixa o tamanho com !important
    const set = (size: number) => el.style.setProperty("font-size", `${size}px`, "important");
    // a largura exata do texto (scrollWidth arredonda: uma fração de pixel a mais já põe as reticências)
    const range = document.createRange();
    const textWidth = () => { range.selectNodeContents(el); return range.getBoundingClientRect().width; };
    const overflows = () => textWidth() > el.getBoundingClientRect().width + 0.01;
    // o texto cresce em proporção à fonte: uma conta acerta quase sempre, e os passos de meio pixel cobrem o arredondamento
    const shrink = (floor: number) => {
      let size = Math.max(floor, Math.floor((parseFloat(getComputedStyle(el).fontSize) * el.getBoundingClientRect().width / textWidth()) * 10) / 10 - 0.1);
      set(size);
      for (let i = 0; i < 6 && size > floor && overflows(); i++) { size = Math.max(floor, size - 0.5); set(size); }
      return size;
    };
    const fit = () => {
      const head = el.parentElement;
      head?.classList.remove("is-tight");
      el.style.removeProperty("font-size");
      if (!overflows()) return;
      if (shrink(TITLE_MIN) > TITLE_MIN || !overflows() || !head?.querySelector(".hub-badges")) return;
      head.classList.add("is-tight");
      el.style.removeProperty("font-size");
      if (overflows()) shrink(TITLE_FLOOR);
    };
    fit();
    let width = el.parentElement?.clientWidth ?? 0;
    const observer = new ResizeObserver(() => { const now = el.parentElement?.clientWidth ?? 0; if (now !== width) { width = now; fit(); } });
    if (el.parentElement) observer.observe(el.parentElement);
    window.addEventListener("resize", fit);
    let alive = true;
    void document.fonts?.ready.then(() => { if (alive) fit(); });
    return () => { alive = false; observer.disconnect(); window.removeEventListener("resize", fit); };
  }, [text]);
  return <p ref={ref} className="hub-title">{text}</p>;
}

/** Carrossel em laço (refeito em 09/10/2026, pedido do Enzo: "o loop tá fraco, trava no fim" e "arrastar o cartão também no desktop, com uma
 *  animaçãozinha"). Cada cartão existe uma vez e é posto no lugar por uma posição contínua (`pos`, em cartões) com aritmética modular, então o
 *  laço não tem fim para bater nem salto de volta (a versão anterior repetia a fila três vezes numa rolagem nativa e, com cliques seguidos, batia
 *  no fim da última cópia, parava e pulava). Arrasta com o mouse e com o dedo (com impulso: um arraste rápido avança mesmo curto), roda do trackpad,
 *  setas, pontos e as teclas ← →. Em movimento os cartões ficam um pouco translúcidos e menores e a quadrícula de fundo anda em paralaxe
 *  (`is-moving` e `--shift` no CSS). Só os cartões inteiros na janela são interativos (os outros ficam `inert`); tocar num vizinho que espia avança.
 *  Com movimento reduzido a troca é imediata. */
/** Onde cada carrossel parou: voltar de outra tela (Loja, Mesa, partida) abre o Hub no mesmo cartão. Vale até recarregar a página. */
const carouselMemory = new Map<string, number>();
const mod = (value: number, n: number) => ((value % n) + n) % n;
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
/** Quanto o dedo/mouse anda na horizontal até virar arraste (abaixo disso é toque/clique). */
const DRAG_START = 6;
/** Velocidade (cartões por ms) a partir da qual soltar o arraste avança para o próximo cartão mesmo sem ter chegado na metade. */
const FLICK = 0.0012;

export function HubCarousel({ label, children }: { label: string; children: ReactNode }) {
  const items = Children.toArray(children);
  const count = items.length;
  const loop = count > 1;
  const track = useRef<HTMLDivElement>(null);
  const slides = useRef<(HTMLDivElement | null)[]>([]);
  const remembered = count > 0 ? mod(Math.round(carouselMemory.get(label) ?? 0), count) : 0;
  const pos = useRef(remembered);
  const geo = useRef({ step: 0, per: 1, peek: 0 });
  const anim = useRef<{ to: number; frame: number } | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; from: number; lastX: number; lastT: number; v: number; active: boolean } | null>(null);
  const dragged = useRef(false);
  const wheelTimer = useRef<number | undefined>(undefined);
  const [active, setActive] = useState(remembered);
  const [per, setPer] = useState(1);
  // a posição inteira em que o carrossel parou: decide quais cartões estão inteiros na janela (os interativos)
  const [rest, setRest] = useState(remembered);

  // a vaga de cada cartão: as vagas começam um pouco à esquerda da janela e dão a volta; o laço é só aritmética
  const slotOf = useCallback((index: number, at: number, perView: number) => {
    const min = -Math.max(0.5, (count - perView) / 2 + 0.5);
    return mod(index - at - min, count) + min;
  }, [count]);

  const paint = useCallback((moving: boolean) => {
    const { step, per: perView } = geo.current;
    if (!step) return;
    slides.current.forEach((el, index) => {
      if (!el) return;
      const slot = slotOf(index, pos.current, perView);
      el.style.transform = `translate3d(${((slot - index) * step).toFixed(2)}px,0,0)`;
      el.style.setProperty("--shift", moving ? (slot - Math.round(slot)).toFixed(3) : "0");
    });
    track.current?.classList.toggle("is-moving", moving);
    const now = mod(Math.round(pos.current), count);
    setActive((prev) => (prev === now ? prev : now));
  }, [count, slotOf]);

  const measure = useCallback(() => {
    const el = track.current;
    const first = slides.current[0];
    if (!el || !first) return;
    const style = getComputedStyle(el);
    const gap = parseFloat(style.columnGap) || 0;
    const peek = parseFloat(style.paddingLeft) || 0;
    const width = parseFloat(getComputedStyle(first).width) || first.offsetWidth;
    const step = width + gap;
    const perView = Math.max(1, Math.min(count, Math.round((el.clientWidth - 2 * peek + gap) / step)));
    geo.current = { step, per: perView, peek };
    setPer(perView);
  }, [count]);

  const settle = useCallback(() => {
    pos.current = mod(Math.round(pos.current), count);
    paint(false);
    carouselMemory.set(label, pos.current);
    setRest(pos.current);
  }, [count, label, paint]);

  const stop = () => {
    if (anim.current) cancelAnimationFrame(anim.current.frame);
    anim.current = null;
  };

  const animateTo = useCallback((target: number) => {
    if (anim.current) cancelAnimationFrame(anim.current.frame);
    const from = pos.current;
    if (reducedMotion() || Math.abs(target - from) < 0.001) { anim.current = null; pos.current = target; settle(); return; }
    const duration = Math.min(560, 280 + 110 * Math.abs(target - from));
    const start = performance.now();
    const state = { to: target, frame: 0 };
    const tick = (now: number) => {
      const x = Math.min(1, (now - start) / duration);
      pos.current = from + (target - from) * easeOut(x);
      paint(true);
      if (x < 1) state.frame = requestAnimationFrame(tick);
      else { anim.current = null; settle(); }
    };
    state.frame = requestAnimationFrame(tick);
    anim.current = state;
  }, [paint, settle]);

  // setas e teclas somam ao destino da animação em curso: cliques seguidos andam vários cartões, sem travar
  const move = (delta: number) => animateTo((anim.current ? anim.current.to : Math.round(pos.current)) + delta);
  const goTo = (index: number) => {
    const base = anim.current ? anim.current.to : Math.round(pos.current);
    let delta = mod(index - base, count);
    if (delta > count / 2) delta -= count;
    if (delta !== 0) animateTo(base + delta);
  };

  useLayoutEffect(() => {
    if (!loop) return;
    measure();
    paint(false);
    // só a LARGURA muda o passo; a altura mudar (barra de endereço do celular) não interrompe um movimento em andamento
    let lastWidth = track.current?.clientWidth ?? 0;
    const observer = new ResizeObserver(() => {
      const width = track.current?.clientWidth ?? 0;
      if (width === lastWidth) return;
      lastWidth = width;
      measure();
      paint(Boolean(anim.current || drag.current?.active));
    });
    if (track.current) observer.observe(track.current);
    return () => { observer.disconnect(); if (anim.current) cancelAnimationFrame(anim.current.frame); window.clearTimeout(wheelTimer.current); };
  }, [loop, measure, paint]);

  // roda do trackpad (deslize horizontal com dois dedos): a posição acompanha e, parada, assenta no cartão mais perto
  useEffect(() => {
    const el = track.current;
    if (!el || !loop) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || !geo.current.step) return;
      event.preventDefault();
      if (anim.current) { cancelAnimationFrame(anim.current.frame); anim.current = null; }
      pos.current += event.deltaX / geo.current.step;
      paint(true);
      window.clearTimeout(wheelTimer.current);
      wheelTimer.current = window.setTimeout(() => animateTo(Math.round(pos.current)), 140);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [loop, paint, animateTo]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!loop || (event.pointerType === "mouse" && event.button !== 0)) return;
    stop();
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, from: pos.current, lastX: event.clientX, lastT: event.timeStamp, v: 0, active: false };
    dragged.current = false;
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const { step } = geo.current;
    if (!d || d.id !== event.pointerId || !step) return;
    const dx = event.clientX - d.x;
    if (!d.active) {
      if (Math.abs(dx) < DRAG_START || Math.abs(dx) < Math.abs(event.clientY - d.y)) return;
      d.active = true;
      dragged.current = true;
      track.current?.setPointerCapture(event.pointerId);
      track.current?.classList.add("is-dragging");
    }
    const dt = Math.max(1, event.timeStamp - d.lastT);
    d.v = 0.75 * ((d.lastX - event.clientX) / step / dt) + 0.25 * d.v;
    d.lastX = event.clientX;
    d.lastT = event.timeStamp;
    pos.current = d.from - dx / step;
    paint(true);
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    track.current?.classList.remove("is-dragging");
    if (!d.active) {
      // toque sem arraste: num vizinho que espia, avança; se uma animação foi interrompida no meio, termina
      const box = track.current?.getBoundingClientRect();
      const { peek } = geo.current;
      if (event.type === "pointerup" && box && peek > 0 && event.clientX < box.left + peek) move(-1);
      else if (event.type === "pointerup" && box && peek > 0 && event.clientX > box.right - peek) move(1);
      else if (Math.abs(pos.current - Math.round(pos.current)) > 0.001) animateTo(Math.round(pos.current));
      return;
    }
    // soltou: o cartão mais perto, ou o próximo no sentido do arraste se ele foi rápido; nunca mais que uma janela de uma vez
    const base = Math.round(d.from);
    let target = Math.abs(d.v) > FLICK ? (d.v > 0 ? Math.ceil(pos.current - 0.15) : Math.floor(pos.current + 0.15)) : Math.round(pos.current);
    target = Math.max(base - geo.current.per, Math.min(base + geo.current.per, target));
    animateTo(target);
  };
  // um arraste não abre o cartão em que começou
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!dragged.current) return;
    event.preventDefault();
    event.stopPropagation();
    dragged.current = false;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    move(event.key === "ArrowRight" ? 1 : -1);
  };
  const interactive = (index: number) => {
    if (!loop) return true;
    const slot = slotOf(index, rest, per);
    return slot > -0.5 && slot < per - 0.5;
  };
  return <div className="hx-car" data-loop={loop ? "true" : undefined} onKeyDown={loop ? onKeyDown : undefined}>
    <div className="hx-track" ref={track} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onClickCapture={onClickCapture} role="region" aria-label={label}>
      {items.map((child, index) => {
        const live = interactive(index);
        return <div key={index} ref={(el) => { slides.current[index] = el; }} className="hx-slide" aria-hidden={live ? undefined : true} inert={!live}>{child}</div>;
      })}
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
  const other = cards.find((item) => item.ladder !== card.ladder);
  return <section className="hx-duel" data-fam="duelo" data-league={status.league} aria-label={t.duel.modeDuel}>
    <div className="hx-duel-top">
      <span className="hx-duel-ic" aria-hidden="true"><Icon type="swords" size={26} /></span>
      <div className="hx-duel-name"><h3>{t.duel.modeDuel}</h3></div>
      {/* no celular (Hub em faixa) o cartão do Duelo é compacto: a escolha da escada vira esta troca de um toque, no lugar da escada e da pílula */}
      <span className="hx-duel-league">{label}</span>
      {other && <button type="button" className="hx-ladder-swap" disabled={searching} onClick={() => choose(other.ladder)} aria-label={t.hub.ladderSwap(t.duel.ladders[card.ladder], t.duel.ladders[other.ladder])}>{t.duel.ladders[card.ladder]} <Icon type="repeat" size={13} /></button>}
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
 * Vitrine da Loja: só consumíveis (os temas ficam na Loja). Alterna os conjuntos de `SUPPLY_SETS` em laço, trocando a cada SHOWCASE_INTERVAL_MS.
 * Para de trocar com o mouse ou o foco nela, com a aba escondida e com movimento reduzido (aí só os pontos trocam). No Hub em faixa é uma grade de
 * 2×3 (`SUPPLY_GRID_SETS`) só com o ícone e o nome; o preço fica no rótulo do botão (leitor de tela e a dica do mouse) e na Loja, que o toque abre.
 */
export function HubShowcase({ onOpenStore, turn }: { onOpenStore: () => void; turn?: number }) {
  const [index, setIndex] = useState(() => showcaseIndex);
  const [paused, setPaused] = useState(false);
  const sets = HUB_BAND ? SUPPLY_GRID_SETS : SUPPLY_SETS;
  const count = sets.length;
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
  const supplies = sets[at];
  return <section className={`hx-showcase${turn !== undefined ? " is-turn" : ""}`} aria-label={t.hub.showcase} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <header><h3>{t.hub.showcase}</h3>
      <span className="hx-showcase-dots">{sets.map((_, dot) => <button key={dot} type="button" aria-current={dot === at} aria-label={t.hub.showcaseSet(dot + 1, count)} onClick={() => setIndex(dot)} />)}</span>
    </header>
    <div key={at} className="hx-showcase-slide">
      <ul className={`hx-supplies${HUB_BAND ? " is-grid" : ""}`}>
        {supplies.map((id) => <li key={id}>
          <button type="button" onClick={onOpenStore} aria-label={`${t.supplies[id].name} · ${money(SUPPLY_COST[id])}`} title={HUB_BAND ? `${t.supplies[id].name} · ${money(SUPPLY_COST[id])}` : undefined}>
            <span className="hx-supply-art" data-supply={id}><SupplyArt id={id} size={58} /></span>
            <b>{t.supplies[id].name}</b>
            {!HUB_BAND && <span className="hx-price"><i aria-hidden="true">$</i>{money(SUPPLY_COST[id])}</span>}
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
/** Desenho do Hub no desktop (≥ 1100 px). Nos três em faixa (08/10/2026, mock hub-v29 L2) os modos ocupam a largura toda e embaixo vêm
 *  Duelo | Desafios | Mecenato · Vitrine; o que muda é onde fica o "Seu progresso" (mock hub-v30):
 *  "cabecalho" (o padrão, P2): fichas na peça do jogador, no lugar de "partidas · rodadas"; "faixa4" (P1): 4ª coluna da faixa;
 *  "faixa": uma linha embaixo (a página rola). "coluna" é o de antes (modos | Duelo + Desafios; progresso | Mecenato · Vitrine).
 *  Para trocar: o padrão aqui, ou abrir o app com ?hub=<valor> (fica gravado neste navegador). Celular e tablet são os mesmos em todos. */
export type HubLayout = "cabecalho" | "faixa4" | "faixa" | "coluna";
const HUB_LAYOUT_DEFAULT: HubLayout = "cabecalho";
const isLayout = (value: string | null): value is HubLayout => value === "cabecalho" || value === "faixa4" || value === "faixa" || value === "coluna";
function readHubLayout(): HubLayout {
  try {
    const asked = new URLSearchParams(window.location.search).get("hub");
    if (isLayout(asked)) localStorage.setItem("carta-hub-layout", asked);
    const saved = localStorage.getItem("carta-hub-layout");
    return isLayout(saved) ? saved : HUB_LAYOUT_DEFAULT;
  } catch { return HUB_LAYOUT_DEFAULT; }
}
export const HUB_LAYOUT: HubLayout = typeof window === "undefined" ? HUB_LAYOUT_DEFAULT : readHubLayout();
/** Os três desenhos em faixa dividem o CSS (`data-layout="faixa"`); o lugar do progresso vai em `data-progress`. */
export const HUB_BAND = HUB_LAYOUT !== "coluna";
/** As colunas da faixa de baixo no desktop (09/10/2026, mocks hub-v37): "iguais" (L1: Duelo, Desafios e Mecenato·Vitrine do mesmo tamanho na
 *  largura de antes, e o cabeçalho seguindo as colunas), "largas" (L2: as mesmas colunas iguais, mas o Hub alarga para o Duelo manter a largura
 *  antiga, até onde a altura deixa; publicado em fbea9bc, o Enzo preferiu o L1) ou "antigas" (1fr 1fr .82fr, até a tag
 *  `hub-colunas-antigas-2026-10-09`). Para trocar sem publicar: `?colunas=antigas|largas|iguais` (fica salvo neste navegador); para todos:
 *  HUB_COLUMNS_DEFAULT. */
export type HubColumns = "iguais" | "largas" | "antigas";
const HUB_COLUMNS_DEFAULT: HubColumns = "iguais";
const isColumns = (value: string | null): value is HubColumns => value === "iguais" || value === "largas" || value === "antigas";
function readHubColumns(): HubColumns {
  try {
    const asked = new URLSearchParams(window.location.search).get("colunas");
    if (isColumns(asked)) localStorage.setItem("carta-hub-colunas", asked);
    const saved = localStorage.getItem("carta-hub-colunas");
    return isColumns(saved) ? saved : HUB_COLUMNS_DEFAULT;
  } catch { return HUB_COLUMNS_DEFAULT; }
}
export const HUB_COLUMNS: HubColumns = typeof window === "undefined" ? HUB_COLUMNS_DEFAULT : readHubColumns();
// a barra de baixo do celular (fora do Hub) também muda com o desenho: o CSS lê `data-hub` no elemento raiz
if (typeof document !== "undefined") document.documentElement.dataset.hub = HUB_BAND ? "faixa" : "coluna";

/** Desafios. Na faixa o cartão tem a estrutura do Duelo (o desafio do dia e os botões), para não ficar vazio ao lado dele; a tela dos Desafios
 *  ainda não existe, então o desafio do dia é uma prévia e os botões ficam desativados. */
export function HubChallenges({ full = false }: { full?: boolean }) {
  const go = <button type="button" className="hx-go" disabled><Icon type="arches" size={16} /> {t.hub.challengesGo}</button>;
  return <section className={`hx-duel hx-chal${full ? " is-full" : ""}`} aria-label={t.hub.challengesAria}>
    <div className="hx-duel-top">
      <span className="hx-duel-ic" aria-hidden="true"><Icon type="arches" size={24} /></span>
      <div className="hx-duel-name"><h3>{t.hub.challenges}</h3></div>
      <span className="hx-pill">{t.hub.challengesSoon}</span>
    </div>
    {full ? <>
      <div className="hx-chal-daily">
        <small>{t.hub.challengesDaily} · {t.hub.challengesSampleInfo}</small>
        <b>{t.hub.challengesSample}</b>
        <em aria-label={`${t.hub.challengesRecord}: —`}>—<small aria-hidden="true">{t.hub.challengesRecord}</small></em>
      </div>
      <div className="hx-duel-foot">
        {go}
        <div className="hx-duel-acts"><button type="button" disabled>{t.hub.challengesAll}</button><button type="button" disabled>{t.hub.challengesRecords}</button></div>
      </div>
    </> : go}
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
