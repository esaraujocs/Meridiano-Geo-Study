import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as maplibregl from "maplibre-gl";
import type { MapMouseEvent } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { Icon } from "./icons";
import { cameraFor, inRegion, normalizeRegionSelection, regionLabel } from "../domain/regions";
import { coastBands, graticuleLines, mixHex, rhumbLines } from "../domain/map-palette";
import { baseVariant, divisionRegionLabel, type UnitWord } from "../domain/divisions";
import { mapPaletteFor } from "../domain/themes";
import type { AnyQuizVariant, Family, GeoFeature, Legacy, Region, RegionSelection } from "../domain/types";
import { MAP_URL } from "../domain/offline-map";
import { startLearningSession, type LearningSessionHandle, type SessionResult } from "../domain/learning-store";
import { cardParentsOf } from "../domain/learning-rules";
import { sameCapitalName } from "../domain/typed-answer";
import { createFiniteDeck, deckSeedFor, seedFromParts } from "../domain/finite-deck";
import { sessionSettings, type SessionOptions } from "../domain/pace";
import { entityTier } from "../domain/spoils";
import { RoundTimer } from "./round-timer";
import { addMapFauna } from "./map-fauna";
import { addMapOrnaments } from "./map-ornaments";
import { activeCosmetics } from "../domain/mecenato-store";
import { MAP_STYLES, isMapStyleId, withMapStyle } from "../domain/map-styles";
import { MAP_BASE_CREDIT, MAP_BASE_MAXZOOM, MAP_BASE_TILES, isSatellite, landOpacityPaint, mapBaseBorderLayers, mapBaseRasterPaint, readMapBase, withMapBase } from "../domain/map-base";
import { useLeaveGuard } from "./leave-guard";
import { GameTopBar, SupplyTray, neighborClue, useGameKeys, useRoundLog } from "./game-shell";
import { useSupplies } from "./use-supplies";
import { compassGroup, emptySupplyCounts, lanternZoom, type SupplyCounts, type SupplyId } from "../domain/supplies";
import { continentLabel } from "../domain/collection-view";
import { variantLabel } from "../domain/result-view";
import {
  ABSORBED_MARKER_IDS,
  assertMarkerBound,
  filteredMarkerSource,
  isMarkerVisibleAtZoom,
  MARKER_BAND_ZOOMS,
  markerBandFilter,
  markerBandOpacity,
  markerFilter,
  markerLayerId,
  SMALL_ENTITY_SOURCE,
} from "../domain/small-entities";
import { chooseClickAnswer, MARKER_TOUCH_PX, resolveMarkerClick } from "../domain/map-marker-click";
import { mapDeckSignature } from "../domain/map-round-engine";
import { distanceToGeometriesKm, haversineKm, nearestWithin, SEA_TAP_PX } from "../domain/map-nearest";
import { t } from "../domain/i18n";

/** O mapa nunca amplia além disto: os tiles vão até o zoom 9 com o detalhe de um zoom 10 (~10 m), e daqui em diante o desenho
 * só cresceria. */
const MAP_MAX_ZOOM = 14;
// Tempo em que o acerto fica visível antes do próximo alvo (antes 350 ms, curto demais para notar).
const HIT_FEEDBACK_MS = 700;
/** As cores do mapa vêm do tema em uso (oceano, terra, costas, marcadores, o tom do acerto e do erro e os enfeites do mar). */
/** Cor do continente marcado pela Bússola: âmbar, que não se confunde com o verde do acerto nem com o vermelho do erro. */
const BUSSOLA_COLOR = "#e6b04a";
/** Cor do vizinho revelado pela Pista de vizinhos: azul, que não se confunde com o âmbar da Bússola, o verde do acerto nem o vermelho do erro. */
const VIZINHO_COLOR = "#5d8fd6";
// a região que a Bússola mostra: o continente, as duas Américas ou, em Estados e províncias, a região do país ("br:nordeste")
const compassLabel = (group: string | null) => (group?.includes(":") ? divisionRegionLabel(group) : group === "america-do-sul" || group === "america-do-norte-central" ? t.regions[group][0] : continentLabel(group ?? undefined));
/** Outro tabuleiro no lugar do mapa-múndi (um país de Estados e províncias): os tiles do jogo, o enquadramento do recorte e o mapa-múndi por baixo,
 *  de contexto. */
