// A tela do Mecenato (v2, 04/10/2026): Expedições (carta das rotas, porto, rotas, próxima etapa), Equipamento (os itens que as peças liberam), Acervo
// (as peças) e Patronato (postos pelo total investido). Mesmo desenho da Loja (ScreenBar + abas st-*), com as peças próprias em mecenato.css.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { MUSEUM_PIECES, museumPieceById, museumPieceRights, museumPieceText, type MuseumPiece } from "../domain/museum";
import {
  ITEMS, RANKS, ROUTES, activeExpeditions, emptyProgress, isBack, itemOwned, itemsOfSlot, launchBlock, maxCutMs, nextRank, nextStage, portSlots, rankFor,
  remainingMs, routeById, stageCost, stageStates, STAGE_HOURS, chestTier,
  type ExpeditionRecord, type ItemId, type ItemSlot, type MecenatoView as View, type RouteDef, type RouteId,
} from "../domain/mecenato";
import { equipItem, landExpedition, launchExpedition, onMecenatoChange, queryMecenato, readEquipment, type LandResult } from "../domain/mecenato-store";
import { formatNumber as money, t } from "../domain/i18n";
import chart from "../domain/mecenato-chart.json";
import { ScreenBar } from "./screen-bar";
import { Icon } from "./icons";
import { SupplyArt } from "./supply-art";
import { LevelFrame } from "./level-frame";
import type { SupplyId } from "../domain/supplies";

export type MecenatoTab = "expeditions" | "equipment" | "archive" | "patronage";
type Props = { initialTab?: MecenatoTab; onBack: () => void; onEconomyRefresh?: () => void | Promise<void>; onSuppliesRefresh?: () => void | Promise<void> };

const m = () => t.mecenato;
const routeName = (id: string) => m().routes[id]?.[0] ?? id;
const itemName = (id: ItemId) => m().items[id]?.[0] ?? id;
const slotName = (slot: ItemSlot) => m().slots[slot]?.[0] ?? slot;
const rankName = (id: string) => (m().rank.names as Record<string, string>)[id] ?? id;
export function duration(ms: number) {
  if (ms < 60_000) return "< 1 min";
  // arredonda o total para cima antes de separar horas e minutos (antes 1 h 59,5 min virava "1 h 60 min")
  const total = Math.ceil(ms / 60_000), hours = Math.floor(total / 60), minutes = total % 60;
  return hours ? (minutes ? `${hours} h ${minutes} min` : `${hours} h`) : `${minutes} min`;
}
const hoursLabel = (stage: number) => `${STAGE_HOURS[stage]} h`;
const stageItem = (route: RouteDef, stage: number) => route.stages[stage]?.item;
const stagePiece = (route: RouteDef, stage: number) => museumPieceById(route.stages[stage]?.piece ?? "");
const STYLE_PREVIEW: Partial<Record<ItemId, string>> = { "estilo-1507": "/museum/estilo-1507.webp", "estilo-navegante": "/museum/estilo-navegante.webp", "estilo-iluminura": "/museum/estilo-iluminura.webp" };

function Price({ value }: { value: number }) {
  return <span className="st-price"><i aria-hidden="true">$</i><b>{money(value)}</b></span>;
}

/** Faixa do Patronato: posto, barra até o próximo e os números. */
function RankStrip({ view }: { view: View }) {
  const rank = rankFor(view.invested), next = nextRank(view.invested);
  const from = rank?.at ?? 0;
  const pct = next ? Math.round(((view.invested - from) / (next.at - from)) * 100) : 100;
  const pieces = MUSEUM_PIECES.filter((piece) => view.ownedPieces.has(piece.id)).length;
  return <section className="mc2-rank" aria-label={m().rank.label}>
    <span className={`mc2-medal${rank ? "" : " is-none"}`} aria-hidden="true"><b>{rank?.roman ?? "·"}</b></span>
    <div className="mc2-rank-t"><small>{m().rank.label}</small><b>{rank ? rankName(rank.id) : m().rank.none}</b>
      <div className="mc2-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={m().rank.label}><i style={{ width: `${pct}%` }} /></div>
      <em>{next ? (rank ? m().rank.toNext(money(next.at - view.invested), rankName(next.id)) : m().rank.toFirst(money(next.at - view.invested))) : m().rank.top} · {m().rank.slots(portSlots(view.invested))}</em></div>
    <div className="mc2-rank-stats"><div><small>{m().rank.invested}</small><b>{money(view.invested)}</b></div><div><small>{m().rank.finds}</small><b>{pieces}/{MUSEUM_PIECES.length}</b></div></div>
  </section>;
}

