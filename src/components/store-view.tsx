import { useState } from "react";
import { ProgressHero } from "./progress-hero";
import { THEMES, isThemeOwned, missingCoins, themeById, type Theme } from "../domain/themes";
import type { EconomySnapshot } from "../domain/economy-store";

const money = (value: number) => value.toLocaleString("pt-BR");

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
  return <article className={`store-card${active ? " is-active" : ""}${owned ? "" : " is-locked"}`} aria-labelledby={`theme-${theme.id}`}>
    {preview
      ? <img className="store-thumb" src={preview} alt={`Prévia do Hub no tema ${theme.name}`} loading="lazy" width={640} height={323} />
      : <div className="store-thumb store-thumb-fallback" role="img" aria-label={`Cores do tema ${theme.name}`} style={{ background: `linear-gradient(90deg,${theme.swatches.map((color, index) => `${color} ${index * 25}% ${(index + 1) * 25}%`).join(",")})` }} />}
    <div className="store-body">
      <div className="store-head">
        <h3 id={`theme-${theme.id}`}>{theme.name}</h3>
        <span className="store-swatches" aria-hidden="true">{theme.swatches.map((color) => <i key={color} style={{ background: color }} />)}</span>
      </div>
      <p>{theme.tagline}</p>
      <div className="store-foot">
        {owned ? <span className="store-state">{theme.cost === 0 ? "Padrão" : "Comprado"}</span>
          : <span className="store-price" aria-label={`${money(theme.cost)} moedas`}><i aria-hidden="true">$</i>{money(theme.cost)}</span>}
        {active ? <button type="button" className="store-btn is-current" disabled aria-current="true">Em uso</button>
          : owned ? <button type="button" className="store-btn primary" onClick={onEquip}>Usar</button>
          : missing > 0 ? <button type="button" className="store-btn" disabled aria-label={`${theme.name}: faltam ${money(missing)} moedas`}>Faltam {money(missing)}</button>
          : <button type="button" className="store-btn primary" disabled={busy} onClick={onAskBuy} aria-expanded={pending}>Comprar</button>}
      </div>
      {pending && <p className="store-confirm" role="status">
        Comprar <b>{theme.name}</b> por {money(theme.cost)} moedas? Ele já passa a ser usado.
        <span><button type="button" className="store-btn primary" disabled={busy} onClick={onConfirm}>Confirmar</button><button type="button" className="store-btn" disabled={busy} onClick={onCancel}>Cancelar</button></span>
      </p>}
    </div>
  </article>;
}

export function StoreView({ economy, activeTheme, onEquip, onBuy }: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const ownedCount = THEMES.filter((theme) => isThemeOwned(theme.id, economy.unlocked)).length;
  const active = themeById(activeTheme) ?? THEMES[0];
  const buy = async (theme: Theme) => {
    setBusy(true);
    try { await onBuy(theme.id); setNotice(`${theme.name} comprado e aplicado ao Hub.`); }
    catch { setNotice("Não foi possível comprar: o saldo mudou. Confira as moedas e tente de novo."); }
    setPending(null);
    setBusy(false);
  };
  const equip = (theme: Theme) => { onEquip(theme.id); setNotice(`${theme.name} aplicado ao Hub.`); };

  return <section className="store" aria-label="Loja">
    <ProgressHero
      value={ownedCount} total={THEMES.length} ringLabel={`${ownedCount} de ${THEMES.length} temas do Hub`}
      eyebrow="Perfil local · Loja" title="Loja"
      lede="Cores e pinceladas para o Hub. Tudo se paga com as moedas que você ganha jogando."
      summary={<><b>Saldo:</b> {money(economy.balance)} moedas. Um tema comprado é seu para sempre.</>}
      legendLabel="Resumo da Loja"
      legend={<><li>Em uso <b>{active.name}</b></li><li>Temas <b>{ownedCount}/{THEMES.length}</b></li></>}
    />
    <div className="store-sec"><h2>Temas do Hub</h2><span>{THEMES.length - ownedCount > 0 ? `${THEMES.length - ownedCount} para comprar` : "todos comprados"}</span></div>
    <p className="store-notice" role="status" aria-live="polite">{notice}</p>
    <div className="store-grid">
      {THEMES.map((theme) => <ThemeCard
        key={theme.id} theme={theme} active={theme.id === activeTheme} owned={isThemeOwned(theme.id, economy.unlocked)}
        balance={economy.balance} pending={pending === theme.id} busy={busy}
        onEquip={() => equip(theme)} onAskBuy={() => { setNotice(""); setPending(theme.id); }} onCancel={() => setPending(null)} onConfirm={() => void buy(theme)}
      />)}
    </div>
  </section>;
}
