import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Game } from "./components/map-game";
import { Header, Hub, OptionsScreen, type TopFamily } from "./components/screens";
import { StoreView } from "./components/store-view";
import { ThemeWash } from "./components/theme-decor";
import { Recorte } from "./components/match-config";
import { variantContextFor } from "./domain/match-config";
import { createPreset, diffPresets, removePreset, renamePreset, setFavorite, updatePreset, type Preset, type PresetDraft, type PresetResult } from "./domain/presets";
import { listPresets, savePresets } from "./domain/presets-store";
import {
  buildFeatures,
  eligible,
  loadLegacy,
} from "./domain/legacy-data";
import {
  migrateLegacyProgress,
  type LegacyProfile,
} from "./domain/legacy-migration";
import { QuizGame } from "./components/quiz-game";
import { SpecialQuiz } from "./components/special-quiz";
import { GeometryGame } from "./components/geometry-games";
import { inRegion, normalizeRegionSelection, REGION_ITEMS, regionLabel } from "./domain/regions";
import type { AnyQuizVariant, Family, Legacy, QuizVariant, Region, RegionSelection, RegionCounts, Screen } from "./domain/types";
import { loadSpecialData, specialInRegion } from "./domain/special-data";
import {
  downloadOfflineMap,
  hasOfflineMap,
  removeOfflineMap,
  type OfflineMapStatus,
} from "./domain/offline-map";
import { initializeEconomy, queryEconomy, unlockRounds, unlockTheme, type EconomySnapshot } from "./domain/economy-store";
import { DEFAULT_THEME, THEME_STORAGE_KEY, isThemeId, resolveTheme, themeAttributes, themeById } from "./domain/themes";
import { ResultScreen } from "./components/result-screen";
import { buildResultView, type ResultView } from "./domain/result-view";
import { DEFAULT_PACE, isPace, isRoundTier, isRoundTierUnlocked, roundLimitFor, type RoundTier, type RoundUnlockKey } from "./domain/pace";
import type { Pace } from "./domain/spoils";
import type { SessionResult } from "./domain/learning-store";
import { Surface } from "./components/surfaces";
import { geometryIndex, travelDestinationIds } from "./domain/legacy-geometry";
import { registerAchievementLifecycleListener } from "./domain/achievements";
import { freshUnlocks, nearAchievements } from "./domain/achievement-summary";
import { EMPTY_ACHIEVEMENT_SUMMARY, TITLE_IDS, type AchievementSummary } from "./domain/hub-profile";
import { achievementToasts } from "./domain/achievement-toast";
import { queryCollectionSummary, querySurfaces } from "./domain/progress-surfaces";
import { t } from "./domain/i18n";
import { LeagueScreen } from "./components/league-screen";
import { leagueOf, type LeagueKey } from "./domain/league";
import { duelRecordId, playerTotalMs, resolveDuel, trophiesFromDuels, type DuelRecord, type DuelView } from "./domain/duel";
import { pickBot, type Bot, type BotContext } from "./domain/bots";
import type { Milestone } from "./domain/duel-rewards";
import { claimDuelMilestones, listDuels, saveDuel } from "./domain/duel-store";
import { isDebugEnabled } from "./domain/debug-flag";

const isUnPresetEntity = (id: string, meta: { un?: boolean } | undefined) =>
  Boolean(meta?.un || id === "336");


