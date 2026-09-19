import { useEffect, useMemo, useState } from "react";
import { Game } from "./components/map-game";
import { Header, Hub, Recorte, Variant } from "./components/screens";
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
import { inRegion } from "./domain/regions";
import type { AnyQuizVariant, Family, Legacy, QuizVariant, Region, Screen } from "./domain/types";
import { loadSpecialData, specialInRegion } from "./domain/special-data";
import {
  downloadOfflineMap,
  hasOfflineMap,
  removeOfflineMap,
  type OfflineMapStatus,
} from "./domain/offline-map";
import { initializeEconomy, queryEconomy, type EconomySnapshot } from "./domain/economy-store";
import { Surface } from "./components/surfaces";

export function App() {
  const [screen, setScreen] = useState<Screen>("hub");
  const [data, setData] = useState<Legacy | null>(null);
  const [error, setError] = useState("");
  const [region, setRegion] = useState<Region>("caribe");
  const [family, setFamily] = useState<Family>("mapa");
  const [variant, setVariant] = useState<AnyQuizVariant>("mapa");
  const [specialCounts, setSpecialCounts] = useState({
    historicas: { mundo: 0, caribe: 0, pacifico: 0 },
    idiomas: { mundo: 0, caribe: 0, pacifico: 0 },
  });
  const [legacy, setLegacy] = useState<LegacyProfile | null>(null);
  const [offlineMap, setOfflineMap] =
    useState<OfflineMapStatus>("checking");
  const [economy, setEconomy] = useState<EconomySnapshot>({
    balance: 0,
    earned: 0,
    spent: 0,
    coverage: 0,
    sessions: 0,
    unlocked: [
      "mapa:mapa:caribe",
      "bandeiras:bandeira-nome:caribe",
      "capitais:capital-pais:caribe",
      "capitais:pais-capital:caribe",
    ],
  });
  const refreshEconomy = () => queryEconomy().then(setEconomy).catch(() => undefined);
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

  const features = useMemo(
    () => (data ? eligible(buildFeatures(data)) : []),
    [data],
  );
  const counts = useMemo(
    () =>
      data
        ? {
            mundo: features.length,
            caribe: features.filter((item) =>
              inRegion(item.id, "caribe", data),
            ).length,
            pacifico: features.filter((item) =>
              inRegion(item.id, "pacifico", data),
            ).length,
          }
        : null,
    [data, features],
  );
  const familyCounts = useMemo(() => {
    if (!data) return null;
    const count = (selected: Family, selectedRegion: Region) =>
      Object.entries(data.meta).filter(([id, meta]) => {
        if (meta.absorvido || !inRegion(id, selectedRegion, data)) return false;
        if (selected === "mapa") return features.some((item) => item.id === id);
        if (selected === "bandeiras") return Boolean(meta.fl);
        return Boolean(typeof meta.cap === "string" && meta.cap.trim() && !meta.soBandeira);
      }).length;
    return {
      mapa: { mundo: count("mapa", "mundo"), caribe: count("mapa", "caribe"), pacifico: count("mapa", "pacifico") },
      bandeiras: { mundo: count("bandeiras", "mundo"), caribe: count("bandeiras", "caribe"), pacifico: count("bandeiras", "pacifico") },
      capitais: { mundo: count("capitais", "mundo"), caribe: count("capitais", "caribe"), pacifico: count("capitais", "pacifico") },
      escrita: {
        mundo: count("bandeiras", "mundo"),
        caribe: count("bandeiras", "caribe"),
        pacifico: count("bandeiras", "pacifico"),
      },
      historicas: specialCounts.historicas,
      idiomas: specialCounts.idiomas,
      silhueta: { mundo: features.length, caribe: counts?.caribe ?? 0, pacifico: counts?.pacifico ?? 0 },
      travel: { mundo: features.length, caribe: counts?.caribe ?? 0, pacifico: counts?.pacifico ?? 0 },
    } as Record<Family, { mundo: number; caribe: number; pacifico: number }>;
  }, [data, features, specialCounts]);

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
    return <div className="app-shell grain"><Header legacy={legacy} economy={economy} onSurface={openSurface} /><Surface data={data} kind={screen} onBack={() => setScreen("hub")} /></div>;
  }

  if (screen === "game") {
    if (family === "silhueta" || family === "travel") {
       return <GeometryGame family={family} data={data} region={region} onBack={() => { void refreshEconomy(); setScreen("recorte"); }} onEnd={() => { void refreshEconomy(); setScreen("result"); }} />;
    }
    if (family === "historicas" || family === "idiomas" || family === "escrita") {
       return <SpecialQuiz data={data} family={family} variant={variant} region={region} onBack={() => { void refreshEconomy(); setScreen("recorte"); }} onEnd={() => { void refreshEconomy(); setScreen("result"); }} />;
    }
    if (family !== "mapa") {
      return (
        <QuizGame
          data={data}
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
      <Header legacy={legacy} economy={economy} onSurface={openSurface} />
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
            if (selected === "historicas" || selected === "idiomas" || selected === "escrita") {
              setRegion("mundo");
              await loadSpecialData().then((special) => {
                const count = (items: { reg?: string; sub?: string }[]) => ({
                  mundo: items.length,
                  caribe: items.filter((item) => specialInRegion(item, "caribe")).length,
                  pacifico: items.filter((item) => specialInRegion(item, "pacifico")).length,
                });
                setSpecialCounts({
                  historicas: count(special.historical),
                  idiomas: count(special.languages),
                });
              });
            }
            setVariant(selected === "mapa" ? "mapa" : selected === "bandeiras" ? "bandeira-nome" : selected === "capitais" ? "capital-pais" : selected === "escrita" ? "escrita-pais" : selected === "historicas" ? "historica-nome" : selected === "idiomas" ? "idioma-pais" : selected === "silhueta" ? "silhueta" : "travel");
            setScreen("variant");
          }}
        />
      )}
      {screen === "variant" && (
        <Variant
            family={family}
            variant={variant}
            setVariant={setVariant}
            economy={economy}
          onBack={() => setScreen("hub")}
          onNext={() => setScreen("recorte")}
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
          onBack={() => setScreen("variant")}
           economy={economy}
           onRefresh={refreshEconomy}
           onPlay={() => setScreen("game")}
        />
      )}
    </div>
  );
}