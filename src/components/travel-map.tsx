// O mapa do Travel (21/10/2026, no estilo do Travle): o mapa HD da partida com a terra apagada e sem fronteiras, e só a origem, o destino e os
// chutes pintados com o contorno de verdade (a cor diz quanto o chute ajudou). A pista "Fronteiras" acende todas as divisas; a "Próximo país"
// tracejado o contorno de um país do caminho. Sem clique: o mapa só se arrasta e amplia.
import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "./map-style";
import { MAP_URL } from "../domain/offline-map";
import { mixHex } from "../domain/map-palette";
import { mapPaletteFor } from "../domain/themes";
import { travelBox, travelFeatureIds, type TravelGrade, type TravelRecapRoute } from "../domain/travel";
import type { Legacy } from "../domain/types";
import { t } from "../domain/i18n";

/** O estado de cada peça do mapa: as pontas, as cores dos chutes e o caminho revelado no fim. */
export type TravelPaint = TravelGrade | "end" | "reveal";
export type TravelBox = readonly [number, number, number, number];

export const TRAVEL_COLORS: Record<TravelPaint, string> = {
  end: "#3f6fb0",
  linked: "#2e8f57",
  closer: "#5fb878",
  near: "#e08a2e",
  far: "#cf5440",
  reveal: "#9db4cc",
};

const paintMatch = (fallback: string) => ["match", ["coalesce", ["feature-state", "tv"], ""],
  ...Object.entries(TRAVEL_COLORS).flat(), fallback] as unknown as maplibregl.ExpressionSpecification;

/** Um país pequeno demais para aparecer pintado (Mônaco, Vaticano, Singapura…): um ponto na cor dele. */
export type TravelPoint = { id: string; lon: number; lat: number; paint: TravelPaint };
const pointsData = (points: readonly TravelPoint[]) => ({
  type: "FeatureCollection" as const,
  features: points.map((point) => ({ type: "Feature" as const, properties: { tv: point.paint }, geometry: { type: "Point" as const, coordinates: [point.lon, point.lat] } })),
});

