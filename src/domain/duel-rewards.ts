// Marcos do Duelo: recompensa em moedas, paga uma vez só, por divisão nova (em cada escada) e (maior) por liga nova.
// Como os troféus podem cair, cada marco é um crédito com id único no livro-caixa: descer e subir de novo não repete o prêmio.
// O marco de liga é um só por liga: quem chegar primeiro, em qualquer das duas escadas, leva; o de divisão é de cada escada.
import { DIVISION_SPAN, LEAGUES, leagueFloor, type LeagueKey } from "./league.js";
import { LADDERS, type Ladder } from "./duel-modes.js";

export const DIVISION_COINS = 500;
/** Entrar na liga: Prata, Ouro, Platina, Diamante e Mestre. */
export const LEAGUE_COINS: Partial<Record<LeagueKey, number>> = { prata: 3000, ouro: 6000, platina: 12000, diamante: 24000, mestre: 48000 };

export type Milestone = {
  id: string;
  kind: "division" | "league";
  league: LeagueKey;
  /** 2 ou 3 nos marcos de divisão; null nos de liga. */
  division: 2 | 3 | null;
  /** Escada do marco de divisão; null no de liga (vale para as duas). */
  ladder: Ladder | null;
  /** Troféus em que o marco abre. */
  at: number;
  coins: number;
};

export const MILESTONES: readonly Milestone[] = [
  ...LEAGUES.flatMap((league, index): Milestone[] => {
    const coins = LEAGUE_COINS[league];
    return coins ? [{ id: `league:${league}`, kind: "league", league, division: null, ladder: null, at: leagueFloor(index), coins }] : [];
  }),
  ...LADDERS.flatMap((ladder) => LEAGUES.flatMap((league, index): Milestone[] => {
    if (league === "mestre") return [];
    const floor = leagueFloor(index);
    return ([2, 3] as const).map((division) => ({ id: `division:${ladder}:${league}:${division}`, kind: "division" as const, league, division, ladder, at: floor + (division - 1) * DIVISION_SPAN, coins: DIVISION_COINS }));
  })),
].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));

export const milestoneLedgerId = (milestone: Pick<Milestone, "id">) => `grant:duel:${milestone.id}`;

/** O v1 tinha uma escada só e ids sem escada (\`division:bronze:2\`): esses créditos já pagos contam como da escada Mapas. */
const legacyLedgerId = (milestone: Milestone) =>
  milestone.kind === "division" && milestone.ladder === "mapas" ? `grant:duel:division:${milestone.league}:${milestone.division}` : null;

/** Troféus por escada; um número solto vale para a escada Mapas (o v1 tinha uma só). */
export type TrophiesByLadder = Partial<Record<Ladder, number>>;
const asLadders = (trophies: number | TrophiesByLadder): TrophiesByLadder => (typeof trophies === "number" ? { mapas: trophies } : trophies);

export function reachedMilestones(trophies: number | TrophiesByLadder) {
  const byLadder = asLadders(trophies);
  const best = Math.max(0, ...LADDERS.map((ladder) => byLadder[ladder] ?? 0));
  return MILESTONES.filter((milestone) => milestone.ladder ? (byLadder[milestone.ladder] ?? 0) >= milestone.at : best >= milestone.at);
}
/** Marcos já alcançados cujo crédito ainda não está no livro-caixa. */
export const pendingMilestones = (trophies: number | TrophiesByLadder, ledgerIds: ReadonlySet<string>) =>
  reachedMilestones(trophies).filter((milestone) => {
    const legacy = legacyLedgerId(milestone);
    return !ledgerIds.has(milestoneLedgerId(milestone)) && !(legacy && ledgerIds.has(legacy));
  });