/** Posição (em %) ao longo da rota desenhada, para o navio no mapa. */
function along(points: number[][], fraction: number) {
  const segments = points.length - 1;
  const at = Math.max(0, Math.min(1, fraction)) * segments;
  const index = Math.min(segments - 1, Math.floor(at)), f = at - index;
  const [x1, y1] = points[index], [x2, y2] = points[index + 1];
  return [x1 + (x2 - x1) * f, y1 + (y2 - y1) * f];
}

function Chart({ view, selected }: { view: View; selected: RouteId }) {
  const [W, H] = chart.size;
  const routes = chart.routes as Record<string, number[][]>;
  const sailing = activeExpeditions(view);
  const pct = (x: number, y: number): CSSProperties => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });
  const port = routes.velho[0];
  return <div className="mc2-chart" role="img" aria-label={m().chartAria}>
    <img src="/museum/carta-rotas.webp" alt="" width={W} height={H} />
    <svg className="mc2-routes" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {ROUTES.map((route) => {
        const points = routes[route.id]; if (!points) return null;
        const on = route.id === selected, open = route.open;
        const end = points[points.length - 1];
        const states = stageStates(route, view);
        const allDone = open && states.every((state) => state === "done");
        return <g key={route.id} className={`mc2-route${on ? " is-on" : ""}${open ? "" : " is-closed"}`}>
          <path d={points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ")} />
          <circle cx={end[0]} cy={end[1]} r="7" className={allDone ? "is-done" : ""} />
        </g>;
      })}
      <circle cx={port[0]} cy={port[1]} r="9" className="mc2-port-dot" />
    </svg>
    {ROUTES.map((route) => { const points = routes[route.id]; const end = points?.[points.length - 1]; return end ? <span key={route.id} className={`mc2-label${route.open ? "" : " is-closed"}`} style={pct(end[0] + 10, end[1] - 10)}>{m().places[route.id]}</span> : null; })}
    <span className="mc2-portlabel" style={pct(port[0], port[1])}>{m().places.port}</span>
    {sailing.map((record) => {
      const points = routes[record.route]; if (!points) return null;
      const progress = view.progress[record.id] ?? emptyProgress();
      const left = remainingMs(record, progress, view.now);
      const [x, y] = along(points, 1 - left / record.durationMs);
      return <span key={record.id} className="mc2-ship" style={pct(x, y)} aria-hidden="true"><SupplyShip /></span>;
    })}
  </div>;
}

