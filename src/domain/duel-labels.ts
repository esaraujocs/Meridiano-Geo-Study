// Textos dos bots e dos marcos no idioma da interface (nomes próprios dos bots não se traduzem).
import type { Bot, BotFamily, BotRegion, BotStyle } from "./bots.js";
import type { Milestone } from "./duel-rewards.js";
import { LEAGUES, divisionRoman, type LeagueKey, type LeagueStatus } from "./league.js";
import { t } from "./i18n/index.js";

export const leagueLabel = (league: LeagueKey, division: 1 | 2 | 3 | null = null) => t.duel.leagueName(t.duel.leagues[league], divisionRoman(division));
/** O sinal na moldura do nível: a divisão em romanos ou, nas ligas sem divisões, M (Mestre) e GM (Grão-Mestre). */
export const leaguePip = (league: LeagueKey, division: 1 | 2 | 3 | null = null) => divisionRoman(division) || (league === "grao-mestre" ? "GM" : "M");

/** "Bot Bronze" só aparece para registros antigos, que guardavam a liga e não o bot. */
export const botLabel = (bot: Pick<Bot, "name" | "league">) => bot.name || t.duel.botName(t.duel.leagues[bot.league]);

export const styleLabel = (style: BotStyle, specialty: BotFamily | null, region?: BotRegion) =>
  style === "especialista" && specialty ? t.duel.styles.especialista(t.families[specialty])
    : style === "regional" && specialty && region ? t.duel.styles.regional(t.families[specialty], t.duel.regionOf[region])
      : t.duel.styles[style === "especialista" || style === "regional" ? "constante" : style];

export const milestoneLabel = (milestone: Pick<Milestone, "kind" | "league" | "division">) =>
  milestone.kind === "league"
    ? t.duel.result.milestoneLeague(t.duel.leagues[milestone.league])
    : t.duel.result.milestoneDivision(t.duel.leagues[milestone.league], divisionRoman(milestone.division));

/** O próximo degrau na escada de ligas: a divisão seguinte ou, na III e no Mestre (sem divisões), a liga seguinte (null no Grão-Mestre). */
export function nextStep(status: LeagueStatus): { label: string; remaining: number } | null {
  if (status.toNextDivision === null) return null;
  const label = status.division === 3 || status.division === null
    ? leagueLabel(LEAGUES[status.index + 1])
    : leagueLabel(status.league, (status.division + 1) as 2 | 3);
  return { label, remaining: status.toNextDivision };
}
