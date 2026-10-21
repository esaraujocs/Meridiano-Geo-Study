// O mapa do Travel (21/10/2026, no estilo do Travle): o mapa HD da partida com a terra apagada e sem fronteiras, e só a origem, o destino e os
// chutes pintados com o contorno de verdade (a cor diz quanto o chute ajudou). A pista "Fronteiras" acende todas as divisas; a "Próximo país"
// tracejado o contorno de um país do caminho. Sem clique: o mapa só se arrasta e amplia.
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "./map-style";
import { MAP_URL } from "../domain/offline-map";
import { mixHex } from "../domain/map-palette";
import { mapPaletteFor } from "../domain/themes";
import type { TravelGrade } from "../domain/travel";
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
