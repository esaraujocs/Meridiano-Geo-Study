import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Icon } from "./icons";
import type { AnyQuizVariant, Family, Legacy, RegionCounts, RegionSelection } from "../domain/types";
import { normalizeRegionSelection, REGION_ITEMS } from "../domain/regions";
import type { EconomySnapshot } from "../domain/economy-store";
import { unlockContent } from "../domain/economy-store";
import { canUnlock, policyFor, type UnlockKey } from "../domain/economy-rules";
import { displayTier, isRoundTierUnlocked, roundChips, roundLimitFor, roundUnlockFor, timerSecondsFor, type RoundTier, type RoundUnlockKey } from "../domain/pace";
import type { Pace } from "../domain/spoils";
import { flagDirectionFromVariant, flagSelection, type FlagCategory, type FlagDirection } from "../domain/flag-configuration";
import { PresetBar, type PresetApi } from "./preset-bar";
import { configSummary, directionLabel, formatSeconds, modesFor, paceHint, selectedMode, type ModeOption, type TopFamily } from "../domain/match-config";

const money = (value: number) => value.toLocaleString("pt-BR");

// Tela "Configure a partida": Modo, Ritmo, Rodadas, Recorte e Filtro numa fileira cada, com a barra de resumo e o botão sempre à vista.
export function Recorte({
  family,
  counts,
  selectedCount: selectedCountProp,
  variant,
  region,
  setRegion,
  onBack,
  onPlay,
  economy,
  onRefresh,
  onlyUn,
  setOnlyUn,
  setVariant,
  topFamily,
  onFamilyChange,
  pace,
  setPace,
  roundTier,
  setRoundTier,
  onBuyRounds,
  presetApi,
}: {
  data: Legacy;
  family: Family;
  variant: AnyQuizVariant;
  counts: RegionCounts;
  selectedCount?: number;
  region: RegionSelection;
  setRegion: Dispatch<SetStateAction<RegionSelection>>;
  onBack: () => void;
  onPlay: () => void;
  economy?: EconomySnapshot | null;
  onRefresh: () => Promise<unknown> | void;
  onlyUn: boolean;
  setOnlyUn: (value: boolean) => void;
  setVariant: (variant: AnyQuizVariant) => void;
  topFamily: TopFamily;
  onFamilyChange: (family: Family, variant: AnyQuizVariant) => void;
  pace: Pace;
  setPace: (value: Pace) => void;
  roundTier: RoundTier;
  setRoundTier: (value: RoundTier) => void;
  onBuyRounds: (key: RoundUnlockKey) => Promise<unknown>;
  presetApi: PresetApi;
}) {
  const familyLabel = topFamily === "mapa" ? "Mapa" : topFamily === "bandeiras" ? "Bandeiras" : topFamily === "capitais" ? "Capitais" : "Idiomas";
  const selectedRegions = normalizeRegionSelection(region);
  const policyRegion = selectedRegions.length === 1 ? selectedRegions[0] : "mundo";
  const selectedCount = selectedCountProp ?? (selectedRegions.length === 1 && selectedRegions[0] === "mundo"
    ? counts.mundo
    : selectedRegions.reduce((total, item) => total + (counts[item] ?? 0), 0));
  const [flagDirection, setFlagDirection] = useState<FlagDirection>(() =>
    flagDirectionFromVariant(variant) ??
    (localStorage.getItem("carta-flag-direction") as FlagDirection | null) ??
    "name-to-flag",
  );
  const [pendingTier, setPendingTier] = useState<RoundTier | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (selectedCount > 0) return;
    setRegion("mundo");
  }, [selectedCount, setRegion]);

  const balance = economy?.balance ?? 0;
  const owned = (targetFamily: Family, targetVariant: AnyQuizVariant) => {
    const policy = policyFor(targetFamily, targetVariant, policyRegion);
    return !policy || (policy.cost === 0 && policy.sessions === 0) || Boolean(economy?.unlocked.includes(policy.key as UnlockKey));
  };
  const priceOf = (targetFamily: Family, targetVariant: AnyQuizVariant) => policyFor(targetFamily, targetVariant, policyRegion)?.cost ?? 0;
  const remember = (nextVariant: AnyQuizVariant) => {
    try { localStorage.setItem(`carta-last-variant:${topFamily}`, nextVariant); } catch { /* sem armazenamento */ }
  };
  const applyFlag = (kind: FlagCategory, direction = flagDirection) => {
    const selection = flagSelection(kind, direction);
    onFamilyChange(selection.family, selection.variant);
    setVariant(selection.variant);
    remember(selection.variant);
  };
  const pickMode = (mode: ModeOption) => {
    setPendingTier(null);
    if (mode.flag) { applyFlag(mode.flag); return; }
    onFamilyChange(mode.family, mode.variant);
    setVariant(mode.variant);
    remember(mode.variant);
  };
  const pickDirection = (direction: FlagDirection) => {
    setFlagDirection(direction);
    try { localStorage.setItem("carta-flag-direction", direction); } catch { /* sem armazenamento */ }
    const mode = selectedMode(topFamily, family, variant);
    if (mode.flag) applyFlag(mode.flag, direction);
  };
  const toggleRegion = (key: (typeof REGION_ITEMS)[number][0]) => {
    if (key === "mundo") return setRegion("mundo");
    const next = selectedRegions.includes("mundo")
      ? [key]
      : selectedRegions.includes(key)
        ? selectedRegions.filter((item) => item !== key)
        : [...selectedRegions, key];
    setRegion(next.length ? normalizeRegionSelection(next) : "mundo");
  };

  const modes = modesFor(topFamily);
  const active = selectedMode(topFamily, family, variant);
  const activeOwned = owned(family, variant);
  const activeCost = priceOf(family, variant);
  const activePolicy = policyFor(family, variant, policyRegion);
  const canBuyActive = !activeOwned && activePolicy ? canUnlock(activePolicy, balance, economy?.sessions ?? 0, 0) : false;
  const roundCap = roundLimitFor(roundTier, family);
  const deckCount = roundCap === null ? selectedCount : Math.min(selectedCount, roundCap);
  const regionText = selectedRegions.length === 1 ? REGION_ITEMS.find(([key]) => key === selectedRegions[0])?.[1] ?? "" : `${selectedRegions.length} recortes`;
  const summary = configSummary({ mode: active, direction: flagDirection, variant, pace, rounds: deckCount, regionText, count: selectedCount });
  const showFilter = family !== "historicas" && family !== "idiomas";
  const pending = pendingTier ? roundUnlockFor(pendingTier) : null;

  const start = async () => {
    if (busy) return;
    if (activeOwned) { onPlay(); return; }
    if (!canBuyActive) return;
    setBusy(true);
    try { await unlockContent(family, variant, policyRegion); } catch { /* saldo mudou: a atualização abaixo mostra o estado real */ }
    await onRefresh();
    setBusy(false);
  };
  const buyRounds = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try { await onBuyRounds(pending.key); setRoundTier(pending.tier); } catch { await onRefresh(); }
    setPendingTier(null);
    setBusy(false);
  };

  const modeHint = !activeOwned
    ? canBuyActive
      ? `Este modo custa ${money(activeCost)} moedas e fica seu para sempre.`
      : `Faltam ${money(activeCost - balance)} moedas para liberar (saldo ${money(balance)}).`
    : active.hint;

  return (
    <main className="content cv-page" data-top-family={topFamily} data-family={family} data-variant={variant}>
      <div className="cv-top">
        <button type="button" className="back" onClick={onBack}>← Hub</button>
        <div className="hub-coin" aria-label={`${money(balance)} moedas`}><i aria-hidden="true">$</i><strong>{money(balance)}</strong></div>
      </div>
      <div className="cv">
        <header className="cv-head"><span className="eyebrow">{familyLabel} · nova partida</span><h1>Configure a partida</h1></header>
        <section className="cv-card" aria-label="Configuração da partida">
          <div className="cv-row">
            <span className="cv-k">Modo</span>
            <div className="cv-ctl">
              <div className="cv-chips cv-modes" role="group" aria-label="Modo">
                {modes.map((mode) => {
                  const modeOwned = owned(mode.family, mode.variant);
                  const cost = priceOf(mode.family, mode.variant);
                  return <button type="button" key={mode.key} className={`cv-chip${modeOwned ? "" : " is-locked"}`} aria-pressed={active.key === mode.key} onClick={() => pickMode(mode)}>
                    <span className="cv-l"><Icon type={mode.icon} size={16} /><span>{mode.label}</span></span>
                    {!modeOwned && <b><Icon type="lock" size={12} /> {money(cost)}</b>}
                  </button>;
                })}
              </div>
              {active.direction && <div className="cv-chips cv-sub" role="group" aria-label="Direção">
                {(["name-to-flag", "flag-to-name"] as const).map((direction) => <button type="button" key={direction} className="cv-chip" aria-pressed={flagDirection === direction} onClick={() => pickDirection(direction)}><span className="cv-l"><span>{directionLabel(direction)}</span></span></button>)}
              </div>}
              <p className="cv-hint" role="status">{modeHint}</p>
            </div>
          </div>
          <div className="cv-row">
            <span className="cv-k">Ritmo</span>
            <div className="cv-ctl">
              <div className="cv-chips" role="group" aria-label="Ritmo">
                <button type="button" className="cv-chip" aria-pressed={pace === "timed"} onClick={() => setPace("timed")}><span className="cv-l"><Icon type="stopwatch" size={16} /><span>Partida · {formatSeconds(timerSecondsFor(variant), variant).replace(" por rota", "")}</span></span></button>
                <button type="button" className="cv-chip" aria-pressed={pace === "training"} onClick={() => setPace("training")}><span className="cv-l"><Icon type="book" size={16} /><span>Treino</span></span></button>
              </div>
              <p className="cv-hint">{paceHint(pace, variant)}</p>
            </div>
          </div>
          <div className="cv-row">
            <span className="cv-k">Rodadas</span>
            <div className="cv-ctl">
              <div className="cv-chips cv-rounds" role="group" aria-label="Rodadas">
                {roundChips(family, selectedCount).map(({ tier, label }) => {
                  const unlock = roundUnlockFor(tier);
                  const tierOwned = isRoundTierUnlocked(tier, economy?.unlocked ?? []);
                  return <button type="button" key={tier} className={`cv-chip${tierOwned ? "" : " is-locked"}`} aria-pressed={displayTier(roundTier, family, selectedCount) === tier && tierOwned} onClick={() => { if (tierOwned) { setPendingTier(null); setRoundTier(tier); } else setPendingTier(tier); }}>
                    <span className="cv-l"><span>{label}</span></span>
                    {!tierOwned && unlock && <b><Icon type="lock" size={12} /> {money(unlock.cost)}</b>}
                  </button>;
                })}
              </div>
              {pending && <p className="cv-hint cv-confirm" role="status">
                {balance >= pending.cost
                  ? <>Liberar <b>{pending.label.toLowerCase()}</b> em todos os modos por {money(pending.cost)} moedas? <button type="button" className="cv-buy" disabled={busy} onClick={() => void buyRounds()}>Liberar</button></>
                  : <>Faltam {money(pending.cost - balance)} moedas para liberar {pending.label.toLowerCase()} (saldo {money(balance)}).</>}
              </p>}
            </div>
          </div>
          <div className={`cv-row${showFilter ? "" : " cv-last"}`}>
            <span className="cv-k">Recorte</span>
            <div className="cv-ctl">
              <div className="cv-chips cv-region" role="group" aria-label="Recortes disponíveis">
                {REGION_ITEMS.map(([key, label]) => <button type="button" key={key} className="cv-chip" aria-pressed={selectedRegions.includes(key)} disabled={counts[key] === 0} onClick={() => toggleRegion(key)}><span className="cv-l"><span>{label}</span><em>{counts[key]}</em></span></button>)}
              </div>
              {selectedCount === 0 && <p className="cv-hint">Sem cartas neste recorte para este modo.</p>}
            </div>
          </div>
          {showFilter && <div className="cv-row cv-last">
            <span className="cv-k">Filtro</span>
            <div className="cv-ctl">
              <button type="button" role="switch" aria-checked={onlyUn} className="cv-switch" onClick={() => setOnlyUn(!onlyUn)}><i aria-hidden="true" /><span>Só membros da ONU</span></button>
            </div>
          </div>}
        </section>
        <PresetBar
          api={presetApi}
          topFamily={topFamily}
          draft={{ topFamily, variant, pace, roundTier, region, onlyUn: showFilter ? onlyUn : false }}
          canSave={activeOwned && selectedCount > 0}
          onApplied={(preset) => { setPendingTier(null); const direction = flagDirectionFromVariant(preset.variant); if (direction) setFlagDirection(direction); }}
        />
        <div className="cv-bar">
          <div className="cv-sum"><b>{summary.title}</b><small>{summary.sub}</small></div>
          <div className="cv-earn"><span className="cv-coin" aria-hidden="true">$</span><span><b>{summary.earn}</b><small>{summary.earnUnit}</small></span></div>
          <button type="button" className="button coral cv-go" disabled={selectedCount === 0 || busy || (!activeOwned && !canBuyActive)} onClick={() => void start()}>
            {activeOwned ? <>Começar<span className="cv-go-l"> partida</span></> : <>Liberar<span className="cv-go-l"> por</span> {money(activeCost)}</>} <Icon type="arrow" />
          </button>
        </div>
      </div>
    </main>
  );
}
