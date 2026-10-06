import { lazy, Suspense, useEffect, useState, type CSSProperties, type TransitionEvent } from "react";
import { Icon } from "./icons";
import { AccountRow } from "./account-row";
import { BrandLogo } from "./brand-logo";
import { LevelTicks } from "./level-badge";
import type { AnyQuizVariant, Family, Legacy } from "../domain/types";
import type { LegacyProfile } from "../domain/legacy-migration";
import { isDebugEnabled } from "../domain/debug-flag";
import { EMPTY_ACHIEVEMENT_SUMMARY, hubProfile, ratioPercent, type AchievementSummary } from "../domain/hub-profile";
import { MAP_BYTES, type OfflineMapStatus } from "../domain/offline-map";
import type { EconomySnapshot } from "../domain/economy-store";
import { policyFor, type UnlockKey } from "../domain/economy-rules";
import type { TopFamily } from "../domain/match-config";
import { SHOP_THEMES, THEMES, isThemeOwned } from "../domain/themes";
import { BACKUP_STORES, coinBalance, exportProgress, importProgress, parseBackup, previewImport } from "../domain/progress-backup";
import { leagueOf, divisionRoman } from "../domain/league";
import type { ArenaSearch } from "./hub-parts";
import { HubCarousel, HubDuel, HubMecenato, HubShowcase } from "./hub-parts";
import { useMecenato } from "./use-mecenato";
import { activeCosmetics } from "../domain/mecenato-store";
import { LevelFrame } from "./level-frame";
import type { LadderCard } from "../domain/duel-view";
import type { Milestone } from "../domain/duel-rewards";
import type { LeaderboardRow } from "../domain/pvp";
import type { Ladder } from "../domain/duel-modes";
import { LOCALES, LOCALE_NAMES, LOCALE_RELEASED, changeLocale, formatNumber, locale, t } from "../domain/i18n";

export type { TopFamily };

export function Header({ legacy, economy, current = "hub", onNavigate, onSurface }: { legacy?: LegacyProfile | null; economy?: EconomySnapshot | null; current?: "hub" | "progress" | "collection" | "achievements" | "store" | "options"; onNavigate?: (destination: "hub" | "progress" | "collection" | "achievements" | "store" | "options") => void; onSurface?: (surface: "progress" | "collection" | "achievements" | "history") => void }) {
  const items = [
    ["hub", t.nav.modes, "map"], ["collection", t.nav.collection, "collection"],
    ["achievements", t.nav.achievements, "achievements"], ["progress", t.nav.progress, "progress"],
    ["store", t.nav.store, "store"],
  ] as const;
  // no celular a barra de baixo tem os mesmos cinco destinos; as Opções abrem pela engrenagem do Hub
  const mobileItems = items;
  return (
    <>
    <header className="topbar">
      <a
        className="brand"
        href="/"
        onClick={(event) => {
          if (location.pathname === "/") {
            event.preventDefault();
            location.reload();
          }
        }}
      >
        <BrandLogo />
        <span>MERIDIANO</span>
      </a>
      <nav className="desktop-nav" aria-label={t.nav.main}>
        {items.map(([key, label, icon]) => <button key={key} aria-current={current === key ? "page" : undefined} onClick={() => onNavigate?.(key)}><Icon type={icon} /><span>{label}</span></button>)}
      </nav>
      <div className="top-actions"><button className="settings-button" aria-label={t.nav.openOptions} aria-current={current === "options" ? "page" : undefined} title={t.nav.options} onClick={() => onNavigate?.("options")}><Icon type="settings" /></button></div>
    </header>
    <nav className="mobile-nav" aria-label={t.nav.main}>
      {mobileItems.map(([key, label, icon]) => <button key={key} aria-label={label} title={label} aria-current={current === key ? "page" : undefined} onClick={() => onNavigate?.(key)}><Icon type={icon} /><span>{label}</span></button>)}
    </nav>
    </>
  );
}

// Painel de debug carregado só quando ligado (npm run dev, ou ?debug=1 em qualquer build).
const DebugPanel = lazy(() => import("./debug-panel"));

