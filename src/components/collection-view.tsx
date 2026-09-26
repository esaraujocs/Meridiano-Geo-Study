import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Meta, Region } from "../domain/types";
import { filterCollectionCards, filterHistoricalAlbum, historicalAlbum, type CollectionCard, type HistoricalAlbumCard, type querySurfaces } from "../domain/progress-surfaces";
import {
  HISTORICAL_TYPES,
  LEVEL_STEPS,
  LEVEL_NAMES,
  cardDetailRows,
  historicalPeriod,
  historicalTypeLabel,
  levelCounts,
  modesDone,
  nextLevelHint,
  placeLabel,
  rarityLevel,
  sortByName,
} from "../domain/collection-view";
import { REGION_ITEMS } from "../domain/regions";
import { loadFlags, flagSource, type FlagCatalog } from "../domain/quiz";
import { loadSpecialData, type HistoricalEntity } from "../domain/special-data";
import { ProgressHero } from "./progress-hero";
import { t } from "../domain/i18n";

type SurfaceState = Awaited<ReturnType<typeof querySurfaces>>;
type Props = { state: SurfaceState; meta: Record<string, Meta>; names?: Record<string, string>; initialRegion?: Region };
type LevelFilter = "todas" | "descobertas" | "faltando" | "1" | "2" | "3" | "4" | "5";
type StateFilter = "todas" | "descobertas" | "faltando";

const ICONS: Record<string, string> = {
  search: "M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0 M21 21l-6 -6",
  lock: "M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6 M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0 M8 11v-4a4 4 0 1 1 8 0v4",
  check: "M5 12l5 5l10 -10",
  x: "M18 6l-12 12 M6 6l12 12",
  left: "M15 6l-6 6l6 6",
  right: "M9 6l6 6l-6 6",
  sort: "M4 6h9 M4 12h7 M4 18h5 M15 15l3 3l3 -3 M18 6v12",
};
function Glyph({ name, size = 18, stroke = 1.6 }: { name: keyof typeof ICONS; size?: number; stroke?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>;
}
const Meridian = () => <svg className="col-meridian" width="120" height="120" viewBox="0 0 170 170" fill="none" stroke="#2F6F6A" strokeWidth="1" aria-hidden="true"><circle cx="85" cy="85" r="78" /><ellipse cx="85" cy="85" rx="30" ry="78" /><ellipse cx="85" cy="85" rx="58" ry="78" /><line x1="85" y1="7" x2="85" y2="163" /><line x1="7" y1="85" x2="163" y2="85" /></svg>;
const Pips = ({ level }: { level: number }) => <span className="col-pips" aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= level ? "on" : ""} />)}</span>;

function Frame({ src }: { src?: string }) {
  return <div className="col-frame">{src && <img src={src} alt="" loading="lazy" decoding="async" />}</div>;
}

function CountryCard({ card, meta, src, onOpen }: { card: CollectionCard; meta: Meta | undefined; src?: string; onOpen: () => void }) {
  const level = rarityLevel(card.mastery);
  if (card.mastery <= 0) {
    return <li><div className="col-card is-empty">
      <div className="col-frame"><Meridian /><span className="col-q" aria-hidden="true">?</span></div>
      <div className="col-meta"><span className="col-name">{t.collection.notFound}</span><div className="col-foot"><Pips level={0} /><span className="col-rl">—</span></div></div>
    </div></li>;
  }
  const sub = card.mastery >= 2 && meta?.cap ? meta.cap : placeLabel(meta);
  return <li><button type="button" className={`col-card col-l${level}`} data-card-id={card.id} onClick={onOpen} aria-haspopup="dialog" aria-label={t.collection.cardAria(card.name, level, LEVEL_NAMES[level])}>
    <Frame src={src} />
    <div className="col-meta"><span className="col-name">{card.name}</span><span className="col-sub">{sub}</span><div className="col-foot"><Pips level={level} /><span className="col-rl">{LEVEL_NAMES[level]}</span></div></div>
  </button></li>;
}