export function TravelMap({ paints, points, boxes, borders, dashed }: {
  /** Peça do mapa (carta_id) → estado. */
  paints: ReadonlyMap<string, TravelPaint>;
  points: readonly TravelPoint[];
  /** O que a câmera enquadra (a origem, o destino e os chutes). */
  boxes: readonly TravelBox[];
  /** A pista "Fronteiras": as divisas de todos os países à vista. */
  borders: boolean;
  /** A pista "Próximo país": as peças com o contorno tracejado. */
  dashed: readonly string[];
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const painted = useRef(new Set<string>());

  useEffect(() => {
    if (!mapEl.current) return;
    const palette = mapPaletteFor(document.documentElement.dataset.theme);
    const ghost = mixHex(palette.ocean, palette.land, 0.4);
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: mapEl.current,
        style: {
          version: 8,
          sources: {
            atlas: { type: "vector", url: `pmtiles://${MAP_URL}`, promoteId: "carta_id", attribution: "© OpenStreetMap contributors · Overture Maps Foundation · geoBoundaries" },
            points: { type: "geojson", data: pointsData([]) },
          },
          layers: [
            { id: "bg", type: "background", paint: { "background-color": palette.ocean } },
            // a terra apagada e sem divisas (o antisserrilhado desenharia as fronteiras)
            { id: "ghost", type: "fill", source: "atlas", "source-layer": "countries", filter: ["==", ["geometry-type"], "Polygon"] as unknown as maplibregl.FilterSpecification, paint: { "fill-color": ghost, "fill-antialias": false } },
            { id: "borders", type: "line", source: "atlas", "source-layer": "countries", filter: ["==", "$type", "Polygon"], layout: { visibility: "none", "line-join": "round" }, paint: { "line-color": mixHex(ghost, palette.outline, 0.7), "line-width": 0.8 } },
            { id: "tv-fill", type: "fill", source: "atlas", "source-layer": "countries", filter: ["==", ["geometry-type"], "Polygon"] as unknown as maplibregl.FilterSpecification, paint: { "fill-color": paintMatch(ghost), "fill-opacity": ["case", ["!=", ["coalesce", ["feature-state", "tv"], ""], ""], 0.95, 0] as unknown as maplibregl.ExpressionSpecification } },
            { id: "tv-line", type: "line", source: "atlas", "source-layer": "countries", filter: ["==", "$type", "Polygon"], layout: { "line-join": "round" }, paint: { "line-color": mixHex(palette.ocean, "#000000", 0.45), "line-width": 1, "line-opacity": ["case", ["!=", ["coalesce", ["feature-state", "tv"], ""], ""], 0.7, 0] as unknown as maplibregl.ExpressionSpecification } },
            { id: "tv-points", type: "circle", source: "points", paint: { "circle-radius": 6, "circle-color": ["match", ["get", "tv"], ...Object.entries(TRAVEL_COLORS).flat(), "#ffffff"] as unknown as maplibregl.ExpressionSpecification, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 } },
            { id: "tv-dashed", type: "line", source: "atlas", "source-layer": "countries", filter: ["in", ["get", "carta_id"], ["literal", []]] as unknown as maplibregl.FilterSpecification, layout: { "line-join": "round" }, paint: { "line-color": "#f2c14e", "line-width": 2.4, "line-dasharray": [2, 1.5] } },
          ],
        },
        center: [10, 30], zoom: 1,
        maxZoom: 9,
        attributionControl: { compact: true },
        dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0, bearing: 0,
      });
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t.map.startFailed);
      return;
    }
    // a atribuição começa recolhida (aberta, cobria o mapa no celular)
    map.on("load", () => { setReady(true); mapEl.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"); });
    map.on("error", (event: { error?: unknown }) => setError(event.error instanceof Error ? event.error.message : t.map.loadFailed));
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __cartaMap?: maplibregl.Map }).__cartaMap = map;
    return () => { map.remove(); mapRef.current = null; setReady(false); };
  }, []);

  // as cores: tira o estado de quem saiu e põe o de agora
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const id of painted.current) if (!paints.has(id)) map.removeFeatureState({ source: "atlas", sourceLayer: "countries", id }, "tv");
    for (const [id, paint] of paints) map.setFeatureState({ source: "atlas", sourceLayer: "countries", id }, { tv: paint });
    painted.current = new Set(paints.keys());
  }, [paints, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("points") as maplibregl.GeoJSONSource | undefined)?.setData(pointsData(points));
  }, [points, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty("borders", "visibility", borders ? "visible" : "none");
  }, [borders, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setFilter("tv-dashed", ["in", ["get", "carta_id"], ["literal", [...dashed]]] as unknown as maplibregl.FilterSpecification);
  }, [dashed, ready]);

  // a câmera: tudo o que importa à vista (anda só quando a caixa muda)
  const boxKey = boxes.map((box) => box.map((value) => value.toFixed(1)).join(",")).join(";");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !boxes.length) return;
    const west = Math.min(...boxes.map((box) => box[0])), south = Math.min(...boxes.map((box) => box[1]));
    const east = Math.max(...boxes.map((box) => box[2])), north = Math.max(...boxes.map((box) => box[3]));
    const pad = Math.min(48, Math.round((mapEl.current?.clientWidth ?? 400) / 10));
    map.fitBounds([[west, Math.max(-80, south)], [east, Math.min(84, north)]], { padding: pad, maxZoom: 6, duration: ready ? 700 : 0 });
  }, [boxKey, ready]);

  return <div className="tv-map" role="region" aria-label={t.travel.mapAria}>
    <div ref={mapEl} className="tv-map-canvas" />
    {error && <p className="tv-map-error">{error}</p>}
  </div>;
}

/** Os países pequenos demais para o contorno aparecer viram um ponto. */
export const TRAVEL_POINT_KM2 = 3000;
export function travelPoints(meta: Legacy["meta"], shown: readonly (readonly [string, TravelPaint])[]): TravelPoint[] {
  return shown.filter(([id]) => (meta[id]?.area ?? Infinity) < TRAVEL_POINT_KM2 && meta[id]?.ll).map(([id, paint]) => ({ id, lat: meta[id].ll![0], lon: meta[id].ll![1], paint }));
}