export type MapBoard = {
  url: string;
  attribution: string;
  /** A palavra da unidade do país (estado, província…), para os textos. */
  unit: UnitWord;
  /** [oeste, sul, leste, norte] do recorte: a câmera enquadra por ela (no lugar de REGION_CAMERA). */
  bounds: [number, number, number, number];
  /** O mapa-múndi de fundo: sem a entidade que o tabuleiro detalha (`hide`, o carta_id dela) e sem responder ao clique. */
  backdrop?: { url: string; hide: string };
};
/** Folga da câmera do tabuleiro: o alvo fica em cima e a bandeja de suprimentos embaixo. */
const boardPadding = (element: HTMLElement | null) => {
  const height = element?.clientHeight ?? 640;
  const width = element?.clientWidth ?? 640;
  return { top: Math.round(Math.min(116, height * 0.2)), bottom: Math.round(Math.min(84, height * 0.13)), left: Math.round(Math.min(28, width * 0.05)), right: Math.round(Math.min(28, width * 0.05)) };
};
const currentPalette = () => mapPaletteFor(document.documentElement.dataset.theme);
const pmtilesProtocol = new Protocol();
maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);
export function Game({
  data,
  features,
  region,
  options,
  onBack,
  onEnd,
  family,
  variant,
  onlyUn = false,
  supplies = emptySupplyCounts(),
  board,
}: {
  data: Legacy;
  features: GeoFeature[];
  region: RegionSelection;
  options?: SessionOptions;
  onBack: () => void;
  onEnd?: (result: SessionResult | null) => void;
  family?: Family;
  variant?: AnyQuizVariant;
  onlyUn?: boolean;
  supplies?: SupplyCounts;
  /** Tabuleiro próprio (um país de Estados e províncias); sem ele, o mapa-múndi de sempre. */
  board?: MapBoard;
}) {
  const engineFamily = family ?? "mapa";
  const engineVariant = variant ?? "mapa";
  // a regra do modo (em Estados e províncias, a do modo equivalente do mapa-múndi): cronômetro, suprimentos, capital ou unidade
  const ruleVariant = baseVariant(engineVariant);
  const settings = sessionSettings(options, engineVariant);
  const { pace, roundLimit, timerSeconds } = settings;
  // No Treino (sem cronômetro, rende 50%) cada país/capital perguntado fica marcado no mapa com o nome
  // escrito, acertando ou errando — é o que diferencia Treino de Partida além do cronômetro/moedas.
  const revealNames = pace === "training";
  // Estilo de mapa do Mecenato (item de expedição), lido uma vez por partida: vale por cima da paleta do tema.
  const mapStyleId = useMemo(() => activeCosmetics()["map-style"], []);
  // Fundo de satélite ou relevo (Configurações, em teste): só no mapa-múndi; no satélite os ornamentos do estilo e a fauna do tema saem.
  const mapBase = useMemo(() => (board ? "padrao" : readMapBase()), []);
  const satellite = isSatellite(mapBase);
  const paletteNow = () => withMapBase(withMapStyle(currentPalette(), mapStyleId), mapBase);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const targetRef = useRef("");
  const feedbackRef = useRef("");
  const timerRef = useRef<number | null>(null);
  const [target, setTarget] = useState("");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [round, setRound] = useState(0);
  const [serial, setSerial] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [wrong, setWrong] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [keyboardMode, setKeyboardMode] = useState(false);
  // Segunda chance: o clique errado deixou a rodada aberta; Escudo: o erro desta rodada foi coberto.
  const [retryNote, setRetryNote] = useState(false);
  const [shieldSaved, setShieldSaved] = useState(false);
  // Ids já perguntados nesta partida, acertando ou errando (só usado no Treino, ver revealNames) — zera a cada baralho novo.
  const [revealed, setRevealed] = useState<string[]>([]);
  const labelMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const sessionRef = useRef<LearningSessionHandle | null>(null);
  const pendingSessionRef = useRef<Promise<LearningSessionHandle> | null>(null);
  const strictUsersRef = useRef(0);
  const targetStartedAtRef = useRef(0);
  const deckRef = useRef<ReturnType<typeof createFiniteDeck<GeoFeature>> | null>(null);
  const queuedRoundsRef = useRef<Parameters<LearningSessionHandle["recordRound"]>[0][]>([]);
  const leaveGuard = useLeaveGuard(settings.pvp ? "pvp" : Boolean(settings.duel));
  const log = useRoundLog(settings.coinVariant ?? engineVariant, pace);
  const featureSignature = mapDeckSignature(features.map((item) => item.id));
  // Territórios absorvidos (Guadalupe, Martinica...) nunca são alvo, mas aparecem com o recorte;
  // seguem a mesma regra do "Só ONU" das demais entidades pequenas (não são membros).
  // No tabuleiro de um país não há marcadores (os do mapa-múndi são de países; uma unidade minúscula, como o DC, não entra no pacote).
  const absorbedMarkerIds = onlyUn || board ? [] : ABSORBED_MARKER_IDS.filter((id) => inRegion(id, region, data));
  const markerIds = board ? [] : [...features.map((feature) => feature.id), ...absorbedMarkerIds];
  const markerSignature = markerIds.join("|");
  // No modo Capitais mostra o nome da capital (foi o que foi perguntado); no modo Mapa, o nome do país.
  const capitalMode = ruleVariant === "capital-pais";
  const nameFor = (id: string) => (capitalMode ? data.meta[id]?.cap : data.meta[id]?.pt);
  const cardParents = useMemo(() => cardParentsOf(data.meta), [data.meta]);
  // Suprimentos de expedição só em Partida solo (nunca Treino/duelo/PvP, ver domain/supplies.ts).
  const suppliesEnabled = !settings.duel && !settings.pvp;
  const supply = useSupplies(supplies, suppliesEnabled);
  const bussolaUsed = supply.usedThisRound.has("bussola");
  // Pista de vizinhos: um país vizinho do alvo fica pintado de azul e o nome vai embaixo do alvo
  const vizinhoUsed = supply.usedThisRound.has("vizinho");
  const clue = useMemo(() => (vizinhoUsed ? neighborClue(data.meta, target) : null), [vizinhoUsed, target, data.meta]);
  const neighborIds = useMemo(() => (clue ? [clue.id] : null), [clue]);
  // Bússola: o continente do alvo fica pintado no mapa (todos os países dele), além do nome embaixo do alvo
  const bussolaIds = useMemo(() => {
    const group = bussolaUsed ? compassGroup(data.meta[target]) : null;
    return group ? Object.keys(data.meta).filter((id) => compassGroup(data.meta[id]) === group) : null;
  }, [bussolaUsed, target, data.meta]);

  const openSession = () => {
    const pending = startLearningSession({
      family: engineFamily,
      variant: engineVariant,
      region,
      pace,
      roundLimit,
      timerSeconds,
      coinVariant: settings.coinVariant,
      duel: settings.duel,
      onRound: settings.onRound,
      coinFactor: settings.coinFactor,
      cardParents,
      // as unidades de Estados e províncias não são cartas da coleção (como Gentílicos e Moedas)
      ...(engineFamily === "divisoes" || engineFamily === "epocas" ? { persistProgress: false } : {}),
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
  // "result": encerrar pelo botão mostra o resultado (com as moedas ganhas até ali); "recorte"/"home" só navegam.
  const leaveSession = async (destination: "recorte" | "home" | "result" = "recorte") => {
    const handle =
      sessionRef.current ??
      (await pendingSessionRef.current?.catch(() => null));
    sessionRef.current = null;
    let result: SessionResult | null = null;
    if (handle) {
      queuedRoundsRef.current.splice(0).forEach((round) => handle.recordRound(round));
      result = await handle.end({ complete: false });
    }
    if (destination === "home") location.href = "/";
    else if (destination === "result" && result?.spoils && onEnd) onEnd(result);
    else onBack();
  };
  const recordRound = (round: Parameters<LearningSessionHandle["recordRound"]>[0]) => {
    leaveGuard.noteAnswer();
    log.push({ correct: round.correct, tier: round.tier, shielded: round.shielded });
    if (sessionRef.current) sessionRef.current.recordRound(round);
    else queuedRoundsRef.current.push(round);
  };
  const finishSession = async () => {
    const handle = sessionRef.current ?? await pendingSessionRef.current?.catch(() => null);
    let result: SessionResult | null = null;
    if (handle) {
      queuedRoundsRef.current.splice(0).forEach((round) => handle.recordRound(round));
      result = await handle.finish();
    }
    if (onEnd) onEnd(result);
    else onBack();
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

  const currentItemRef = useRef<GeoFeature | null>(null);
  const nextTarget = () => {
    const item = deckRef.current?.draw();
    if (!item) return;
    currentItemRef.current = item;
    targetRef.current = item.id;
    targetStartedAtRef.current = Date.now();
    feedbackRef.current = "";
    setTarget(item.id);
    setRound((deckRef.current?.size ?? features.length) - (deckRef.current?.remaining ?? 0));
    setSelectedAnswer("");
    setFeedback("");
    setWrong(false);
    setTimedOut(false);
    setRetryNote(false);
    setShieldSaved(false);
    setSerial((value) => value + 1);
    supply.resetRound();
    // Lanterna: a câmera que se aproximou do alvo anterior volta ao enquadramento do recorte
    if (lanternRef.current) { lanternRef.current = false; resetCamera(); }
  };
  const lanternRef = useRef(false);
  const flyOptions = () => (document.documentElement.dataset.reducedMotion === "true" ? { duration: 0 } : { duration: 900 });
  const resetCamera = () => {
    if (board) { mapRef.current?.fitBounds(board.bounds, { padding: boardPadding(mapEl.current), ...flyOptions() }); return; }
    const camera = cameraFor(normalizeRegionSelection(region)[0] ?? "mundo");
    mapRef.current?.flyTo({ center: camera.center, zoom: camera.zoom, ...flyOptions() });
  };
  // Lanterna: a câmera voa até o alvo e fecha numa janela de ~1.200 km (lanternZoom), ainda dá para mexer no mapa.
  const shine = () => {
    const map = mapRef.current;
    const ll = data.meta[targetRef.current]?.ll;
    if (!map || !ll) return;
    lanternRef.current = true;
    map.flyTo({ center: [ll[1], ll[0]], zoom: lanternZoom(ll[0], map.getContainer().clientWidth), ...flyOptions() });
  };
  // Pular: o alvo vai para o fim do baralho (sem contar acerto nem erro) e o próximo entra. No último alvo não há para onde mandar.
  const skipRound = () => {
    const deck = deckRef.current;
    const item = currentItemRef.current;
    if (feedbackRef.current || !item || !deck || deck.remaining === 0 || !supply.use("pular")) return;
    deck.defer(item);
    nextTarget();
  };
  const newDeck = () => createFiniteDeck(features, deckSeedFor(seedFromParts(engineFamily, engineVariant, JSON.stringify(region), features.map((item) => item.id).join("|")), settings.deckSeed), roundLimit);

  useEffect(() => {
    deckRef.current = newDeck();
    setRevealed([]);
    nextTarget();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [featureSignature, engineFamily, engineVariant, region]);

  // Anel + check no ponto do acerto (toque, marcador ou mira) e vibração curta no celular.
  const celebrateHit = (point?: [number, number]) => {
    try { navigator.vibrate?.(30); } catch { /* aparelho sem vibração */ }
    const map = mapRef.current;
    if (!map || !point) return;
    const element = document.createElement("div");
    element.className = "hit-pulse";
    element.setAttribute("aria-hidden", "true");
    element.innerHTML = "<i></i><i></i><b>✓</b>";
    const marker = new maplibregl.Marker({ element, anchor: "center" }).setLngLat(point).addTo(map);
    window.setTimeout(() => { try { marker.remove(); } catch { /* mapa já removido */ } }, 1000);
  };

  const answerRef = useRef<(id: string, evidence?: { byWater?: boolean; distanceKm?: number | null; point?: [number, number] }) => void>(() => undefined);
  const answerId = (id: string, evidence?: { byWater?: boolean; distanceKm?: number | null; point?: [number, number] }) => {
    if (!id || feedbackRef.current || !targetRef.current) return;
    if (import.meta.env.DEV) {
      (window as unknown as { __cartaLastAnswer?: string }).__cartaLastAnswer = id;
    }
    setSelectedAnswer(id);
    // Capital com nome repetido (Victoria, Georgetown...): o país clicado também tem a capital perguntada, então vale e vira o alvo da rodada
    // (a carta, o destaque e o texto do acerto ficam com o país que a pessoa achou).
    if (capitalMode && id !== targetRef.current && sameCapitalName(data.meta[id]?.cap, data.meta[targetRef.current]?.cap)) { targetRef.current = id; setTarget(id); }
    const responseTimeMs = Math.max(0, Date.now() - targetStartedAtRef.current);
    const correct = id === targetRef.current;
    // Segunda chance: errou o clique: a rodada segue aberta, o lugar errado fica marcado em vermelho até o próximo clique.
    if (!correct && supply.consumeArmed("retorno")) { setWrong(true); setRetryNote(true); return; }
    // Escudo: o erro não quebra a sequência nem pesa na partida (a rodada fica de fora da conta, ver spoils.ts).
    const shielded = !correct && supply.consumeArmed("escudo");
    const round = {
      targetId: targetRef.current,
      correct,
      responseTimeMs,
      answeredAt: Date.now(),
      clickedId: id,
      byWater: evidence?.byWater,
      distanceKm: evidence?.distanceKm ?? null,
      tier: entityTier(data.meta, targetRef.current),
      ...(supply.assisted || shielded ? { assisted: true } : {}),
      ...(shielded ? { shielded: true } : {}),
    };
    recordRound(round);
    setRetryNote(false);
    setShieldSaved(shielded);
    // No Treino, o alvo da rodada fica marcado no mapa com o nome — acertando ou errando.
    setRevealed((list) => (list.includes(targetRef.current) ? list : [...list, targetRef.current]));
    if (round.correct) {
      feedbackRef.current = t.map.hit(data.meta[targetRef.current]?.pt ?? t.map.targetFallback);
      setScore((value) => value + 1);
      setStreak((value) => value + 1);
      setWrong(false);
      setFeedback(feedbackRef.current);
      celebrateHit(evidence?.point);
       const exhausted = deckRef.current?.remaining === 0;
       timerRef.current = window.setTimeout(async () => {
         if (exhausted) {
           await finishSession();
         } else nextTarget();
       }, HIT_FEEDBACK_MS);
    } else {
      feedbackRef.current = t.map.miss;
      setStreak((value) => (shielded ? value : 0));
      setWrong(true);
      setFeedback(feedbackRef.current);
      const exhausted = deckRef.current?.remaining === 0;
      timerRef.current = window.setTimeout(async () => {
        if (exhausted) await finishSession();
        else nextTarget();
      }, 1400);
    }
  };
  answerRef.current = answerId;
  // O tempo da pergunta acabou: conta como erro (sem clique) e o alvo fica marcado no mapa.
  const timeUp = () => {
    if (feedbackRef.current || !targetRef.current) return;
    const shielded = supply.consumeArmed("escudo");
    setShieldSaved(shielded);
    setRetryNote(false);
    recordRound({
      targetId: targetRef.current,
      correct: false,
      responseTimeMs: Math.max(0, Date.now() - targetStartedAtRef.current),
      answeredAt: Date.now(),
      timedOut: true,
      tier: entityTier(data.meta, targetRef.current),
      ...(supply.assisted || shielded ? { assisted: true } : {}),
      ...(shielded ? { shielded: true } : {}),
    });
    feedbackRef.current = t.map.timeUp;
    setSelectedAnswer("");
    setTimedOut(true);
    setStreak((value) => (shielded ? value : 0));
    setWrong(true);
    setFeedback(feedbackRef.current);
    const exhausted = deckRef.current?.remaining === 0;
    timerRef.current = window.setTimeout(async () => {
      if (exhausted) await finishSession();
      else nextTarget();
    }, 1400);
  };
  const restart = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    leaveGuard.reset();
    log.reset();
    const previous = sessionRef.current;
    sessionRef.current = null;
    pendingSessionRef.current = null;
    if (previous) void previous.end();
    openSession();
    setScore(0);
    setStreak(0);
    setRound(0);
    setRevealed([]);
    supply.clearArmed();
    deckRef.current = newDeck();
    nextTarget();
  };

  useEffect(() => {
    if (!mapEl.current) return;
    if (!board) assertMarkerBound(data.mapEntityIds.length);
    const camera = cameraFor(normalizeRegionSelection(region)[0] ?? "mundo");
    const activeFilter = markerFilter(markerIds);
    setMapReady(false);
    let map: maplibregl.Map;
    const palette = paletteNow();
    try {
      map = new maplibregl.Map({
        container: mapEl.current,
        style: {
          version: 8,
          sources: {
            atlas: {
              type: "vector",
              url: `pmtiles://${board?.url ?? MAP_URL}`,
              promoteId: "carta_id",
              attribution: board?.attribution ??
                `© OpenStreetMap contributors · Overture Maps Foundation · geoBoundaries${mapBase !== "padrao" ? ` · ${MAP_BASE_CREDIT}` : ""}`,
            },
            ...(MAP_BASE_TILES[mapBase] ? { "map-base": { type: "raster" as const, tiles: [MAP_BASE_TILES[mapBase] as string], tileSize: 512, maxzoom: MAP_BASE_MAXZOOM } } : {}),
            ...(board?.backdrop ? { backdrop: { type: "vector" as const, url: `pmtiles://${board.backdrop.url}`, promoteId: "carta_id" } } : {}),
            "small-entities": { type: "geojson", data: SMALL_ENTITY_SOURCE },
            ...(palette.graticule ? { graticule: { type: "geojson" as const, data: graticuleLines(palette.graticuleStep) as unknown as GeoJSON.FeatureCollection } } : {}),
            ...(palette.rhumb ? { rhumb: { type: "geojson" as const, data: rhumbLines(palette.rhumb.hubs, palette.rhumb.directions) as unknown as GeoJSON.FeatureCollection } } : {}),
          },
          layers: [
            {
              id: "bg",
              type: "background",
              paint: { "background-color": palette.ocean },
            },
            ...(satellite ? [{ id: "map-base", type: "raster" as const, source: "map-base", paint: mapBaseRasterPaint(mapBase) } as maplibregl.LayerSpecification] : []),
            ...(palette.graticule ? [{ id: "graticule", type: "line" as const, source: "graticule", paint: { "line-color": palette.graticule, "line-opacity": palette.graticuleOpacity, "line-width": 0.7, "line-dasharray": [2, 3] } }] : []),
            ...(palette.rhumb ? [{ id: "rhumb", type: "line" as const, source: "rhumb", paint: { "line-color": palette.rhumb.color, "line-opacity": palette.rhumb.opacity, "line-width": 0.7 } }] : []),
            // sombra junto às costas (três faixas opacas, da mais clara à mais escura), por baixo da terra: só aparece do lado do mar
            ...coastBands(palette).map((band) => ({
              id: band.id,
              type: "line",
              source: "atlas",
              "source-layer": "countries",
              filter: ["==", "$type", "Polygon"],
              layout: { "line-join": "round" },
              paint: { "line-color": band.color, "line-width": ["interpolate", ["linear"], ["zoom"], 1, band.w1, 5, band.w5], "line-blur": band.blur },
            }) as maplibregl.LayerSpecification),
            // tabuleiro de um país: os vizinhos do mapa-múndi em tom apagado, opacos (cobrem a sombra da costa na fronteira) e fora do clique
            ...(board?.backdrop ? [{
              id: "backdrop-land",
              type: "fill" as const,
              source: "backdrop",
              "source-layer": "countries",
              filter: ["all", ["==", ["geometry-type"], "Polygon"], ["!=", ["get", "carta_id"], board.backdrop.hide]] as unknown as maplibregl.FilterSpecification,
              paint: { "fill-color": mixHex(palette.ocean, palette.land, 0.3), "fill-outline-color": mixHex(palette.ocean, palette.outline, 0.25) },
            }] : []),
            ...(mapBase === "relevo" ? [{ id: "map-base", type: "raster" as const, source: "map-base", paint: mapBaseRasterPaint(mapBase) } as maplibregl.LayerSpecification] : []),
            {
              id: "land",
              type: "fill",
              source: "atlas",
              "source-layer": "countries",
              filter: ["==", ["geometry-type"], "Polygon"] as unknown as maplibregl.FilterSpecification,
              paint: {
                "fill-color": palette.land,
                "fill-outline-color": palette.outline,
                "fill-opacity": landOpacityPaint(palette, []) as maplibregl.DataDrivenPropertyValueSpecification<number>,
              },
            },
            // com a foto, as costas e fronteiras viram um traço claro e fino sobre um contorno escuro (lê no deserto e na floresta)
            ...mapBaseBorderLayers(mapBase, withMapStyle(currentPalette(), mapStyleId)).map((line) => ({ id: line.id, type: "line" as const, source: "atlas", "source-layer": "countries", filter: ["==", "$type", "Polygon"] as unknown as maplibregl.FilterSpecification, layout: { "line-join": "round" as const }, paint: { "line-color": line.color, "line-opacity": line.opacity, "line-width": ["interpolate", ["linear"], ["zoom"], 1, line.width[0], 6, line.width[1]] as unknown as maplibregl.ExpressionSpecification } })),
            // traço de tinta do estilo de mapa (gravura): por cima da terra, por baixo dos marcadores
            ...(palette.ink ? [{ id: "ink", type: "line" as const, source: "atlas", "source-layer": "countries", filter: ["==", "$type", "Polygon"] as unknown as maplibregl.FilterSpecification, layout: { "line-join": "round" as const }, paint: { "line-color": palette.ink.color, "line-width": ["interpolate", ["linear"], ["zoom"], 1, palette.ink.width, 6, palette.ink.width * 1.6] as unknown as maplibregl.ExpressionSpecification, "line-opacity": palette.ink.opacity } }] : []),
             ...MARKER_BAND_ZOOMS.map((band) => ({
              id: markerLayerId(band),
              type: "circle" as const,
              source: "small-entities",
              maxzoom: band,
              filter: markerBandFilter(band, markerIds) as unknown as maplibregl.FilterSpecification,
              paint: {
                "circle-radius": 4,
                "circle-color": palette.marker,
                "circle-opacity": markerBandOpacity(band) as unknown as maplibregl.ExpressionSpecification,
                "circle-stroke-color": palette.markerStroke,
                "circle-stroke-width": 1,
                "circle-stroke-opacity": markerBandOpacity(band) as unknown as maplibregl.ExpressionSpecification,
              },
            })),
            {
               id: "small-entities-hit",
               type: "circle",
               source: "small-entities",
               filter: activeFilter as unknown as maplibregl.FilterSpecification,
                paint: {
                  "circle-radius": MARKER_TOUCH_PX,
                  "circle-color": palette.marker,
                  "circle-opacity": 0.01,
                },
             },
          ],
        },
        ...(board ? { bounds: board.bounds, fitBoundsOptions: { padding: boardPadding(mapEl.current) } } : { center: camera.center, zoom: camera.zoom }),
        maxZoom: MAP_MAX_ZOOM,
        attributionControl: { compact: true },
        // O norte fica sempre para cima: sem girar (dedos, botão direito, teclado) nem inclinar.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        bearing: 0,
      });
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
    } catch (error) {
      setMapError(
        error instanceof Error
          ? error.message
          : t.map.startFailed,
      );
      return;
    }

    const handleLoad = () => setMapReady(true);
    const handleError = (event: any) => {
      // o mapa-múndi de fundo do tabuleiro e a foto de satélite são só contexto: sem internet (o mapa offline não baixado, a foto ainda não
      // guardada) ou com um tile falhando, a partida segue
      if (event?.sourceId === "backdrop" || event?.sourceId === "map-base") return;
      const message =
        event.error instanceof Error
          ? event.error.message
          : t.map.loadFailed;
      setMapError(message);
    };
    map.on("load", handleLoad);
    const exposeActiveMarkerIds = () => {
      const active = filteredMarkerSource(markerIds);
      mapEl.current?.setAttribute(
        "data-marker-ids",
        active.features.map((item) => item.properties.carta_id).join(","),
      );
    };
    map.on("load", exposeActiveMarkerIds);
    map.on("error", handleError);
    // Navios e criaturas do mar do tema (Cartógrafo): ancorados no oceano, acompanham o arrasto e o zoom do mapa.
    const removeFauna = addMapFauna(map, satellite ? undefined : document.documentElement.dataset.theme);
    const removeOrnaments = addMapOrnaments(map, satellite ? undefined : mapStyleId);
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );
    // Toque na água: vale o território mais perto, dentro do alcance de um dedo (SEA_TAP_PX), como no jogo clássico.
    // Antes o mar contava sempre como erro, mesmo colado nas ilhas do país pedido.
    const nearestLand = (x: number, y: number) => {
      const zoom = map.getZoom();
      const found = map
        .queryRenderedFeatures([[x - SEA_TAP_PX, y - SEA_TAP_PX], [x + SEA_TAP_PX, y + SEA_TAP_PX]], { layers: ["land", "small-entities-hit"] })
        // terra sem entidade (Saba, Bir Tawil…) tem carta_id vazio: não responde por ninguém
        .filter((feature) => feature.properties?.carta_id && (feature.layer.id !== "small-entities-hit" || isMarkerVisibleAtZoom(feature.properties?.switchZoom, zoom)))
        .map((feature) => ({ answerId: String(feature.properties?.answer_id ?? feature.properties?.carta_id), geometry: feature.geometry as unknown as { type: string; coordinates: unknown } }));
      return nearestWithin(found, (position) => map.project(position), x, y, SEA_TAP_PX);
    };
    // Distância do toque até o território pedido (0 se caiu dentro): é o "erro" do jogador.
    const distanceToTargetKm = (lng: number, lat: number) => {
      const id = targetRef.current;
      try {
        const filter = ["==", ["get", "carta_id"], id] as maplibregl.FilterSpecification;
        const geometries = [
          ...map.querySourceFeatures("atlas", { sourceLayer: "countries", filter }),
          ...map.querySourceFeatures("small-entities", { filter }),
        ].map((feature) => feature.geometry as unknown as { type: string; coordinates: unknown });
        const measured = geometries.length ? distanceToGeometriesKm(geometries, lng, lat) : null;
        if (measured !== null) return measured;
      } catch { /* fonte ainda carregando: cai no centro do país */ }
      const ll = data.meta[id]?.ll;
      return ll ? haversineKm(lat, lng, ll[1], ll[0]) : null;
    };
    // Quem responde por um ponto da tela: o marcador só vale perto do próprio ponto e, sobre o terreno
    // de outro país, apenas no núcleo dele (senão um país grande "cai" no pequeno vizinho).
    const resolveAt = (x: number, y: number): { id: string; point: [number, number] | undefined; byWater: boolean; specific?: boolean } => {
      const zoom = map.getZoom();
      const candidates = map
        .queryRenderedFeatures(
          [[x - MARKER_TOUCH_PX, y - MARKER_TOUCH_PX], [x + MARKER_TOUCH_PX, y + MARKER_TOUCH_PX]],
          { layers: ["small-entities-hit"] },
        )
        .filter((feature) => isMarkerVisibleAtZoom(feature.properties?.switchZoom, zoom))
        .flatMap((feature) => {
          if (feature.geometry.type !== "Point") return [];
          const coordinates = feature.geometry.coordinates as [number, number];
          const projected = map.project(coordinates);
          return [{
            answerId: resolveMarkerClick(feature, targetRef.current).answerId,
            distancePx: Math.hypot(projected.x - x, projected.y - y),
            coordinates,
          }];
        });
      const landHit = map
        .queryRenderedFeatures([x, y], { layers: ["land"] })
        .find((feature) => feature.properties?.carta_id);
      const landId = landHit ? String(landHit.properties?.carta_id) : "";
      const choice = chooseClickAnswer(candidates, landId);
      if (choice.answerId) return {
        id: choice.answerId, point: choice.marker?.coordinates, byWater: false,
        specific: Boolean(choice.marker),
      };
      return { id: nearestLand(x, y)?.answerId ?? "", point: undefined, byWater: true };
    };
    const tapAt = (x: number, y: number, lngLat: { lng: number; lat: number }) => {
      const { id, point, byWater, specific } = resolveAt(x, y);
      const distanceKm = distanceToTargetKm(lngLat.lng, lngLat.lat);
      // Geografia real tem prioridade sobre qual polígono renderizou por cima no pixel clicado: alguns pares
      // (ex. Saara Ocidental sob o Marrocos) têm o território menor com geometria própria e correta na fonte,
      // mas o vizinho desenha uma reivindicação que cobre a mesma área, "roubando" todo clique ali. distanceKm
      // já vem 0 quando o toque caiu de fato dentro do polígono do alvo (distanceToTargetKm/distanceToGeometriesKm),
      // então um id resolvido diferente nessa condição é a sobreposição, não um erro real do jogador.
      const resolvedId = !specific && id && id !== targetRef.current && distanceKm === 0 ? targetRef.current : id;
      // O clique é registrado uma vez, ao montar o mapa: chama sempre a versão mais nova (estoque, suprimentos armados e rodada assistida).
      answerRef.current(resolvedId || "__water_click__", { byWater, distanceKm, point: point ?? [lngLat.lng, lngLat.lat] });
    };
    map.on("click", (event: MapMouseEvent) => tapAt(event.point.x, event.point.y, event.lngLat));
     const handleKey = (event: KeyboardEvent) => {
       if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","+","=","-","_"].includes(event.key)) setKeyboardMode(true);
      if (event.key !== "Enter" || feedbackRef.current) return;
      const center = map.getContainer().getBoundingClientRect();
      tapAt(center.width / 2, center.height / 2, map.unproject([center.width / 2, center.height / 2]));
    };
     const handlePointer = () => setKeyboardMode(false);
     map.getContainer().addEventListener("keydown", handleKey);
     map.getContainer().addEventListener("pointerdown", handlePointer);
    mapRef.current = map;
    if (import.meta.env.DEV) {
      (window as unknown as { __cartaMap?: maplibregl.Map }).__cartaMap = map;
    }
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
      labelMarkersRef.current.forEach((marker) => marker.remove());
      labelMarkersRef.current.clear();
      removeFauna();
      removeOrnaments();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [region]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const filter = markerFilter(markerIds);
    const activeIds = markerIds;
    for (const band of MARKER_BAND_ZOOMS) {
      map.setFilter(
        markerLayerId(band),
        markerBandFilter(band, activeIds) as unknown as maplibregl.FilterSpecification,
      );
    }
    map.setFilter(
      "small-entities-hit",
      filter as unknown as maplibregl.FilterSpecification,
    );
    const active = filteredMarkerSource(markerIds);
    mapEl.current?.setAttribute(
      "data-marker-ids",
      active.features.map((item) => item.properties.carta_id).join(","),
    );
  }, [markerSignature, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !target || !mapReady || !map.isStyleLoaded()) return;
    const palette = paletteNow();
    const answerColor = palette.answer;
    const settled = Boolean(feedback);
    // Fora do alvo desta rodada: só fica marcado no Treino (revealNames), com todo país já perguntado até aqui.
    const marked = revealNames && revealed.length ? revealed : null;
    const hintColor = BUSSOLA_COLOR;
    const tinted = bussolaIds && !settled ? bussolaIds : null;
    const nbr = neighborIds && !settled ? neighborIds : null;
    const neighborColor = VIZINHO_COLOR;
    try {
      map.setPaintProperty("land", "fill-color", [
        "case",
        ["all", settled, ["==", ["get", "carta_id"], target]],
        answerColor,
        ["all", wrong, ["==", ["get", "carta_id"], selectedAnswer]],
        palette.wrong,
        ...(nbr ? [["in", ["get", "carta_id"], ["literal", nbr]], neighborColor] : []),
        ...(tinted ? [["in", ["get", "carta_id"], ["literal", tinted]], hintColor] : []),
        ...(marked ? [["in", ["get", "carta_id"], ["literal", marked]], answerColor] : []),
        palette.land,
      ] as unknown as maplibregl.ExpressionSpecification);
      // com fundo de satélite ou relevo a terra é transparente (ou quase): os países marcados acendem por cima da foto
      if (palette.landMarkedOpacity !== undefined) map.setPaintProperty("land", "fill-opacity", landOpacityPaint(palette, [
        ["all", settled, ["==", ["get", "carta_id"], target]],
        ["all", wrong, ["==", ["get", "carta_id"], selectedAnswer]],
        ...(nbr ? [["in", ["get", "carta_id"], ["literal", nbr]]] : []),
        ...(tinted ? [["in", ["get", "carta_id"], ["literal", tinted]]] : []),
        ...(marked ? [["in", ["get", "carta_id"], ["literal", marked]]] : []),
      ]) as maplibregl.DataDrivenPropertyValueSpecification<number>);
      for (const band of MARKER_BAND_ZOOMS) {
        map.setPaintProperty(markerLayerId(band), "circle-color", [
        "case",
        ["all", settled, ["==", ["coalesce", ["get", "answer_id"], ["get", "carta_id"]], target]],
        answerColor,
        ["all", wrong, ["==", ["coalesce", ["get", "answer_id"], ["get", "carta_id"]], selectedAnswer]],
        palette.wrong,
        ...(nbr ? [["in", ["coalesce", ["get", "answer_id"], ["get", "carta_id"]], ["literal", nbr]], neighborColor] : []),
        ...(tinted ? [["in", ["coalesce", ["get", "answer_id"], ["get", "carta_id"]], ["literal", tinted]], hintColor] : []),
        ...(marked ? [["in", ["coalesce", ["get", "answer_id"], ["get", "carta_id"]], ["literal", marked]], answerColor] : []),
        palette.marker,
      ] as unknown as maplibregl.ExpressionSpecification);
        const isRevealedTarget = ["all", settled, ["==", ["coalesce", ["get", "answer_id"], ["get", "carta_id"]], target]] as unknown as maplibregl.ExpressionSpecification;
        map.setPaintProperty(markerLayerId(band), "circle-radius", ["case", isRevealedTarget, 9, 4]);
        map.setPaintProperty(markerLayerId(band), "circle-stroke-width", ["case", isRevealedTarget, 2.5, 1]);
      }
    } catch (error) {
      setMapError(
        error instanceof Error
          ? error.message
          : t.map.highlightFailed,
      );
    }
  }, [target, wrong, feedback, selectedAnswer, mapReady, revealed, revealNames, bussolaIds, neighborIds]);

  // Rótulo escrito (HTML por cima do mapa, não texto nativo do MapLibre) para cada país/capital já perguntado.
  // Reaproveita maplibregl.Marker: ele já se reposiciona sozinho a cada pan/zoom, sem projetar coordenada à mão.
  useEffect(() => {
    const map = mapRef.current;
    const markers = labelMarkersRef.current;
    if (!map || !mapReady) return;
    if (!revealNames) {
      if (markers.size) { markers.forEach((marker) => marker.remove()); markers.clear(); }
      return;
    }
    for (const [id, marker] of markers) {
      if (!revealed.includes(id)) { marker.remove(); markers.delete(id); }
    }
    for (const id of revealed) {
      if (markers.has(id)) continue;
      const ll = data.meta[id]?.ll;
      const label = nameFor(id);
      if (!ll || !label) continue;
      const element = document.createElement("div");
      element.className = "map-reveal-label";
      element.textContent = label;
      const marker = new maplibregl.Marker({ element, anchor: "center" }).setLngLat([ll[1], ll[0]]).addTo(map);
      markers.set(id, marker);
    }
  }, [revealed, revealNames, mapReady]);

  const totalRounds = deckRef.current?.size ?? features.length;
  const exit = () => leaveGuard.ask({ onLeave: () => void leaveSession(), onRestart: restart, coins: log.pending, xp: totalRounds });
  useGameKeys({ exit });
  const targetName = nameFor(target) ?? t.map.loading;
  if (mapError) {
    return (
      <div className="app-shell">
        <main className="content">
           <button className="back" onClick={() => void leaveSession()}>
             {t.common.exitGame}
          </button>
           <div className="diagnostic" style={{ marginTop: 32 }}>
            <div className="eyebrow">{t.map.unavailable}</div>
            <p>
              <strong>{t.map.webgl}</strong>{" "}
              {t.map.webglHelp}
            </p>
            <p className="mono">{mapError}</p>
              <p className="map-keyboard-hint">{t.map.keyboardHelp}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell gs-app">
      {leaveGuard.dialog}
      <div className="gs gs-map-screen">
        <GameTopBar results={log.results} total={totalRounds} streak={streak} pending={log.pending} onExit={exit} meta={`${variantLabel(engineVariant)} · ${regionLabel(region)}`} />
        <main className="map-wrap" aria-label={t.map.wrapAria}>
          <div className={`map-target-overlay ${feedback ? (wrong ? "is-wrong" : "is-correct") : ""}`} data-target-id={import.meta.env.DEV ? target : undefined}>
            <span>{feedback ? (wrong ? (timedOut ? t.map.timeUpShort : t.map.notYet) : t.map.hitShort) : (capitalMode ? (board ? t.divisions.capitalFind(board.unit) : t.map.capitalCountry) : t.map.find)}</span>
            <strong>{feedback && !wrong ? `✓ ${targetName}` : targetName}</strong>
            {bussolaUsed && !feedback && <em className="map-bussola-hint">{compassLabel(compassGroup(data.meta[target]))}</em>}
            {clue && !feedback && <em className="map-bussola-hint is-neighbor is-note">{clue.text}</em>}
            {retryNote && !feedback && <em className="map-bussola-hint is-note">{t.supplies.retryNote}</em>}
            {shieldSaved && feedback && <em className="map-bussola-hint is-note">{t.supplies.shieldSaved}</em>}
            <RoundTimer pausable={!settings.duel} seconds={timerSeconds} bonusSeconds={supply.bonusSeconds} running={Boolean(target) && mapReady && !feedback && !leaveGuard.asking} resetKey={serial} onExpire={timeUp} />
            {suppliesEnabled && (
              <SupplyTray timed={pace === "timed"}
                variant={ruleVariant}
                counts={supply.counts}
                usedThisRound={supply.usedThisRound}
                armed={supply.armed} tonicLeft={supply.tonicLeft}
                onArm={supply.toggleArm}
                blocked={deckRef.current?.remaining === 0 ? new Set<SupplyId>(["pular"]) : undefined}
                disabled={Boolean(feedback) || !mapReady}
                onUse={(id) => (id === "pular" ? skipRound() : id === "lanterna" ? (supply.use(id) && shine()) : supply.use(id))}
              />
            )}
          </div>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {feedback || t.map.currentTarget(targetName)}
          </p>
          <p className="map-keyboard-hint">{t.map.keyboardHint}</p>
          {isMapStyleId(mapStyleId) && !satellite && <div className="map-cartouche" data-style={mapStyleId} aria-hidden="true" style={{ "--c-paper": MAP_STYLES[mapStyleId].ornament.paper, "--c-ink": MAP_STYLES[mapStyleId].ornament.ink, "--c-accent": MAP_STYLES[mapStyleId].ornament.accent } as CSSProperties}><b>{MAP_STYLES[mapStyleId].cartouche[0]}</b><small>{MAP_STYLES[mapStyleId].cartouche[1]}</small></div>}
          <div className={`map-crosshair ${keyboardMode ? "is-visible" : ""}`} aria-hidden="true"><i /><i /><span>{t.map.crosshair}</span></div>
          <div className="map-hud">
            <div className="map-note">{t.map.note}</div>
          </div>
          <div
            ref={mapEl}
            className="map"
            role="application"
            tabIndex={0}
            aria-label={t.map.mapAria(targetName)}
            onFocus={(event) => event.currentTarget.parentElement?.classList.add("map-focused")}
            onBlur={(event) => event.currentTarget.parentElement?.classList.remove("map-focused")}
          />
        </main>
      </div>
    </div>
  );
}
