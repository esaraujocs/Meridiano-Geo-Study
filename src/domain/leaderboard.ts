// Ranking do Duelo: pessoas do servidor e bots simulados, com troféus próprios de cada escada.
import { BOTS, hashSeed, mulberry32, type Bot } from "./bots.js";
import { LEAGUES, leagueFloor, leagueOf, type LeagueKey } from "./league.js";
import type { Ladder } from "./duel-modes.js";

export const DAY_MS = 86_400_000;
export const dayNumber = (now = Date.now()) => Math.floor(now / DAY_MS);

/** Onde cada bot fica dentro da liga dele (troféus acima do começo da liga); os do Mestre (sem teto) vão mais longe. */
const OFFSETS = [70, 170, 260, 350, 440] as const;
const MASTER_OFFSETS = [100, 350, 600, 850, 1100] as const;
/** Quanto os troféus do bot variam de um dia para o outro (para cima ou para baixo). */
export const DAILY_SWING = 30;

/** Troféus do bot naquela escada e naquele dia: a posição fixa dele na liga mais uma variação sorteada pelo dia. */
export function botTrophies(bot: Bot, ladder: Ladder, day: number) {
  const index = LEAGUES.indexOf(bot.league);
  const slot = Math.max(0, Number(bot.id.split("-").pop()) || 0);
  const offset = (bot.league === "mestre" ? MASTER_OFFSETS : OFFSETS)[Math.min(slot, OFFSETS.length - 1)];
  const swing = (mulberry32(hashSeed(`rank:${bot.id}:${ladder}:${day}`))() - 0.5) * 2 * DAILY_SWING;
  return Math.max(leagueFloor(index) + 5, Math.round(leagueFloor(index) + offset + swing));
}

/** `code`: código de amigo (só no ranking com gente de verdade; abre o perfil). */
export type RankRow = { pos: number; id: string; name: string; trophies: number; league: LeagueKey; you: boolean; bot: boolean; code?: string };

/** A lista completa, do primeiro ao último: os bots e a pessoa (em empate a pessoa fica na frente). */
export function leaderboard(ladder: Ladder, trophies: number, day = dayNumber()): RankRow[] {
  const rows = BOTS.map((bot) => { const value = botTrophies(bot, ladder, day); return { id: bot.id, name: bot.name, trophies: value, league: leagueOf(value).league, you: false, bot: true }; });
  const me = { id: "you", name: "", trophies: Math.max(0, Math.round(trophies)), league: leagueOf(trophies).league, you: true, bot: false };
  return [...rows, me]
    .sort((a, b) => b.trophies - a.trophies || Number(b.you) - Number(a.you) || (a.id < b.id ? -1 : 1))
    .map((row, index) => ({ ...row, pos: index + 1 }));
}

/** O ranking com gente de verdade: a lista do servidor com a linha da pessoa trocada pelos troféus de agora (os do servidor são os que o aparelho
 *  informou por último). Sem a pessoa na lista (nunca jogou contra pessoas, ou sem conexão), ela entra assim mesmo. */
export function playersLeaderboard(rows: readonly { name: string; trophies: number; you: boolean; code?: string }[], trophies: number): RankRow[] {
  const others = rows.filter((row) => !row.you).map((row, index) => ({ id: `p${index}`, name: row.name, trophies: Math.max(0, Math.round(row.trophies)), league: leagueOf(row.trophies).league, you: false, bot: false, ...(row.code ? { code: row.code } : {}) }));
  const me = { id: "you", name: "", trophies: Math.max(0, Math.round(trophies)), league: leagueOf(trophies).league, you: true, bot: false };
  return [...others, me]
    .sort((a, b) => b.trophies - a.trophies || Number(b.you) - Number(a.you) || (a.id < b.id ? -1 : 1))
    .map((row, index) => ({ ...row, pos: index + 1 }));
}

/** Ranking global misto. Preserva os perfis humanos, uma única linha local e os bots
 * da escada; posições são calculadas depois de juntar e ordenar todos os participantes. */
export function globalLeaderboard(
  ladder: Ladder,
  rows: Parameters<typeof playersLeaderboard>[0],
  trophies: number,
  day = dayNumber(),
): RankRow[] {
  const bots = leaderboard(ladder, trophies, day).filter((row) => row.bot);
  const players = playersLeaderboard(rows, trophies).map((row) => ({
    ...row, id: row.code && !row.you ? `player:${row.code}` : row.id,
  }));
  return [...bots, ...players]
    .sort((a, b) => b.trophies - a.trophies || Number(b.you) - Number(a.you) || a.id.localeCompare(b.id))
    .map((row, index) => ({ ...row, pos: index + 1 }));
}

export type RankLine = RankRow | { gap: true };
/** O que cabe numa tela pequena: os `top` primeiros e, se a pessoa está mais abaixo, um corte e a linha dela. */
export function rankWindow(rows: readonly RankRow[], top: number): RankLine[] {
  const head = rows.slice(0, top);
  const me = rows.find((row) => row.you);
  if (!me || me.pos <= top) return head;
  return [...head, ...(me.pos > top + 1 ? [{ gap: true as const }] : []), me];
}
