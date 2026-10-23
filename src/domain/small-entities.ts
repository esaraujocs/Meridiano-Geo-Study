import markerData from "../data/small-entity-markers.json";

type MarkerFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    carta_id: string;
    switchZoom: number;
    un: boolean;
    // Território absorvido: o clique vale pelo soberano (answer_id) e ele nunca é alvo.
    answer_id?: string;
    absorbed?: boolean;
  };
};

export type SmallEntitySource = {
  type: "FeatureCollection";
  features: MarkerFeature[];
};

export const SMALL_ENTITY_SOURCE = markerData as SmallEntitySource;

const ids = SMALL_ENTITY_SOURCE.features.map((feature) => feature.properties.carta_id);
if (ids.length > 255 || new Set(ids).size !== ids.length) {
  throw new Error(
    `Fonte de marcadores inválida: ${ids.length} marcadores para ${new Set(ids).size} entidades.`,
  );
}

export const ABSORBED_MARKER_IDS = SMALL_ENTITY_SOURCE.features
  .filter((feature) => feature.properties.absorbed)
  .map((feature) => feature.properties.carta_id);

export function assertMarkerBound(playableEntityCount: number) {
  const playableMarkers = SMALL_ENTITY_SOURCE.features.length - ABSORBED_MARKER_IDS.length;
  if (playableMarkers > playableEntityCount) {
    throw new Error(
      `Marcadores (${playableMarkers}) excedem entidades jogáveis (${playableEntityCount}).`,
    );
  }
}

export function markerFilter(entityIds: Iterable<string>) {
  const allowed = [...new Set(entityIds)];
  return ["in", ["get", "carta_id"], ["literal", allowed]] as const;
}

// O marcador de uma entidade some quando o contorno dela já é visível (switchZoom, gerado a
// partir dos tiles). Uma expressão de estilo não aceita limite de zoom por feição, então cada
// faixa de zoom vira uma layer própria, com maxzoom e fade próprios.
export const MARKER_BAND = 0.25;
export const MARKER_FADE_ZOOMS = 0.75;
export const MARKER_MAX_ZOOM = 24;

export function markerBandZoom(switchZoom: number) {
  return Math.min(MARKER_MAX_ZOOM, Math.ceil(switchZoom / MARKER_BAND) * MARKER_BAND);
}

export const MARKER_BAND_ZOOMS = [
  ...new Set(SMALL_ENTITY_SOURCE.features.map((feature) => markerBandZoom(feature.properties.switchZoom))),
].sort((a, b) => a - b);

export const markerLayerId = (band: number) => `small-entities-z${band.toFixed(2)}`;

export function markerBandFilter(band: number, entityIds: Iterable<string>) {
  return [
    "all",
    markerFilter(entityIds),
    ["<=", ["get", "switchZoom"], band],
    [">", ["get", "switchZoom"], band - MARKER_BAND],
  ] as const;
}

export function markerBandOpacity(band: number) {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    Math.max(0, band - MARKER_FADE_ZOOMS),
    0.9,
    band,
    0,
  ] as const;
}

export function isMarkerVisibleAtZoom(switchZoom: unknown, zoom: number) {
  const value = Number(switchZoom);
  return Number.isFinite(value) && zoom < markerBandZoom(value);
}

export function filteredMarkerSource(entityIds: Iterable<string>, source: SmallEntitySource = SMALL_ENTITY_SOURCE): SmallEntitySource {
  const allowed = new Set(entityIds);
  return {
    type: "FeatureCollection",
    features: source.features.filter((feature) =>
      allowed.has(feature.properties.carta_id),
    ),
  };
}

/** Marcadores no tabuleiro de um país (22/10/2026, com as regiões ultramarinas da França): toda unidade menor que `BOARD_MARKER_KM2` ganha um
 *  ponto clicável no rótulo dela, como as ilhas do mapa-múndi (Martinica, Reunião, Ceuta, Rhode Island). O ponto some quando o contorno passa de
 *  ~`BOARD_MARKER_PX` na tela (8: com 16 o Reino Unido ficava coberto de pontos); o zoom é encaixado numa das faixas do mapa-múndi (as camadas dos marcadores são as mesmas). */
export const BOARD_MARKER_KM2 = 5000;
export const BOARD_MARKER_PX = 8;
export function boardMarkerSource(units: readonly { id: string; ll?: readonly [number, number]; area?: number; bbox?: readonly [number, number, number, number] }[]): SmallEntitySource {
  const features: MarkerFeature[] = [];
  for (const unit of units) {
    if (!unit.ll || !unit.bbox || (unit.area ?? Infinity) >= BOARD_MARKER_KM2) continue;
    // o tamanho pela área (o lado de um quadrado com ela), não pela caixa: arquipélagos espalhados (as Laquedivas, 32 km² em ~3°) sumiriam cedo
    const span = Math.max(0.01, Math.min(Math.sqrt(unit.area ?? 0) / 111 || Infinity, unit.bbox[2] - unit.bbox[0], unit.bbox[3] - unit.bbox[1]));
    const zoom = Math.log2((BOARD_MARKER_PX * 360) / (512 * span));
    const band = MARKER_BAND_ZOOMS.find((value) => value >= zoom) ?? MARKER_BAND_ZOOMS[MARKER_BAND_ZOOMS.length - 1];
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: [unit.ll[1], unit.ll[0]] }, properties: { carta_id: unit.id, switchZoom: band, un: true } });
  }
  return { type: "FeatureCollection", features };
}