// Marcos do Duelo: recompensa em moedas, paga uma vez só, por divisão nova (em cada escada) e (maior) por liga nova.
// Como os troféus podem cair, cada marco é um crédito com id único no livro-caixa: descer e subir de novo não repete o prêmio.
// O marco de liga é um só por liga: quem chegar primeiro, em qualquer das duas escadas, leva; o de divisão é de cada escada.
import { DIVISION_SPAN, LEAGUES, leagueFloor, type LeagueKey } from "./league.js";
import { LADDERS, type Ladder } from "./duel-modes.js";

// Um duelo rende perto de mil moedas, então o prêmio de uma divisão vale uns 2 ou 3 duelos e o de uma liga, de 10 a 150 (a subida é bem mais lenta).
export const DIVISION_COINS = 2500;
/** Entrar na liga: Prata, Ouro, Platina, Diamante e Mestre. */
export const LEAGUE_COINS: Partial<Record<LeagueKey, number>> = { prata: 10000, ouro: 20000, platina: 40000, diamante: 80000, mestre: 150000 };

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

/** Diferença de um marco já pago com um valor menor (os prêmios foram aumentados): o crédito extra tem id por valor, então só é pago uma vez. */
export const topupLedgerId = (milestone: Pick<Milestone, "id">, coins: number) => `grant:duel:topup:${milestone.id}:${coins}`;
export function milestoneTopUps(trophies: number | TrophiesByLadder, paid: ReadonlyMap<string, number>) {
  return reachedMilestones(trophies).flatMap((milestone) => {
    const legacy = legacyLedgerId(milestone);
    const base = Math.max(paid.get(milestoneLedgerId(milestone)) ?? 0, legacy ? paid.get(legacy) ?? 0 : 0);
    if (base <= 0) return []; // ainda não pago: é o crédito normal
    const prefix = `grant:duel:topup:${milestone.id}:`;
    let extra = 0;
    for (const [id, amount] of paid) if (id.startsWith(prefix)) extra += amount;
    const amount = milestone.coins - base - extra;
    return amount > 0 ? [{ milestone, id: topupLedgerId(milestone, milestone.coins), amount }] : [];
  });
}

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
