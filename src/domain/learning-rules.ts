export type LearningColumn = "bandeiras" | "mapa" | "capitais" | "escrita";

export type ProgressRecord = {
  id: string;
  entityId?: string;
  seen: number;
  correct: number;
  columns: {
    bandeiras: number;
    mapa: number;
    capitais: number;
    escrita?: number;
  };
  latest: number;
  mastery: 0 | 1 | 2 | 3 | 4 | 5;
  source: string;
};

export function masteryForProgress(record: {
  seen: number;
  correct: number;
  columns: ProgressRecord["columns"];
}): ProgressRecord["mastery"] {
  let mastery = record.seen > 0 || record.correct > 0 ? 1 : 0;
  const columns = ["bandeiras", "mapa", "capitais", "escrita"] as const;
  const modes = columns.filter(
    (column) => (record.columns[column] ?? 0) > 0,
  ).length;
  if (modes >= 2) mastery = 2;
  if (modes >= 3) mastery = 3;
  if (modes >= 4) mastery = 4;
  if (
    modes >= 4 &&
    (record.columns.escrita ?? 0) >= 2 &&
    (record.columns.capitais ?? 0) >= 2
  ) {
    mastery = 5;
  }
  return mastery as ProgressRecord["mastery"];
}

export function mergeProgressRecord(
  existing: ProgressRecord | undefined,
  entityId: string,
  column: LearningColumn,
  correct: boolean,
  answeredAt: number,
): ProgressRecord {
  const current: ProgressRecord = existing
    ? {
        ...existing,
        entityId: existing.entityId ?? entityId,
        columns: {
          bandeiras: existing.columns?.bandeiras ?? 0,
          mapa: existing.columns?.mapa ?? 0,
          capitais: existing.columns?.capitais ?? 0,
          ...(existing.columns?.escrita === undefined
            ? {}
            : { escrita: existing.columns.escrita }),
        },
      }
    : {
        id: `current:${entityId}`,
        entityId,
        seen: 0,
        correct: 0,
        columns: { bandeiras: 0, mapa: 0, capitais: 0 },
        latest: 0,
        mastery: 0,
        source: "current-v2",
      };

  current.seen += 1;
  if (correct) {
    current.correct += 1;
    current.columns[column] = (current.columns[column] ?? 0) + 1;
    current.latest = Math.max(current.latest, answeredAt);
  }
  current.mastery = masteryForProgress(current);
  if (current.source === "legacy-v1") current.source = "combined";
  else if (current.source !== "combined") current.source = "current-v2";
  return current;
}
/** Cartas "mãe" que o mapa nunca pergunta: o Reino Unido (826, `mapa: false`) só aparece no mapa pelas 4 nações (`substitui: "GBR"`). Devolve
 *  nação → carta mãe, para o acerto de uma nação nos modos de clicar no mapa (colunas mapa e capitais) contar também para a carta do Reino Unido. */
export function cardParentsOf(meta: Record<string, { cca3?: string; substitui?: string }>): Record<string, string> {
  const byCca3 = new Map<string, string>();
  for (const [id, item] of Object.entries(meta)) if (item.cca3 && !item.substitui) byCca3.set(item.cca3, id);
  const parents: Record<string, string> = {};
  for (const [id, item] of Object.entries(meta)) {
    const parent = item.substitui ? byCca3.get(item.substitui) : undefined;
    if (parent && parent !== id) parents[id] = parent;
  }
  return parents;
}

/** A carta mãe que este acerto também credita (só acerto, só nas colunas que o mapa pergunta pelas nações). */
export function parentCardCredit(parents: Readonly<Record<string, string>> | undefined, targetId: string, column: LearningColumn, correct: boolean) {
  if (!correct || !parents || (column !== "mapa" && column !== "capitais")) return null;
  return parents[targetId] ?? null;
}