/** Caravela pequena (a mesma linguagem dos suprimentos: latão e velas de cruz vermelha). */
function SupplyShip({ size = 46 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="60" rx="20" ry="3" fill="#1a1208" opacity=".25" /><path d="M6 55q26 6 52 0" fill="none" stroke="#3f86a6" strokeWidth="2.2" strokeLinecap="round" opacity=".8" />
    <path d="M9 42q23 12 46 0l-5 10q-18 6-36 0z" fill="#7d522e" /><path d="M9 42q23 12 46 0" fill="none" stroke="#d8a345" strokeWidth="1.6" /><path d="M24 42V10M40 42V15" stroke="#4d301a" strokeWidth="1.8" />
    <path d="M25 12q10 3 10 13t-10 12z" fill="#f6ecd2" stroke="#8d5f1a" strokeWidth=".6" /><path d="M41 17q8 3 8 11t-8 10z" fill="#f6ecd2" stroke="#8d5f1a" strokeWidth=".6" />
    <path d="M27 22h5M29.5 19v10" stroke="#c0513a" strokeWidth="2.2" /><path d="M24 10l-8 3 8 3z" fill="#c0513a" /></svg>;
}

function PortCard({ record, view, onLand }: { record: ExpeditionRecord; view: View; onLand: (id: string) => void }) {
  const route = routeById(record.route)!;
  const piece = stagePiece(route, record.stage);
  const item = stageItem(route, record.stage);
  const progress = view.progress[record.id] ?? emptyProgress();
  const back = isBack(record, progress, view.now);
  const left = remainingMs(record, progress, view.now);
  const pct = Math.round((1 - left / record.durationMs) * 100);
  const cap = maxCutMs(record.durationMs);
  const capped = progress.cutMs >= cap;
  return <article className={`mc2-run${back ? " is-back" : ""}`}>
    <div className="mc2-run-art">{back ? <SupplyArtChest /> : <SupplyShip size={64} />}</div>
    <div className="mc2-run-t">
      <small>{back ? m().back : m().sailing} · {routeName(route.id)} · {m().stageOf(record.stage + 1)}</small>
      <b>{piece ? museumPieceText(piece).title : routeName(route.id)}</b>
      {item && <span>{m().brings(itemName(item))}</span>}
      {back
        ? <div className="mc2-run-row"><button type="button" className="st-btn is-buy" onClick={() => onLand(record.id)}>{m().land}</button><span className="mc2-muted">{m().waits}</span></div>
        : <>
          <div className="mc2-prog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={m().returnsIn(duration(left))}><i style={{ width: `${pct}%` }} /></div>
          <div className="mc2-run-row"><span><Icon type="clock" size={14} /> <b>{m().returnsIn(duration(left))}</b></span></div>
          <span className="mc2-boost">{capped ? m().chestFull : m().accel(m().routes[route.id][2])}{progress.cutMs >= 60_000 ? ` · ${m().cut(duration(progress.cutMs), duration(cap))}` : ""}</span>
          {progress.chest > 0 && <span className="mc2-chest">{m().chest[chestTier(progress.chest)]}</span>}
        </>}
    </div>
  </article>;
}
function SupplyArtChest() {
  return <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="59" rx="22" ry="3" fill="#1a1208" opacity=".28" /><path d="M9 35q0-15 23-15t23 15z" fill="#7d522e" /><rect x="9" y="35" width="46" height="21" rx="2" fill="#6a4426" />
    <path d="M9 35h46" stroke="#d8a345" strokeWidth="2.2" /><rect x="18" y="21" width="4" height="35" fill="#d8a345" /><rect x="42" y="21" width="4" height="35" fill="#d8a345" /><rect x="27" y="31" width="10" height="11" rx="2" fill="#f2c770" stroke="#8d5f1a" strokeWidth=".7" /><circle cx="32" cy="36" r="1.8" fill="#8d5f1a" /></svg>;
}

function RouteCard({ route, view, on, onPick }: { route: RouteDef; view: View; on: boolean; onPick: () => void }) {
  const states = route.open ? stageStates(route, view) : ["locked", "locked", "locked", "locked"];
  const done = states.filter((state) => state === "done").length;
  const running = states.find((state) => state === "running" || state === "back");
  const next = nextStage(route, view);
  return <button type="button" className={`mc2-routecard${on ? " is-on" : ""}${route.open ? "" : " is-closed"}`} aria-pressed={on} onClick={onPick}>
    <span className="mc2-routecard-h"><b>{routeName(route.id)}</b><small>{m().routes[route.id][1]}</small></span>
    <span className="mc2-steps" aria-hidden="true">{states.map((state, index) => <i key={index} className={state === "done" ? "on" : state === "running" || state === "back" ? "go" : ""} />)}</span>
    <span className="mc2-routecard-f"><small>{route.open ? m().findsOf(done) : m().soon}</small>
      {route.open && (running === "running" ? <span className="mc2-st is-run"><Icon type="clock" size={12} /> {m().sailing}</span>
        : running === "back" ? <span className="mc2-st is-back">{m().back}</span>
          : next !== null ? <span className="mc2-st"><Price value={stageCost(route, next)} /> · {hoursLabel(next)}</span>
            : <span className="mc2-st is-done"><Icon type="check" size={12} /> {m().complete}</span>)}
    </span>
  </button>;
}

function PlanCard({ route, view, onSail }: { route: RouteDef; view: View; onSail: () => void }) {
  if (!route.open) return <article className="mc2-plan is-closed"><div className="mc2-plan-t"><small>{routeName(route.id)}</small><b>{m().soon}</b><p>{m().soonRoute}</p></div></article>;
  const stage = nextStage(route, view);
  const running = activeExpeditions(view).find((record) => record.route === route.id);
  if (stage === null) return <article className="mc2-plan is-closed"><div className="mc2-plan-t"><small>{routeName(route.id)}</small><b>{running ? m().busy : m().complete}</b></div></article>;
  const piece = stagePiece(route, stage)!;
  const item = stageItem(route, stage)!;
  const cost = stageCost(route, stage);
  const block = launchBlock(route, view);
  return <article className="mc2-plan">
    <div className="mc2-plan-img"><img src={piece.image} alt="" className="mc2-veil" /><span className="mc2-seal" aria-hidden="true"><Icon type="lock" size={18} /></span><span className="mc2-year">{piece.year}</span></div>
    <div className="mc2-plan-t">
      <small>{m().nextKicker(routeName(route.id), stage + 1)}</small>
      <b>{museumPieceText(piece).title}</b>
      <p>{m().nextLead(itemName(item))}</p>
      <div className="mc2-facts"><div><small>{m().cost}</small><b>{money(cost)}</b></div><div><small>{m().trip}</small><b>{hoursLabel(stage)}</b></div><div><small>{m().speeds}</small><b>{m().routes[route.id][2]}</b></div></div>
      <div className="mc2-acts">
        {block === null && <button type="button" className="st-btn is-buy" onClick={onSail}>{m().sail(money(cost))}</button>}
        {block === "coins" && <span className="st-btn is-missing">{m().missing(money(cost - view.balance))}</span>}
        {block === "port-full" && <span className="mc2-muted is-light">{m().portFull}</span>}
        {block === "busy" && <span className="mc2-muted is-light">{m().busy}</span>}
      </div>
    </div>
  </article>;
}

function SailDialog({ route, view, busy, onConfirm, onCancel }: { route: RouteDef; view: View; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const stage = nextStage(route, view) ?? 0;
  const piece = stagePiece(route, stage)!;
  const item = stageItem(route, stage)!;
  const cost = stageCost(route, stage);
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => { confirm.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); }; document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey); }, [onCancel]);
  return <div className="st-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="st-dialog mc2-dialog" role="dialog" aria-modal="true" aria-labelledby="mc2-sail-title">
      <button type="button" className="st-x" onClick={onCancel} aria-label={m().close}><Icon type="close" size={16} /></button>
      <div className="mc2-dlg-top"><div className="mc2-dlg-ship"><SupplyShip size={96} /></div><div><span className="st-kicker">{m().confirmKicker(routeName(route.id), stage + 1)}</span><h2 id="mc2-sail-title">{museumPieceText(piece).title}</h2><p className="st-dialog-blurb">{m().confirmLead(hoursLabel(stage), piece.year)}</p></div></div>
      <div className="mc2-loot">
        {STYLE_PREVIEW[item] ? <div className="mc2-loot-img"><img src={STYLE_PREVIEW[item]} alt="" /><span>{m().preview} · {itemName(item)}</span></div> : <div className="mc2-loot-img is-frame"><span className="mc2-frame-demo"><span className="hub-level"><strong>24</strong></span><LevelFrame id={item} /></span><span>{m().preview} · {itemName(item)}</span></div>}
        <div className="mc2-loot-side"><small>{m().sure}</small><b>{slotName(ITEMS[item].slot)} · {itemName(item)}</b><b>{m().pieceOf(piece.year)}</b><small>{m().maybe}</small><span>{m().maybeSupplies}</span><span>{m().maybeCoins}</span></div>
      </div>
      <dl className="st-rows"><div><dt>{m().cost}</dt><dd><Price value={cost} /></dd></div><div><dt>{m().trip}</dt><dd>{m().rowTripValue(hoursLabel(stage), m().routes[route.id][2])}</dd></div><div><dt>{m().rowAfter}</dt><dd>{money(view.balance - cost)}</dd></div></dl>
      <div className="st-dialog-actions"><button type="button" className="st-btn is-ghost" onClick={onCancel}>{m().notNow}</button><button type="button" className="st-btn is-buy" ref={confirm} disabled={busy} onClick={onConfirm}>{m().go}</button></div>
    </div>
  </div>;
}

