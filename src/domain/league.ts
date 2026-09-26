// Ligas do Duelo: 5 ligas de 500 troféus, cada uma com 3 divisões (I, II, III), e o Mestre sem teto. Lógica pura.
export const LEAGUES = ["bronze", "prata", "ouro", "platina", "diamante", "mestre"] as const;
export type LeagueKey = (typeof LEAGUES)[number];

export const LEAGUE_SPAN = 500;
/** Cada liga tem 3 divisões; a última pega o que sobra (166 troféus). */
export const DIVISION_SPAN = 167;
export const MASTER_AT = (LEAGUES.length - 1) * LEAGUE_SPAN;

export type LeagueStatus = {
  league: LeagueKey;
  index: number;
  /** 1 a 3; o Mestre não tem divisões. */
  division: 1 | 2 | 3 | null;
  trophies: number;
  /** Troféus em que esta liga começa. */
  floor: number;
  nextDivisionAt: number | null;
  nextLeagueAt: number | null;
  toNextDivision: number | null;
  toNextLeague: number | null;
};

export const leagueFloor = (index: number) => index * LEAGUE_SPAN;

export function leagueOf(trophies: number): LeagueStatus {
  const value = Math.max(0, Math.floor(Number.isFinite(trophies) ? trophies : 0));
  const index = Math.min(LEAGUES.length - 1, Math.floor(value / LEAGUE_SPAN));
  const floor = leagueFloor(index);
  if (index === LEAGUES.length - 1) {
    return { league: LEAGUES[index], index, division: null, trophies: value, floor, nextDivisionAt: null, nextLeagueAt: null, toNextDivision: null, toNextLeague: null };
  }
  const division = (1 + Math.min(2, Math.floor((value - floor) / DIVISION_SPAN))) as 1 | 2 | 3;
  const nextLeagueAt = floor + LEAGUE_SPAN;
  const nextDivisionAt = division < 3 ? floor + division * DIVISION_SPAN : nextLeagueAt;
  return { league: LEAGUES[index], index, division, trophies: value, floor, nextDivisionAt, nextLeagueAt, toNextDivision: nextDivisionAt - value, toNextLeague: nextLeagueAt - value };
}

const ROMAN = ["I", "II", "III"] as const;
export const divisionRoman = (division: 1 | 2 | 3 | null) => (division ? ROMAN[division - 1] : "");
