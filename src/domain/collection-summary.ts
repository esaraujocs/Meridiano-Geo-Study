export type CollectionProgressRecord = {
  entityId?: unknown;
  id?: unknown;
  mastery?: unknown;
};

export function collectionSummary(
  records: CollectionProgressRecord[],
  universe: Iterable<string>,
) {
  const ids = new Set([...universe].map(String));
  const discovered = new Set(
    records
      .filter((record) => Number(record.mastery ?? 0) > 0)
      .map((record) => String(record.entityId ?? record.id ?? ""))
      .filter((id) => ids.has(id)),
  );
  return { discovered: discovered.size, total: ids.size };
}