function LandDialog({ result, onEquip, onArchive, onClose }: { result: Extract<LandResult, { ok: true }>; onEquip: (item: ItemId) => void; onArchive: () => void; onClose: () => void }) {
  const route = routeById(result.record.route)!;
  const piece = museumPieceById(result.piece)!;
  const item = stageItem(route, result.record.stage)!;
  const text = museumPieceText(piece);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey); }, [onClose]);
  return <div className="st-scrim mc2-scrim-dark" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="mc2-land" role="dialog" aria-modal="true" aria-labelledby="mc2-land-title"><span className="mc2-rays" aria-hidden="true" />
      <small className="mc2-land-k">{m().landKicker(routeName(route.id), result.record.stage + 1)}</small>
      <div className="mc2-land-piece"><img src={piece.image} alt={`${text.title} · ${text.subtitle}`} /><span className="mc2-year">{piece.year}</span></div>
      <h2 id="mc2-land-title">{text.title}</h2><p>{text.description} {m().landLead}</p>
      <div className="mc2-land-unlock">{STYLE_PREVIEW[item] ? <img src={STYLE_PREVIEW[item]} alt="" /> : <span className="mc2-frame-demo is-sm"><span className="hub-level"><strong>24</strong></span><LevelFrame id={item} /></span>}<div><small>{m().newItem(slotName(ITEMS[item].slot))}</small><b>{itemName(item)}</b><span>{m().items[item][1]}</span></div></div>
      <div className="mc2-land-extra"><small>{m().extras}</small>
        {result.loot.coins > 0 && <span><i className="mc2-coin" aria-hidden="true">$</i> {m().coinsBack(money(result.loot.coins))}</span>}
        {(Object.entries(result.loot.supplies) as [SupplyId, number][]).map(([id, count]) => <span key={id}><SupplyArt id={id} size={24} /> {count}× {t.supplies[id].name}</span>)}
      </div>
      <div className="mc2-land-acts"><button type="button" className="st-btn is-ghost-light" onClick={onArchive}>{m().seeArchive}</button><button type="button" className="st-btn is-buy" ref={close} onClick={() => onEquip(item)}><Icon type="check" size={15} /> {m().equipNow}</button></div>
    </div>
  </div>;
}

