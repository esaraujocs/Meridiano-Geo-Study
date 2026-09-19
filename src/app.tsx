import { useEffect, useMemo, useState } from "react";
import { Game } from "./components/map-game";
import { Header, Hub, OptionsScreen, Recorte, type TopFamily } from "./components/screens";
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
import { inRegion, normalizeRegionSelection, REGION_ITEMS } from "./domain/regions";
import type { AnyQuizVariant, Family, Legacy, QuizVariant, Region, RegionSelection, RegionCounts, Screen } from "./domain/types";
import { loadSpecialData, specialInRegion } from "./domain/special-data";
import {
  downloadOfflineMap,
  hasOfflineMap,
  removeOfflineMap,
  type OfflineMapStatus,
} from "./domain/offline-map";
import { initializeEconomy, queryEconomy, type EconomySnapshot } from "./domain/economy-store";
import { Surface } from "./components/surfaces";
import { geometryIndex, travelDestinationIds } from "./domain/legacy-geometry";
import { registerAchievementLifecycleListener } from "./domain/achievements";
import { queryCollectionSummary, querySurfaces } from "./domain/progress-surfaces";

const isUnPresetEntity = (id: string, meta: { un?: boolean } | undefined) =>
  Boolean(meta?.un || id === "336");

export function variantContextFor(topFamily: TopFamily, saved: string): { family: Family; variant: AnyQuizVariant } | null {
  const table: Record<TopFamily, Array<[string, Family]>> = {
    mapa: [["mapa", "mapa"], ["silhueta", "silhueta"], ["silhueta-opcoes", "silhueta"], ["travel", "travel"]],
    bandeiras: [["bandeira-nome", "bandeiras"], ["nome-bandeira", "bandeiras"], ["escrita-pais", "escrita"], ["nome-historica", "historicas"], ["historica-nome", "historicas"]],
    capitais: [["capital-pais", "capitais"], ["pais-capital", "capitais"], ["escrita-capital", "escrita"]],
    idiomas: [["idioma-pais", "idiomas"]],
  };
  const match = table[topFamily].find(([variant]) => variant === saved);
  return match ? { family: match[1], variant: match[0] as AnyQuizVariant } : null;
}