function HistoricalCardView({ card, src, onOpen }: { card: HistoricalAlbumCard; src?: string; onOpen: () => void }) {
  const tag = historicalTypeLabel(card.type);
  if (!card.discovered) {
    return <li><div className="col-card is-empty">
      <div className="col-frame"><Meridian /><span className="col-q" aria-hidden="true">?</span></div>
      <div className="col-meta"><span className="col-name">{t.collection.notFound}</span><div className="col-foot"><span className="col-tag">{tag}</span></div></div>
    </div></li>;
  }
  return <li><button type="button" className="col-card col-l2 is-historical" data-card-id={card.id} onClick={onOpen} aria-haspopup="dialog" aria-label={t.collection.historicalCardAria(card.name, tag)}>
    <Frame src={src} />
    <div className="col-meta"><span className="col-name">{card.name}</span><span className="col-sub col-period">{historicalPeriod(card.value)}</span><div className="col-foot"><span className={`col-tag is-${card.type}`}>{tag}</span><span className="col-tick"><Glyph name="check" size={16} stroke={2.4} /></span></div></div>
  </button></li>;
}

type DetailProps = {
  title: string; src?: string; onClose: () => void; onPrev?: () => void; onNext?: () => void; children: ReactNode; side: ReactNode;
};
// Janela sobre a grade no desktop; folha inferior no celular (mesmo <dialog>, muda só o CSS).
function CardDialog({ title, src, onClose, onPrev, onNext, children, side }: DetailProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // foco no corpo (não no primeiro botão): sem anel em "Fechar" ao abrir
    bodyRef.current?.focus({ preventScroll: true });
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  const keys = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft" && onPrev) { event.preventDefault(); onPrev(); }
    if (event.key === "ArrowRight" && onNext) { event.preventDefault(); onNext(); }
  };
  return <dialog ref={ref} className="col-dialog" aria-labelledby="col-dialog-title" onClose={onClose} onKeyDown={keys}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="col-dialog-body" ref={bodyRef} tabIndex={-1}>
      <span className="col-grab" aria-hidden="true" />
      <div className="col-dialog-tools">
        <button type="button" className="col-round" onClick={onPrev} disabled={!onPrev} aria-label={t.collection.prev}><Glyph name="left" /></button>
        <button type="button" className="col-round" onClick={onNext} disabled={!onNext} aria-label={t.collection.next}><Glyph name="right" /></button>
        <button type="button" className="col-round" onClick={onClose} aria-label={t.collection.close}><Glyph name="x" /></button>
      </div>
      <div className="col-dialog-left">
        <div className="col-bigframe">{src && <img src={src} alt={t.collection.flagAlt(title)} />}</div>
        {side}
      </div>
      <div className="col-dialog-right">{children}</div>
    </div>
  </dialog>;
}

function CountryDetail({ card, meta, names, src, onClose, onPrev, onNext }: { card: CollectionCard; meta: Meta | undefined; names?: Record<string, string>; src?: string; onClose: () => void; onPrev?: () => void; onNext?: () => void }) {
  const level = rarityLevel(card.mastery);
  const rows = cardDetailRows(meta, level, names);
  const hint = nextLevelHint(card.name, level, card.columns);
  const modes = modesDone(card.columns);
  return <CardDialog title={card.name} src={src} onClose={onClose} onPrev={onPrev} onNext={onNext} side={<>
    <div className={`col-levelbox col-l${level}`}><div><span className="col-rl">{t.collection.level(level)}</span><b>{LEVEL_NAMES[level]}</b></div><Pips level={level} /></div>
    <ol className={`col-ladder col-l${level}`} aria-label={t.collection.layersAria}>
      {LEVEL_STEPS.map((step) => <li key={step.level} className={`col-step ${step.level < level ? "is-done" : step.level === level ? "is-current" : ""}`} aria-current={step.level === level ? "step" : undefined}>
        <u aria-hidden="true">{step.level}</u><div><b>{step.title}</b><small>{t.collection.opens(step.opens)}</small></div>
      </li>)}
    </ol>
  </>}>
    <div className="col-headline"><span className="col-eyebrow">{placeLabel(meta)}</span><h2 id="col-dialog-title">{card.name}</h2><p>{t.collection.layersOpen(level)}</p></div>
    <div className="col-fields">
      {rows.map((row) => row.unlocked
        ? <div key={row.key} className={`col-fld ${row.wide ? "is-wide" : ""}`}><span className="k">{row.label}</span>
            {row.list && row.list.length > 0
              ? <ul className="col-chips-list">{row.list.map((name) => <li key={name}>{name}</li>)}</ul>
              : <span className={`v ${row.key === "nota" ? "is-note" : ""} ${row.text ? "" : "is-missing"}`}>{row.text ?? "—"}</span>}
          </div>
        : <div key={row.key} className={`col-fld is-locked ${row.wide ? "is-wide" : ""}`}><span className="k"><span className="kk"><Glyph name="lock" size={12} stroke={2} />{row.label}</span><span className="need">{t.collection.level(row.minLevel)}</span></span>
            <span className="sk" aria-hidden="true" /><span className="sk is-short" aria-hidden="true" /><span className="sr-only">{t.collection.opensAt(row.minLevel)}</span>
          </div>)}
    </div>
    {hint ? <div className="col-next"><b>{t.collection.nextLayer(hint.next, LEVEL_NAMES[hint.next])}</b><p>{hint.text}</p>
      <ul className="col-modes" aria-label={t.collection.modesAria}>{modes.map((mode) => <li key={mode.key} className={mode.done ? "is-done" : ""}>{mode.done && <Glyph name="check" size={14} stroke={2.4} />}{mode.label}<span className="sr-only">{mode.done ? t.collection.modeDone : t.collection.modeNotYet}</span></li>)}</ul>
    </div> : <div className="col-next is-complete"><b>{t.collection.complete}</b><p>{t.collection.completeHint}</p></div>}
  </CardDialog>;
}