// Backup do progresso: o navegador guarda por endereço, então um arquivo é a forma de levar tudo para outro link/aparelho.
function BackupRow() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const file = await exportProgress();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
      link.download = `${t.backup.fileName}-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setMessage(t.backup.saved(file.stores.sessions.length, file.stores.progress.length, formatNumber(coinBalance(file.stores.ledger))));
    } catch { setMessage(t.backup.exportFailed); }
    setBusy(false);
  };
  const upload = async (input: HTMLInputElement) => {
    const chosen = input.files?.[0];
    input.value = "";
    if (!chosen) return;
    setBusy(true);
    try {
      const file = parseBackup(await chosen.text());
      if (!file) { setMessage(t.backup.notBackup); setBusy(false); return; }
      const plan = await previewImport(file);
      if (plan.alreadyImported) { setMessage(t.backup.alreadyImported); setBusy(false); return; }
      const news = BACKUP_STORES.filter((name) => name !== "state").reduce((sum, name) => sum + plan.added[name], 0);
      const ask = t.backup.confirm(news, plan.summed, formatNumber(plan.coinsBefore), formatNumber(plan.coinsAfter));
      if (!window.confirm(ask)) { setMessage(t.backup.cancelled); setBusy(false); return; }
      await importProgress(file);
      setMessage(t.backup.imported);
      window.setTimeout(() => window.location.reload(), 700);
    } catch { setMessage(t.backup.importFailed); setBusy(false); }
  };
  return <div className="cv-row">
    <span className="cv-k">{t.backup.label}</span>
    <div className="cv-ctl">
      <p className="cv-hint">{t.backup.hint}</p>
      <div className="cv-chips">
        <button type="button" className="cv-chip" disabled={busy} onClick={() => void download()}>{t.backup.export}</button>
        <label className="cv-chip" aria-disabled={busy}>{t.backup.import}<input type="file" accept="application/json,.json" hidden disabled={busy} onChange={(event) => void upload(event.currentTarget)} /></label>
      </div>
      {message && <p className="cv-hint" role="status">{message}</p>}
    </div>
  </div>;
}

export function OptionsScreen({ data, theme, ownedUnlocks, onTheme, onOpenStore, offlineMap, onToggleOfflineMap, onDebugChange, onBack }: {
  data: Legacy;
  theme: string;
  ownedUnlocks: readonly string[];
  onTheme: (id: string) => void;
  onOpenStore: () => void;
  offlineMap: OfflineMapStatus;
  onToggleOfflineMap: () => Promise<void>;
  onDebugChange: (options: { announce: boolean }) => Promise<void> | void;
  onBack: () => void;
}) {
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem("carta-reduced-motion") === "1");
  const [timerLate, setTimerLate] = useState(() => localStorage.getItem("carta-timer-late") === "1");
  const [cacheReport, setCacheReport] = useState(t.options.cacheChecking);
  useEffect(() => {
    document.documentElement.dataset.timerReveal = timerLate ? "late" : "always";
    localStorage.setItem("carta-timer-late", timerLate ? "1" : "0");
  }, [timerLate]);
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reducedMotion ? "true" : "false";
    localStorage.setItem("carta-reduced-motion", reducedMotion ? "1" : "0");
  }, [reducedMotion]);
  useEffect(() => {
    if (!("caches" in window)) { setCacheReport(t.options.cacheUnavailable); return; }
    caches.keys().then(async (keys) => {
      const entries = (await Promise.all(keys.map((key) => caches.open(key).then((cache) => cache.keys())))).flat();
      const paths = entries.map((request) => new URL(request.url).pathname);
      const app = paths.some((path) => path === "/" || path.endsWith(".js") || path.endsWith(".css"));
      const data = paths.some((path) => /data|json|geo|special/i.test(path));
      const flags = paths.some((path) => /flag|bandeir/i.test(path));
      setCacheReport(t.options.cacheReport(app, data, flags));
    }).catch(() => setCacheReport(t.options.cacheFailed));
  }, []);
  const mapLabel = offlineMap === "installed" ? t.options.mapInstalled : offlineMap === "downloading" ? t.options.mapDownloading : offlineMap === "error" ? t.options.mapError : t.options.mapAvailable;
  const ownedThemes = THEMES.filter((item) => isThemeOwned(item.id, ownedUnlocks));
  const toBuy = SHOP_THEMES.filter((item) => !isThemeOwned(item.id, ownedUnlocks)).length;
  const mapBusy = offlineMap === "checking" || offlineMap === "downloading" || offlineMap === "unavailable";
  // Mesmo molde da tela "Configure a partida": título simples e um cartão só, com uma linha rotulada por assunto.
  return <main className="content cv-page options-screen">
    <div className="cv-top"><button type="button" className="back" onClick={onBack}>{t.common.backHub}</button></div>
    <div className="cv">
      <header className="cv-head"><span className="eyebrow">{t.options.eyebrow}</span><h1>{t.options.title}</h1></header>
      <section className="cv-card" aria-label={t.options.cardAria}>
        {(LOCALE_RELEASED || isDebugEnabled()) && <div className="cv-row">
          <span className="cv-k">{t.options.language}</span>
          <div className="cv-ctl">
            <div className="cv-chips" role="group" aria-label={t.options.language}>
              {LOCALES.map((item) => <button type="button" key={item} lang={item} className="cv-chip" aria-pressed={locale === item} onClick={() => { if (item !== locale) changeLocale(item); }}>{LOCALE_NAMES[item]}</button>)}
            </div>
            <p className="cv-hint">{t.options.languageHint}</p>
          </div>
        </div>}
        <div className="cv-row">
          <span className="cv-k">{t.options.appearance}</span>
          <div className="cv-ctl">
            <div className="cv-chips" role="group" aria-label={t.options.themeGroup}>
              {ownedThemes.map((item) => <button type="button" key={item.id} className="cv-chip" aria-pressed={theme === item.id} onClick={() => onTheme(item.id)}>{item.name}</button>)}
            </div>
            <p className="cv-hint">{toBuy > 0 ? t.options.themesToBuy(toBuy) : t.options.allThemes} <button type="button" className="cv-buy" onClick={onOpenStore}>{t.options.openStore}</button></p>
          </div>
        </div>
        <div className="cv-row">
          <span className="cv-k">{t.options.motion}</span>
          <div className="cv-ctl">
            <button type="button" role="switch" aria-checked={reducedMotion} className="cv-switch" onClick={() => setReducedMotion(!reducedMotion)}><i aria-hidden="true" /><span>{t.options.reducedMotion}</span></button>
            <p className="cv-hint">{t.options.reducedMotionHint}</p>
          </div>
        </div>
        <div className="cv-row">
          <span className="cv-k">{t.options.timerBar}</span>
          <div className="cv-ctl">
            <button type="button" role="switch" aria-checked={timerLate} className="cv-switch" onClick={() => setTimerLate(!timerLate)}><i aria-hidden="true" /><span>{t.options.timerLate}</span></button>
            <p className="cv-hint">{t.options.timerHint}</p>
          </div>
        </div>
        <AccountRow />
        <BackupRow />
        <div className="cv-row cv-last">
          <span className="cv-k">{t.options.offline}</span>
          <div className="cv-ctl">
            <p className="cv-hint offline-status">{t.options.appData(cacheReport)}</p>
            <p className="cv-hint offline-status">{t.options.mapStatus(mapLabel)}</p>
            <div className="cv-chips"><button type="button" className="cv-chip" disabled={mapBusy} onClick={() => void onToggleOfflineMap()}>{offlineMap === "installed" ? t.options.removeMap : t.options.downloadMap(formatNumber(Math.round(MAP_BYTES / 1e6)))}</button></div>
          </div>
        </div>
      </section>
      {isDebugEnabled() && <section className="options-grid" aria-label={t.options.debugAria}><Suspense fallback={<article className="surface-card dbg"><p>{t.options.debugLoading}</p></article>}><DebugPanel data={data} onChange={onDebugChange} /></Suspense></section>}
    </div>
  </main>;
}

export function Hub({
  onSelect,
  economy,
  onNavigate,
  onOpenMuseum,
  totalEntities = 0,
  collectionSummary = { discovered: 0, total: 0 },
  achievementSummary = EMPTY_ACHIEVEMENT_SUMMARY,
  trophies = 0,
  duelsPlayed = 0,
  duelReady = true,
  onOpenLeague,
  arenas,
}: {
  onSelect: (family: Family) => void;
  economy?: EconomySnapshot | null;
  onNavigate?: (destination: "hub" | "progress" | "collection" | "achievements" | "store" | "options") => void;
  /** Abre o Museu (a aba do Museu dentro da Coleção). */
  onOpenMuseum?: () => void;
  totalEntities?: number;
  collectionSummary?: { discovered: number; total: number };
  achievementSummary?: AchievementSummary;
  /** A última partida de cada modo (o "Continuar" do cartão); sem ela o cartão só oferece "Jogar". */
  /** Repete a última partida do modo, sem passar pela configuração. */
  trophies?: number;
  duelsPlayed?: number;
  /** O corte de 20 rodadas (Loja) já foi comprado; senão o duelo contra bot mostra um cadeado. */
  duelReady?: boolean;
  onOpenLeague?: () => void;
  /** Os dois cartões de escada (Mapas e Bandeiras), a fila e os atalhos do Duelo, que mora no Hub. */
  arenas?: { cards: readonly LadderCard[]; next: readonly Milestone[]; formatCost: number; search: ArenaSearch; boards: Record<Ladder, readonly LeaderboardRow[] | null>; botRanking?: import("../domain/bot-ranking").BotRankingState | null; onFriends?: () => void; onOpenPlayer?: (code: string) => void };
}) {
  const unlocked = (family: Family, variant: AnyQuizVariant) => {
    const policy = policyFor(family, variant, "caribe");
    return (
      !policy ||
      (policy.cost === 0 && policy.sessions === 0) ||
      Boolean(economy?.unlocked.includes(policy.key as UnlockKey))
    );
  };
  const familyItems: Array<{ family: Family; variant: AnyQuizVariant; label: string; description: string; icon: Parameters<typeof Icon>[0]["type"]; pillar?: "mapa" | "bandeiras" | "capitais" }> = [
    { family: "mapa", variant: "mapa", label: t.families.mapa, description: t.hub.familyDescriptions.mapa, icon: "map", pillar: "mapa" },
    { family: "bandeiras", variant: "bandeira-nome", label: t.families.bandeiras, description: t.hub.familyDescriptions.bandeiras, icon: "flag", pillar: "bandeiras" },
    { family: "capitais", variant: "capital-pais", label: t.families.capitais, description: t.hub.familyDescriptions.capitais, icon: "capital", pillar: "capitais" },
    { family: "idiomas", variant: "idioma-nome", label: t.families.idiomas, description: t.hub.familyDescriptions.idiomas, icon: "language" },
    { family: "gentilicos", variant: "gentilico-pais", label: t.families.gentilicos, description: t.hub.familyDescriptions.gentilicos, icon: "people" },
    { family: "moedas", variant: "pais-moeda", label: t.families.moedas, description: t.hub.familyDescriptions.moedas, icon: "coins" },
  ];
  // Famílias sem modo grátis: o cartão abre com qualquer um dos dois sentidos comprado.
  const BOTH_WAYS: Partial<Record<Family, [AnyQuizVariant, AnyQuizVariant]>> = { idiomas: ["idioma-nome", "idioma-pais"], gentilicos: ["gentilico-pais", "pais-gentilico"], moedas: ["pais-moeda", "moeda-pais"] };
  const isFamilyUnlocked = (item: (typeof familyItems)[number]) => {
    const ways = BOTH_WAYS[item.family];
    return ways ? ways.some((way) => unlocked(item.family, way)) : unlocked(item.family, item.variant);
  };
  const level = economy?.level ?? 1;
  const xpInLevel = Math.max(0, (economy?.xp ?? 0) - (economy?.xpBase ?? 0));
  const xpSpan = Math.max(1, (economy?.xpNext ?? 100) - (economy?.xpBase ?? 0));
  const league = leagueOf(trophies);
  const leagueLabel = t.duel.leagueName(t.duel.leagues[league.league], divisionRoman(league.division));
  const framed = duelsPlayed > 0;
  // Mecenato: a moldura do nível equipada (no lugar da da liga)
  const mecenato = useMecenato();
  const mcFrame = mecenato ? activeCosmetics()["level-frame"] : undefined;
  const masteryPct = ratioPercent(economy?.dominated ?? 0, totalEntities);
  const profile = hubProfile({ masteryPct, titleIds: achievementSummary.titles });
  const progressTiles = [
    { key: "collection", icon: "collection", target: "collection", big: `${collectionSummary.discovered}/${collectionSummary.total}`, label: t.hub.tileCollection, pct: ratioPercent(collectionSummary.discovered, collectionSummary.total) },
    { key: "achievements", icon: "achievements", target: "achievements", big: `${achievementSummary.unlocked}/${achievementSummary.total}`, label: t.hub.tileAchievements, pct: ratioPercent(achievementSummary.unlocked, achievementSummary.total) },
    { key: "progress", icon: "progress", target: "progress", big: `${masteryPct}%`, label: t.hub.tileMastery, pct: masteryPct },
  ] as const;
  const modeCard = (item: (typeof familyItems)[number]) => {
    const open = isFamilyUnlocked(item);
    return <div
      key={item.family}
      data-fam={item.family}
      className={`family hx-mode ${economy && !open ? "locked" : ""}`}
    >
      {/* o cartão inteiro abre a Mesa (sem botão "Jogar": repetia em todos os cartões; a Mesa já vem com a última partida montada) */}
      <button type="button" className="hx-hit" onClick={() => onSelect(item.family)} aria-label={`${t.hub.play}: ${item.label}`} />
      <div className="family-visual"><div className="family-geo" /><div className="family-icon"><Icon type={item.icon} /></div></div>
      <div className="family-copy"><h3>{item.label}</h3><p>{item.description}</p></div>
      <div className="family-footer">{economy && !open && <span className="hx-stat"><small>{t.hub.locked}</small></span>}</div>
    </div>;
  };
  return (
    <main className="content hub-content hx">
      <h1 className="sr-only">Meridiano</h1>
      <header className="hub-bar hx-bar hx-head" aria-label={t.hub.profileAria}>
        <div className="hub-bar hx-piece hx-p-player"><div className="hub-player">
          <div className={`hub-level${framed && !mcFrame ? " lg-frame" : ""}${mcFrame ? " has-mc-frame" : ""}`} data-league={framed ? league.league : undefined} role="img" aria-label={t.hub.levelAria(level, xpInLevel, xpSpan)}>
            {mcFrame && <LevelFrame id={mcFrame} />}
            <LevelTicks />
            <svg className="hub-level-ring" viewBox="0 0 132 132" aria-hidden="true"><circle className="hub-ring-track" cx="66" cy="66" r="58" />{xpInLevel > 0 && xpSpan > 0 && <circle className="hub-ring-arc" cx="66" cy="66" r="58" strokeDasharray={`${2 * Math.PI * 58 * Math.min(1, xpInLevel / xpSpan)} ${2 * Math.PI * 58}`} />}</svg>
            <strong>{level}</strong>
            <span className="hub-level-cap">{t.hub.levelCap}</span>
            {framed && <span className="lg-pip" title={t.duel.frameAria(leagueLabel)}>{divisionRoman(league.division) || "M"}</span>}
          </div>
          <div className="hub-head">
            <p className="hub-title">{profile.title}</p>
            {profile.earned.length > 0 && <ul className="hub-badges" aria-label={t.hub.badgesAria}>{profile.earned.map((title) => <li key={title.id} className="hub-badge" title={title.label}><Icon type={title.icon} /><span className="hub-badge-label">{title.label}</span></li>)}</ul>}
            {economy && <p className="hub-tally" title={t.hub.tallyTitle}>{t.hub.tally(economy.completedSessions, economy.rounds, formatNumber)}</p>}
          </div>
          <div className="hub-xp">
            <div className="hub-track" role="progressbar" aria-label={t.hub.xpProgressAria} aria-valuemin={0} aria-valuemax={xpSpan} aria-valuenow={xpInLevel}><i style={{ width: `${ratioPercent(xpInLevel, xpSpan)}%` }} /></div>
            <span className="hub-xp-label">{t.hub.levelLineSpaced(level, xpInLevel, xpSpan)}</span>
          </div>
        </div></div>
        <div className="hub-bar hx-piece hx-p-wallet"><div className="hub-stats">
          {arenas?.onFriends && <button type="button" className="hub-friends" aria-label={t.hub.duelFriends} title={t.hub.duelFriends} onClick={arenas.onFriends}><Icon type="people" size={19} /><span>{t.hub.duelFriends}</span></button>}
          <button type="button" className="hub-coin" aria-label={t.hub.coinAria(formatNumber(economy?.balance ?? 0))} title={t.nav.store} onClick={() => onNavigate?.("store")}><i aria-hidden="true">$</i><strong>{formatNumber(economy?.balance ?? 0)}</strong><span className="hub-coin-store"><Icon type="store" size={15} /> {t.nav.store}</span></button>
          <button type="button" className="hub-gear" aria-label={t.nav.openOptions} title={t.nav.options} onClick={() => onNavigate?.("options")}><Icon type="settings" /></button>
        </div></div>
      </header>
      <div className="hx-grid">
        <section className="hx-cell hx-modes" aria-labelledby="hx-modes-title">
          <div className="section-label"><h2 id="hx-modes-title">{t.hub.modesTitle}</h2></div>
          <HubCarousel label={t.hub.modesRegion}>{familyItems.map(modeCard)}</HubCarousel>
        </section>
        <section className="hx-cell hx-arena" aria-labelledby="hx-arena-title">
          <div className="section-label"><h2 id="hx-arena-title">{t.hub.arenaTitle}</h2></div>
          {arenas && <HubDuel cards={arenas.cards} formatReady={duelReady} formatCost={arenas.formatCost} search={arenas.search} onLeague={onOpenLeague} />}
          <HubShowcase onOpenStore={() => onNavigate?.("store")} />
        </section>
        <section className="hx-cell hx-progress hub-progress" aria-labelledby="hub-progress-title">
          <div className="section-label"><h2 id="hub-progress-title">{t.hub.yourProgress}</h2></div>
          <div className="hub-progress-grid">
            {progressTiles.map((tile) => <button type="button" key={tile.key} data-tile={tile.key} onClick={() => onNavigate?.(tile.target)}>
              <span className="hx-tile-mark" aria-hidden="true"><Icon type={tile.icon} size={150} /></span>
              <span className="hub-progress-icon"><svg className="hx-ring" viewBox="0 0 72 72" aria-hidden="true"><circle className="hx-ring-track" cx="36" cy="36" r="32" /><circle className="hx-ring-arc" cx="36" cy="36" r="32" strokeDasharray={`${2 * Math.PI * 32 * Math.min(100, tile.pct) / 100} ${2 * Math.PI * 32}`} /></svg><Icon type={tile.icon} /></span>
              <span className="hub-progress-text"><strong>{tile.big}</strong><small>{tile.label}</small><span className="hub-progress-bar" aria-hidden="true"><i style={{ width: `${tile.pct}%` }} /></span></span>
            </button>)}
          </div>
        </section>
        <section className="hx-cell hx-mecenato" aria-labelledby="hx-mec-title">
          <div className="section-label"><h2 id="hx-mec-title">{t.hub.mecenato}</h2></div>
          <HubMecenato onOpen={() => onOpenMuseum?.()} />
        </section>
      </div>
    </main>
  );
}

export function Variant({
  topFamily,
  family,
  variant,
  setVariant,
  onBack,
  onNext,
  onSelectEngine,
  economy,
}: {
  topFamily: TopFamily;
  family: Family;
  variant: AnyQuizVariant;
  setVariant: (variant: AnyQuizVariant) => void;
  onBack: () => void;
  onNext: () => void;
  onSelectEngine: (family: Family, variant: AnyQuizVariant) => void;
  economy?: EconomySnapshot | null;
}) {
  const variants: Record<TopFamily, [Family, AnyQuizVariant, string, string][]> = {
    mapa: [["mapa", "mapa", "Clicar no mapa", "Localize o território pedido."], ["silhueta", "silhueta", "Silhueta", "Escreva ou escolha entre quatro nomes."], ["travel", "travel", "Travel", "Trace uma rota entre países."]],
     bandeiras: [["bandeiras", "nome-bandeira", "Atuais", "Bandeiras atuais nos dois sentidos."], ["bandeiras", "bandeira-nome", "Bandeira → nome", "Reconheça o país pela bandeira."], ["escrita", "escrita-pais", "Escrita", "Digite o país pela bandeira."], ["historicas", "nome-historica", "Históricas", "Bandeiras históricas nos dois sentidos."]],
    capitais: [["capitais", "capital-pais", "Clicar no mapa", "Localize o país da capital."], ["escrita", "escrita-capital", "Escrita", "Digite a capital do país."]],
    idiomas: [["idiomas", "idioma-nome", "Nome do idioma", "Reconheça o idioma pela escrita."], ["idiomas", "idioma-pais", "Países do idioma", "Associe uma escrita aos países."]],
    gentilicos: [["gentilicos", "gentilico-pais", t.modes["gentilico-pais"][0], t.modes["gentilico-pais"][1]], ["gentilicos", "pais-gentilico", t.modes["pais-gentilico"][0], t.modes["pais-gentilico"][1]]],
    moedas: [["moedas", "pais-moeda", t.modes["pais-moeda"][0], t.modes["pais-moeda"][1]], ["moedas", "moeda-pais", t.modes["moeda-pais"][0], t.modes["moeda-pais"][1]]],
  };
  const familyLabel = topFamily === "mapa" ? "Mapa" : topFamily === "bandeiras" ? "Bandeiras" : topFamily === "capitais" ? "Capitais" : "Idiomas";
  const continueWith = (engine: Family, key: AnyQuizVariant) => {
    setVariant(key);
    onSelectEngine(engine, key);
    onNext();
  };
  const cards = topFamily === "bandeiras"
    ? variants.bandeiras
    : variants[topFamily];
  const [active, setActive] = useState(Math.max(0, cards.findIndex(([, key]) => key === variant)));
  const wrap = (index: number) => (index + cards.length) % cards.length;
  const move = (index: number) => setActive(wrap(index));
  const current = cards[active];
  const policy = policyFor(current[0], current[1], "caribe");
  const unlocked = !policy || (policy.cost === 0 && policy.sessions === 0) || Boolean(economy?.unlocked.includes(policy.key as UnlockKey));
  const visibleCards = cards.length === 1
    ? [{ index: 0, position: "current" as const }]
    : [
        { index: wrap(active - 1), position: "previous" as const },
        { index: active, position: "current" as const },
        { index: wrap(active + 1), position: "next" as const },
      ];
  return (
    <main className="content">
       <button className="back" onClick={onBack}>← Modos</button>
       <div style={{ marginTop: 38 }} className="eyebrow">{familyLabel} / variante</div>
       <h1 style={{ marginTop: 18 }}>Escolha a variante</h1>
      <div className="variant-carousel" onTouchStart={(e) => { (e.currentTarget as HTMLElement).dataset.x = String(e.touches[0].clientX); }} onTouchEnd={(e) => { const start = Number((e.currentTarget as HTMLElement).dataset.x); const end = e.changedTouches[0].clientX; if (Math.abs(end - start) > 40) move(active + (end < start ? 1 : -1)); }}>
        {cards.length > 1 && <button className="carousel-arrow carousel-arrow-prev" aria-label="Variante anterior" onClick={() => move(active - 1)}>‹</button>}
        <div className="variant-track" aria-label="Variantes">
          {visibleCards.map(({ index, position }) => {
            const [engine, key, label, description] = cards[index];
            const cardPolicy = policyFor(engine, key, "caribe");
            const cardUnlocked = !cardPolicy || cardPolicy.cost === 0 || Boolean(economy?.unlocked.includes(cardPolicy.key as UnlockKey));
            return (
            <button key={`${position}:${key}`} type="button" className={`family variant-card variant-card-${position} ${position === "current" ? "active" : ""}`} aria-current={position === "current" ? "true" : undefined} aria-hidden={position === "current" ? undefined : "true"} inert={position === "current" ? undefined : true} onClick={() => continueWith(engine, key)}>
              <div><div className="family-icon"><Icon type={engine === "capitais" ? "capital" : engine === "bandeiras" || engine === "historicas" || engine === "escrita" ? "flag" : "cross"} /></div><h3>{label}</h3><p>{description}</p></div>
              <div className="family-footer"><span>{position === "current" ? (cardUnlocked ? "disponível" : `bloqueada · ${(cardPolicy?.cost ?? 0).toLocaleString("pt-BR")} moedas`) : "próxima variante"}</span><Icon type="arrow" /></div>
            </button>
          )})}
        </div>
        {cards.length > 1 && <button className="carousel-arrow carousel-arrow-next" aria-label="Próxima variante" onClick={() => move(active + 1)}>›</button>}
        {cards.length > 1 && <div className="carousel-dots">{cards.map(([, key], index) => <button type="button" key={key} aria-label={`Ir para variante ${index + 1}`} aria-current={index === active ? "true" : undefined} onClick={() => move(index)} />)}</div>}
      </div>
    </main>
  );
}