function Expeditions({ view, selected, onSelect, onSail, onLand }: { view: View; selected: RouteId; onSelect: (id: RouteId) => void; onSail: () => void; onLand: (id: string) => void }) {
  const active = activeExpeditions(view);
  const slots = portSlots(view.invested);
  const route = routeById(selected)!;
  return <>
    <div className="mc2-chartwrap">
      <Chart view={view} selected={selected} />
      <div className="mc2-dock"><small>{m().port} · {m().portSlots(active.length, slots)}</small>
        {active.map((record) => <PortCard key={record.id} record={record} view={view} onLand={onLand} />)}
        {Array.from({ length: Math.max(0, slots - active.length) }, (_, index) => <div key={index} className="mc2-run is-empty"><span><b>{m().emptySlot}</b><small>{m().emptySlotHint}</small></span></div>)}
      </div>
      <p className="mc2-credit">{m().chartCredit}</p>
    </div>
    <div className="st-sec"><h2>{m().routesTitle}</h2><span>{m().routesSub}</span></div>
    <div className="mc2-routegrid">{ROUTES.map((item) => <RouteCard key={item.id} route={item} view={view} on={item.id === selected} onPick={() => onSelect(item.id)} />)}</div>
    <PlanCard route={route} view={view} onSail={onSail} />
    <div className="st-sec"><h2>{m().grandTitle}</h2><span>{m().grandSub}</span></div>
    <div className="mc2-grand">{m().grand.map(([name, gives], index) => <article key={name} className="mc2-gcard"><span className="mc2-gtag">{[48, 72, 96][index]} h</span><b>{name}</b><span>{gives}</span><span className="mc2-need"><Icon type="lock" size={12} /> {rankName(RANKS[index + 2].id)} · {m().soon}</span></article>)}</div>
  </>;
}