function HistoricalDetail({ card, src, onClose, onPrev, onNext }: { card: HistoricalAlbumCard; src?: string; onClose: () => void; onPrev?: () => void; onNext?: () => void }) {
  const entity = card.value as HistoricalEntity | undefined;
  const facts: Array<[string, string]> = [
    [t.collection.type, historicalTypeLabel(card.type)], [t.collection.period, historicalPeriod(entity)], [t.collection.capital, entity?.cap ?? ""], [t.collection.successor, entity?.sucessor ?? ""],
  ];
  return <CardDialog title={card.name} src={src} onClose={onClose} onPrev={onPrev} onNext={onNext} side={<div className="col-levelbox col-l2"><div><span className="col-rl">{t.collection.historicalCollection}</span><b>{t.collection.discovered}</b></div><span className="col-tick"><Glyph name="check" size={20} stroke={2.4} /></span></div>}>
    <div className="col-headline"><span className="col-eyebrow">{placeLabel({ reg: card.region, sub: card.sub })}</span><h2 id="col-dialog-title">{card.name}</h2><p>{historicalPeriod(entity)}</p></div>
    <div className="col-fields">
      {facts.filter(([, value]) => value).map(([label, value]) => <div key={label} className="col-fld"><span className="k">{label}</span><span className="v">{value}</span></div>)}
      {entity?.fato && <div className="col-fld is-wide"><span className="k">{t.collection.historicalNote}</span><span className="v is-note">{entity.fato}</span></div>}
    </div>
  </CardDialog>;
}

