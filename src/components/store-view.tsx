import { useState } from "react";
import { ProgressHero } from "./progress-hero";
import { Icon, type IconType } from "./icons";
import { LEAGUE_THEMES, SHOP_THEMES, THEMES, THEME_TIERS, isThemeOwned, missingCoins, themeById, type Theme, type ThemeTier } from "../domain/themes";
import { SUPPLY_COST, SUPPLY_IDS, type SupplyCounts, type SupplyId } from "../domain/supplies";
import type { EconomySnapshot } from "../domain/economy-store";
import { formatNumber as money, t } from "../domain/i18n";

// Prévias do Hub de cada tema (geradas por scripts/build-theme-previews.mjs). Sem a imagem, a amostra de cores ocupa o lugar.
const PREVIEWS = import.meta.glob("../assets/themes/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const previewFor = (id: string) => PREVIEWS[`../assets/themes/${id}.webp`];

type Props = {
  economy: EconomySnapshot;
  activeTheme: string;
  onEquip: (id: string) => void;
  onBuy: (id: string) => Promise<void>;
  supplies: SupplyCounts;
  onBuySupply: (id: SupplyId, qty: number) => Promise<void>;
};

const SUPPLY_ICON: Record<SupplyId, IconType> = { ampulheta: "hourglass", bussola: "compass", lupa: "search" };

function SupplyCard({ id, count, price, busy, onBuy }: { id: SupplyId; count: number; price: number; busy: boolean; onBuy: (qty: number) => Promise<void> }) {
  const [qty, setQty] = useState(1);
  return <article className="store-card store-card-supply" aria-labelledby={`supply-${id}`}>
    <div className="store-thumb store-thumb-fallback supply-thumb" aria-hidden="true"><Icon type={SUPPLY_ICON[id]} size={32} /></div>
    <div className="store-body">
      <div className="store-head"><h3 id={`supply-${id}`}>{t.supplies[id].name}</h3></div>
      <p>{t.supplies[id].detail}</p>
      <div className="store-foot">
        <span className="store-state">{t.store.supplies.owned(count)}</span>
        <span className="store-price" aria-label={t.store.supplies.unitPrice(money(price))}><i aria-hidden="true">$</i>{money(price)}</span>
      </div>
      <div className="store-qty" role="group" aria-label={t.supplies[id].name}>
        <button type="button" className="store-btn" onClick={() => setQty((value) => Math.max(1, value - 1))} disabled={qty <= 1} aria-label={t.store.supplies.less}>−</button>
        <b>{qty}</b>
        <button type="button" className="store-btn" onClick={() => setQty((value) => value + 1)} aria-label={t.store.supplies.more}>+</button>
      </div>
      <button type="button" className="store-btn primary" disabled={busy} onClick={() => void onBuy(qty)}>{t.store.supplies.buy(qty)} · {money(price * qty)}</button>
    </div>
  </article>;
}

function ThemeCard({ theme, active, owned, balance, pending, busy, onEquip, onAskBuy, onConfirm, onCancel }: {
  theme: Theme; active: boolean; owned: boolean; balance: number; pending: boolean; busy: boolean;
  onEquip: () => void; onAskBuy: () => void; onConfirm: () => void; onCancel: () => void;
}) {
  const missing = missingCoins(theme.cost, balance);
  const preview = previewFor(theme.id);
  const leagueName = theme.league ? t.duel.leagues[theme.league] : "";
  return <article className={`store-card${active ? " is-active" : ""}${owned ? "" : " is-locked"}${theme.league ? " is-league" : ""}`} aria-labelledby={`theme-${theme.id}`}>
    {theme.league && <span className="store-badge">{t.store.leagueBadge(leagueName)}</span>}
    {(theme.tier === "elaborate" || theme.tier === "prestige") && <span className="store-badge">{t.store.tierBadge[theme.tier]}</span>}
    {preview
      ? <img className="store-thumb" src={preview} alt={t.store.previewAlt(theme.name)} loading="lazy" width={640} height={323} />
      : <div className="store-thumb store-thumb-fallback" role="img" aria-label={t.store.colorsAria(theme.name)} style={{ background: `linear-gradient(90deg,${theme.swatches.map((color, index) => `${color} ${index * 25}% ${(index + 1) * 25}%`).join(",")})` }} />}
    <div className="store-body">
      <div className="store-head">
        <h3 id={`theme-${theme.id}`}>{theme.name}</h3>
        <span className="store-swatches" aria-hidden="true">{theme.swatches.map((color) => <i key={color} style={{ background: color }} />)}</span>
      </div>
      <p>{theme.tagline}</p>
      <div className="store-foot">
        {theme.league ? <span className="store-state">{owned ? t.store.earned(leagueName) : t.store.lockedLeague(leagueName)}</span>
        : owned ? <span className="store-state">{theme.cost === 0 ? t.store.default : t.store.bought}</span>
          : <span className="store-price" aria-label={t.store.priceAria(money(theme.cost))}><i aria-hidden="true">$</i>{money(theme.cost)}</span>}
        {active ? <button type="button" className="store-btn is-current" disabled aria-current="true">{t.store.inUse}</button>
          : owned ? <button type="button" className="store-btn primary" onClick={onEquip}>{t.store.use}</button>
          : theme.league ? null
          : missing > 0 ? <button type="button" className="store-btn" disabled aria-label={t.store.missingAria(theme.name, money(missing))}>{t.store.missing(money(missing))}</button>
          : <button type="button" className="store-btn primary" disabled={busy} onClick={onAskBuy} aria-expanded={pending}>{t.store.buy}</button>}
      </div>
      {pending && <p className="store-confirm" role="status">
        {(() => { const [a, name, b] = t.store.confirmText(theme.name, money(theme.cost)); return <>{a}<b>{name}</b>{b}</>; })()}
        <span><button type="button" className="store-btn primary" disabled={busy} onClick={onConfirm}>{t.store.confirm}</button><button type="button" className="store-btn" disabled={busy} onClick={onCancel}>{t.store.cancel}</button></span>
      </p>}
    </div>
  </article>;
}

/** Os submenus da Loja: uma faixa de preço por vez, os temas de liga e os Suprimentos de expedição. */
type Tab = ThemeTier | "league" | "supplies";

export function StoreView({ economy, activeTheme, onEquip, onBuy, supplies, onBuySupply }: Props) {
  const [picked, setPicked] = useState<Tab | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const ownedCount = THEMES.filter((theme) => isThemeOwned(theme.id, economy.unlocked)).length;
  const toBuy = SHOP_THEMES.filter((theme) => !isThemeOwned(theme.id, economy.unlocked)).length;
  const leagueOwned = LEAGUE_THEMES.filter((theme) => isThemeOwned(theme.id, economy.unlocked)).length;
  const active = themeById(activeTheme) ?? THEMES[0];
  const buy = async (theme: Theme) => {
    setBusy(true);
    try { await onBuy(theme.id); setNotice(t.store.boughtNotice(theme.name)); }
    catch { setNotice(t.store.buyFailed); }
    setPending(null);
    setBusy(false);
  };
  const buySupply = async (id: SupplyId, qty: number) => {
    setBusy(true);
    try { await onBuySupply(id, qty); setNotice(t.store.supplies.boughtNotice(t.supplies[id].name, qty)); }
    catch { setNotice(t.store.supplies.buyFailed); }
    setBusy(false);
  };
  const equip = (theme: Theme) => { onEquip(theme.id); setNotice(t.store.equipped(theme.name)); };
  // Submenus: só as faixas que têm tema, mais os de liga e os Suprimentos (sempre presente). Abre na primeira faixa que ainda tem o que comprar.
  const leftIn = (tier: ThemeTier) => SHOP_THEMES.filter((theme) => theme.tier === tier && !isThemeOwned(theme.id, economy.unlocked)).length;
  const tabs: Tab[] = [...THEME_TIERS.filter((tier) => SHOP_THEMES.some((theme) => theme.tier === tier)), ...(LEAGUE_THEMES.length ? (["league"] as const) : []), "supplies"];
  const current: Tab = picked && tabs.includes(picked) ? picked : tabs.find((tab): tab is ThemeTier => tab !== "league" && tab !== "supplies" && leftIn(tab) > 0) ?? tabs[0];
  const pick = (tab: Tab) => { setPicked(tab); setPending(null); setNotice(""); };
  const cardOf = (theme: Theme, league: boolean) => <ThemeCard
    key={theme.id} theme={theme} active={theme.id === activeTheme} owned={isThemeOwned(theme.id, economy.unlocked)}
    balance={economy.balance} pending={!league && pending === theme.id} busy={busy}
    onEquip={() => equip(theme)} onAskBuy={() => { setNotice(""); setPending(theme.id); }} onCancel={() => setPending(null)} onConfirm={() => void buy(theme)}
  />;

  return <section className="store" aria-label={t.store.aria}>
    <ProgressHero
      value={ownedCount} total={THEMES.length} ringLabel={t.store.ringLabel(ownedCount, THEMES.length)}
      eyebrow={t.store.eyebrow} title={t.store.title}
      lede={t.store.lede}
      summary={<><b>{t.store.balance}</b>{t.store.balanceText(money(economy.balance))}</>}
      legendLabel={t.store.legend}
      legend={<><li>{t.store.inUseLegend} <b>{active.name}</b></li><li>{t.store.themes} <b>{ownedCount}/{THEMES.length}</b></li></>}
    />
    <div className="store-sec"><h2>{t.store.hubThemes}</h2><span>{toBuy > 0 ? t.store.toBuy(toBuy) : t.store.allBought}</span></div>
    <div className="pg-chips store-tabs" role="group" aria-label={t.store.tabsAria}>
      {tabs.map((tab) => {
        const label = tab === "league" ? t.store.leagueTab : tab === "supplies" ? t.store.suppliesTab : t.store.tiers[tab][0];
        const count = tab === "league" ? `${leagueOwned}/${LEAGUE_THEMES.length}` : tab === "supplies" ? "" : leftIn(tab) > 0 ? String(leftIn(tab)) : "";
        return <button key={tab} type="button" className="pg-chip" aria-pressed={current === tab} onClick={() => pick(tab)}>{label}{count && <> <em>{count}</em></>}</button>;
      })}
    </div>
    <p className="store-notice" role="status" aria-live="polite">{notice}</p>
    {current === "league"
      ? <section className="store-tier" aria-labelledby="tier-league">
        <div className="store-sec store-sec-tier"><h3 id="tier-league">{t.store.leagueThemes}</h3><span>{t.store.leagueOwned(leagueOwned, LEAGUE_THEMES.length)}</span></div>
        <p className="store-note">{t.store.leagueThemesNote}</p>
        <div className="store-grid">{LEAGUE_THEMES.map((theme) => cardOf(theme, true))}</div>
      </section>
      : current === "supplies"
      ? <section className="store-tier" aria-labelledby="tier-supplies">
        <div className="store-sec store-sec-tier"><h3 id="tier-supplies">{t.store.suppliesTab}</h3></div>
        <p className="store-note">{t.store.supplies.note}</p>
        <div className="store-grid">{SUPPLY_IDS.map((id) => <SupplyCard key={id} id={id} count={supplies[id]} price={SUPPLY_COST[id]} busy={busy} onBuy={(qty) => buySupply(id, qty)} />)}</div>
      </section>
      : <section className="store-tier" aria-labelledby={`tier-${current}`}>
        <div className="store-sec store-sec-tier"><h3 id={`tier-${current}`}>{t.store.tiers[current][0]}</h3><span>{leftIn(current) > 0 ? t.store.toBuy(leftIn(current)) : t.store.allBought}</span></div>
        <p className="store-note">{t.store.tiers[current][1]}</p>
        <div className="store-grid">{SHOP_THEMES.filter((theme) => theme.tier === current).map((theme) => cardOf(theme, false))}</div>
      </section>}
  </section>;
}