function Equipment({ view, equipment, onEquip }: { view: View; equipment: Partial<Record<ItemSlot, ItemId>>; onEquip: (slot: ItemSlot, item: ItemId | null) => void }) {
  const [slot, setSlot] = useState<ItemSlot>("map-style");
  const slots: ItemSlot[] = ["map-style", "level-frame"];
  const current = equipment[slot];
  const ownedNow = (id: ItemId) => itemOwned(id, view.ownedPieces);
  const options = itemsOfSlot(slot);
  const where = (id: ItemId) => { const def = ITEMS[id]; return m().lockedBy(routeName(def.route), def.stage + 1); };
  return <div className="mc2-eq">
    <div className="mc2-eq-slots">{slots.map((key) => {
      const item = equipment[key];
      return <button key={key} type="button" className={`mc2-eq-slot${key === slot ? " is-on" : ""}`} aria-pressed={key === slot} onClick={() => setSlot(key)}>
        <span className="mc2-eq-ic"><Icon type={key === "map-style" ? "map" : "star"} size={18} /></span>
        <span><small>{slotName(key)}</small><b>{item && ownedNow(item) ? itemName(item) : m().none[key]}</b><em>{m().slots[key][1]}</em></span>
      </button>;
    })}<p className="mc2-muted">{m().moreSlots}</p></div>
    <div className="mc2-eq-main">
      <div className="mc2-eq-prev">{slot === "map-style"
        ? <img src={current && ownedNow(current) && STYLE_PREVIEW[current] ? STYLE_PREVIEW[current] : "/museum/estilo-tema.webp"} alt="" />
        : <div className="mc2-eq-framebox"><span className="mc2-frame-demo is-lg"><span className="hub-level"><strong>24</strong></span>{current && ownedNow(current) && <LevelFrame id={current} />}</span></div>}
        <span className="mc2-eq-tag">{m().preview}</span></div>
      <div className="mc2-eq-opts">
        <button type="button" className={`mc2-opt${!current ? " is-on" : ""}`} aria-pressed={!current} onClick={() => onEquip(slot, null)}><span className="mc2-th is-none">{slot === "map-style" ? <img src="/museum/estilo-tema.webp" alt="" /> : <span className="mc2-frame-demo is-sm"><span className="hub-level"><strong>24</strong></span></span>}</span><b>{m().none[slot]}</b><small>{!current ? m().equipped : m().noneHint[slot]}</small></button>
        {options.map((id) => {
          const owned = ownedNow(id), on = current === id;
          return <button key={id} type="button" className={`mc2-opt${on ? " is-on" : ""}${owned ? "" : " is-lock"}`} aria-pressed={on} disabled={!owned} onClick={() => onEquip(slot, id)}>
            <span className="mc2-th">{STYLE_PREVIEW[id] ? <img src={STYLE_PREVIEW[id]} alt="" /> : <span className="mc2-frame-demo is-sm"><span className="hub-level"><strong>24</strong></span><LevelFrame id={id} /></span>}{!owned && <i><Icon type="lock" size={14} /></i>}</span>
            <b>{itemName(id)}</b><small>{on ? m().equipped : owned ? m().owned : where(id)}</small>
          </button>;
        })}
      </div>
      <p className="mc2-muted">{m().a11y}</p>
    </div>
  </div>;
}