export function CollectionView({ state, meta, names, initialRegion }: Props) {
  const [flags, setFlags] = useState<FlagCatalog>({});
  const [historicalFlags, setHistoricalFlags] = useState<FlagCatalog>({});
  const [historical, setHistorical] = useState<HistoricalEntity[]>([]);
  const [album, setAlbum] = useState<"countries" | "historical">("countries");
  const [region, setRegion] = useState<Region>(initialRegion ?? "mundo");
  const [level, setLevel] = useState<LevelFilter>("todas");
  const [unOnly, setUnOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [historicalType, setHistoricalType] = useState("todos");
  const [historicalState, setHistoricalState] = useState<StateFilter>("todas");
  const [selected, setSelected] = useState<string | null>(null);
  const lastOpened = useRef<string | null>(null);
  useEffect(() => { loadFlags().then(setFlags).catch(() => undefined); loadSpecialData().then((value) => { setHistoricalFlags(value.historicalFlags); setHistorical(value.historical); }).catch(() => undefined); }, []);

  const regionFilter = region === "mundo" ? "todas" : region;
  const cards = useMemo(() => sortByName(state.cards), [state.cards]);
  const counts = useMemo(() => levelCounts(cards), [cards]);
  const discovered = cards.length - counts[0];
  const visible = useMemo(() => filterCollectionCards(cards, {
    region: regionFilter, query, unOnly,
    mastery: /^[1-5]$/.test(level) ? Number(level) : "todas",
    state: level === "descobertas" ? "descobertas" : level === "faltando" ? "faltando" : "todas",
  }), [cards, regionFilter, query, unOnly, level]);
  const allHistorical = useMemo(() => sortByName(historicalAlbum(historical, state.historical)), [historical, state.historical]);
  const historicalDiscovered = allHistorical.filter((card) => card.discovered).length;
  const visibleHistorical = useMemo(() => filterHistoricalAlbum(allHistorical, regionFilter, historicalType, { query, state: historicalState }), [allHistorical, regionFilter, historicalType, query, historicalState]);
  const src = (catalog: FlagCatalog, flag?: string) => { const value = flag ? catalog[flag.toLowerCase()] : undefined; return value ? flagSource(value) : undefined; };

  const isCountries = album === "countries";
  const navigable: string[] = isCountries ? visible.filter((card) => card.mastery > 0).map((card) => card.id) : visibleHistorical.filter((card) => card.discovered).map((card) => card.id);
  const position = selected ? navigable.indexOf(selected) : -1;
  const openCard = (id: string) => { lastOpened.current = id; setSelected(id); };
  // ao fechar, devolve o foco à carta (o <dialog> só restaura se o clique tiver focado o botão; no Safari não focam)
  const closeCard = () => {
    setSelected(null);
    const id = lastOpened.current;
    if (id) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-card-id="${id}"]`)?.focus());
  };
  const go = (delta: number) => { const next = navigable[position + delta]; if (position >= 0 && next) openCard(next); };
  const selectedCountry = isCountries && selected ? cards.find((card) => card.id === selected) : undefined;
  const selectedHistorical = !isCountries && selected ? allHistorical.find((card) => card.id === selected) : undefined;
  const switchAlbum = (next: "countries" | "historical") => { setAlbum(next); setQuery(""); setSelected(null); };
  const clearFilters = () => { setRegion("mundo"); setLevel("todas"); setUnOnly(false); setQuery(""); setHistoricalType("todos"); setHistoricalState("todas"); };
  const pick = (chip: HTMLElement) => chip.scrollIntoView?.({ inline: "center", block: "nearest" });
  const shown = isCountries ? visible.length : visibleHistorical.length;
  const total = isCountries ? cards.length : allHistorical.length;

  const missing = cards.length - discovered;
  const heroLegend = isCountries
    ? <>{[1, 2, 3, 4, 5].map((n) => <li key={n} className={`col-l${n}`}><span className="pg-dot" />{LEVEL_NAMES[n]} <b>{counts[n]}</b></li>)}<li><span className="pg-dot is-none" />{t.collection.missingLabel} <b>{counts[0]}</b></li></>
    : <>{Object.entries(HISTORICAL_TYPES).map(([key, item]) => {
        const group = allHistorical.filter((card) => card.type === key);
        return <li key={key}><span className={`pg-dot is-${key}`} />{item.plural} <b>{group.filter((card) => card.discovered).length}/{group.length}</b></li>;
      })}</>;

  return <section className="col" aria-label={t.collection.aria}>
    <ProgressHero
      value={isCountries ? discovered : historicalDiscovered} total={isCountries ? cards.length : allHistorical.length}
      ringLabel={isCountries ? t.collection.ringCountries(discovered, cards.length) : t.collection.ringHistorical(historicalDiscovered, allHistorical.length)}
      eyebrow={isCountries ? t.collection.eyebrow : t.collection.eyebrowHistorical} title={isCountries ? t.collection.title : t.collection.titleHistorical}
      lede={isCountries ? t.collection.lede : t.collection.ledeHistorical}
      summary={isCountries
        ? (missing > 0 ? <b>{t.collection.missingAtlas(missing)}</b> : <b>{t.collection.atlasComplete}</b>)
        : (allHistorical.length - historicalDiscovered > 0 ? <b>{t.collection.missing(allHistorical.length - historicalDiscovered)}</b> : <b>{t.collection.complete2}</b>)}
      legendLabel={isCountries ? t.collection.legend : t.collection.legendHistorical} legend={heroLegend}
    />

    <div className="col-toolbar">
      <div className="col-tabs" role="group" aria-label={t.collection.album}>
        <button type="button" className="col-tab" aria-pressed={isCountries} onClick={() => switchAlbum("countries")}>{t.collection.countries} <em>{discovered}/{cards.length}</em></button>
        <button type="button" className="col-tab" aria-pressed={!isCountries} onClick={() => switchAlbum("historical")}>{t.collection.historical} <em>{historicalDiscovered}/{allHistorical.length}</em></button>
      </div>
      <div className="col-tools">
        {isCountries && <label className="col-switch"><input type="checkbox" checked={unOnly} onChange={(event) => setUnOnly(event.target.checked)} /><i aria-hidden="true" />{t.collection.onlyUn}</label>}
        <label className="col-search"><Glyph name="search" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isCountries ? t.collection.searchCountry : t.collection.searchEntity} aria-label={isCountries ? t.collection.searchCountryAria : t.collection.searchEntityAria} /></label>
      </div>
    </div>

    <div className="col-frow"><span className="col-flabel">{t.collection.region}</span>
      <div className="pg-chips" role="group" aria-label={t.collection.regionFilter}>
        {REGION_ITEMS.map(([key, name]) => <button type="button" className="pg-chip" key={key} aria-pressed={region === key} onClick={(event) => { setRegion(key); pick(event.currentTarget); }}>{name}</button>)}
      </div>
    </div>
    {isCountries
      ? <div className="col-frow"><span className="col-flabel">{t.collection.levelLabel}</span>
          <div className="pg-chips" role="group" aria-label={t.collection.levelFilter}>
            {([["todas", t.collection.all, cards.length], ["descobertas", t.collection.discoveredPlural, discovered], ["faltando", t.collection.missingLabel, counts[0]]] as const).map(([key, label, count]) => <button type="button" className="pg-chip" key={key} aria-pressed={level === key} onClick={(event) => { setLevel(key); pick(event.currentTarget); }}>{label} <em>{count}</em></button>)}
            <span className="col-sep" aria-hidden="true" />
            {([1, 2, 3, 4, 5] as const).map((n) => <button type="button" className={`pg-chip col-l${n}`} key={n} aria-pressed={level === String(n)} onClick={(event) => { setLevel(String(n) as LevelFilter); pick(event.currentTarget); }}><span className="pg-dot" aria-hidden="true" />{LEVEL_NAMES[n]} <em>{counts[n]}</em></button>)}
          </div>
        </div>
      : <div className="col-frow"><span className="col-flabel">{t.collection.typeLabel}</span>
          <div className="pg-chips" role="group" aria-label={t.collection.typeFilter}>
            <button type="button" className="pg-chip" aria-pressed={historicalType === "todos"} onClick={(event) => { setHistoricalType("todos"); pick(event.currentTarget); }}>{t.collection.allTypes} <em>{allHistorical.length}</em></button>
            {Object.entries(HISTORICAL_TYPES).map(([key, item]) => <button type="button" className="pg-chip" key={key} aria-pressed={historicalType === key} onClick={(event) => { setHistoricalType(key); pick(event.currentTarget); }}>{item.label} <em>{allHistorical.filter((card) => card.type === key).length}</em></button>)}
            <span className="col-sep" aria-hidden="true" />
            {([["descobertas", t.collection.discoveredPlural, historicalDiscovered], ["faltando", t.collection.missingLabel, allHistorical.length - historicalDiscovered]] as const).map(([key, label, count]) => <button type="button" className="pg-chip" key={key} aria-pressed={historicalState === key} onClick={(event) => { setHistoricalState(historicalState === key ? "todas" : key); pick(event.currentTarget); }}>{label} <em>{count}</em></button>)}
          </div>
        </div>}

    <div className="col-gh"><h2>{isCountries ? t.collection.countries : t.collection.historical}</h2><span className="col-count" aria-live="polite">{shown === total ? t.collection.cards(total) : t.collection.cardsOf(shown, total)}</span><span className="col-rule" /><span className="col-order"><Glyph name="sort" size={16} />{t.collection.order}</span></div>

    {shown === 0
      ? <div className="col-empty"><p>{total === 0 ? t.collection.loading : t.collection.none}</p>{total > 0 && <button type="button" className="pg-chip" onClick={clearFilters}>{t.collection.clear}</button>}</div>
      : <ul className="col-grid">
          {isCountries
            ? visible.map((card) => <CountryCard key={card.id} card={card} meta={meta[card.id]} src={src(flags, card.flag)} onOpen={() => openCard(card.id)} />)
            : visibleHistorical.map((card) => <HistoricalCardView key={card.id} card={card} src={src(historicalFlags, card.flag)} onOpen={() => openCard(card.id)} />)}
        </ul>}

    {selectedCountry && selectedCountry.mastery > 0 && <CountryDetail card={selectedCountry} meta={meta[selectedCountry.id]} names={names} src={src(flags, selectedCountry.flag)} onClose={closeCard} onPrev={position > 0 ? () => go(-1) : undefined} onNext={position >= 0 && position < navigable.length - 1 ? () => go(1) : undefined} />}
    {selectedHistorical && selectedHistorical.discovered && <HistoricalDetail card={selectedHistorical} src={src(historicalFlags, selectedHistorical.flag)} onClose={closeCard} onPrev={position > 0 ? () => go(-1) : undefined} onNext={position >= 0 && position < navigable.length - 1 ? () => go(1) : undefined} />}
  </section>;
}
