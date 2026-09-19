import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { MapMouseEvent } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { Icon } from "./icons";
import { REGION_CAMERA, regionLabel } from "../domain/regions";
import type { AnyQuizVariant, Family, GeoFeature, Legacy, Region } from "../domain/types";
import { MAP_URL } from "../domain/offline-map";
import { startLearningSession, type LearningSessionHandle } from "../domain/learning-store";

const pmtilesProtocol = new Protocol();
maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);

export function Game({
  data,
  features,
  region,
  onBack,
  onEnd,
  family,
  variant,
}: {
  data: Legacy;
  features: GeoFeature[];
  region: Region;
  onBack: () => void;
  onEnd?: () => void;
  family?: Family;
  variant?: AnyQuizVariant;
}) {
  const engineFamily = family ?? "mapa";
  const engineVariant = variant ?? "mapa";
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const targetRef = useRef("");
  const feedbackRef = useRef("");
  const timerRef = useRef<number | null>(null);
  const [target, setTarget] = useState("");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [wrong, setWrong] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const sessionRef = useRef<LearningSessionHandle | null>(null);
  const pendingSessionRef = useRef<Promise<LearningSessionHandle> | null>(null);
  const strictUsersRef = useRef(0);
  const targetStartedAtRef = useRef(0);

  const openSession = () => {
    const pending = startLearningSession({
      family: engineFamily,
      variant: engineVariant,
      region,
    });
    pendingSessionRef.current = pending;
    pending
      .then((handle) => {
        if (strictUsersRef.current > 0) sessionRef.current = handle;
        else void handle.end();
      })
      .catch((error) =>
        console.error(
          `[carta-cega] learning session failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
  };
  const leaveSession = async () => {
    const handle =
      sessionRef.current ??
      (await pendingSessionRef.current?.catch(() => null));
    sessionRef.current = null;
    if (handle) await handle.finish();
    (onEnd ?? onBack)();
  };

  useEffect(() => {
    strictUsersRef.current += 1;
    if (!pendingSessionRef.current) openSession();
    return () => {
      strictUsersRef.current -= 1;
      queueMicrotask(() => {
        if (strictUsersRef.current > 0) return;
        const handle = sessionRef.current;
        sessionRef.current = null;
        if (handle) void handle.end();
      });
    };
  }, []);

  const nextTarget = () => {
    if (!features.length) return;
    const item = features[Math.floor(Math.random() * features.length)];
    targetRef.current = item.id;
    targetStartedAtRef.current = Date.now();
    feedbackRef.current = "";
    setTarget(item.id);
    setSelectedAnswer("");
    setFeedback("");
    setWrong(false);
  };

  useEffect(() => {
    nextTarget();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [features]);

  const answerId = (id: string) => {
    if (!id || feedbackRef.current || !targetRef.current) return;
    setSelectedAnswer(id);
    const responseTimeMs = Math.max(0, Date.now() - targetStartedAtRef.current);
    const round = {
      targetId: targetRef.current,
      correct: id === targetRef.current,
      responseTimeMs,
      answeredAt: Date.now(),
      clickedId: id,
    };
    sessionRef.current?.recordRound(round);
    if (round.correct) {
      feedbackRef.current = "Acerto. O mapa respondeu.";
      setScore((value) => value + 1);
      setStreak((value) => value + 1);
      setFeedback(feedbackRef.current);
      timerRef.current = window.setTimeout(nextTarget, 650);
    } else {
      feedbackRef.current = "Ainda não. O alvo está marcado no mapa.";
      setStreak(0);
      setWrong(true);
      setFeedback(feedbackRef.current);
      timerRef.current = window.setTimeout(nextTarget, 1400);
    }
  };

  useEffect(() => {
    if (!mapEl.current) return;
    const camera = REGION_CAMERA[region];
    setMapReady(false);
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: mapEl.current,
        style: {
          version: 8,
          sources: {
            atlas: {
              type: "vector",
              url: `pmtiles://${MAP_URL}`,
              promoteId: "carta_id",
              attribution:
                "geoBoundaries · Natural Earth · © OpenStreetMap contributors",
            },
          },
          layers: [
            {
              id: "bg",
              type: "background",
              paint: { "background-color": "#081825" },
            },
            {
              id: "land",
              type: "fill",
              source: "atlas",
              "source-layer": "countries",
              filter: ["==", "$type", "Polygon"],
              paint: {
                "fill-color": "#164455",
                "fill-outline-color": "#4c8890",
                "fill-opacity": 0.82,
              },
            },
            {
              id: "pts",
              type: "circle",
              source: "atlas",
              "source-layer": "countries",
              filter: ["==", "$type", "Point"],
              paint: {
                "circle-radius": 5,
                "circle-color": "#e8ba6a",
                "circle-stroke-color": "#081825",
                "circle-stroke-width": 1,
              },
            },
          ],
        },
        center: camera.center,
        zoom: camera.zoom,
        attributionControl: { compact: true },
      });
    } catch (error) {
      setMapError(
        error instanceof Error
          ? error.message
          : "Este navegador não conseguiu iniciar o mapa.",
      );
      return;
    }

    const handleLoad = () => setMapReady(true);
    const handleError = (event: any) => {
      const message =
        event.error instanceof Error
          ? event.error.message
          : "Falha ao carregar os dados cartográficos.";
      setMapError(message);
    };
    map.on("load", handleLoad);
    map.on("error", handleError);
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );
    map.on("click", (event: MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(event.point, {
        layers: ["land", "pts"],
      });
      const id = hits[0]?.properties?.carta_id;
      if (!id) return;
      answerId(String(id));
    });
    mapRef.current = map;
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      map.off("load", handleLoad);
      map.off("error", handleError);
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [features, region]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !target || !mapReady || !map.isStyleLoaded()) return;
    const answerColor = wrong ? "#ee7968" : "#164455";
    try {
      map.setPaintProperty("land", "fill-color", [
        "case",
        ["==", ["get", "carta_id"], target],
        answerColor,
        "#164455",
      ]);
      map.setPaintProperty("pts", "circle-color", [
        "case",
        ["==", ["get", "carta_id"], target],
        wrong ? "#ee7968" : "#e8ba6a",
        "#e8ba6a",
      ]);
    } catch (error) {
      setMapError(
        error instanceof Error
          ? error.message
          : "Falha ao atualizar o destaque do alvo.",
      );
    }
  }, [target, wrong, mapReady]);

  const targetName = engineFamily === "capitais" && engineVariant === "capital-pais"
    ? data.meta[target]?.cap ?? "carregando"
    : data.meta[target]?.pt ?? "carregando";
  if (mapError) {
    return (
      <div className="app-shell">
        <main className="content">
           <button className="back" onClick={() => void leaveSession()}>
             ← Encerrar sessão
          </button>
           <div className="diagnostic" style={{ marginTop: 32 }}>
            <div className="eyebrow">Mapa indisponível</div>
            <p>
              <strong>WebGL2 é necessário para abrir este recorte.</strong>{" "}
              Atualize o navegador ou ative a aceleração de hardware e tente
              novamente.
            </p>
            <p className="mono">{mapError}</p>
             <label className="target-kicker" htmlFor="map-answer-select">
               Resposta sem mapa
             </label>
             <select
               id="map-answer-select"
               aria-label="Selecionar território para responder"
               value={selectedAnswer}
               disabled={Boolean(feedback)}
               onChange={(event) => answerId(event.target.value)}
             >
               <option value="">Escolha um território…</option>
               {features.map((item) => (
                 <option key={item.id} value={item.id}>
                   {data.meta[item.id]?.pt ?? item.id}
                 </option>
               ))}
             </select>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="map-stage">
        <aside className="map-panel">
           <button className="back" onClick={() => void leaveSession()}>
             ← Encerrar sessão
          </button>
          <div className="eyebrow" style={{ marginTop: 28 }}>
            Sessão ·{" "}
            {regionLabel(region)}
          </div>
           <h1>{engineFamily === "capitais" ? "Encontre o país." : "Encontre no mapa."}</h1>
          <div className="target-kicker">Seu alvo</div>
          <div className="target" aria-live="polite" aria-atomic="true">
            {targetName}
          </div>
           <label className="target-kicker" htmlFor="map-answer-select">
             Responda também pelo teclado
           </label>
           <select
             id="map-answer-select"
             aria-label="Selecionar território para responder"
             value={selectedAnswer}
             disabled={Boolean(feedback)}
             onChange={(event) => answerId(event.target.value)}
           >
             <option value="">Escolha um território…</option>
             {features.map((item) => (
               <option key={item.id} value={item.id}>
                 {data.meta[item.id]?.pt ?? item.id}
               </option>
             ))}
           </select>
          <div
            className={feedback ? `feedback ${wrong ? "bad" : ""}` : "feedback"}
            aria-live="polite"
            role="status"
          >
             {feedback || (engineFamily === "capitais" ? "Clique no país correspondente à capital." : "Clique na região correspondente.")}
          </div>
          <div className="score-box">
            <div>
              <span>acertos</span>
              <b>{score}</b>
            </div>
            <div>
              <span>sequência</span>
              <b>{streak}</b>
            </div>
          </div>
          <button
            className="button ghost"
            style={{ marginTop: 20 }}
            onClick={() => {
              if (timerRef.current) window.clearTimeout(timerRef.current);
              const previous = sessionRef.current;
              sessionRef.current = null;
              pendingSessionRef.current = null;
              if (previous) void previous.end();
              openSession();
              setScore(0);
              setStreak(0);
              nextTarget();
            }}
          >
            Recomeçar sessão
          </button>
        </aside>
        <div className="map-wrap">
          <div className="map-hud">
             <div className="map-note">Toque, clique ou use a lista de teclado</div>
          </div>
          <div
            ref={mapEl}
            className="map"
            role="application"
            aria-label="Mapa interativo para localizar o alvo"
          />
        </div>
      </div>
    </div>
  );
}