function PieceDialog({ piece, onClose }: { piece: MuseumPiece; onClose: () => void }) {
  const text = museumPieceText(piece);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey); }, [onClose]);
  return <div className="st-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="st-dialog mc2-piece-dlg" role="dialog" aria-modal="true" aria-labelledby="mc2-piece-title">
      <button type="button" className="st-x" ref={close} onClick={onClose} aria-label={m().close}><Icon type="close" size={16} /></button>
      <div className="mc2-piece-img"><img src={piece.image} alt={`${text.title} · ${text.subtitle}`} /></div>
      <span className="st-kicker">{text.subtitle}</span><h2 id="mc2-piece-title">{text.title}</h2>
      <p className="st-dialog-blurb">{text.detail}</p>
      <dl className="st-rows"><div><dt>{piece.year}</dt><dd>{piece.author}</dd></div><div><dt>·</dt><dd>{piece.institution}</dd></div></dl>
      <p className="mc2-rights">{museumPieceRights(piece)} <a href={piece.sourceUrl} target="_blank" rel="noopener noreferrer">↗</a></p>
    </div>
  </div>;
}

function Archive({ view }: { view: View }) {
  const [open, setOpen] = useState<MuseumPiece | null>(null);
  const itemOf = (pieceId: string) => { for (const route of ROUTES) { const stage = route.stages.find((item) => item.piece === pieceId); if (stage) return stage.item; } return null; };
  const owned = MUSEUM_PIECES.filter((piece) => view.ownedPieces.has(piece.id)).length;
  return <>
    <div className="st-sec"><h2>{m().archiveTitle}</h2><span>{m().archiveCount(owned, MUSEUM_PIECES.length)}</span></div>
    <div className="mc2-pieces">{MUSEUM_PIECES.map((piece) => {
      const has = view.ownedPieces.has(piece.id); const text = museumPieceText(piece); const item = itemOf(piece.id);
      return <article key={piece.id} className={`st-card mc2-piece${has ? "" : " is-locked"}`}>
        <div className="st-card-art"><img src={piece.image} alt="" loading="lazy" />{!has && <span className="mc2-seal" aria-hidden="true"><Icon type="lock" size={16} /></span>}<span className="mc2-year">{piece.year}</span></div>
        <div className="st-card-body"><h3>{text.title}</h3><p>{has ? text.subtitle : `${text.subtitle} · ${m().sealed}`}</p><small className="mc2-unlocks">{item ? m().unlocks(itemName(item)) : m().laterRoute}</small></div>
        <div className="st-card-foot">{has ? <><span className="st-state">{m().inArchive}</span><button type="button" className="st-btn is-ghost" onClick={() => setOpen(piece)}>{m().viewPiece}</button></> : <span className="st-state">{m().sealed}</span>}</div>
      </article>;
    })}</div>
    {open && <PieceDialog piece={open} onClose={() => setOpen(null)} />}
  </>;
}

function Patronage({ view, spentMuseum }: { view: View; spentMuseum: number }) {
  const rank = rankFor(view.invested);
  const index = rank ? RANKS.indexOf(rank) : -1;
  const fill = index < 0 ? 0 : Math.min(100, (index / (RANKS.length - 1)) * 100);
  const spentExpeditions = Math.max(0, view.invested - spentMuseum);
  const max = Math.max(1, spentMuseum, spentExpeditions);
  return <>
    <div className="st-sec"><h2>{m().patronTitle}</h2><span>{m().patronSub}</span></div>
    <div className="mc2-ladder-box"><div className="mc2-ladder"><i className="mc2-ladder-fill" style={{ width: `${fill * 0.8}%` }} />{RANKS.map((item, i) => <div key={item.id} className={`mc2-step${i === index ? " is-now" : ""}`}><span className={`mc2-medal${i > index ? " is-lock" : ""}`}><b>{item.roman}</b></span><b className="n">{rankName(item.id)}</b><small>{money(item.at)}</small></div>)}</div></div>
    <div className="mc2-two">
      <div><div className="st-sec"><h2>{m().givesTitle}</h2></div><ul className="mc2-gives">{m().gives.map(([title, text], i) => <li key={title} className={i <= index ? "on" : ""}><span className="ic"><Icon type={i <= index ? "check" : "lock"} size={16} /></span><div><b>{title}</b><small>{text}</small></div><span className="at">{rankName(RANKS[i].id)}</span></li>)}</ul></div>
      <div><div className="st-sec"><h2>{m().spentTitle}</h2><span>{money(view.invested)}</span></div><div className="mc2-panel mc2-spent">
        {[[m().spentMuseum, spentMuseum], [m().spentExpeditions, spentExpeditions]].map(([label, value]) => <div key={String(label)}><header><span>{label}</span><b>{money(Number(value))}</b></header><div className="mc2-bar"><i style={{ width: `${(Number(value) / max) * 100}%` }} /></div></div>)}
      </div></div>
    </div>
  </>;
}

