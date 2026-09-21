// Perfil mostrado no Hub: título de maestria, selos de pilar e legendas dos cards de progresso.
// Lógica pura (sem React nem IndexedDB) para poder ser testada.

export type PillarTitle = { id: "vexilologo" | "cartografo" | "diplomata"; label: string; icon: "flag" | "map" | "capital" };
export const PILLAR_TITLES: readonly PillarTitle[] = [
  { id: "vexilologo", label: "Vexilólogo", icon: "flag" },
  { id: "cartografo", label: "Cartógrafo", icon: "map" },
  { id: "diplomata", label: "Diplomata", icon: "capital" },
];
// Títulos de pilar + Cosmógrafo (os três juntos): são as conquistas de categoria "Domínio".
export const TITLE_IDS: readonly string[] = [...PILLAR_TITLES.map((title) => title.id), "cosmografo"];

// Cortes da escala global do jogo clássico.
export const MASTERY_STAGES = [
  { title: "Novato", from: 0 },
  { title: "Aprendiz", from: 20 },
  { title: "Explorador", from: 40 },
  { title: "Navegador", from: 60 },
  { title: "Geógrafo", from: 80 },
] as const;

export type AchievementSummary = {
  unlocked: number;
  total: number;
  titles: string[];
  next: { name: string; current: number; target: number } | null;
};
export const EMPTY_ACHIEVEMENT_SUMMARY: AchievementSummary = { unlocked: 0, total: 30, titles: [], next: null };

export const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
export const ratioPercent = (value: number, total: number) => (total > 0 ? clampPercent((value / total) * 100) : 0);

function joinList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

export function hubProfile(input: { masteryPct: number; titleIds: readonly string[] }) {
  const pct = clampPercent(input.masteryPct);
  const cosmographer = input.titleIds.includes("cosmografo");
  let stageIndex = 0;
  MASTERY_STAGES.forEach((stage, index) => { if (pct >= stage.from) stageIndex = index; });
  const nextStage = MASTERY_STAGES[stageIndex + 1];
  const next = !cosmographer && nextStage ? { title: nextStage.title, at: nextStage.from } : null;
  const earned = PILLAR_TITLES.filter((title) => input.titleIds.includes(title.id));
  const missing = PILLAR_TITLES.filter((title) => !input.titleIds.includes(title.id)).map((title) => title.label);
  return {
    pct,
    title: cosmographer ? "Cosmógrafo" : MASTERY_STAGES[stageIndex].title,
    next,
    earned,
    // com selos ganhos a linha fica curta (o próximo título continua na legenda do card de Maestria)
    masteryLine: `${pct}% de maestria${next && earned.length === 0 ? ` · próximo: ${next.title} aos ${next.at}%` : ""}`,
    caption: cosmographer
      ? "Título máximo: Cosmógrafo"
      : next
        ? `Próximo título: ${next.title} aos ${next.at}%`
        : missing.length === 0
          ? "Os três títulos de pilar estão completos"
          : `${missing.length === 1 ? "Falta" : "Faltam"} ${joinList(missing)} para Cosmógrafo`,
  };
}

export function collectionCaption(discovered: number, total: number) {
  if (total <= 0) return "";
  const missing = total - discovered;
  return missing > 0 ? `${missing} faltando para completar o atlas` : "Atlas completo";
}

export function achievementCaption(summary: AchievementSummary) {
  if (summary.total > 0 && summary.unlocked >= summary.total) return "Todas desbloqueadas";
  if (summary.next) return `Próximo: ${summary.next.name} · ${summary.next.current}/${summary.next.target}`;
  return summary.total > 0 ? `${summary.total - summary.unlocked} por desbloquear` : "";
}
