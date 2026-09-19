import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { MapMouseEvent } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { Icon } from "./icons";
import { normalizeRegionSelection, REGION_CAMERA, regionLabel } from "../domain/regions";
import type { AnyQuizVariant, Family, GeoFeature, Legacy, Region, RegionSelection } from "../domain/types";
import { MAP_URL } from "../domain/offline-map";
import { startLearningSession, type LearningSessionHandle } from "../domain/learning-store";
import { createFiniteDeck, seedFromParts } from "../domain/finite-deck";
import {
  assertMarkerBound,
  filteredMarkerSource,
  markerFilter,
  SMALL_ENTITY_SOURCE,
} from "../domain/small-entities";
import { resolveMarkerClick } from "../domain/map-marker-click";

const pmtilesProtocol = new Protocol();
maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);
const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
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
  region: RegionSelection;
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
  const [round, setRound] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [wrong, setWrong] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [keyboardMode, setKeyboardMode] = useState(false);
  const sessionRef = useRef<LearningSessionHandle | null>(null);
  const pendingSessionRef = useRef<Promise<LearningSessionHandle> | null>(null);
  const strictUsersRef = useRef(0);
  const targetStartedAtRef = useRef(0);
  const deckRef = useRef<ReturnType<typeof createFiniteDeck<GeoFeature>> | null>(null);
  const queuedRoundsRef = useRef<Parameters<LearningSessionHandle["recordRound"]>[0][]>([]);

  const openSession = () => {
    const pending = startLearningSession({
      family: engineFamily,
      variant: engineVariant,
      region,
    });
    pendingSessionRef.current = pending;
    pending
      .then((handle) => {
        if (strictUsersRef.current > 0) {
          sessionRef.current = handle;
          queuedRoundsRef.current.splice(0).forEach((round) => handle.recordRound(round));
        }
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
  const leaveSession = async (home = false) => {
    const handle =
      sessionRef.current ??
      (await pendingSessionRef.current?.catch(() => null));
    sessionRef.current = null;
    if (handle) {
      queuedRoundsRef.current.splice(0).forEach((round) => handle.recordRound(round));
      await handle.end({ complete: false });
    }
    if (home) location.href = "/";
    else onBack();
  };
  const recordRound = (round: Parameters<LearningSessionHandle["recordRound"]>[0]) => {
    if (sessionRef.current) sessionRef.current.recordRound(round);
    else queuedRoundsRef.current.push(round);
  };
  const finishSession = async () => {
    const handle = sessionRef.current ?? await pendingSessionRef.current?.catch(() => null);
    if (handle) {
      queuedRoundsRef.current.splice(0).forEach((round) => handle.recordRound(round));
      await handle.finish();
    }
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
    const item = deckRef.current?.draw();
    if (!item) return;
    targetRef.current = item.id;
    targetStartedAtRef.current = Date.now();
    feedbackRef.current = "";
    setTarget(item.id);
    setRound(features.length - (deckRef.current?.remaining ?? 0));
    setSelectedAnswer("");
    setFeedback("");
    setWrong(false);
  };

  useEffect(() => {
    deckRef.current = createFiniteDeck(features, seedFromParts(engineFamily, engineVariant, JSON.stringify(region), features.map((item) => item.id).join("|")) ^ Math.floor(Math.random() * 0x100000000));
    nextTarget();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [features]);

  const answerId = (id: string, evidence?: { byWater?: boolean; distanceKm?: number | null }) => {
    if (!id || feedbackRef.current || !targetRef.current) return;
    setSelectedAnswer(id);
    const responseTimeMs = Math.max(0, Date.now() - targetStartedAtRef.current);
    const round = {
      targetId: targetRef.current,
      correct: id === targetRef.current,
      responseTimeMs,
      answeredAt: Date.now(),
      clickedId: id,
      byWater: evidence?.byWater,
      distanceKm: evidence?.distanceKm ?? null,
    };
    recordRound(round);
    if (round.correct) {
      feedbackRef.current = "Acerto. O mapa respondeu.";
      setScore((value) => value + 1);
      setStreak((value) => value + 1);
      setFeedback(feedbackRef.current);
       const exhausted = deckRef.current?.remaining === 0;
       timerRef.current = window.setTimeout(async () => {
         if (exhausted) {
           await finishSession();
         } else nextTarget();
       }, 350);
    } else {
      feedbackRef.current = "Ainda não. O alvo está marcado no mapa.";
      setStreak(0);
      setWrong(true);
      setFeedback(feedbackRef.current);
      const exhausted = deckRef.current?.remaining === 0;
      timerRef.current = window.setTimeout(async () => {
        if (exhausted) await finishSession();
        else nextTarget();
      }, 1400);
    }
  };
  const restart = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const previous = sessionRef.current;
    sessionRef.current = null;
    pendingSessionRef.current = null;
    if (previous) void previous.end();
    openSession();
    setScore(0);
    setStreak(0);
    setRound(0);
    nextTarget();
  };

  useEffect(() => {
    if (!mapEl.current) return;
    assertMarkerBound(data.mapEntityIds.length);
    const camera = REGION_CAMERA[normalizeRegionSelection(region)[0] ?? "mundo"];
    const activeFilter = markerFilter(features.map((feature) => feature.id));
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
            "small-entities": { type: "geojson", data: SMALL_ENTITY_SOURCE },
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
                 "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 3.5, 3, 5, 5, 1.5],
                 "circle-color": "#9db7b2",
                 "circle-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.9, 3, 0.7, 5, 0.25],
                 "circle-stroke-color": "#24423d",
                "circle-stroke-width": 1,
              },
            },
             {
               id: "pts-hit",
               type: "circle",
               source: "atlas",
               "source-layer": "countries",
               filter: ["==", "$type", "Point"],
               paint: { "circle-radius": 14, "circle-color": "#9db7b2", "circle-opacity": 0.01 },
             },
             {
               id: "small-entities",
               type: "circle",
               source: "small-entities",
               filter: activeFilter as unknown as maplibregl.FilterSpecification,
                paint: {
                  "circle-radius": 4,
                 "circle-color": "#9db7b2",
                  "circle-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.9, 3, 0.7, 5, 0.25, 8, 0.05],
                 "circle-stroke-color": "#24423d",
                 "circle-stroke-width": 1,
               },
             },
             {
               id: "small-entities-hit",
               type: "circle",
               source: "small-entities",
               filter: activeFilter as unknown as maplibregl.FilterSpecification,
                paint: {
                  "circle-radius": 22,
                  "circle-color": "#9db7b2",
                  "circle-opacity": 0.01,
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
    const exposeActiveMarkerIds = () => {
      const active = filteredMarkerSource(features.map((feature) => feature.id));
      mapEl.current?.setAttribute(
        "data-marker-ids",
        active.features.map((item) => item.properties.carta_id).join(","),
      );
    };
    map.on("load", exposeActiveMarkerIds);
    map.on("error", handleError);
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );
    map.on("click", (event: MapMouseEvent) => {
       const markerHits = map.queryRenderedFeatures([
         [event.point.x - 15, event.point.y - 15],
         [event.point.x + 15, event.point.y + 15],
       ], {
         layers: ["small-entities-hit"],
       });
       const nearestMarker = markerHits
         .map((feature) => {
           const coordinates = feature.geometry.type === "Point" ? feature.geometry.coordinates as [number, number] : null;
           if (!coordinates) return null;
           const projected = map.project(coordinates);
           return { feature, distance: Math.hypot(projected.x - event.point.x, projected.y - event.point.y) };
         })
         .filter((item): item is { feature: maplibregl.MapGeoJSONFeature; distance: number } => Boolean(item))
         .sort((a, b) => a.distance - b.distance)[0];
       if (nearestMarker?.feature.properties?.carta_id) {
          const { answerId: id } = resolveMarkerClick(
            nearestMarker.feature,
            targetRef.current,
          );
         const targetMeta = data.meta[targetRef.current];
         const distanceKm = targetMeta?.ll ? haversine(event.lngLat.lat, event.lngLat.lng, targetMeta.ll[1], targetMeta.ll[0]) : null;
         answerId(id, { distanceKm });
         return;
       }
      const hits = map.queryRenderedFeatures(event.point, {
           layers: ["land", "pts-hit", "pts"],
      });
      const id = hits.find((feature) => feature.properties?.carta_id)?.properties?.carta_id;
      const targetMeta = data.meta[targetRef.current];
      const distanceKm = targetMeta?.ll ? haversine(event.lngLat.lat, event.lngLat.lng, targetMeta.ll[1], targetMeta.ll[0]) : null;
      answerId(id ? String(id) : "__water_click__", { byWater: !id, distanceKm });
    });
     const handleKey = (event: KeyboardEvent) => {
       if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","+","=","-","_"].includes(event.key)) setKeyboardMode(true);
      if (event.key !== "Enter" || feedbackRef.current) return;
      const center = map.getContainer().getBoundingClientRect();
      const hits = map.queryRenderedFeatures(
        [center.width / 2, center.height / 2],
        { layers: ["land", "small-entities-hit", "small-entities", "pts-hit", "pts"] },
      );
      const id = hits.find((feature) => feature.properties?.carta_id)?.properties?.carta_id;
       const centerLngLat = map.unproject([center.width / 2, center.height / 2]);
       const targetMeta = data.meta[targetRef.current];
       const distanceKm = targetMeta?.ll
         ? haversine(centerLngLat.lat, centerLngLat.lng, targetMeta.ll[1], targetMeta.ll[0])
         : null;
       answerId(id ? String(id) : "__water_click__", { byWater: !id, distanceKm });
     };
     const handlePointer = () => setKeyboardMode(false);
     map.getContainer().addEventListener("keydown", handleKey);
     map.getContainer().addEventListener("pointerdown", handlePointer);
    mapRef.current = map;
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      map.off("load", handleLoad);
      map.off("load", exposeActiveMarkerIds);
      map.off("error", handleError);
      map.getContainer().removeEventListener("keydown", handleKey);
      map.getContainer().removeEventListener("pointerdown", handlePointer);
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [region]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const filter = markerFilter(features.map((feature) => feature.id));
    map.setFilter(
      "small-entities",
      filter as unknown as maplibregl.FilterSpecification,
    );
    map.setFilter(
      "small-entities-hit",
      filter as unknown as maplibregl.FilterSpecification,
    );
    const active = filteredMarkerSource(features.map((feature) => feature.id));
    mapEl.current?.setAttribute(
      "data-marker-ids",
      active.features.map((item) => item.properties.carta_id).join(","),
    );
  }, [features, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !target || !mapReady || !map.isStyleLoaded()) return;
    const answerColor = "#2f8f83";
    const revealed = Boolean(feedback);
    try {
      map.setPaintProperty("land", "fill-color", [
        "case",
        ["all", revealed, ["==", ["get", "carta_id"], target]],
        answerColor,
        ["all", wrong, ["==", ["get", "carta_id"], selectedAnswer]],
        "#ee7968",
        "#164455",
      ]);
       map.setPaintProperty("pts", "circle-color", [
        "case",
        ["all", revealed, ["==", ["get", "carta_id"], target]],
        answerColor,
        ["all", wrong, ["==", ["get", "carta_id"], selectedAnswer]],
        "#ee7968",
         "#9db7b2",
      ]);
      map.setPaintProperty("small-entities", "circle-color", [
        "case",
        ["all", revealed, ["==", ["get", "carta_id"], target]],
        answerColor,
        ["all", wrong, ["==", ["get", "carta_id"], selectedAnswer]],
        "#ee7968",
        "#9db7b2",
      ]);
    } catch (error) {
      setMapError(
        error instanceof Error
          ? error.message
          : "Falha ao atualizar o destaque do alvo.",
      );
    }
  }, [target, wrong, feedback, selectedAnswer, mapReady]);

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
              <p className="map-keyboard-hint">Foque o mapa, mova com as setas, use +/− e pressione Enter.</p>
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
          <div className="eyebrow">{regionLabel(region)}</div>
           <h1>{engineFamily === "capitais" ? "Encontre o país." : "Encontre no mapa."}</h1>
           <div className="target-kicker">Seu alvo</div>
           <div className="target" aria-live="polite" aria-atomic="true">
            {targetName}
          </div>
           <div
             className={feedback ? `feedback ${wrong ? "bad feedback-error" : "feedback-success"}` : "feedback"}
            aria-live="polite"
            role="status"
          >
             {feedback || (engineFamily === "capitais" ? "Clique no país correspondente à capital." : "Clique na região correspondente.")}
              {feedback && !wrong && <span aria-label="Resposta correta"> Acerto</span>}
          </div>
          <div className="score-box">
            <div>
              <span>progresso</span>
              <b>{round}/{features.length}</b>
            </div>
            <div>
              <span>acertos</span>
              <b>{score}</b>
            </div>
            <div>
              <span>sequência</span>
              <b>{streak}</b>
            </div>
          </div>
            <details className="hud-overflow"><summary aria-label="Mais ações">⋯</summary><div><button type="button" onClick={restart}>Recomeçar</button><button type="button" onClick={() => void leaveSession()}>Voltar ao recorte</button><button type="button" onClick={() => void leaveSession(true)}>Início</button></div></details>
        </aside>
           <div className="map-wrap">
              <div className="map-target-overlay"><span>Encontre</span><strong>{targetName}</strong></div>
              <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {feedback || `Alvo atual: ${targetName}`}
              </p>
              <p className="map-keyboard-hint">Setas movem o mapa; + e − controlam o zoom; Enter responde no centro da mira.</p>
               <div className={`map-crosshair ${keyboardMode ? "is-visible" : ""}`} aria-hidden="true"><i /><i /><span>Enter responde</span></div>
          <div className="map-hud">
              <div className="map-note">Clique no mapa ou use setas, +/− e Enter</div>
          </div>
          <div
            ref={mapEl}
            className="map"
             role="application"
             tabIndex={0}
             aria-label={`Mapa interativo: encontre ${targetName}; setas movem o mapa, Enter responde`}
             onFocus={(event) => event.currentTarget.parentElement?.classList.add("map-focused")}
             onBlur={(event) => event.currentTarget.parentElement?.classList.remove("map-focused")}
          />
        </div>
      </div>
    </div>
  );
}