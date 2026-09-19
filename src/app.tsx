import { useEffect, useMemo, useState } from "react";
import { Game } from "./components/map-game";
import { Header, Hub, Recorte, type TopFamily } from "./components/screens";
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
import { inRegion, REGION_ITEMS } from "./domain/regions";
import type { AnyQuizVariant, Family, Legacy, QuizVariant, Region, RegionCounts, Screen } from "./domain/types";
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
import { querySurfaces } from "./domain/progress-surfaces";

export function App() {
  const [screen, setScreen] = useState<Screen>("hub");
  const [data, setData] = useState<Legacy | null>(null);
  const [error, setError] = useState("");
  const [region, setRegion] = useState<Region>("caribe");
  const [family, setFamily] = useState<Family>("mapa");
  const [topFamily, setTopFamily] = useState<TopFamily>("mapa");
  const [variant, setVariant] = useState<AnyQuizVariant>("mapa");
  const [onlyUn, setOnlyUn] = useState(false);
  const [specialCounts, setSpecialCounts] = useState({
    historicas: Object.fromEntries(REGION_ITEMS.map(([key]) => [key, 0])) as RegionCounts,
    idiomas: Object.fromEntries(REGION_ITEMS.map(([key]) => [key, 0])) as RegionCounts,
  });
  const [travelCounts, setTravelCounts] = useState<RegionCounts | null>(null);
  const [legacy, setLegacy] = useState<LegacyProfile | null>(null);
  const [offlineMap, setOfflineMap] =
    useState<OfflineMapStatus>("checking");
  const [surfaceRevision, setSurfaceRevision] = useState(0);
  const [economy, setEconomy] = useState<EconomySnapshot>({
    balance: 0,
    earned: 0,
    spent: 0,
    coverage: 0,
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
    if (saved) setVariant(saved as AnyQuizVariant);
  }, [topFamily]);
  useEffect(() => {
    if (!data) return;
    setTravelCounts(null);
    void geometryIndex().then(({ features: geometryFeatures }) => {
      const ids = [...geometryFeatures.keys()].filter((id) => data.meta[id] && (!onlyUn || data.meta[id]?.un));
      setTravelCounts(Object.fromEntries(REGION_ITEMS.map(([key]) => [key, travelDestinationIds(data.meta, ids.filter((id) => inRegion(id, key, data))).length])) as RegionCounts);
    }).catch(() => setTravelCounts(null));
  }, [data, onlyUn]);
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
      return meta && !meta.absorvido && meta.mapa !== false && (!onlyUn || meta.un);
    }) : []),
    [data, onlyUn],
  );
  const playableData = useMemo(() => {
    if (!data || !onlyUn) return data;
    return { ...data, meta: Object.fromEntries(Object.entries(data.meta).filter(([, meta]) => meta.un)) };
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
         if (onlyUn && !meta.un) return false;
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
     return <div className="app-shell grain"><Header legacy={legacy} economy={economy} onSurface={openSurface} onGrantCoins={grantDevelopmentCoins} onUnlockContent={unlockDevelopmentContent} /><Surface key={surfaceRevision} data={data} kind={screen} onBack={() => setScreen("hub")} /></div>;
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
    <div className="app-shell grain">
       <Header legacy={legacy} economy={economy} onSurface={openSurface} onGrantCoins={grantDevelopmentCoins} onUnlockContent={unlockDevelopmentContent} />
      {screen === "hub" && (
        <Hub
          legacy={legacy}
            economy={economy}
            onSurface={openSurface}
          offlineMap={offlineMap}
          onToggleOfflineMap={async () => {
            try {
              if (offlineMap === "installed") {
                await removeOfflineMap();
                setOfflineMap("available");
              } else {
                setOfflineMap("downloading");
                await downloadOfflineMap();
                setOfflineMap("installed");
              }
            } catch {
              setOfflineMap("error");
            }
          }}
          onSelect={async (selected) => {
            setFamily(selected);
            setTopFamily(selected === "mapa" || selected === "silhueta" || selected === "travel" ? "mapa" : selected === "bandeiras" || selected === "escrita" || selected === "historicas" ? "bandeiras" : selected === "capitais" ? "capitais" : "idiomas");
            if (selected === "historicas" || selected === "idiomas" || selected === "escrita") {
              setRegion("mundo");
            }
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
              });
            }
             const defaultVariant = selected === "mapa" ? "mapa" : selected === "bandeiras" ? "bandeira-nome" : selected === "capitais" ? "capital-pais" : selected === "escrita" ? "escrita-pais" : selected === "historicas" ? "historica-nome" : selected === "idiomas" ? "idioma-pais" : selected === "silhueta" ? "silhueta" : "travel";
             const familyKey = selected === "mapa" || selected === "silhueta" || selected === "travel" ? "mapa" : selected === "bandeiras" || selected === "escrita" || selected === "historicas" ? "bandeiras" : selected === "capitais" ? "capitais" : "idiomas";
             const savedVariant = localStorage.getItem(`carta-last-variant:${familyKey}`);
             setVariant((savedVariant as AnyQuizVariant | null) ?? defaultVariant);
             localStorage.setItem(`carta-last-variant:${familyKey}`, savedVariant ?? defaultVariant);
             setScreen("recorte");
          }}
        />
      )}
      {screen === "recorte" && (
        <Recorte
          data={data}
            family={family}
            variant={variant}
            counts={familyCounts?.[family] ?? counts}
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