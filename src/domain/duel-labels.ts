// Textos dos bots e dos marcos no idioma da interface (nomes próprios dos bots não se traduzem).
import type { Bot, BotFamily, BotStyle } from "./bots.js";
import type { Milestone } from "./duel-rewards.js";
import { LEAGUES, divisionRoman, type LeagueKey, type LeagueStatus } from "./league.js";
import { t } from "./i18n/index.js";

export const leagueLabel = (league: LeagueKey, division: 1 | 2 | 3 | null = null) => t.duel.leagueName(t.duel.leagues[league], divisionRoman(division));

/** "Bot Bronze" só aparece para registros antigos, que guardavam a liga e não o bot. */
export const botLabel = (bot: Pick<Bot, "name" | "league">) => bot.name || t.duel.botName(t.duel.leagues[bot.league]);

export const styleLabel = (style: BotStyle, specialty: BotFamily | null) =>
  style === "especialista" && specialty ? t.duel.styles.especialista(t.families[specialty]) : t.duel.styles[style === "especialista" ? "constante" : style];

export const milestoneLabel = (milestone: Pick<Milestone, "kind" | "league" | "division">) =>
  milestone.kind === "league"
    ? t.duel.result.milestoneLeague(t.duel.leagues[milestone.league])
    : t.duel.result.milestoneDivision(t.duel.leagues[milestone.league], divisionRoman(milestone.division));

/** O próximo degrau na escada de ligas: a divisão seguinte ou, na III, a liga seguinte (null no Mestre). */
export function nextStep(status: LeagueStatus): { label: string; remaining: number } | null {
  if (status.toNextDivision === null || status.division === null) return null;
  const label = status.division === 3
    ? leagueLabel(LEAGUES[status.index + 1])
    : leagueLabel(status.league, (status.division + 1) as 2 | 3);
  return { label, remaining: status.toNextDivision };
}
