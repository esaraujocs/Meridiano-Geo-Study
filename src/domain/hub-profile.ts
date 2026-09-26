// Perfil mostrado no Hub: título de maestria, selos de pilar e legendas dos cards de progresso.
// Lógica pura (sem React nem IndexedDB) para poder ser testada.
import { t } from "./i18n/index.js";

export type PillarTitle = { id: "vexilologo" | "cartografo" | "diplomata"; label: string; icon: "flag" | "map" | "capital" };
export const PILLAR_TITLES: readonly PillarTitle[] = [
  { id: "vexilologo", label: t.titles.vexilologo, icon: "flag" },
  { id: "cartografo", label: t.titles.cartografo, icon: "map" },
  { id: "diplomata", label: t.titles.diplomata, icon: "capital" },
];
// Títulos de pilar + Cosmógrafo (os três juntos): são as conquistas de categoria "Domínio".
export const TITLE_IDS: readonly string[] = [...PILLAR_TITLES.map((title) => title.id), "cosmografo"];

// Cortes da escala global do jogo clássico.
export const MASTERY_STAGES = [
  { title: t.titles.novato, from: 0 },
  { title: t.titles.aprendiz, from: 20 },
  { title: t.titles.explorador, from: 40 },
  { title: t.titles.navegador, from: 60 },
  { title: t.titles.geografo, from: 80 },
] as const;

export type AchievementSummary = {
  unlocked: number;
  total: number;
  titles: string[];
  next: { name: string; current: number; target: number } | null;
};
export const EMPTY_ACHIEVEMENT_SUMMARY: AchievementSummary = { unlocked: 0, total: 49, titles: [], next: null };

export const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
export const ratioPercent = (value: number, total: number) => (total > 0 ? clampPercent((value / total) * 100) : 0);

const joinList = (items: string[]) => t.titles.joinList(items);

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
    title: cosmographer ? t.titles.cosmografo : MASTERY_STAGES[stageIndex].title,
    cosmographer,
    next,
    earned,
    // com selos ganhos a linha fica curta (o próximo título continua na legenda do card de Maestria)
    masteryLine: `${t.titles.masteryLine(pct)}${next && earned.length === 0 ? t.titles.nextInline(next.title, next.at) : ""}`,
    caption: cosmographer
      ? t.titles.maxTitle
      : next
        ? t.titles.nextTitle(next.title, next.at)
        : missing.length === 0
          ? t.titles.allPillars
          : t.titles.missingPillars(missing.length, joinList(missing)),
  };
}

export function collectionCaption(discovered: number, total: number) {
  if (total <= 0) return "";
  const missing = total - discovered;
  return missing > 0 ? t.titles.collectionMissing(missing) : t.titles.atlasComplete;
}

export function achievementCaption(summary: AchievementSummary) {
  if (summary.total > 0 && summary.unlocked >= summary.total) return t.titles.allUnlocked;
  if (summary.next) return t.titles.nextAchievement(summary.next.name, summary.next.current, summary.next.target);
  return summary.total > 0 ? t.titles.toUnlock(summary.total - summary.unlocked) : "";
}