/** Resultado do Travel (22/10/2026, pedido do Enzo: "no final da partida você pode acessar todas as rotas via seta, como um carrossel"): cada rota
 *  no mapa, com as fronteiras acesas, o seu caminho, os chutes que sobraram e o caminho mais curto tracejado. ← → (ou os botões) trocam. */
export function TravelRecap({ routes, meta }: { routes: readonly TravelRecapRoute[]; meta: Legacy["meta"] }) {
  const [index, setIndex] = useState(0);
  const route = routes[Math.min(index, routes.length - 1)];
  const go = (step: number) => setIndex((current) => (current + step + routes.length) % routes.length);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(event.target.tagName)) return;
      if (event.key === "ArrowRight") go(1); else if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [routes.length]);
  const nameOf = (id: string) => meta[id]?.pt ?? id;
  const { paints, points, boxes, dashed } = useMemo(() => {
    const out = new Map<string, TravelPaint>();
    const shown: Array<[string, TravelPaint]> = [];
    const put = (id: string, paint: TravelPaint) => { for (const piece of travelFeatureIds(meta, id)) out.set(piece, paint); shown.push([id, paint]); };
    const onPath = new Set(route.path);
    for (const id of route.shortest.slice(1, -1)) if (!onPath.has(id)) put(id, "reveal");
    for (const id of route.guesses) if (!onPath.has(id)) put(id, "far");
    for (const id of route.path.slice(1, -1)) put(id, route.won ? "linked" : "reveal");
    put(route.start, "end"); put(route.end, "end");
    const ids = [...new Set([route.start, route.end, ...route.path, ...route.shortest])];
    return {
      paints: out, points: travelPoints(meta, shown),
      boxes: ids.map((id) => travelBox(meta, id)).filter((box): box is NonNullable<typeof box> => Boolean(box)),
      dashed: route.shortest.slice(1, -1).flatMap((id) => travelFeatureIds(meta, id)),
    };
  }, [meta, route]);
  if (!route) return null;
  const used = route.guesses.length;
  const minimum = Math.max(0, route.shortest.length - 2);
  const same = route.path.length === route.shortest.length && route.path.every((id, i) => id === route.shortest[i]);
  return <section className="tv-recap" aria-label={t.travel.recapTitle}>
    <header className="tv-recap-h">
      <button type="button" className="tv-recap-arrow" aria-label={t.travel.recapPrev} onClick={() => go(-1)} disabled={routes.length < 2}>‹</button>
      <div><small>{t.travel.recapPos(index + 1, routes.length)}</small><b>{nameOf(route.start)} → {nameOf(route.end)}</b>
        <span className={`tv-recap-tag ${route.won ? "is-won" : "is-lost"}`}>{route.won ? t.travel.recapWon(used, minimum) : t.travel.recapLost(minimum)}</span></div>
      <button type="button" className="tv-recap-arrow" aria-label={t.travel.recapNext} onClick={() => go(1)} disabled={routes.length < 2}>›</button>
    </header>
    <div className="tv-mapwrap tv-recap-map"><TravelMap paints={paints} points={points} boxes={boxes} borders dashed={dashed} /></div>
    <dl className="tv-recap-lines">
      {route.won && <div><dt>{t.travel.recapYours}</dt><dd>{route.path.map(nameOf).join(" → ")}{same ? ` ${t.travel.recapSame}` : ""}</dd></div>}
      {!(route.won && same) && <div><dt>{t.travel.recapShortest}</dt><dd>{route.shortest.map(nameOf).join(" → ")}</dd></div>}
    </dl>
    {routes.length > 1 && <div className="tv-recap-dots" aria-hidden="true">{routes.map((item, i) => <i key={i} className={`${i === index ? "is-on " : ""}${item.won ? "is-won" : "is-lost"}`} />)}</div>}
  </section>;
}
