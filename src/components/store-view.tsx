// A Loja (reimaginada em 03/10/2026, mock em mockups-carta-cega/hub-final): destaque, abas por categoria, sugestões, temas, modos, rodadas,
// suprimentos, temas de liga e o Mecenato. Toda compra passa por uma confirmação (preço, saldo e saldo depois).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon, type IconType } from "./icons";
import { LEAGUE_THEMES, SHOP_THEMES, THEME_TIERS, isThemeOwned, missingCoins, themeById, type Theme, type ThemeTier } from "../domain/themes";
import { SUPPLY_COST, SUPPLY_IDS, type SupplyCounts, type SupplyId } from "../domain/supplies";
import { pickShowcaseTheme } from "../domain/hub-showcase";
import { storeCounts, storeModes, storeRounds, storeSuggestions, type StoreMode, type StoreRounds, type Suggestion } from "../domain/store-catalog";
import type { EconomySnapshot } from "../domain/economy-store";
import type { AnyQuizVariant, Family } from "../domain/types";
import type { RoundUnlockKey } from "../domain/pace";
import { MUSEUM_PIECES } from "../domain/museum";
import { SupplyArt } from "./supply-art";
import { formatNumber as money, t } from "../domain/i18n";

// Prévias do Hub de cada tema (geradas por scripts/build-theme-previews.mjs). Sem a imagem, a amostra de cores ocupa o lugar.
const PREVIEWS = import.meta.glob("../assets/themes/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const previewFor = (id: string) => PREVIEWS[`../assets/themes/${id}.webp`];

type Props = {
  /** A aba que abre primeiro (a Vitrine do Hub leva direto aos Suprimentos). */
  initialTab?: StoreTab;
  economy: EconomySnapshot;
  activeTheme: string;
  onEquip: (id: string) => void;
  onBuy: (id: string) => Promise<void>;
  supplies: SupplyCounts;
  onBuySupply: (id: SupplyId, qty: number) => Promise<void>;
  onBuyMode: (family: Family, variant: AnyQuizVariant) => Promise<void>;
  onBuyRounds: (key: RoundUnlockKey) => Promise<void>;
  onOpenMuseum: () => void;
  onBack: () => void;
};

const modeIcon = (variant: AnyQuizVariant): IconType => variant.startsWith("silhueta") ? "puzzle" : variant.startsWith("escrita") ? "type" : variant.startsWith("historica") ? "clock" : variant.startsWith("idioma") ? "language" : variant === "travel" ? "route" : "map";
/** O texto do modo (o mesmo da configuração da partida) para a variante; o Travel e as silhuetas têm chave própria. */
const MODE_TEXT_KEY: Record<string, string> = { "silhueta-opcoes": "silhueta-opcoes", silhueta: "silhueta", travel: "travel", "escrita-pais": "escrita-pais", "escrita-capital": "escrita-capital", "historica-nome": "historicas", "idioma-nome": "idioma-nome", "idioma-pais": "idioma-pais" };
const modeName = (variant: string) => t.store.modeNames[variant] ?? variant;
const modeBlurb = (variant: string) => (t.modes as unknown as Record<string, readonly string[]>)[MODE_TEXT_KEY[variant] ?? variant]?.[1] ?? "";

/** O que está aberto na confirmação de compra. */
type Pending =
  | { kind: "theme"; theme: Theme }
  | { kind: "mode"; mode: StoreMode }
  | { kind: "rounds"; rounds: StoreRounds }
  | { kind: "supply"; id: SupplyId; qty: number };

export type StoreTab = "all" | "themes" | "modes" | "rounds" | "supplies" | "leagues";
type Tab = StoreTab;

const pendingInfo = (pending: Pending) => {
  if (pending.kind === "theme") return { name: pending.theme.name, blurb: pending.theme.tagline, price: pending.theme.cost, permanent: true };
  if (pending.kind === "mode") return { name: modeName(pending.mode.variant), blurb: modeBlurb(pending.mode.variant), price: pending.mode.price, permanent: true };
  if (pending.kind === "rounds") return { name: t.roundUnlocks[pending.rounds.tier as "long" | "fifty" | "hundred" | "all"], blurb: t.store.roundBlurbs[pending.rounds.tier], price: pending.rounds.price, permanent: true };
  return { name: t.supplies[pending.id].name, blurb: t.supplies[pending.id].detail, price: SUPPLY_COST[pending.id] * pending.qty, permanent: false };
};

function Art({ icon, size = 38 }: { icon: IconType; size?: number }) {
  return <span className="st-art" aria-hidden="true"><Icon type={icon} size={size} /></span>;
}

function Price({ value }: { value: number }) {
  return <span className="st-price" aria-label={t.store.priceAria(money(value))}><i aria-hidden="true">$</i><b>{money(value)}</b></span>;
}

/** Cartão genérico de um item à venda (tema, modo, corte de rodadas ou suprimento). Clicar abre a confirmação. */
function Card({ art, ribbon, owned, name, blurb, price, balance, onOpen, extra, action }: {
  art: ReactNode; ribbon?: string; owned: boolean; name: string; blurb: string; price: number; balance: number; onOpen?: () => void; extra?: ReactNode; action?: ReactNode;
}) {
  const missing = missingCoins(price, balance);
  return <article className={`st-card${owned ? " is-owned" : ""}`}>
    <div className="st-card-art">{art}{ribbon && <span className="st-ribbon">{ribbon}</span>}{owned && <span className="st-owned"><Icon type="check" size={13} /> {t.store.mine}</span>}</div>
    <div className="st-card-body"><h3>{name}</h3><p>{blurb}</p>{extra}</div>
    <div className="st-card-foot">
      {action ?? (owned
        ? <span className="st-state">{t.store.bought}</span>
        : <>
          <Price value={price} />
          {missing > 0
            ? <span className="st-btn is-missing" aria-label={t.store.missingAria(name, money(missing))}>{t.store.missing(money(missing))}</span>
            : <button type="button" className="st-btn" onClick={onOpen}>{t.store.buy}</button>}
        </>)}
    </div>
  </article>;
}

function ThemeArt({ theme }: { theme: Theme }) {
  const preview = previewFor(theme.id);
  return preview
    ? <img className="st-thumb" src={preview} alt={t.store.previewAlt(theme.name)} loading="lazy" width={640} height={323} />
    : <div className="st-thumb is-fallback" role="img" aria-label={t.store.colorsAria(theme.name)} style={{ background: `linear-gradient(90deg,${theme.swatches.map((color, index) => `${color} ${index * 25}% ${(index + 1) * 25}%`).join(",")})` }} />;
}

const Swatches = ({ theme }: { theme: Theme }) => <span className="store-swatches" aria-hidden="true">{theme.swatches.map((color) => <i key={color} style={{ background: color }} />)}</span>;

/** A confirmação de compra: o item, o preço, o saldo e o saldo depois. */
function PurchaseDialog({ pending, balance, busy, onConfirm, onCancel, onQty }: { pending: Pending; balance: number; busy: boolean; onConfirm: () => void; onCancel: () => void; onQty: (qty: number) => void }) {
  const info = pendingInfo(pending);
  const missing = missingCoins(info.price, balance);
  const confirm = useRef<HTMLButtonElement>(null);
  const titleId = "st-dialog-title";
  useEffect(() => { confirm.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const art = pending.kind === "theme" ? <ThemeArt theme={pending.theme} />
    : pending.kind === "supply" ? <span className="st-art is-supply" data-supply={pending.id} aria-hidden="true"><SupplyArt id={pending.id} size={84} /></span>
    : <Art icon={pending.kind === "mode" ? modeIcon(pending.mode.variant) : "layers"} size={44} />;
  return <div className="st-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="st-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="st-x" onClick={onCancel} aria-label={t.store.close}><Icon type="close" size={16} /></button>
      <div className="st-dialog-art">{art}</div>
      <span className="st-kicker">{t.store.confirmKicker}</span>
      <h2 id={titleId}>{info.name}</h2>
      <p className="st-dialog-blurb">{info.blurb}</p>
      {pending.kind === "supply" && <div className="st-qty" role="group" aria-label={info.name}>
        <button type="button" className="st-btn is-ghost" onClick={() => onQty(Math.max(1, pending.qty - 1))} disabled={pending.qty <= 1} aria-label={t.store.supplies.less}>−</button>
        <b>{pending.qty}</b>
        <button type="button" className="st-btn is-ghost" onClick={() => onQty(pending.qty + 1)} aria-label={t.store.supplies.more}>+</button>
      </div>}
      <dl className="st-rows">
        <div><dt>{t.store.rowPrice}</dt><dd><Price value={info.price} /></dd></div>
        <div><dt>{t.store.rowBalance}</dt><dd>{money(balance)}</dd></div>
        {missing > 0
          ? <div><dt>{t.store.rowMissing}</dt><dd className="is-bad">{money(missing)}</dd></div>
          : <div><dt>{t.store.rowAfter}</dt><dd>{money(balance - info.price)}</dd></div>}
      </dl>
      {info.permanent && <small className="st-note">{t.store.permanent}</small>}
      <div className="st-dialog-actions">
        <button type="button" className="st-btn is-ghost" onClick={onCancel}>{t.store.notNow}</button>
        <button type="button" className="st-btn is-buy" ref={confirm} disabled={busy || missing > 0} onClick={onConfirm}>{pending.kind === "supply" ? t.store.supplies.buy(pending.qty) : t.store.confirm}</button>
      </div>
    </div>
  </div>;
}

export function StoreView({ initialTab = "all", economy, activeTheme, onEquip, onBuy, supplies, onBuySupply, onBuyMode, onBuyRounds, onOpenMuseum, onBack }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const { balance, unlocked } = economy;
  const counts = storeCounts(unlocked);
  const featured = pickShowcaseTheme(balance, unlocked);
  const modes = useMemo(() => storeModes(unlocked), [unlocked]);
  const rounds = useMemo(() => storeRounds(unlocked), [unlocked]);
  const suggestions = storeSuggestions(balance, unlocked, featured?.id ?? null);
  const leagueOwned = LEAGUE_THEMES.filter((theme) => isThemeOwned(theme.id, unlocked)).length;

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === "theme") { await onBuy(pending.theme.id); setNotice(t.store.boughtNotice(pending.theme.name)); }
      else if (pending.kind === "mode") { await onBuyMode(pending.mode.family, pending.mode.variant); setNotice(t.store.boughtGeneric(modeName(pending.mode.variant))); }
      else if (pending.kind === "rounds") { await onBuyRounds(pending.rounds.key); setNotice(t.store.boughtRounds(t.roundUnlocks[pending.rounds.tier as "long" | "fifty" | "hundred" | "all"])); }
      else { await onBuySupply(pending.id, pending.qty); setNotice(t.store.supplies.boughtNotice(t.supplies[pending.id].name, pending.qty)); }
      setPending(null);
    } catch { setNotice(pending.kind === "supply" ? t.store.supplies.buyFailed : t.store.buyFailed); setPending(null); }
    setBusy(false);
  };
  const equip = (theme: Theme) => { onEquip(theme.id); setNotice(t.store.equipped(theme.name)); };

  const themeCard = (theme: Theme, league = false) => {
    const owned = isThemeOwned(theme.id, unlocked);
    const active = theme.id === activeTheme;
    const leagueName = theme.league ? t.duel.leagues[theme.league] : "";
    const ribbon = theme.league ? t.store.leagueBadge(leagueName) : theme.tier === "elaborate" || theme.tier === "prestige" ? t.store.tierBadge[theme.tier] : theme.tier ? t.store.tiers[theme.tier][0] : undefined;
    const use = owned ? (active
      ? <button type="button" className="st-btn is-current" disabled aria-current="true">{t.store.inUse}</button>
      : <button type="button" className="st-btn is-use" onClick={() => equip(theme)}>{t.store.use}</button>) : undefined;
    return <Card
      key={theme.id} art={<ThemeArt theme={theme} />} ribbon={ribbon} owned={owned} name={theme.name} blurb={theme.tagline}
      price={theme.cost} balance={balance} onOpen={() => setPending({ kind: "theme", theme })}
      extra={<Swatches theme={theme} />}
      action={league
        ? (owned ? use : <span className="st-state">{t.store.lockedLeague(leagueName)}</span>)
        : use}
    />;
  };
  const modeCard = (mode: StoreMode) => <Card key={mode.key} art={<Art icon={modeIcon(mode.variant)} />} owned={mode.owned} name={modeName(mode.variant)} blurb={modeBlurb(mode.variant)} price={mode.price} balance={balance} onOpen={() => setPending({ kind: "mode", mode })} />;
  const roundsCard = (item: StoreRounds) => <Card key={item.key} art={<Art icon="layers" />} owned={item.owned} name={t.roundUnlocks[item.tier as "long" | "fifty" | "hundred" | "all"]} blurb={t.store.roundBlurbs[item.tier]} price={item.price} balance={balance} onOpen={() => setPending({ kind: "rounds", rounds: item })} />;
  const supplyCard = (id: SupplyId) => <Card key={id} art={<span className="st-art is-supply" data-supply={id} aria-hidden="true"><SupplyArt id={id} size={72} /></span>} owned={false} name={t.supplies[id].name} blurb={t.supplies[id].detail} price={SUPPLY_COST[id]} balance={balance} onOpen={() => setPending({ kind: "supply", id, qty: 1 })}
    extra={<small className="st-stock">{t.store.supplies.owned(supplies[id])}</small>} />;
  const suggestionCard = (item: Suggestion) => item.kind === "theme" ? themeCard(item.theme) : item.kind === "mode" ? modeCard(item.mode) : item.kind === "rounds" ? roundsCard(item.rounds) : supplyCard(item.id);

  const shop = SHOP_THEMES.filter((theme) => theme.cost > 0);
  const byOwnership = (list: readonly Theme[]) => [...list].sort((a, b) => Number(isThemeOwned(a.id, unlocked)) - Number(isThemeOwned(b.id, unlocked)) || a.cost - b.cost);
  const heading = (title: string, sub?: ReactNode, id?: string) => <div className="st-sec"><h2 id={id}>{title}</h2>{sub && <span>{sub}</span>}</div>;
  const tabs: Array<[Tab, string, string]> = [
    ["all", t.store.tabAll, ""],
    ["themes", t.store.tabThemes, counts.themes > 0 ? String(counts.themes) : ""],
    ["modes", t.store.tabModes, counts.modes > 0 ? String(counts.modes) : ""],
    ["rounds", t.store.tabRounds, counts.rounds > 0 ? String(counts.rounds) : ""],
    ["supplies", t.store.suppliesTab, ""],
    ["leagues", t.store.leagueTab, `${leagueOwned}/${LEAGUE_THEMES.length}`],
  ];
  const showAll = tab === "all";

  return <section className="st" aria-label={t.store.aria}>
    <header className="st-bar">
      <button type="button" className="st-back" onClick={onBack}>{t.common.backHub}</button>
      <div className="st-crumb"><small>{t.store.eyebrow}</small><h1>{t.store.title}</h1></div>
      <span className="st-balance" aria-label={t.hub.coinAria(money(balance))}><i aria-hidden="true">$</i><b>{money(balance)}</b></span>
    </header>
    {featured && showAll && (() => {
      const missing = missingCoins(featured.cost, balance);
      return <section className="st-hero" aria-label={t.store.heroKicker}>
        <div className="st-hero-t">
          <span className="st-kicker"><Icon type="star" size={13} /> {t.store.heroKicker}</span>
          <h2>{featured.name}</h2>
          <p>{featured.tagline}</p>
          <div className="st-hero-sw"><Swatches theme={featured} /><small>{featured.tier ? t.store.tiers[featured.tier][0] : ""}</small></div>
          <div className="st-hero-buy">
            <Price value={featured.cost} />
            {missing > 0 && <div className="st-need"><span className="st-bar-track"><i style={{ width: `${Math.min(100, (balance / featured.cost) * 100)}%` }} /></span><small>{t.store.heroNeed(money(balance), money(missing))}</small></div>}
          </div>
          <div className="st-hero-act">
            {missing > 0
              ? <span className="st-btn is-missing">{t.store.missing(money(missing))}</span>
              : <button type="button" className="st-btn is-buy" onClick={() => setPending({ kind: "theme", theme: featured })}>{t.store.buy}</button>}
          </div>
        </div>
        <div className="st-hero-img"><div className="st-frame"><ThemeArt theme={featured} /></div></div>
      </section>;
    })()}
    <div className="st-tabs" role="group" aria-label={t.store.tabsAria}>
      {tabs.map(([key, label, count]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => { setTab(key); setNotice(""); }}>{label}{count && <em>{count}</em>}</button>)}
    </div>
    <p className="st-notice" role="status" aria-live="polite">{notice}</p>

    {showAll && suggestions.length > 0 && <section aria-labelledby="st-sug">{heading(t.store.suggestions, t.store.suggestionsSub, "st-sug")}<div className="st-grid">{suggestions.map(suggestionCard)}</div></section>}
    {(showAll || tab === "themes") && <section aria-labelledby="st-themes">
      {heading(t.store.themesTitle, <>{t.store.themesCount(SHOP_THEMES.length)}{showAll && <> <button type="button" className="st-link" onClick={() => setTab("themes")}>{t.store.seeAll} <Icon type="arrow" size={14} /></button></>}</>, "st-themes")}
      {showAll
        ? <div className="st-grid">{byOwnership(shop.filter((theme) => theme.id !== featured?.id)).slice(0, 4).map((theme) => themeCard(theme))}</div>
        : THEME_TIERS.filter((tier) => SHOP_THEMES.some((theme) => theme.tier === tier)).map((tier: ThemeTier) => <div key={tier} className="st-tier">
          <div className="st-sec is-tier"><h3>{t.store.tiers[tier][0]}</h3><span>{t.store.tiers[tier][1]}</span></div>
          <div className="st-grid">{SHOP_THEMES.filter((theme) => theme.tier === tier).map((theme) => themeCard(theme))}</div>
        </div>)}
    </section>}
    {(showAll || tab === "modes") && <section aria-labelledby="st-modes">{heading(t.store.modesTitle, t.store.modesSub, "st-modes")}<div className="st-grid">{modes.map(modeCard)}</div></section>}
    {(showAll || tab === "rounds") && <section aria-labelledby="st-rounds">{heading(t.store.roundsTitle, t.store.roundsSub, "st-rounds")}<div className="st-grid">{rounds.map(roundsCard)}</div></section>}
    {(showAll || tab === "supplies") && <section className="st-supplies" aria-labelledby="st-sup">
      {heading(t.store.suppliesTab, t.store.suppliesSub, "st-sup")}<p className="st-note">{t.store.supplies.note}</p>
      <div className="st-grid">{SUPPLY_IDS.map(supplyCard)}</div>
    </section>}
    {tab === "leagues" && <section aria-labelledby="st-leagues">{heading(t.store.leagueThemes, t.store.leagueOwned(leagueOwned, LEAGUE_THEMES.length), "st-leagues")}<p className="st-note">{t.store.leagueThemesNote}</p><div className="st-grid">{LEAGUE_THEMES.map((theme) => themeCard(theme, true))}</div></section>}
    {showAll && <section className="st-museum-sec" aria-label={t.store.museumTitle}>
      <button type="button" className="st-museum" onClick={onOpenMuseum}>
        <span className="st-museum-img" style={{ backgroundImage: `url(${MUSEUM_PIECES[0].image})` }} aria-hidden="true" />
        <span className="st-museum-t"><small>{t.hub.museumName}</small><b>{t.hub.mecenato}</b><span>{t.store.museumSub}</span></span>
        <span className="st-btn is-light">{t.hub.museumVisit} <Icon type="arrow" size={14} /></span>
      </button>
    </section>}
    {pending && <PurchaseDialog pending={pending} balance={balance} busy={busy} onConfirm={() => void confirm()} onCancel={() => setPending(null)} onQty={(qty) => setPending((current) => (current && current.kind === "supply" ? { ...current, qty } : current))} />}
  </section>;
}
