import markerData from "../data/small-entity-markers.json";

type MarkerFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    carta_id: string;
    switchZoom: number;
    un: boolean;
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

export function assertMarkerBound(playableEntityCount: number) {
  if (SMALL_ENTITY_SOURCE.features.length > playableEntityCount) {
    throw new Error(
      `Marcadores (${SMALL_ENTITY_SOURCE.features.length}) excedem entidades jogáveis (${playableEntityCount}).`,
    );
  }
}

export function markerFilter(entityIds: Iterable<string>) {
  const allowed = [...new Set(entityIds)];
  return ["in", ["get", "carta_id"], ["literal", allowed]] as const;
}

export function filteredMarkerSource(entityIds: Iterable<string>): SmallEntitySource {
  const allowed = new Set(entityIds);
  return {
    type: "FeatureCollection",
    features: SMALL_ENTITY_SOURCE.features.filter((feature) =>
      allowed.has(feature.properties.carta_id),
    ),
  };
}