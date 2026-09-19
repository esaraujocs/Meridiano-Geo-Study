export type MarkerClickFeature = {
  properties?: { carta_id?: string | number | null } | null;
};

export function resolveMarkerClick(
  feature: MarkerClickFeature,
  targetId: string,
) {
  const value = feature.properties?.carta_id;
  const answerId = value === null || value === undefined ? "" : String(value);
  return { answerId, correct: answerId !== "" && answerId === targetId };
}