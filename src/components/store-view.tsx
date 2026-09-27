import { useState } from "react";
import { ProgressHero } from "./progress-hero";
import { LEAGUE_THEMES, SHOP_THEMES, THEMES, THEME_TIERS, isThemeOwned, missingCoins, themeById, type Theme } from "../domain/themes";
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
};

function ThemeCard({ theme, active, owned, balance, pending, busy, onEquip, onAskBuy, onConfirm, onCancel }: {
  theme: Theme; active: boolean; owned: boolean; balance: number; pending: boolean; busy: boolean;
  onEquip: () => void; onAskBuy: () => void; onConfirm: () => void; onCancel: () => void;
}) {
  const missing = missingCoins(theme.cost, balance);
  const preview = previewFor(theme.id);
  const leagueName = theme.league ? t.duel.leagues[theme.league] : "";
  return <article className={`store-card${active ? " is-active" : ""}${owned ? "" : " is-locked"}${theme.league ? " is-league" : ""}`} aria-labelledby={`theme-${theme.id}`}>
    {theme.league && <span className="store-badge">{t.store.leagueBadge(leagueName)}</span>}
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

export function StoreView({ economy, activeTheme, onEquip, onBuy }: Props) {
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
  const equip = (theme: Theme) => { onEquip(theme.id); setNotice(t.store.equipped(theme.name)); };

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
    <p className="store-notice" role="status" aria-live="polite">{notice}</p>
    {THEME_TIERS.map((tier) => {
      const list = SHOP_THEMES.filter((theme) => theme.tier === tier);
      if (!list.length) return null;
      const left = list.filter((theme) => !isThemeOwned(theme.id, economy.unlocked)).length;
      const [title, note] = t.store.tiers[tier];
      return <section key={tier} className="store-tier" aria-labelledby={`tier-${tier}`}>
        <div className="store-sec store-sec-tier"><h3 id={`tier-${tier}`}>{title}</h3><span>{left > 0 ? t.store.toBuy(left) : t.store.allBought}</span></div>
        <p className="store-note">{note}</p>
        <div className="store-grid">
          {list.map((theme) => <ThemeCard
            key={theme.id} theme={theme} active={theme.id === activeTheme} owned={isThemeOwned(theme.id, economy.unlocked)}
            balance={economy.balance} pending={pending === theme.id} busy={busy}
            onEquip={() => equip(theme)} onAskBuy={() => { setNotice(""); setPending(theme.id); }} onCancel={() => setPending(null)} onConfirm={() => void buy(theme)}
          />)}
        </div>
      </section>;
    })}
    {LEAGUE_THEMES.length > 0 && <>
      <div className="store-sec"><h2>{t.store.leagueThemes}</h2><span>{t.store.leagueOwned(leagueOwned, LEAGUE_THEMES.length)}</span></div>
      <p className="store-note">{t.store.leagueThemesNote}</p>
      <div className="store-grid">
        {LEAGUE_THEMES.map((theme) => <ThemeCard
          key={theme.id} theme={theme} active={theme.id === activeTheme} owned={isThemeOwned(theme.id, economy.unlocked)}
          balance={economy.balance} pending={false} busy={busy}
          onEquip={() => equip(theme)} onAskBuy={() => undefined} onCancel={() => undefined} onConfirm={() => undefined}
        />)}
      </div>
    </>}
  </section>;
}
