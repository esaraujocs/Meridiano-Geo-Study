// Marcos do Duelo: recompensa em moedas, paga uma vez só, por divisão nova e (maior) por liga nova.
// Como os troféus podem cair, cada marco é um crédito com id único no livro-caixa: descer e subir de novo não repete o prêmio.
import { DIVISION_SPAN, LEAGUES, leagueFloor, type LeagueKey } from "./league.js";

export const DIVISION_COINS = 500;
/** Entrar na liga: Prata, Ouro, Platina, Diamante e Mestre. */
export const LEAGUE_COINS: Partial<Record<LeagueKey, number>> = { prata: 3000, ouro: 6000, platina: 12000, diamante: 24000, mestre: 48000 };

export type Milestone = {
  id: string;
  kind: "division" | "league";
  league: LeagueKey;
  /** 2 ou 3 nos marcos de divisão; null nos de liga. */
  division: 2 | 3 | null;
  /** Troféus em que o marco abre. */
  at: number;
  coins: number;
};

export const MILESTONES: readonly Milestone[] = LEAGUES.flatMap((league, index): Milestone[] => {
  const floor = leagueFloor(index);
  const leagueCoins = LEAGUE_COINS[league];
  const list: Milestone[] = [];
  if (leagueCoins) list.push({ id: `league:${league}`, kind: "league", league, division: null, at: floor, coins: leagueCoins });
  if (league !== "mestre") {
    list.push({ id: `division:${league}:2`, kind: "division", league, division: 2, at: floor + DIVISION_SPAN, coins: DIVISION_COINS });
    list.push({ id: `division:${league}:3`, kind: "division", league, division: 3, at: floor + 2 * DIVISION_SPAN, coins: DIVISION_COINS });
  }
  return list;
}).sort((a, b) => a.at - b.at);

export const milestoneLedgerId = (milestone: Pick<Milestone, "id">) => `grant:duel:${milestone.id}`;
export const reachedMilestones = (trophies: number) => MILESTONES.filter((milestone) => trophies >= milestone.at);
/** Marcos já alcançados cujo crédito ainda não está no livro-caixa. */
export const pendingMilestones = (trophies: number, ledgerIds: ReadonlySet<string>) =>
  reachedMilestones(trophies).filter((milestone) => !ledgerIds.has(milestoneLedgerId(milestone)));
