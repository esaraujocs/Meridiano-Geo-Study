// Explorar (20/10/2026, mock `mockups-carta-cega/hub-v39`): o mapa de um modo sem tempo, sem moedas e sem rodadas, com os nomes (e as capitais) à
// vista, a busca e a ficha do lugar tocado. O mapa é o mesmo da partida (atlasStyle: tema, estilo de mapa, satélite, tabuleiro de um país ou de uma
// época); os rótulos são HTML por cima dele (o estilo não tem glyphs), postos do maior para o menor sem se atropelar (explore.ts), então ampliar
// mostra mais nomes.
import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { MapMouseEvent } from "maplibre-gl";
import { Icon } from "./icons";
import { atlasStyle } from "./map-style";
import { addMapFauna } from "./map-fauna";
import { addMapOrnaments } from "./map-ornaments";
import type { MapBoard } from "./map-game";
import { cameraFor, normalizeRegionSelection } from "../domain/regions";
import { mapPaletteFor } from "../domain/themes";
import { withMapStyle } from "../domain/map-styles";
import { isSatellite, landOpacityPaint, readMapBase, withMapBase } from "../domain/map-base";
import { activeCosmetics } from "../domain/mecenato-store";
import { ABSORBED_MARKER_IDS, isMarkerVisibleAtZoom, MARKER_BAND_ZOOMS, markerLayerId } from "../domain/small-entities";
import { chooseClickAnswer, MARKER_TOUCH_PX, resolveMarkerClick } from "../domain/map-marker-click";
import { nearestWithin, SEA_TAP_PX } from "../domain/map-nearest";
import { exploreUnits, placeLabels, searchUnits, wrapNear, zoomForArea, type ExploreUnit } from "../domain/explore";
import { continentLabel } from "../domain/collection-view";
import { divisionRegionLabel } from "../domain/divisions";
import { flagSource, type FlagCatalog } from "../domain/quiz";
import type { Legacy, RegionSelection } from "../domain/types";
import { formatNumber, t } from "../domain/i18n";

const MAP_MAX_ZOOM = 14;
type Capitals = Record<string, [number, number]>;
let capitalsPromise: Promise<Capitals> | null = null;
/** As coordenadas das capitais (Wikidata, CC0; public/data/explore-capitals.json), carregadas uma vez. */
const loadCapitals = () => (capitalsPromise ??= fetch("/data/explore-capitals.json")
  .then((response) => (response.ok ? response.json() : { capitals: {} }))
  .then((payload: { capitals?: Capitals }) => payload.capitals ?? {})
  .catch(() => ({})));

export type ExploreSpec = {
  data: Legacy;
  /** Os lugares com rótulo (o mapa-múndi inteiro, ou as unidades do tabuleiro). */
  ids: readonly string[];
  region: RegionSelection;
  /** Tabuleiro de um país ou de uma época; sem ele, o mapa-múndi. */
  board?: MapBoard;
  /** Caixa de cada unidade do tabuleiro (para ir até ela pela busca). */
  bbox?: Readonly<Record<string, readonly [number, number, number, number]>>;
  title: string;
  /** As capitais começam ligadas (o Explorar aberto pela Mesa de Capitais). */
  capitals: boolean;
  loadFlags: () => Promise<FlagCatalog>;
};

