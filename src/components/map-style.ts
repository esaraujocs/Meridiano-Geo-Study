// O estilo do MapLibre do mapa do jogo (a partida e o Explorar usam o mesmo): o mar e a terra do tema, a foto de satélite ou o relevo, a quadrícula
// e as linhas de rumo do estilo de mapa, a sombra das costas, o mapa-múndi de fundo do tabuleiro de um país e os marcadores das entidades pequenas.
import * as maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { coastBands, graticuleLines, mixHex, rhumbLines } from "../domain/map-palette";
import type { MapPalette } from "../domain/map-palette";
import { MAP_URL } from "../domain/offline-map";
import { MAP_BASE_CREDIT, MAP_BASE_MAXZOOM, MAP_BASE_TILES, NATURAL, coversLand, isSatellite, landOpacityPaint, mapBaseBorderLayers, mapBaseRasterPaint, type MapBase, type MapProjection } from "../domain/map-base";
import { MARKER_BAND_ZOOMS, markerBandFilter, markerBandOpacity, markerFilter, markerLayerId, SMALL_ENTITY_SOURCE, type SmallEntitySource } from "../domain/small-entities";
import { MARKER_TOUCH_PX } from "../domain/map-marker-click";

// os mapas do jogo são PMTiles: o protocolo é registrado uma vez, por quem importa este módulo (a partida e o Explorar)
const pmtilesProtocol = new Protocol();
maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);

/** Outro tabuleiro no lugar do mapa-múndi (um país de Estados e províncias, uma época): os tiles, a atribuição e o mapa-múndi de fundo. */
export type StyleBoard = { url: string; attribution: string; backdrop?: { url: string; hide: readonly string[] }; markers?: SmallEntitySource;
  /** Outros tabuleiros desenhados junto (o Explorar com todos os países de Estados e províncias): uma fonte e uma camada `land-<i>` por país. */
  extra?: readonly string[] };

