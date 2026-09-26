// Textos dos bots e dos marcos no idioma da interface (nomes próprios dos bots não se traduzem).
import type { Bot, BotFamily, BotStyle } from "./bots.js";
import type { Milestone } from "./duel-rewards.js";
import { divisionRoman, type LeagueKey } from "./league.js";
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
