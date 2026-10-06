import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Icon, type IconType } from "./icons";
import { ScreenBar } from "./screen-bar";
import { ModePanels } from "./mode-panels";
import { STREAK_CAP, completionPerRound } from "../domain/spoils";
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
import { formatNumber as money, t } from "../domain/i18n";

/** O ícone de cada família do Hub (a Mesa mostra só os modos da família que foi aberta). */
const FAMILY_ICON: Record<TopFamily, IconType> = { mapa: "map", bandeiras: "flag", capitais: "capital", idiomas: "language", gentilicos: "people", moedas: "coins" };

// Mesa de jogo (antes "Configure a partida"): Modo, Ritmo, Rodadas, Recorte e Filtro numa fileira cada, com a barra de resumo e o botão sempre à vista.
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
  pillarPct = {},
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
  /** Precisão de cada pilar (0 a 100) para mostrar nas famílias e no histórico. */
  pillarPct?: Partial<Record<"mapa" | "bandeiras" | "capitais", number | null>>;
}) {
  const familyLabel = t.families[topFamily];
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
  const regionText = selectedRegions.length === 1 ? REGION_ITEMS.find(([key]) => key === selectedRegions[0])?.[1] ?? "" : t.regions.many(selectedRegions.length);
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
      ? t.config.modeCost(money(activeCost))
      : t.config.modeMissing(money(activeCost - balance), money(balance))
    : active.hint;

  // Estatísticas do modo num menu suspenso (pedido do Enzo, 06/10): fecha com Esc, clique fora ou no próprio botão.
  const [statsOpen, setStatsOpen] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!statsOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setStatsOpen(false); };
    const onDown = (event: PointerEvent) => { if (!statsRef.current?.contains(event.target as Node)) setStatsOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [statsOpen]);

  const trio = (label: string, children: ReactNode, extra = "") => <div className={`mz-group ${extra}`}><span className="cv-k">{label}</span><div className="cv-ctl">{children}</div></div>;
  const accuracy = topFamily === "mapa" || topFamily === "bandeiras" || topFamily === "capitais" ? pillarPct[topFamily] ?? null : null;
  const hitFirst = summary.earn.split(/[^\d]/)[0];

  return (
    <main className="content cv-page mz-page" data-top-family={topFamily} data-family={family} data-variant={variant}>
      <ScreenBar onBack={onBack} eyebrow={t.config.table} title={familyLabel} balance={balance} badge={<span className="mz-badge" data-fam={topFamily} aria-hidden="true"><Icon type={FAMILY_ICON[topFamily]} size={22} /></span>} />
      <div className="cv mz" data-fam={topFamily}>
        <div className="mz-main">
          <section className="cv-card mz-card" aria-label={t.config.cardAria}>
            <header className="cv-head mz-head">
              <div><span className="eyebrow">{t.config.newMatch(familyLabel)}</span><h1>{t.config.title}</h1></div>
              <div className="mz-stats" ref={statsRef}>
                <button type="button" className="mz-stats-toggle" aria-expanded={statsOpen} aria-controls="mz-stats" onClick={() => setStatsOpen((open) => !open)}>
                  <Icon type="trend" size={16} /><span>{t.config.stats}</span><i aria-hidden="true"><Icon type="chevron" size={14} /></i>
                </button>
                <aside id="mz-stats" className="mz-side" aria-label={t.config.stats} hidden={!statsOpen}>
                  <ModePanels mode={{ family: active.family, variant: active.variant, flag: active.flag }} label={active.label.toLowerCase().includes(familyLabel.toLowerCase()) ? active.label : `${familyLabel} · ${active.label}`} />
                  <section className="mz-panel">
                    <h2>{t.config.reward}</h2>
                    <div className="mz-reward">
                      <div><b>{hitFirst}</b><small>{summary.earnUnit}</small></div>
                      <div><b>+{Math.round(STREAK_CAP * 100)}%</b><small>{t.config.rewardStreak}</small></div>
                      <div><b>+{completionPerRound(0.9)}</b><small>{t.config.rewardRound}</small></div>
                    </div>
                    {pace === "training" && <p className="cv-hint">{t.config.rewardTraining}</p>}
                  </section>
                </aside>
              </div>
            </header>
            <div className="mz-block">
              <span className="cv-k">{t.config.mode}</span>
              <div className="mz-ways" role="group" aria-label={t.config.mode} style={{ ["--cols" as string]: modes.length === 4 ? 2 : modes.length }}>
                {modes.map((mode) => {
                  const modeOwned = owned(mode.family, mode.variant);
                  const cost = priceOf(mode.family, mode.variant);
                  return <button type="button" key={mode.key} className={`mz-way${modeOwned ? "" : " is-locked"}`} aria-pressed={active.key === mode.key} onClick={() => pickMode(mode)}>
                    <span className="mz-way-ic"><Icon type={mode.icon} size={20} /></span>
                    <span className="mz-way-t"><b>{mode.label}</b><small>{mode.hint}</small></span>
                    {modeOwned ? <i className="mz-way-check" aria-hidden="true"><Icon type="check" size={14} /></i> : <em><Icon type="lock" size={12} /> {money(cost)}</em>}
                  </button>;
                })}
              </div>
              {active.direction && <div className="cv-chips cv-sub" role="group" aria-label={t.config.direction}>
                {(["name-to-flag", "flag-to-name"] as const).map((direction) => <button type="button" key={direction} className="cv-chip" aria-pressed={flagDirection === direction} onClick={() => pickDirection(direction)}><span className="cv-l"><span>{directionLabel(direction)}</span></span></button>)}
              </div>}
              {!activeOwned && <p className="cv-hint" role="status">{modeHint}</p>}
            </div>
            <div className="mz-trio">
              {trio(t.config.pace, <>
                <div className="cv-chips" role="group" aria-label={t.config.pace}>
                  <button type="button" className="cv-chip" aria-pressed={pace === "timed"} onClick={() => setPace("timed")}><span className="cv-l"><Icon type="stopwatch" size={16} /><span>{t.config.timed(formatSeconds(timerSecondsFor(variant), "mapa"))}</span></span></button>
                  <button type="button" className="cv-chip" aria-pressed={pace === "training"} onClick={() => setPace("training")}><span className="cv-l"><Icon type="book" size={16} /><span>{t.config.training}</span></span></button>
                </div>
                <p className="cv-hint">{paceHint(pace, variant)}</p>
              </>)}
              {trio(t.config.rounds, <>
                <div className="cv-chips cv-rounds" role="group" aria-label={t.config.rounds}>
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
                    ? <>{t.config.unlockRounds(pending.label.toLowerCase(), money(pending.cost))} <button type="button" className="cv-buy" disabled={busy} onClick={() => void buyRounds()}>{t.config.unlock}</button></>
                    : <>{t.config.missingRounds(money(pending.cost - balance), pending.label.toLowerCase(), money(balance))}</>}
                </p>}
              </>)}
              {trio(t.config.region, <>
                <div className="cv-chips cv-region" role="group" aria-label={t.config.regionsAvailable}>
                  {REGION_ITEMS.map(([key, label]) => <button type="button" key={key} className="cv-chip" aria-pressed={selectedRegions.includes(key)} disabled={counts[key] === 0} onClick={() => toggleRegion(key)}><span className="cv-l"><span>{label}</span><em>{counts[key]}</em></span></button>)}
                </div>
                {selectedCount === 0 && <p className="cv-hint">{t.config.noCards}</p>}
              </>, "mz-region")}
            </div>
            <div className="mz-block mz-foot">
              {showFilter && <div className="mz-filter">
                <span className="cv-k">{t.config.filter}</span>
                <button type="button" role="switch" aria-checked={onlyUn} className="cv-switch" onClick={() => setOnlyUn(!onlyUn)}><i aria-hidden="true" /><span>{t.config.onlyUn}</span></button>
              </div>}
              <PresetBar
                api={presetApi}
                topFamily={topFamily}
                draft={{ topFamily, variant, pace, roundTier, region, onlyUn: showFilter ? onlyUn : false }}
                canSave={activeOwned && selectedCount > 0}
                onApplied={(preset) => { setPendingTier(null); const direction = flagDirectionFromVariant(preset.variant); if (direction) setFlagDirection(direction); }}
              />
            </div>
          </section>
          <div className="cv-bar">
            <div className="cv-sum"><b>{summary.title}</b><small>{summary.sub}</small></div>
            <div className="cv-earn"><span className="cv-coin" aria-hidden="true">$</span><span><b>{summary.earn}</b><small>{summary.earnUnit}</small></span></div>
            <button type="button" className="button coral cv-go" disabled={selectedCount === 0 || busy || (!activeOwned && !canBuyActive)} onClick={() => void start()}>
              {activeOwned ? <>{t.config.start}<span className="cv-go-l">{t.config.startTail}</span></> : <>{t.config.unlockFor}<span className="cv-go-l">{t.config.unlockForTail}</span> {money(activeCost)}</>} <Icon type="arrow" />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
