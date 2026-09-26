import { t } from "./i18n/index.js";

export const RARITY_LABELS: readonly string[] = t.rarity;
export type RarityLevel = 1 | 2 | 3 | 4 | 5;

export type AchievementLike = {
  id: string;
  unlocked: boolean;
  hidden?: boolean;
  rarity?: number;
  category?: string;
  target?: number;
  current?: number;
  unlockedAt?: number;
};

export function rarityLevel(value: number | undefined): RarityLevel {
  const level = Math.round(Number(value ?? 1));
  return (level >= 1 && level <= 5 ? level : 1) as RarityLevel;
}

export function rarityBreakdown(items: AchievementLike[]) {
  return ([1, 2, 3, 4, 5] as const).map((rarity) => {
    const group = items.filter((item) => rarityLevel(item.rarity) === rarity);
    return { rarity, unlocked: group.filter((item) => item.unlocked).length, total: group.length };
  });
}

export function categoryTally(items: AchievementLike[], category: string) {
  const group = items.filter((item) => item.category === category);
  return { unlocked: group.filter((item) => item.unlocked).length, total: group.length };
}

export function progressRatio(item: AchievementLike) {
  const target = Number(item.target ?? 0);
  if (target <= 0) return 0;
  return Math.max(0, Math.min(1, Number(item.current ?? 0) / target));
}

// "Quase lá": só conquistas com contagem (alvo > 1) já iniciadas e que não são ocultas;
// as mais adiantadas primeiro. Ocultas ficam de fora para não revelar o que são.
export function nearAchievements<T extends AchievementLike>(items: T[], limit = 3): T[] {
  return items
    .filter((item) => !item.unlocked && !item.hidden && Number(item.target ?? 0) > 1 && Number(item.current ?? 0) > 0)
    .sort((a, b) => progressRatio(b) - progressRatio(a) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

// Conquistas recém-desbloqueadas entre duas avaliações. Sem base anterior (`known` nulo, primeira
// leitura depois de abrir o app) nada é "novo": o que já estava desbloqueado não vira aviso.
export function freshUnlocks<T extends { id: string; unlocked: boolean }>(known: ReadonlySet<string> | null, items: T[]) {
  const unlocked = items.filter((item) => item.unlocked);
  return {
    fresh: known === null ? [] : unlocked.filter((item) => !known.has(item.id)),
    next: new Set(unlocked.map((item) => item.id)),
    count: unlocked.length,
  };
}

const MONTHS = t.dates.monthsShort;

// "12 set"; com o ano quando não é o ano corrente ("12 set 2025").
export function formatUnlockDate(timestamp: number | undefined, now: Date = new Date()) {
  if (!timestamp || !Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  const base = t.dates.shortDate(date.getDate(), MONTHS[date.getMonth()]);
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}