/** Luminância relativa de uma cor #rrggbb (para escolher o texto claro ou escuro dos rótulos). */
const luminance = (hex: string) => {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1];
  if (!value) return 0;
  const [r, g, b] = [0, 2, 4].map((at) => { const c = parseInt(value.slice(at, at + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function ExploreMap({ spec, onExit }: { spec: ExploreSpec; onExit: () => void }) {
  const { data, ids, region, board } = spec;
  const mapStyleId = useMemo(() => activeCosmetics()["map-style"], []);
  const mapBase = useMemo(() => (board ? "padrao" : readMapBase()), []);
  const satellite = isSatellite(mapBase);
  const paletteNow = () => withMapBase(withMapStyle(mapPaletteFor(document.documentElement.dataset.theme), mapStyleId), mapBase);
  const mapEl = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [capitals, setCapitals] = useState<Capitals | null>(null);
  const [flags, setFlags] = useState<FlagCatalog>({});
  const [showNames, setShowNames] = useState(true);
  const [showCapitals, setShowCapitals] = useState(spec.capitals);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void loadCapitals().then(setCapitals); void spec.loadFlags().then(setFlags).catch(() => undefined); }, []);
  const units = useMemo(() => (capitals ? exploreUnits(data, ids, capitals) : []), [capitals, data, ids]);
  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const results = useMemo(() => searchUnits(units, query), [units, query]);
  useEffect(() => setActive(0), [query]);

  // o mapa: o mesmo estilo da partida, sem alvo nem cronômetro
  useEffect(() => {
    if (!mapEl.current) return;
    const camera = cameraFor(normalizeRegionSelection(region)[0] ?? "mundo");
    const palette = paletteNow();
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: mapEl.current,
        style: atlasStyle({ palette, borderPalette: withMapStyle(mapPaletteFor(document.documentElement.dataset.theme), mapStyleId), board, mapBase, markerIds: board ? [] : [...data.mapEntityIds, ...ABSORBED_MARKER_IDS] }),
        ...(board ? { bounds: board.bounds, fitBoundsOptions: { padding: { top: 76, bottom: 24, left: 24, right: 24 } } } : { center: camera.center, zoom: camera.zoom }),
        maxZoom: MAP_MAX_ZOOM,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        bearing: 0,
      });
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
    } catch (error) {
      setMapError(error instanceof Error ? error.message : t.map.startFailed);
      return;
    }
    map.on("load", () => setMapReady(true));
    map.on("error", (event: { sourceId?: string; error?: unknown }) => {
      if (event?.sourceId === "backdrop" || event?.sourceId === "map-base") return;
      setMapError(event.error instanceof Error ? event.error.message : t.map.loadFailed);
    });
    const removeFauna = addMapFauna(map, satellite ? undefined : document.documentElement.dataset.theme);
    const removeOrnaments = addMapOrnaments(map, satellite ? undefined : mapStyleId);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __cartaMap?: maplibregl.Map }).__cartaMap = map;
    return () => { removeFauna(); removeOrnaments(); map.remove(); mapRef.current = null; setMapReady(false); };
  }, []);

  // tocar no mapa: o lugar do ponto (o marcador de uma ilha pequena perto do dedo, senão a terra; na água, o mais perto ao alcance do dedo)
  const unitsRef = useRef(unitById);
  unitsRef.current = unitById;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const resolve = (x: number, y: number) => {
      const zoom = map.getZoom();
      const markers = board ? [] : map.queryRenderedFeatures([[x - MARKER_TOUCH_PX, y - MARKER_TOUCH_PX], [x + MARKER_TOUCH_PX, y + MARKER_TOUCH_PX]], { layers: ["small-entities-hit"] })
        .filter((feature) => isMarkerVisibleAtZoom(feature.properties?.switchZoom, zoom))
        .flatMap((feature) => {
          if (feature.geometry.type !== "Point") return [];
          const coordinates = feature.geometry.coordinates as [number, number];
          const projected = map.project(coordinates);
          return [{ answerId: resolveMarkerClick(feature, "").answerId, distancePx: Math.hypot(projected.x - x, projected.y - y), coordinates }];
        });
      const land = map.queryRenderedFeatures([x, y], { layers: ["land"] }).find((feature) => feature.properties?.carta_id);
      const choice = chooseClickAnswer(markers, land ? String(land.properties?.carta_id) : "");
      if (choice.answerId) return choice.answerId;
      const near = map.queryRenderedFeatures([[x - SEA_TAP_PX, y - SEA_TAP_PX], [x + SEA_TAP_PX, y + SEA_TAP_PX]], { layers: board ? ["land"] : ["land", "small-entities-hit"] })
        .filter((feature) => feature.properties?.carta_id && (feature.layer.id !== "small-entities-hit" || isMarkerVisibleAtZoom(feature.properties?.switchZoom, zoom)))
        .map((feature) => ({ answerId: String(feature.properties?.answer_id ?? feature.properties?.carta_id), geometry: feature.geometry as unknown as { type: string; coordinates: unknown } }));
      return nearestWithin(near, (position) => map.project(position), x, y, SEA_TAP_PX)?.answerId ?? "";
    };
    const onClick = (event: MapMouseEvent) => {
      const id = resolve(event.point.x, event.point.y);
      setSelected(id && unitsRef.current.has(id) ? id : null);
      setSearchOpen(false);
    };
    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [mapReady]);

  // o lugar escolhido acende no mapa (a mesma cor do acerto na partida)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return;
    const palette = paletteNow();
    const is = ["==", ["get", "carta_id"], selected ?? "__none__"];
    const isMarker = ["==", ["coalesce", ["get", "answer_id"], ["get", "carta_id"]], selected ?? "__none__"];
    try {
      map.setPaintProperty("land", "fill-color", ["case", is, palette.answer, palette.land] as unknown as maplibregl.ExpressionSpecification);
      if (palette.landMarkedOpacity !== undefined) map.setPaintProperty("land", "fill-opacity", landOpacityPaint(palette, [is]) as maplibregl.DataDrivenPropertyValueSpecification<number>);
      if (!board) for (const band of MARKER_BAND_ZOOMS) {
        map.setPaintProperty(markerLayerId(band), "circle-color", ["case", isMarker, palette.answer, palette.marker] as unknown as maplibregl.ExpressionSpecification);
        map.setPaintProperty(markerLayerId(band), "circle-radius", ["case", isMarker, 8, 4] as unknown as maplibregl.ExpressionSpecification);
      }
    } catch { /* estilo trocando: a próxima mudança repinta */ }
  }, [selected, mapReady]);

  // os rótulos: um elemento por nome e por capital, criados uma vez e medidos uma vez; a cada movimento só muda quem aparece e onde
  const elements = useRef(new Map<string, { name: HTMLSpanElement; capital?: HTMLSpanElement; nameSize?: { w: number; h: number }; capitalSize?: { w: number; h: number } }>());
  const frame = useRef(0);
  const settings = useRef({ showNames, showCapitals, selected });
  settings.current = { showNames, showCapitals, selected };
  const relayout = () => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    const width = layer.clientWidth;
    const height = layer.clientHeight;
    const center = map.getCenter().lng;
    const { showNames: names, showCapitals: caps, selected: chosen } = settings.current;
    const placed = placeLabels({
      units, width, height, selected: chosen, names, capitals: caps,
      project: ([lng, lat]) => map.project([wrapNear(lng, center), lat]),
      size: (id, kind) => {
        const entry = elements.current.get(id);
        if (!entry) return null;
        if (kind === "capital") return entry.capital ? (entry.capitalSize ??= { w: entry.capital.offsetWidth, h: entry.capital.offsetHeight }) : null;
        return (entry.nameSize ??= { w: entry.name.offsetWidth, h: entry.name.offsetHeight });
      },
    });
    const shown = new Set<HTMLElement>();
    for (const item of placed) {
      const entry = elements.current.get(item.id);
      const element = item.kind === "name" ? entry?.name : entry?.capital;
      if (!element) continue;
      element.style.transform = `translate(${Math.round(item.x)}px, ${Math.round(item.y)}px)`;
      shown.add(element);
    }
    for (const entry of elements.current.values()) {
      entry.name.classList.toggle("is-on", shown.has(entry.name));
      entry.capital?.classList.toggle("is-on", shown.has(entry.capital));
    }
  };
  const schedule = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => { frame.current = 0; relayout(); });
  };
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.replaceChildren();
    elements.current.clear();
    for (const unit of units) {
      const name = document.createElement("span");
      name.className = `ex-l is-${unit.tier}`;
      name.textContent = unit.name;
      layer.append(name);
      let capital: HTMLSpanElement | undefined;
      if (unit.capital && unit.capitalAt) {
        capital = document.createElement("span");
        capital.className = "ex-c";
        capital.append(document.createElement("i"), document.createTextNode(unit.capital));
        layer.append(capital);
      }
      elements.current.set(unit.id, { name, capital });
    }
    schedule();
    // as fontes do jogo chegando mudam a largura dos rótulos: mede de novo
    void document.fonts?.ready.then(() => { for (const entry of elements.current.values()) { entry.nameSize = undefined; entry.capitalSize = undefined; } schedule(); });
  }, [units]);
  useEffect(() => {
    for (const [id, entry] of elements.current) {
      const was = entry.name.classList.contains("is-sel");
      const now = id === selected;
      if (was !== now) { entry.name.classList.toggle("is-sel", now); entry.nameSize = undefined; }
    }
    schedule();
  }, [selected, showNames, showCapitals]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.on("move", schedule);
    map.on("resize", schedule);
    schedule();
    return () => { map.off("move", schedule); map.off("resize", schedule); if (frame.current) cancelAnimationFrame(frame.current); frame.current = 0; };
  }, [mapReady, units]);

  // a palheta dos rótulos: texto claro com contorno escuro sobre terra escura (e sobre a foto), o contrário sobre terra clara
  const lightLand = !satellite && luminance(paletteNow().land) > 0.35;

  const goTo = (unit: ExploreUnit) => {
    const map = mapRef.current;
    setSelected(unit.id);
    setQuery("");
    setSearchOpen(false);
    if (!map) return;
    const box = spec.bbox?.[unit.id];
    if (box) map.fitBounds([[box[0], box[1]], [box[2], box[3]]], { padding: { top: 90, bottom: 60, left: 40, right: 40 }, maxZoom: 8, duration: 900 });
    else map.flyTo({ center: [wrapNear(unit.at[0], map.getCenter().lng), unit.at[1]], zoom: zoomForArea(unit.area), duration: 900 });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (query || searchOpen) { setQuery(""); setSearchOpen(false); return; }
      if (selected) setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [query, searchOpen, selected]);
  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);

  const card = selected ? cardFor(selected) : null;
  function cardFor(id: string) {
    const meta = data.meta[id];
    if (!meta) return null;
    const flag = meta.fl ? flags[meta.fl.toLowerCase()] ?? flags[meta.fl] : undefined;
    const neighborNames = board
      ? (meta.borders ?? []).map((code) => Object.values(data.meta).find((other) => other.cca3 === code)?.pt).filter((name): name is string => Boolean(name))
      : [];
    const rows: [string, string][] = board
      ? [
        ...(meta.cap ? [[t.explore.capital, meta.cap] as [string, string]] : []),
        ...(meta.census ? [[t.explore.population, meta.census[1] ? `${formatNumber(meta.census[0])} (${meta.census[1]})` : formatNumber(meta.census[0])] as [string, string]] : []),
        ...(meta.area ? [[t.explore.area, t.explore.km2(formatNumber(Math.round(meta.area)))] as [string, string]] : []),
        // no máximo 3 línguas e "e mais N" (o Daguestão tem 12; o Alasca, 20)
        ...(meta.coLangs?.length ? [[t.explore.coLanguages, `${meta.coLangs.slice(0, 3).join(", ")}${meta.coLangs.length > 3 ? ` ${t.explore.andMore(meta.coLangs.length - 3)}` : ""}`] as [string, string]] : []),
        ...(neighborNames.length ? [[t.explore.neighbors, neighborNames.slice(0, 6).join(", ")] as [string, string]] : []),
      ]
      : [
        ...(meta.cap ? [[t.explore.capital, meta.cap] as [string, string]] : []),
        ...(meta.pop ? [[t.explore.population, formatNumber(meta.pop)] as [string, string]] : []),
        ...(meta.area ? [[t.explore.area, t.explore.km2(formatNumber(Math.round(meta.area)))] as [string, string]] : []),
        ...(meta.lang?.length ? [[t.explore.languages, meta.lang.slice(0, 3).join(", ")] as [string, string]] : []),
        ...(meta.cur?.length ? [[t.explore.currency, meta.cur.join(", ")] as [string, string]] : []),
      ];
    return {
      name: meta.pt ?? id,
      sub: board ? (meta.reg ? divisionRegionLabel(meta.reg) : "") : continentLabel(meta.reg),
      flag: flag ? flagSource(flag) : undefined,
      rows,
      fact: board ? undefined : meta.fato,
    };
  }

  if (mapError) {
    return (
      <div className="app-shell">
        <main className="content">
          <button className="back" onClick={onExit}>{t.explore.exit}</button>
          <div className="diagnostic" style={{ marginTop: 32 }}>
            <div className="eyebrow">{t.map.unavailable}</div>
            <p><strong>{t.map.webgl}</strong> {t.map.webglHelp}</p>
            <p className="mono">{mapError}</p>
          </div>
        </main>
      </div>
    );
  }

  const listId = "ex-results";
  return (
    <div className="app-shell ex-app">
      <header className="ex-bar">
        <button type="button" className="ex-x" aria-label={t.explore.exit} onClick={onExit}><Icon type="close" size={14} /><span>{t.explore.exit}</span></button>
        <span className="ex-t"><small>{t.explore.eyebrow}</small><b>{spec.title}</b></span>
        <span className="ex-sp" />
        <button type="button" className="ex-chip" aria-label={t.explore.names} aria-pressed={showNames} onClick={() => setShowNames((value) => !value)}><i aria-hidden="true" /><span>{t.explore.names}</span></button>
        <button type="button" className="ex-chip" aria-label={t.explore.capitals} aria-pressed={showCapitals} onClick={() => setShowCapitals((value) => !value)}><i aria-hidden="true" /><span>{t.explore.capitals}</span></button>
        <button type="button" className="ex-search-open" aria-label={t.explore.searchOpen} aria-expanded={searchOpen} onClick={() => setSearchOpen((value) => !value)}><Icon type="search" size={16} /></button>
        <div className={`ex-search${searchOpen ? " is-open" : ""}`}>
          <Icon type="search" size={15} />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder={t.explore.search}
            aria-label={t.explore.searchAria}
            role="combobox"
            aria-expanded={Boolean(query)}
            aria-controls={listId}
            aria-activedescendant={results[active] ? `ex-r-${results[active].id}` : undefined}
            autoComplete="off"
            data-1p-ignore=""
            data-lpignore="true"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(results.length - 1, value + 1)); }
              if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(0, value - 1)); }
              if (event.key === "Enter" && results[active]) { event.preventDefault(); goTo(results[active]); }
            }}
          />
          {query && <ul className="ex-results" id={listId} role="listbox" aria-label={t.explore.searchAria}>
            {results.length ? results.map((unit, index) => (
              <li key={unit.id} id={`ex-r-${unit.id}`} role="option" aria-selected={index === active} onMouseDown={(event) => { event.preventDefault(); goTo(unit); }} onMouseEnter={() => setActive(index)}>
                <b>{unit.name}</b>{unit.capital && <small>{unit.capital}</small>}
              </li>
            )) : <li className="is-empty" role="option" aria-selected={false} aria-disabled="true">{t.explore.noResults}</li>}
          </ul>}
        </div>
      </header>
      <main className="ex-wrap">
        <div ref={mapEl} className="map ex-map" role="application" tabIndex={0} aria-label={t.explore.mapAria} />
        <div ref={layerRef} className={`ex-layer${lightLand ? " is-light" : ""}`} aria-hidden="true" />
        <p className="sr-only" role="status" aria-live="polite">{card ? t.explore.selected(card.name) : ""}</p>
        {card && (
          <aside className="ex-card" aria-label={card.name}>
            <button type="button" className="ex-close" aria-label={t.explore.close} onClick={() => setSelected(null)}><Icon type="close" size={13} /></button>
            <div className="ex-top">
              {card.flag && <img src={card.flag} alt="" />}
              <div><span className="ex-sub">{card.sub}</span><h2>{card.name}</h2></div>
            </div>
            {card.rows.length > 0 && <dl>{card.rows.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>}
            {card.fact && <p>{card.fact}</p>}
          </aside>
        )}
      </main>
    </div>
  );
}