export function App() {
  const [screen, setScreen] = useState<Screen>("hub");
  const [data, setData] = useState<Legacy | null>(null);
  const [error, setError] = useState("");
  // Duelo contra bots (liga no Hub): sempre Mundo inteiro, sem o filtro ONU; a escolha do solo fica guardada.
  const [duelMode, setDuelMode] = useState(false);
  const [regionPref, setRegion] = useState<RegionSelection>("mundo");
  const region: RegionSelection = duelMode ? "mundo" : regionPref;
  const [family, setFamily] = useState<Family>("mapa");
  const [topFamily, setTopFamily] = useState<TopFamily>("mapa");
  const [variant, setVariant] = useState<AnyQuizVariant>("mapa");
  const [onlyUnPref, setOnlyUn] = useState(true);
  const onlyUn = duelMode ? false : onlyUnPref;
  // Ritmo (Partida com tempo ou Treino) e quantas rodadas: lembrados entre as partidas.
  const [pace, setPaceState] = useState<Pace>(() => {
    try { const saved = localStorage.getItem("carta-pace"); return isPace(saved) ? saved : DEFAULT_PACE; } catch { return DEFAULT_PACE; }
  });
  const [roundTier, setRoundTierState] = useState<RoundTier>(() => {
    try { const saved = localStorage.getItem("carta-round-tier"); return isRoundTier(saved) ? saved : "short"; } catch { return "short"; }
  });
  const setPace = (value: Pace) => { setPaceState(value); try { localStorage.setItem("carta-pace", value); } catch { /* sem armazenamento */ } };
  const setRoundTier = (value: RoundTier) => { setRoundTierState(value); try { localStorage.setItem("carta-round-tier", value); } catch { /* sem armazenamento */ } };
  // Tema do Hub: guardado neste aparelho; só vale se for do jogador (o padrão é grátis, os outros se compram na Loja).
  const [theme, setThemeState] = useState<string>(() => {
    try { const saved = localStorage.getItem(THEME_STORAGE_KEY); return isThemeId(saved) ? saved : DEFAULT_THEME; } catch { return DEFAULT_THEME; }
  });
  const setTheme = (id: string) => { setThemeState(id); try { localStorage.setItem(THEME_STORAGE_KEY, id); } catch { /* sem armazenamento */ } };
  // Os troféus vêm do histórico de duelos (como XP e maestria). O adversário é sorteado entre os 5 bots da liga da pessoa
  // (sem repetir o do duelo anterior) e só troca depois de cada duelo; `?debug=1` deixa forçar a liga do bot para testar.
  const [duels, setDuels] = useState<DuelRecord[]>([]);
  const [lastDuel, setLastDuel] = useState<DuelView | null>(null);
  const [duelSeed, setDuelSeed] = useState(() => Date.now());
  const [debugLeague, setDebugLeague] = useState<LeagueKey | null>(null);
  const lastBotRef = useRef<string | null>(null);
  const duelRunRef = useRef<{ bot: Bot; trophiesBefore: number; context: BotContext } | null>(null);
  const trophies = useMemo(() => trophiesFromDuels(duels), [duels]);
  const leagueStatus = leagueOf(trophies);
  const duelBot = useMemo(() => pickBot(debugLeague ?? leagueStatus.league, duelSeed, lastBotRef.current), [debugLeague, leagueStatus.league, duelSeed]);
  useEffect(() => { void listDuels().then(setDuels).catch(() => undefined); }, []);
  const [economyReady, setEconomyReady] = useState(false);
  const [lastResult, setLastResult] = useState<ResultView | null>(null);
  const [specialCounts, setSpecialCounts] = useState({
    historicas: Object.fromEntries(REGION_ITEMS.map(([key]) => [key, 0])) as RegionCounts,
    idiomas: Object.fromEntries(REGION_ITEMS.map(([key]) => [key, 0])) as RegionCounts,
  });
  const [specialEntries, setSpecialEntries] = useState<{ historicas: Awaited<ReturnType<typeof loadSpecialData>>["historical"]; idiomas: Awaited<ReturnType<typeof loadSpecialData>>["languages"] }>({ historicas: [], idiomas: [] });
  const [travelIds, setTravelIds] = useState<string[]>([]);
  const [travelCounts, setTravelCounts] = useState<RegionCounts | null>(null);
  const [legacy, setLegacy] = useState<LegacyProfile | null>(null);
  const [offlineMap, setOfflineMap] =
    useState<OfflineMapStatus>("checking");
  const [surfaceRevision, setSurfaceRevision] = useState(0);
  const [collectionRegion, setCollectionRegion] = useState<Region>("mundo");
  const [collectionSummary, setCollectionSummary] = useState({ discovered: 0, total: 0 });
  const [achievementSummary, setAchievementSummary] = useState<AchievementSummary>(EMPTY_ACHIEVEMENT_SUMMARY);
  const [economy, setEconomy] = useState<EconomySnapshot>({
    balance: 0,
    earned: 0,
    spent: 0,
    coverage: 0,
    xp: 0,
    level: 1,
    xpBase: 0,
    xpNext: 100,
    rounds: 0,
    completedSessions: 0,
    dominated: 0,
    coverageByColumn: { bandeiras: 0, mapa: 0, capitais: 0, escrita: 0 },
    sessions: 0,
    unlocked: [
      "mapa:mapa",
      "bandeiras:bandeira-nome",
      "capitais:capital-pais",
      "capitais:pais-capital",
    ],
  });
  const refreshEconomy = () => queryEconomy().then(setEconomy).catch(() => undefined);
  // Rodadas compradas valem para todos os modos; se a opção escolhida ainda não foi liberada, volta para 10.
  const effectiveTier: RoundTier = isRoundTierUnlocked(roundTier, economy.unlocked) ? roundTier : "short";
  // Duelo: sempre com tempo e no formato único de 20 rodadas (o corte de 20 da Loja), qualquer que seja o ritmo e o corte guardados.
  const sessionOptions = useMemo(() => duelMode
    ? { pace: "timed" as Pace, roundLimit: roundLimitFor("long", family) }
    : { pace, roundLimit: roundLimitFor(effectiveTier, family) }, [pace, effectiveTier, family, duelMode]);
  // Saldo e XP de antes da partida: o resultado mostra o "antes → depois" e anima a diferença.
  const economyBeforeRef = useRef<EconomySnapshot>(economy);
  const startGame = () => {
    if (duelMode && !isRoundTierUnlocked("long", economy.unlocked)) return;
    economyBeforeRef.current = economy;
    duelRunRef.current = duelMode ? { bot: duelBot, trophiesBefore: trophies, context: { division: leagueStatus.division, family: topFamily } } : null;
    setLastDuel(null);
    setScreen("game");
  };
  const finishGame = async (result: SessionResult | null) => {
    if (!result?.spoils) { void refreshEconomy(); setScreen("recorte"); return; }
    const before = economyBeforeRef.current;
    const after = await queryEconomy().catch(() => null);
    if (after) setEconomy(after);
    const { session } = result;
    // Duelo: o bot "joga" as mesmas rodadas; o placar decide e os troféus entram no histórico.
    const run = duelRunRef.current;
    duelRunRef.current = null;
    if (run && session.complete && session.rounds.length > 0) {
      const { bot } = run;
      const playerCorrect = session.rounds.filter((round) => round.correct).length;
      const outcome = resolveDuel({ trophies: run.trophiesBefore, bot, playerCorrect, playerTotal: session.rounds.length, playerMs: playerTotalMs(session.rounds, session.timerSeconds), seed: session.id, context: run.context });
      const record: DuelRecord = { id: duelRecordId(session.id), sessionId: session.id, at: session.endedAt ?? Date.now(), botId: bot.id, family: session.family, variant: session.variant, playerCorrect, total: session.rounds.length, botCorrect: outcome.botCorrect, outcome: outcome.outcome, tiebreak: outcome.tiebreak, delta: outcome.delta };
      setDuels((current) => [...current.filter((item) => item.id !== record.id), record]);
      // Marcos de divisão e de liga: crédito único no livro-caixa (não repete se os troféus caírem e subirem de novo).
      const milestones: readonly Milestone[] = await saveDuel(record).then(() => claimDuelMilestones(outcome.trophiesAfter)).catch(() => []);
      if (milestones.length) void refreshEconomy();
      lastBotRef.current = bot.id;
      setDuelSeed(Date.now());
      setLastDuel({ botName: bot.name, botLeague: bot.league, botStyle: bot.style, botSpecialty: bot.specialty, outcome: outcome.outcome, tiebreak: outcome.tiebreak, playerCorrect, botCorrect: outcome.botCorrect, total: session.rounds.length, delta: outcome.delta, trophiesBefore: run.trophiesBefore, trophiesAfter: outcome.trophiesAfter, milestones });
    } else setLastDuel(null);
    setLastResult(buildResultView({
      session, spoils: result.spoils, before, after: after ?? before,
      regionLabel: regionLabel(session.regions?.length ? session.regions : session.region),
    }));
    setScreen("result");
  };
  const buyRounds = async (key: RoundUnlockKey) => { setEconomy(await unlockRounds(key)); };
  // Compra na Loja: debita as moedas e já aplica o tema.
  const buyTheme = async (id: string) => { setEconomy(await unlockTheme(id)); setTheme(id); };
  const openSurface = (surface: "progress" | "collection" | "achievements" | "history") => { if (surface === "collection") setCollectionRegion("mundo"); setScreen(surface); };
  const navigate = (destination: "hub" | "progress" | "collection" | "achievements" | "store" | "options") => { if (destination === "collection") setCollectionRegion("mundo"); setScreen(destination); };
  const openLeague = () => setScreen("league");
  const openCollectionAt = (target: Region) => { setCollectionRegion(target); setScreen("collection"); };
  const restoreVariantContext = (familyKey: TopFamily, saved: string) => {
    const context = variantContextFor(familyKey, saved);
    if (context) { setFamily(context.family); setVariant(context.variant); }
  };

  useEffect(() => {
    loadLegacy()
      .then(setData)
      .catch((loadError) => setError(loadError.message));
    migrateLegacyProgress().then(setLegacy).then(() => initializeEconomy()).then((snapshot) => { setEconomy(snapshot); setEconomyReady(true); });
    hasOfflineMap()
      .then((installed) => setOfflineMap(installed ? "installed" : "available"))
      .catch(() => setOfflineMap("unavailable"));
  }, []);
  // O CSS lê o tema nos atributos do elemento raiz.
  useEffect(() => {
    const { theme: id, treat, wash } = themeAttributes(theme);
    const root = document.documentElement;
    root.dataset.theme = id; root.dataset.treat = treat; root.dataset.wash = wash;
  }, [theme]);
  // Tema guardado que não é do jogador (dados limpos, valor antigo) volta ao padrão, mas só depois de a economia carregar de verdade.
  useEffect(() => {
    if (!economyReady) return;
    const valid = resolveTheme(theme, economy.unlocked);
    if (valid !== theme) setTheme(valid);
  }, [economyReady, economy.unlocked, theme]);
  useEffect(() => {
    const saved = localStorage.getItem(`carta-last-variant:${topFamily}`);
    if (saved) restoreVariantContext(topFamily, saved);
  }, [topFamily]);
  useEffect(() => {
    if (!data) return;
    setTravelCounts(null);
    void geometryIndex().then(({ features: geometryFeatures }) => {
      const ids = [...geometryFeatures.keys()].filter((id) =>
        data.meta[id] && (!onlyUn || isUnPresetEntity(id, data.meta[id])),
      );
      setTravelIds(ids);
      setTravelCounts(Object.fromEntries(REGION_ITEMS.map(([key]) => [key, travelDestinationIds(data.meta, ids.filter((id) => inRegion(id, key, data))).length])) as RegionCounts);
    }).catch(() => setTravelCounts(null));
  }, [data, onlyUn]);
  useEffect(() => {
    if (!data) return;
    void queryCollectionSummary(data).then(setCollectionSummary).catch(() => undefined);
  }, [data, economy.coverage, surfaceRevision]);
  // Conquistas: avalia depois de cada rodada/partida, atualiza o card do Hub e avisa as que acabaram de abrir.
  // A primeira leitura (ao abrir o app) só serve de base: o que já estava desbloqueado não vira aviso.
  const knownAchievements = useRef<ReadonlySet<string> | null>(null);
  const achievementChain = useRef<Promise<unknown>>(Promise.resolve());
  const syncAchievements = useCallback((announce: boolean) => {
    if (!data) return Promise.resolve();
    const run = async () => {
      const state = await querySurfaces(data);
      const { fresh, next, count } = freshUnlocks(announce ? knownAchievements.current : null, state.achievements);
      knownAchievements.current = next;
      const near = nearAchievements(state.achievements)[0];
      setAchievementSummary({
        unlocked: count,
        total: state.achievements.length,
        titles: state.achievements.filter((item) => item.unlocked && TITLE_IDS.includes(item.id)).map((item) => item.id),
        next: near ? { name: near.name, current: Number(near.current ?? 0), target: Number(near.target ?? 0) } : null,
      });
      achievementToasts.push(fresh.map(({ id, name, description, rarity }) => ({ id, name, description, rarity })));
    };
    // uma avaliação por vez, na ordem: a base de abertura sempre vem antes de qualquer aviso
    const task = achievementChain.current.then(run).catch((achievementError) => {
      console.error("[carta-cega] achievement evaluation failed", achievementError);
    });
    achievementChain.current = task;
    return task;
  }, [data]);
  useEffect(() => { void syncAchievements(false); }, [syncAchievements]);
  useEffect(() => {
    registerAchievementLifecycleListener(() => {
      void syncAchievements(true).then(() => setSurfaceRevision((current) => current + 1));
    });
    return () => registerAchievementLifecycleListener(null);
  }, [syncAchievements]);
  const onDebugChange = async ({ announce }: { announce: boolean }) => {
    await refreshEconomy();
    await syncAchievements(announce);
    setSurfaceRevision((current) => current + 1);
  };

  const features = useMemo(
    () => (data ? eligible(buildFeatures(data)).filter((item) => {
      const meta = data.meta[item.id];
      return meta && !meta.absorvido && meta.mapa !== false &&
        (!onlyUn || isUnPresetEntity(item.id, meta));
    }) : []),
    [data, onlyUn],
  );
  const playableData = useMemo(() => {
    if (!data || !onlyUn) return data;
    return {
      ...data,
      meta: Object.fromEntries(
        Object.entries(data.meta).filter(([id, meta]) => isUnPresetEntity(id, meta)),
      ),
    };
  }, [data, onlyUn]);
  const gameFeatures = useMemo(
    () => data
      ? features.filter((item) =>
        inRegion(item.id, region, data) &&
        (family !== "capitais" || Boolean(data.meta[item.id]?.cap)),
      )
      : [],
    [data, family, features, region],
  );
  const counts = useMemo(
    () => data
      ? Object.fromEntries(REGION_ITEMS.map(([key]) => [
        key,
        features.filter((item) => inRegion(item.id, key, data)).length,
      ])) as RegionCounts
      : null,
    [data, features],
  );
  const familyCounts = useMemo(() => {
    if (!data) return null;
    const count = (selected: Family, selectedRegion: Region) =>
      Object.entries(data.meta).filter(([id, meta]) => {
         if (meta.absorvido || !inRegion(id, selectedRegion, data)) return false;
         if (onlyUn && !isUnPresetEntity(id, meta)) return false;
        if (selected === "mapa") return features.some((item) => item.id === id);
        if (selected === "bandeiras") return Boolean(meta.fl);
        return Boolean(typeof meta.cap === "string" && meta.cap.trim() && !meta.soBandeira);
      }).length;
    const regionCounts = (selected: Family) => Object.fromEntries(
      REGION_ITEMS.map(([key]) => [key, count(selected, key)]),
    ) as RegionCounts;
    return {
      mapa: regionCounts("mapa"),
      bandeiras: regionCounts("bandeiras"),
      capitais: regionCounts("capitais"),
      escrita: regionCounts(variant === "escrita-capital" ? "capitais" : "bandeiras"),
      historicas: specialCounts.historicas,
      idiomas: specialCounts.idiomas,
      silhueta: counts,
       travel: travelCounts ?? Object.fromEntries(REGION_ITEMS.map(([key]) => [key, 0])) as RegionCounts,
    } as Record<Family, RegionCounts>;
  }, [data, features, specialCounts, travelCounts, onlyUn, variant]);
  const selectedCount = useMemo(() => {
    if (!data) return 0;
    const ids = Object.entries(data.meta).filter(([id, meta]) => {
      if (
        meta.absorvido ||
        !inRegion(id, region, data) ||
        (onlyUn && !isUnPresetEntity(id, meta))
      ) return false;
      if (family === "mapa") return features.some((item) => item.id === id);
      if (family === "bandeiras") return Boolean(meta.fl);
      if (family === "capitais") return Boolean(meta.cap && !meta.soBandeira);
      if (family === "escrita") return variant === "escrita-capital" ? Boolean(meta.cap) : Boolean(meta.fl);
      return true;
    });
    if (family === "historicas" || family === "idiomas") {
      const source = family === "historicas" ? specialEntries.historicas : specialEntries.idiomas;
      return source.filter((item) => specialInRegion(item, region)).length;
    }
    if (family === "travel") return travelDestinationIds(data.meta, travelIds.filter((id) => inRegion(id, region, data))).length;
    return ids.length;
  }, [data, family, features, onlyUn, region, specialEntries, travelIds, variant]);

  // Contagens e entradas de Históricas e Idiomas (a configuração e a partida dependem delas).
  const loadSpecial = () => loadSpecialData().then((special) => {
    const count = (items: { reg?: string; sub?: string }[]) =>
      Object.fromEntries(REGION_ITEMS.map(([key]) => [
        key,
        items.filter((item) => specialInRegion(item, key)).length,
      ])) as RegionCounts;
    setSpecialCounts({
      historicas: count(special.historical),
      idiomas: count(special.languages),
    });
    setSpecialEntries({ historicas: special.historical, idiomas: special.languages });
  });

  // ---- Favoritas (configurações guardadas) ----
  const [presets, setPresets] = useState<Preset[]>([]);
  const presetsRef = useRef<Preset[]>([]);
  useEffect(() => { void listPresets().then((list) => { presetsRef.current = list; setPresets(list); }).catch(() => undefined); }, []);
  const commitPresets = (next: Preset[]) => {
    const { changed, removedIds } = diffPresets(presetsRef.current, next);
    presetsRef.current = next;
    setPresets(next);
    void savePresets(changed, removedIds).catch(() => undefined);
  };
  const newPresetId = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  const presetApi = {
    list: presets,
    save: (draft: PresetDraft, name?: string): PresetResult => { const result = createPreset(presetsRef.current, draft, { id: newPresetId(), now: Date.now(), name }); if (result.ok) commitPresets(result.list); return result; },
    update: (id: string, draft: PresetDraft): PresetResult => { const result = updatePreset(presetsRef.current, id, draft, Date.now()); if (result.ok) commitPresets(result.list); return result; },
    rename: (id: string, name: string) => commitPresets(renamePreset(presetsRef.current, id, name, Date.now())),
    favorite: (id: string) => commitPresets(setFavorite(presetsRef.current, id, Date.now())),
    remove: (id: string) => commitPresets(removePreset(presetsRef.current, id, Date.now())),
    apply: (preset: Preset) => applyPreset(preset),
  };
  // Coloca no estado tudo o que a favorita guarda (modo, ritmo, rodadas, recorte e filtro).
  const applyPreset = (preset: Preset) => {
    const context = variantContextFor(preset.topFamily, preset.variant);
    if (!context) return;
    try { localStorage.setItem(`carta-last-variant:${preset.topFamily}`, context.variant); } catch { /* sem armazenamento */ }
    setTopFamily(preset.topFamily);
    setFamily(context.family);
    setVariant(context.variant);
    setRegion(preset.region);
    setOnlyUn(preset.onlyUn);
    setPace(preset.pace);
    setRoundTier(preset.roundTier);
  };
  // Escolhe a família de jogo e abre a configuração da partida (Hub e cards de pilar da tela de Progresso).
  const selectFamily = async (selected: Family) => {
            setFamily(selected);
            setRegion("mundo");
             const selectedTopFamily: TopFamily = selected === "mapa" || selected === "silhueta" || selected === "travel" ? "mapa" : selected === "bandeiras" || selected === "escrita" || selected === "historicas" ? "bandeiras" : selected === "capitais" ? "capitais" : "idiomas";
             setTopFamily(selectedTopFamily);
            if (selected === "bandeiras" || selected === "historicas" || selected === "idiomas" || selected === "escrita") {
              await loadSpecial();
            }
              const defaultVariant = selected === "mapa" ? "mapa" : selected === "bandeiras" ? "nome-bandeira" : selected === "capitais" ? "capital-pais" : selected === "escrita" ? "escrita-pais" : selected === "historicas" ? "nome-historica" : selected === "idiomas" ? "idioma-nome" : selected === "silhueta" ? "silhueta" : "travel";
              const savedVariant = localStorage.getItem(`carta-last-variant:${selectedTopFamily}`);
              const restored =
                variantContextFor(selectedTopFamily, savedVariant ?? "") ??
                variantContextFor(selectedTopFamily, defaultVariant);
              if (restored) {
                setFamily(restored.family);
                setVariant(restored.variant);
                localStorage.setItem(`carta-last-variant:${selectedTopFamily}`, restored.variant);
              }
             setScreen("recorte");
  };

  if (error) {
    return (
      <div className="app-shell">
        <Header />
        <main className="content">
          <div className="diagnostic">
            <b>{t.app.errorTitle}</b>
            <p>{error}</p>
            <button className="button" onClick={() => location.reload()}>
              {t.app.retry}
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!data || !counts) {
    return (
      <div className="app-shell">
        <Header />
        <main className="content">
          <div className="eyebrow">{t.app.loadingEyebrow}</div>
          <h1 style={{ marginTop: 20 }}>{t.app.loadingTitle}</h1>
          <p className="lede">{t.app.loadingLede}</p>
        </main>
      </div>
    );
  }

  if (screen === "result") {
    return <div className="app-shell grain">{lastResult
      ? <ResultScreen view={lastResult} duel={lastDuel} onLeague={openLeague} onAgain={startGame} onAdjust={() => setScreen("recorte")} onHome={() => setScreen("hub")} />
      : <main className="content"><button className="back" onClick={() => setScreen("hub")}>{t.common.backHub}</button></main>}</div>;
  }
  if (screen === "progress" || screen === "collection" || screen === "achievements" || screen === "history") {
     return <div className="app-shell grain">{themeById(theme)?.wash && <ThemeWash />}<Header legacy={legacy} economy={economy} current={screen === "history" ? "hub" : screen} onNavigate={navigate} onSurface={openSurface} /><Surface key={surfaceRevision} data={data} kind={screen} onBack={() => setScreen("hub")} economy={economy} onTrain={selectFamily} onOpenCollection={openCollectionAt} collectionRegion={collectionRegion} /></div>;
  }
  if (screen === "league") {
    return <div className="app-shell grain">{themeById(theme)?.wash && <ThemeWash />}<Header legacy={legacy} economy={economy} current="hub" onNavigate={navigate} onSurface={openSurface} /><LeagueScreen trophies={trophies} duels={duels} onBack={() => setScreen("hub")} /></div>;
  }
  if (screen === "store") {
    return <div className="app-shell grain">{themeById(theme)?.wash && <ThemeWash />}<Header legacy={legacy} economy={economy} current="store" onNavigate={navigate} onSurface={openSurface} /><main className="content surface" data-surface="store"><button className="back" onClick={() => setScreen("hub")}>{t.common.backHub}</button><StoreView economy={economy} activeTheme={theme} onEquip={setTheme} onBuy={buyTheme} /></main></div>;
  }
  if (screen === "options") {
    return <div className="app-shell grain"><Header legacy={legacy} economy={economy} current="options" onNavigate={navigate} onSurface={openSurface} /><OptionsScreen data={data} theme={theme} ownedUnlocks={economy.unlocked} onTheme={setTheme} onOpenStore={() => setScreen("store")} offlineMap={offlineMap} onToggleOfflineMap={async () => {
      if (offlineMap === "installed") { await removeOfflineMap(); setOfflineMap("available"); }
      else { setOfflineMap("downloading"); try { await downloadOfflineMap(); setOfflineMap("installed"); } catch { setOfflineMap("error"); } }
    }} onDebugChange={onDebugChange} onBack={() => setScreen("hub")} /></div>;
  }

  if (screen === "game") {
    if (family === "capitais" && variant === "capital-pais") {
       return <Game data={playableData ?? data} features={gameFeatures} region={region} family={family} variant={variant} onlyUn={onlyUn} onBack={() => { void refreshEconomy(); setScreen("recorte"); }} onEnd={finishGame} options={sessionOptions} />;
    }
    if (family === "silhueta" || family === "travel") {
        return <GeometryGame family={family} variant={variant} data={playableData ?? data} region={region} onBack={() => { void refreshEconomy(); setScreen("recorte"); }} onEnd={finishGame} options={sessionOptions} />;
    }
    if (family === "historicas" || family === "idiomas" || family === "escrita") {
        const specialData = family === "historicas" || family === "idiomas" ? data : (playableData ?? data);
        return <SpecialQuiz data={specialData} family={family} variant={variant} region={region} onBack={() => { void refreshEconomy(); setScreen("recorte"); }} onEnd={finishGame} options={sessionOptions} />;
    }
    if (family !== "mapa") {
      return (
        <QuizGame
          data={playableData ?? data}
          family={family}
            variant={variant as Exclude<QuizVariant, "mapa">}
          region={region}
          onBack={() => { void refreshEconomy(); setScreen("recorte"); }}
          onEnd={finishGame} options={sessionOptions}
        />
      );
    }
    return (
      <Game
        data={data}
        features={gameFeatures}
        region={region}
        onlyUn={onlyUn}
        onBack={() => { void refreshEconomy(); setScreen("recorte"); }}
        onEnd={finishGame} options={sessionOptions}
      />
    );
  }

  return (
    <div className={`app-shell grain ${screen === "recorte" ? "focused-flow" : ""}`}>
        {screen === "hub" && themeById(theme)?.wash && <ThemeWash />}
        <Header legacy={legacy} economy={economy} current={screen === "hub" ? "hub" : undefined} onNavigate={navigate} onSurface={openSurface} />
      {screen === "hub" && (
        <Hub
          legacy={legacy}
            economy={economy}
            onSurface={openSurface}
          offlineMap={offlineMap}
          totalEntities={data.mapEntityIds.length}
          collectionSummary={collectionSummary}
          achievementSummary={achievementSummary}
          onSelect={selectFamily}
           onNavigate={navigate}
          duelMode={duelMode}
          duelReady={isRoundTierUnlocked("long", economy.unlocked)}
          onDuelMode={setDuelMode}
          trophies={trophies}
          duelsPlayed={duels.length}
          onOpenLeague={openLeague}
         />
      )}
      {screen === "recorte" && (
        <Recorte
          data={data}
            family={family}
            variant={variant}
            counts={familyCounts?.[family] ?? counts}
            selectedCount={selectedCount}
          region={region}
          setRegion={setRegion}
          onBack={() => setScreen("hub")}
           economy={economy}
           onRefresh={refreshEconomy}
           onPlay={startGame}
           pace={duelMode ? "timed" : pace}
           setPace={setPace}
           roundTier={duelMode ? "long" : effectiveTier}
           setRoundTier={setRoundTier}
           onBuyRounds={buyRounds}
           onlyUn={onlyUn}
           setOnlyUn={setOnlyUn}
           presetApi={presetApi}
           duel={duelMode ? { bot: duelBot, debugLeague: isDebugEnabled() ? { current: duelBot.league, onPick: setDebugLeague } : undefined } : undefined}
            setVariant={setVariant}
            topFamily={topFamily}
            onFamilyChange={(nextFamily, nextVariant) => {
              setFamily(nextFamily);
              setVariant(nextVariant);
            }}
        />
      )}
    </div>
  );
}