// Ligas do Duelo: Bronze a Diamante com 500 troféus e 3 divisões (I, II, III) cada; o Mestre (2.500 a 3.499) e o Grão-Mestre (3.500 em diante,
// sem teto) não têm divisões. Lógica pura.
//
// O Grão-Mestre (19/10/2026, pedido do Enzo: "um novo elo acima do Mestre, decida uma linha de corte"): 3.500 é onde um jogador muito engajado,
// que acerta quase tudo e responde rápido, se segura contra os bots novos do topo (o próprio Enzo, com 3.583 em Bandeiras, é a referência).
export const LEAGUES = ["bronze", "prata", "ouro", "platina", "diamante", "mestre", "grao-mestre"] as const;
export type LeagueKey = (typeof LEAGUES)[number];

export const LEAGUE_SPAN = 500;
/** Cada liga com divisões tem 3; a última pega o que sobra (166 troféus). */
export const DIVISION_SPAN = 167;
export const MASTER_AT = 2500;
export const GRAND_MASTER_AT = 3500;
/** Onde cada liga começa. */
const FLOORS: readonly number[] = [0, 500, 1000, 1500, 2000, MASTER_AT, GRAND_MASTER_AT];

export type LeagueStatus = {
  league: LeagueKey;
  index: number;
  /** 1 a 3; o Mestre e o Grão-Mestre não têm divisões. */
  division: 1 | 2 | 3 | null;
  trophies: number;
  /** Troféus em que esta liga começa. */
  floor: number;
  /** Próximo degrau: a divisão seguinte ou, sem divisões, a liga seguinte (null no Grão-Mestre). */
  nextDivisionAt: number | null;
  nextLeagueAt: number | null;
  toNextDivision: number | null;
  toNextLeague: number | null;
};

const clampIndex = (index: number) => Math.min(LEAGUES.length - 1, Math.max(0, Math.floor(index)));
export const leagueFloor = (index: number) => FLOORS[clampIndex(index)];
/** Largura da liga em troféus (o Mestre tem 1.000); o Grão-Mestre, sem teto, conta 500 para as barras e réguas. */
export const leagueSpan = (index: number) => (clampIndex(index) < LEAGUES.length - 1 ? FLOORS[clampIndex(index) + 1] - FLOORS[clampIndex(index)] : LEAGUE_SPAN);
/** Só Bronze a Diamante têm divisões. */
export const hasDivisions = (index: number) => clampIndex(index) < LEAGUES.indexOf("mestre");

export function leagueOf(trophies: number): LeagueStatus {
  const value = Math.max(0, Math.floor(Number.isFinite(trophies) ? trophies : 0));
  let index = 0;
  while (index < LEAGUES.length - 1 && value >= FLOORS[index + 1]) index += 1;
  const floor = FLOORS[index];
  const nextLeagueAt = index < LEAGUES.length - 1 ? FLOORS[index + 1] : null;
  const toNextLeague = nextLeagueAt === null ? null : nextLeagueAt - value;
  if (!hasDivisions(index)) {
    return { league: LEAGUES[index], index, division: null, trophies: value, floor, nextDivisionAt: nextLeagueAt, nextLeagueAt, toNextDivision: toNextLeague, toNextLeague };
  }
  const division = (1 + Math.min(2, Math.floor((value - floor) / DIVISION_SPAN))) as 1 | 2 | 3;
  const nextDivisionAt = division < 3 ? floor + division * DIVISION_SPAN : (nextLeagueAt as number);
  return { league: LEAGUES[index], index, division, trophies: value, floor, nextDivisionAt, nextLeagueAt, toNextDivision: nextDivisionAt - value, toNextLeague };
}

const ROMAN = ["I", "II", "III"] as const;
export const divisionRoman = (division: 1 | 2 | 3 | null) => (division ? ROMAN[division - 1] : "");