export function App() {
  const [screen, setScreen] = useState<Screen>("hub");
  const [data, setData] = useState<Legacy | null>(null);
  const [error, setError] = useState("");
  const [region, setRegion] = useState<RegionSelection>("mundo");
  const [family, setFamily] = useState<Family>("mapa");
  const [topFamily, setTopFamily] = useState<TopFamily>("mapa");
  const [variant, setVariant] = useState<AnyQuizVariant>("mapa");
  const [onlyUn, setOnlyUn] = useState(false);
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
  const [collectionSummary, setCollectionSummary] = useState({ discovered: 0, total: 0 });
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
  const grantDevelopmentCoins = async (amount = 10) => {
    if (!import.meta.env.DEV) return;
    const { grantDebugCoins } = await import("./domain/debug-economy");
    setEconomy(await grantDebugCoins(amount));
  };
  const unlockDevelopmentContent = async () => {
    if (!import.meta.env.DEV) return;
    const { unlockAllDebugContent } = await import("./domain/debug-economy");
    setEconomy(await unlockAllDebugContent());
  };
  const openSurface = (surface: "progress" | "collection" | "achievements" | "history") => setScreen(surface);
  const navigate = (destination: "hub" | "progress" | "collection" | "achievements" | "options") => setScreen(destination);
  const restoreVariantContext = (familyKey: TopFamily, saved: string) => {
    const context = variantContextFor(familyKey, saved);
    if (context) { setFamily(context.family); setVariant(context.variant); }
  };

  useEffect(() => {
    loadLegacy()
      .then(setData)
      .catch((loadError) => setError(loadError.message));
    migrateLegacyProgress().then(setLegacy).then(() => initializeEconomy()).then(setEconomy);
    hasOfflineMap()
      .then((installed) => setOfflineMap(installed ? "installed" : "available"))
      .catch(() => setOfflineMap("unavailable"));
  }, []);
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
  useEffect(() => {
    if (!data) return;
    registerAchievementLifecycleListener(() => {
      void querySurfaces(data)
        .then(() => setSurfaceRevision((current) => current + 1))
        .catch((achievementError) => {
          console.error("[carta-cega] achievement evaluation failed", achievementError);
        });
    });
    return () => registerAchievementLifecycleListener(null);
  }, [data]);

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

  if (error) {
    return (
      <div className="app-shell">
        <Header />
        <main className="content">
          <div className="diagnostic">
            <b>Não foi possível abrir o atlas.</b>
            <p>{error}</p>
            <button className="button" onClick={() => location.reload()}>
              Tentar novamente
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
          <div className="eyebrow">Carta Cega / inicializando</div>
          <h1 style={{ marginTop: 20 }}>Preparando o atlas.</h1>
          <p className="lede">
            Carregando a geometria legada e conferindo entidades jogáveis.
          </p>
        </main>
      </div>
    );
  }

  if (screen === "progress" || screen === "collection" || screen === "achievements" || screen === "history" || screen === "result") {
     return <div className="app-shell grain"><Header legacy={legacy} economy={economy} current={screen === "history" || screen === "result" ? "hub" : screen} onNavigate={navigate} onSurface={openSurface} /><Surface key={surfaceRevision} data={data} kind={screen} onBack={() => setScreen("hub")} /></div>;
  }
  if (screen === "options") {
    return <div className="app-shell grain"><Header legacy={legacy} economy={economy} current="options" onNavigate={navigate} onSurface={openSurface} /><OptionsScreen offlineMap={offlineMap} onToggleOfflineMap={async () => {
      if (offlineMap === "installed") { await removeOfflineMap(); setOfflineMap("available"); }
      else { setOfflineMap("downloading"); try { await downloadOfflineMap(); setOfflineMap("installed"); } catch { setOfflineMap("error"); } }
    }} onGrantCoins={grantDevelopmentCoins} onUnlockContent={unlockDevelopmentContent} onBack={() => setScreen("hub")} /></div>;
  }

  if (screen === "game") {
    if (family === "capitais" && variant === "capital-pais") {
       return <Game data={playableData ?? data} features={features.filter((item) => inRegion(item.id, region, data) && Boolean(data.meta[item.id]?.cap))} region={region} family={family} variant={variant} onBack={() => { void refreshEconomy(); setScreen("recorte"); }} onEnd={() => { void refreshEconomy(); setScreen("result"); }} />;
    }
    if (family === "silhueta" || family === "travel") {
        return <GeometryGame family={family} variant={variant} data={playableData ?? data} region={region} onBack={() => { void refreshEconomy(); setScreen("recorte"); }} onEnd={() => { void refreshEconomy(); setScreen("result"); }} />;
    }
    if (family === "historicas" || family === "idiomas" || family === "escrita") {
        const specialData = family === "historicas" || family === "idiomas" ? data : (playableData ?? data);
        return <SpecialQuiz data={specialData} family={family} variant={variant} region={region} onBack={() => { void refreshEconomy(); setScreen("recorte"); }} onEnd={() => { void refreshEconomy(); setScreen("result"); }} />;
    }
    if (family !== "mapa") {
      return (
        <QuizGame
          data={playableData ?? data}
          family={family}
            variant={variant as Exclude<QuizVariant, "mapa">}
          region={region}
          onBack={() => { void refreshEconomy(); setScreen("recorte"); }}
          onEnd={() => { void refreshEconomy(); setScreen("result"); }}
        />
      );
    }
    return (
      <Game
        data={data}
        features={features.filter((item) => inRegion(item.id, region, data))}
        region={region}
        onBack={() => { void refreshEconomy(); setScreen("recorte"); }}
        onEnd={() => { void refreshEconomy(); setScreen("result"); }}
      />
    );
  }

  return (
    <div className={`app-shell grain ${screen === "recorte" ? "focused-flow" : ""}`}>
        <Header legacy={legacy} economy={economy} current={screen === "hub" ? "hub" : undefined} onNavigate={navigate} onSurface={openSurface} />
      {screen === "hub" && (
        <Hub
          legacy={legacy}
            economy={economy}
            onSurface={openSurface}
          offlineMap={offlineMap}
          totalEntities={data.mapEntityIds.length}
          collectionSummary={collectionSummary}
          onSelect={async (selected) => {
            setFamily(selected);
            setRegion("mundo");
             const selectedTopFamily: TopFamily = selected === "mapa" || selected === "silhueta" || selected === "travel" ? "mapa" : selected === "bandeiras" || selected === "escrita" || selected === "historicas" ? "bandeiras" : selected === "capitais" ? "capitais" : "idiomas";
             setTopFamily(selectedTopFamily);
            if (selected === "bandeiras" || selected === "historicas" || selected === "idiomas" || selected === "escrita") {
              await loadSpecialData().then((special) => {
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
            }
              const defaultVariant = selected === "mapa" ? "mapa" : selected === "bandeiras" ? "nome-bandeira" : selected === "capitais" ? "capital-pais" : selected === "escrita" ? "escrita-pais" : selected === "historicas" ? "nome-historica" : selected === "idiomas" ? "idioma-pais" : selected === "silhueta" ? "silhueta" : "travel";
              const savedVariant = localStorage.getItem(`carta-last-variant:${selectedTopFamily}`);
              const restored = variantContextFor(selectedTopFamily, savedVariant ?? defaultVariant);
              if (restored) { setFamily(restored.family); setVariant(restored.variant); }
              localStorage.setItem(`carta-last-variant:${selectedTopFamily}`, savedVariant ?? defaultVariant);
             setScreen("recorte");
          }}
           onNavigate={navigate}
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
           onPlay={() => setScreen("game")}
           onlyUn={onlyUn}
           setOnlyUn={setOnlyUn}
            setVariant={setVariant}
            topFamily={topFamily}
            onFamilyChange={(nextFamily, nextVariant) => {
              setFamily(nextFamily);
              setVariant(nextVariant);
              setTopFamily(nextFamily === "mapa" || nextFamily === "silhueta" || nextFamily === "travel" ? "mapa" : nextFamily === "bandeiras" || nextFamily === "escrita" || nextFamily === "historicas" ? "bandeiras" : nextFamily === "capitais" ? "capitais" : "idiomas");
            }}
        />
      )}
    </div>
  );
}