export function atlasStyle({ palette, borderPalette, board, mapBase, markerIds, projection = "plana" }: {
  /** A paleta já com o estilo de mapa e o fundo aplicados. */
  palette: MapPalette;
  /** A paleta do tema com o estilo de mapa, sem o fundo (o traço das fronteiras sobre a foto sai dela). */
  borderPalette: MapPalette;
  board?: StyleBoard;
  mapBase: MapBase;
  /** As entidades pequenas com marcador (no tabuleiro de um país, nenhuma). */
  markerIds: readonly string[];
  projection?: MapProjection;
}): maplibregl.StyleSpecification {
  const satellite = isSatellite(mapBase);
  const natural = mapBase === "natural";
  const covered = coversLand(mapBase);
  const activeFilter = markerFilter(markerIds);
  // tabuleiro com o mapa-múndi de fundo (22/10/2026, pedido do Enzo): as divisas das unidades num tracejado discreto e as fronteiras dos países
  // e a costa numa linha contínua por cima, como num atlas; sem o fundo (as épocas, em que as unidades são os países), o contorno de sempre
  const atlasLines = Boolean(board?.backdrop);
  const unitOutline = atlasLines ? "rgba(0,0,0,0)" : palette.outline;
  // o contorno da paleta com o fundo é transparente no satélite e no relevo; as linhas saem do contorno do tema
  const ink = borderPalette.outline.startsWith("#") ? borderPalette.outline : "#4c8890";
  const divisionColor = satellite ? "#ffffff" : natural ? NATURAL.division : mixHex(ink, "#ffffff", 0.2);
  const nationColor = satellite ? "#ffffff" : natural ? NATURAL.border : mixHex(ink, "#ffffff", 0.3);
  return {
    version: 8,
    // o globo com um halo de atmosfera, que some ao chegar perto (de perto o MapLibre já passa ao plano)
    ...(projection === "globo" ? { projection: { type: "globe" }, sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] } } as Partial<maplibregl.StyleSpecification> : {}),
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
      "small-entities": { type: "geojson", data: (board?.markers ?? SMALL_ENTITY_SOURCE) as unknown as GeoJSON.FeatureCollection },
      ...Object.fromEntries((board?.extra ?? []).map((url, index) => [`atlas-${index}`, { type: "vector" as const, url: `pmtiles://${url}`, promoteId: "carta_id" }])),
      ...(palette.graticule ? { graticule: { type: "geojson" as const, data: graticuleLines(palette.graticuleStep) as unknown as GeoJSON.FeatureCollection } } : {}),
      ...(palette.rhumb ? { rhumb: { type: "geojson" as const, data: rhumbLines(palette.rhumb.hubs, palette.rhumb.directions) as unknown as GeoJSON.FeatureCollection } } : {}),
    },
    layers: [
      {
        id: "bg",
        type: "background",
        paint: { "background-color": palette.ocean },
      },
      ...(covered ? [{ id: "map-base", type: "raster" as const, source: "map-base", paint: mapBaseRasterPaint(mapBase) } as maplibregl.LayerSpecification] : []),
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
        filter: ["all", ["==", ["geometry-type"], "Polygon"], ["!", ["in", ["get", "carta_id"], ["literal", [...board.backdrop.hide]]]]] as unknown as maplibregl.FilterSpecification,
        // com a foto de satélite o fundo fica transparente (a foto aparece no mundo todo; só as linhas de cima marcam os países)
        paint: { "fill-color": mixHex(palette.ocean, palette.land, 0.3), "fill-outline-color": mixHex(palette.ocean, ink, 0.25), ...(covered ? { "fill-opacity": 0 } : mapBase === "relevo" ? { "fill-opacity": palette.landOpacity ?? 0.42 } : {}) },
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
          "fill-outline-color": unitOutline,
          "fill-opacity": landOpacityPaint(palette, []) as maplibregl.DataDrivenPropertyValueSpecification<number>,
        },
      },
      ...(board?.extra ?? []).map((_, index) => ({
        id: `land-${index}`,
        type: "fill" as const,
        source: `atlas-${index}`,
        "source-layer": "countries",
        filter: ["==", ["geometry-type"], "Polygon"] as unknown as maplibregl.FilterSpecification,
        paint: { "fill-color": palette.land, "fill-outline-color": unitOutline, "fill-opacity": landOpacityPaint(palette, []) as maplibregl.DataDrivenPropertyValueSpecification<number> },
      })),
      // com a foto, as costas e fronteiras viram um traço claro e fino sobre um contorno escuro (lê no deserto e na floresta)
      ...(atlasLines ? [] : mapBaseBorderLayers(mapBase, borderPalette)).map((line) => ({ id: line.id, type: "line" as const, source: "atlas", "source-layer": "countries", filter: ["==", "$type", "Polygon"] as unknown as maplibregl.FilterSpecification, layout: { "line-join": "round" as const }, paint: { "line-color": line.color, "line-opacity": line.opacity, "line-width": ["interpolate", ["linear"], ["zoom"], 1, line.width[0], 6, line.width[1]] as unknown as maplibregl.ExpressionSpecification } })),
      // traço de tinta do estilo de mapa (gravura): por cima da terra, por baixo dos marcadores
      ...(palette.ink ? [{ id: "ink", type: "line" as const, source: "atlas", "source-layer": "countries", filter: ["==", "$type", "Polygon"] as unknown as maplibregl.FilterSpecification, layout: { "line-join": "round" as const }, paint: { "line-color": palette.ink.color, "line-width": ["interpolate", ["linear"], ["zoom"], 1, palette.ink.width, 6, palette.ink.width * 1.6] as unknown as maplibregl.ExpressionSpecification, "line-opacity": palette.ink.opacity } }] : []),
      ...(atlasLines ? [
        ...["atlas", ...(board?.extra ?? []).map((_, index) => `atlas-${index}`)].map((source, index) => ({
          id: index ? `division-lines-${index - 1}` : "division-lines", type: "line" as const, source, "source-layer": "countries",
          filter: ["==", "$type", "Polygon"] as unknown as maplibregl.FilterSpecification, layout: { "line-join": "round" as const },
          paint: { "line-color": divisionColor, "line-opacity": satellite ? 0.7 : 0.9, "line-dasharray": [2.5, 2], "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.7, 6, 1.4] as unknown as maplibregl.ExpressionSpecification },
        })),
        ...(satellite ? [{ id: "nation-casing", type: "line" as const, source: "backdrop", "source-layer": "countries", filter: ["==", "$type", "Polygon"] as unknown as maplibregl.FilterSpecification, layout: { "line-join": "round" as const }, paint: { "line-color": "#06121a", "line-opacity": 0.5, "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.8, 6, 3.4] as unknown as maplibregl.ExpressionSpecification } }] : []),
        { id: "nation-lines", type: "line" as const, source: "backdrop", "source-layer": "countries", filter: ["==", "$type", "Polygon"] as unknown as maplibregl.FilterSpecification, layout: { "line-join": "round" as const },
          paint: { "line-color": nationColor, "line-opacity": 0.9, "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.9, 6, 1.8] as unknown as maplibregl.ExpressionSpecification } },
      ] : []),
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
  };
}