export function MecenatoView({ initialTab = "expeditions", onBack, onEconomyRefresh, onSuppliesRefresh }: Props) {
  const [view, setView] = useState<View | null>(null);
  const [tab, setTab] = useState<MecenatoTab>(initialTab);
  const [selected, setSelected] = useState<RouteId>("velho");
  const [sailing, setSailing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [landed, setLanded] = useState<Extract<LandResult, { ok: true }> | null>(null);
  const [equipment, setEquipment] = useState(readEquipment());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const load = () => queryMecenato().then((fresh) => { setView({ ...fresh }); setEquipment(readEquipment()); }).catch(() => undefined);
    void load();
    const off = onMecenatoChange(() => { void queryMecenato().then((fresh) => setView({ ...fresh })).catch(() => undefined); setEquipment(readEquipment()); });
    const timer = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => { off(); window.clearInterval(timer); };
  }, []);
  const live = useMemo(() => (view ? { ...view, now } : null), [view, now]);
  if (!live) return <section className="st" aria-busy="true"><ScreenBar onBack={onBack} eyebrow={m().eyebrow} title={m().title} balance={0} /></section>;
  const back = activeExpeditions(live).filter((record) => isBack(record, live.progress[record.id] ?? emptyProgress(), live.now)).length;
  const route = routeById(selected)!;
  const sail = async () => {
    setBusy(true);
    const result = await launchExpedition(route.id);
    setBusy(false); setSailing(false);
    setNotice(result.ok ? m().sailed(routeName(route.id)) : m().failed);
    await Promise.allSettled([onEconomyRefresh?.()]);
  };
  const land = async (id: string) => {
    const result = await landExpedition(id);
    if (result.ok) { setLanded(result); await Promise.allSettled([onEconomyRefresh?.(), onSuppliesRefresh?.()]); }
  };
  const onEquip = (slot: ItemSlot, item: ItemId | null) => { equipItem(slot, item); setEquipment(readEquipment()); };
  const tabs: [MecenatoTab, string, string][] = [["expeditions", m().tabs.expeditions, back ? m().backCount(back) : ""], ["equipment", m().tabs.equipment, ""], ["archive", m().tabs.archive, `${MUSEUM_PIECES.filter((piece) => live.ownedPieces.has(piece.id)).length}/${MUSEUM_PIECES.length}`], ["patronage", m().tabs.patronage, ""]];
  return <section className="st mc2" aria-label={m().title}>
    <ScreenBar onBack={onBack} eyebrow={m().eyebrow} title={m().title} balance={live.balance} />
    <RankStrip view={live} />
    <div className="st-tabs" role="group" aria-label={m().title}>{tabs.map(([key, label, count]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => { setTab(key); setNotice(""); }}>{label}{count && <em>{count}</em>}</button>)}</div>
    <p className="st-notice" role="status" aria-live="polite">{notice}</p>
    {tab === "expeditions" && <Expeditions view={live} selected={selected} onSelect={setSelected} onSail={() => setSailing(true)} onLand={(id) => void land(id)} />}
    {tab === "equipment" && <Equipment view={live} equipment={equipment} onEquip={onEquip} />}
    {tab === "archive" && <Archive view={live} />}
    {tab === "patronage" && <Patronage view={live} spentMuseum={live.investedLegacy ?? 0} />}
    {sailing && <SailDialog route={route} view={live} busy={busy} onConfirm={() => void sail()} onCancel={() => setSailing(false)} />}
    {landed && <LandDialog result={landed} onClose={() => setLanded(null)} onArchive={() => { setLanded(null); setTab("archive"); }} onEquip={(item) => { onEquip(ITEMS[item].slot, item); setLanded(null); setTab("equipment"); }} />}
  </section>;
}
