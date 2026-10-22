// Aba "Duelos" do Progresso (22/10/2026, mock ../mockups-carta-cega/duelo-stats, aprovado pelo Enzo: "queria ver meu desempenho/estatística vs
// bots e players"). Contas puras sobre os registros dos duelos (test:duel-stats).
import { botById, mulberry32, hashSeed, simulateBot, type BotStyle } from "./bots.js";
import { groupDef, type Ladder, type ModeGroup } from "./duel-modes.js";
import { mmrFromDuels, type DuelRecord } from "./duel.js";
import { timerSecondsFor } from "./pace.js";
import type { LadderEntry } from "./pvp-trophies.js";
import type { PvpMatchRecord } from "./pvp-store.js";

/** Você × bot num modo: acertos, tempo (só dos tempos com o tempo do bot gravado) e quantos tempos de duelo você levou. */
export type ModeStat = { group: ModeGroup; rounds: number; you: number; bot: number; youMs: number; botMs: number; msRounds: number; legs: number; legWins: number };
export type StyleStat = { style: BotStyle; duels: number; wins: number };
export type RivalStat = { botId: string; duels: number; wins: number; losses: number; delta: number };
export type PerfPoint = { at: number; perf: number };
export type LadderStats = {
  duels: number; wins: number; losses: number; draws: number; tiebreakWins: number;
  /** Rating de desempenho nos últimos 20 (o R que explica as vitórias contra os adversários enfrentados). */
  perf20: number | null;
  last20: { wins: number; duels: number };
  modes: ModeStat[]; styles: StyleStat[]; rivals: RivalStat[];
  /** O desempenho em janelas de 20 duelos, de 10 em 10, a última terminando no mais recente. */
  windows: PerfPoint[];
};

const score = (outcome: string) => (outcome === "win" ? 1 : outcome === "draw" ? 0.5 : 0);
const finished = (duel: DuelRecord) => !duel.abandoned;

/** O rating que faz a soma das expectativas (Elo) igual ao placar. */
export function performanceRating(games: readonly { opp: number; score: number }[]): number | null {
  if (!games.length) return null;
  const wins = games.reduce((sum, game) => sum + game.score, 0);
  // tudo ganho ou tudo perdido não tem solução finita: conta como 97% ou 3%
  const target = Math.min(games.length * 0.97, Math.max(games.length * 0.03, wins));
  let rating = games.reduce((sum, game) => sum + game.opp, 0) / games.length;
  for (let step = 0; step < 60; step += 1) { // Newton
    let expected = 0, slope = 0;
    for (const game of games) { const p = 1 / (1 + 10 ** ((game.opp - rating) / 400)); expected += p; slope += p * (1 - p) * Math.LN10 / 400; }
    const move = Math.max(-400, Math.min(400, (target - expected) / Math.max(slope, 1e-6)));
    rating += move;
    if (Math.abs(move) < 0.01) break;
  }
  return Math.round(rating);
}

/** Os duelos com o rating do adversário: o MMR da pessoa antes de cada um (somando os registros anteriores, ajustes inclusos) e o que o Elo
 *  esperava (`mmrExp`) dão o rating que o adversário tinha naquela conta. Duelos sem a expectativa gravada ficam de fora. */
export function ratedGames(duels: readonly DuelRecord[], entries: readonly LadderEntry[], ladder: Ladder) {
  const sorted = [...entries].sort((a, b) => a.at - b.at);
  return duels.filter((duel) => duel.ladder === ladder && finished(duel) && typeof duel.mmrExp === "number" && duel.mmrExp > 0 && duel.mmrExp < 1).map((duel) => {
    const mmr = mmrFromDuels(sorted.filter((entry) => entry.at < duel.at), ladder);
    return { at: duel.at, opp: mmr - 400 * Math.log10(1 / (duel.mmrExp as number) - 1), score: score(duel.outcome) };
  });
}

export function ladderStats(allDuels: readonly DuelRecord[], entries: readonly LadderEntry[], ladder: Ladder): LadderStats {
  const duels = allDuels.filter((duel) => duel.ladder === ladder && finished(duel)).sort((a, b) => a.at - b.at);
  const games = ratedGames(duels, entries, ladder).sort((a, b) => a.at - b.at);
  const modes = new Map<ModeGroup, ModeStat>();
  const styles = new Map<BotStyle, StyleStat>();
  const rivals = new Map<string, RivalStat>();
  for (const duel of duels) {
    for (const leg of duel.legs ?? []) {
      const mode = modes.get(leg.group) ?? { group: leg.group, rounds: 0, you: 0, bot: 0, youMs: 0, botMs: 0, msRounds: 0, legs: 0, legWins: 0 };
      mode.rounds += leg.total; mode.you += leg.playerCorrect; mode.bot += leg.botCorrect; mode.legs += 1;
      const youMs = typeof leg.playerMs === "number" ? leg.playerMs : null;
      const botMs = typeof leg.botMs === "number" ? leg.botMs : null;
      if (leg.playerCorrect > leg.botCorrect || (leg.playerCorrect === leg.botCorrect && youMs !== null && botMs !== null && youMs < botMs)) mode.legWins += 1;
      if (youMs !== null && botMs !== null) { mode.youMs += youMs; mode.botMs += botMs; mode.msRounds += leg.total; }
      modes.set(leg.group, mode);
    }
    const bot = botById(duel.botId);
    if (bot) {
      const style = styles.get(bot.style) ?? { style: bot.style, duels: 0, wins: 0 };
      style.duels += 1; style.wins += score(duel.outcome);
      styles.set(bot.style, style);
    }
    const rival = rivals.get(duel.botId) ?? { botId: duel.botId, duels: 0, wins: 0, losses: 0, delta: 0 };
    rival.duels += 1; rival.delta += duel.delta;
    if (duel.outcome === "win") rival.wins += 1; else if (duel.outcome === "loss") rival.losses += 1;
    rivals.set(duel.botId, rival);
  }
  const windows: PerfPoint[] = [];
  for (let end = games.length; end >= 20; end -= 10) windows.unshift({ at: games[end - 1].at, perf: performanceRating(games.slice(end - 20, end)) as number });
  const last20 = duels.slice(-20);
  return {
    duels: duels.length,
    wins: duels.filter((duel) => duel.outcome === "win").length,
    losses: duels.filter((duel) => duel.outcome === "loss").length,
    draws: duels.filter((duel) => duel.outcome === "draw").length,
    tiebreakWins: duels.filter((duel) => duel.tiebreak && duel.outcome === "win").length,
    perf20: performanceRating(games.slice(-20)),
    last20: { wins: last20.filter((duel) => duel.outcome === "win").length, duels: last20.length },
    modes: [...modes.values()].sort((a, b) => b.rounds - a.rounds),
    styles: [...styles.values()].sort((a, b) => b.duels - a.duels),
    rivals: [...rivals.values()].sort((a, b) => b.duels - a.duels || b.wins - a.wins).slice(0, 6),
    windows,
  };
}

/** A força pelos acertos e pelo tempo: a de um bot "constante" que empataria (50%) com a pessoa nestes duelos, cada um com os mesmos tempos
 *  (modo e rodadas) e a regra do jogo (mais acertos vence, empate no tempo). Busca binária sobre uma simulação com semente fixa (o número não
 *  muda a cada abertura). Precisa de ao menos 5 duelos com o tempo da pessoa gravado em todos os tempos. */
export const SKILL_SIMS = 60;
export function estimatedSkill(duels: readonly DuelRecord[], sims = SKILL_SIMS): number | null {
  const usable = duels.filter((duel) => finished(duel) && duel.legs?.length && duel.legs.every((leg) => typeof leg.playerMs === "number"));
  if (usable.length < 5) return null;
  const winRate = (rating: number) => {
    let wins = 0, games = 0;
    for (const duel of usable) {
      const yourMs = (duel.legs ?? []).reduce((sum, leg) => sum + (leg.playerMs as number), 0);
      for (let sim = 0; sim < sims; sim += 1) {
        const random = mulberry32(hashSeed(`skill:${duel.id}:${sim}`));
        const form = 160 * Math.sqrt(-2 * Math.log(Math.max(1e-9, random()))) * Math.cos(2 * Math.PI * random());
        const bot = { id: "eq", name: "", league: "grao-mestre" as const, style: "constante" as const, specialty: null, skill: rating + form };
        let correct = 0, ms = 0;
        (duel.legs ?? []).forEach((leg, index) => {
          const def = groupDef(leg.group);
          const result = simulateBot(bot, leg.total, `skill:${duel.id}:${sim}:${index}`, { division: null, own: true, form: 0, family: def.botFamily, neutral: def.neutral, specialtyWeight: def.specialtyWeight, tuning: { accuracy: def.accuracy, time: def.time }, kind: def.kind, limitMs: timerSecondsFor(def.variants[0].variant) * 1000, leg: index });
          correct += result.correct; ms += result.totalMs;
        });
        wins += duel.playerCorrect > correct || (duel.playerCorrect === correct && yourMs < ms) ? 1 : duel.playerCorrect === correct && yourMs === ms ? 0.5 : 0;
        games += 1;
      }
    }
    return wins / games;
  };
  let low = 0, high = 4300;
  for (let step = 0; step < 13; step += 1) { const mid = (low + high) / 2; if (winRate(mid) > 0.5) low = mid; else high = mid; }
  return Math.round((low + high) / 2 / 10) * 10;
}

/** Duelos da pessoa contra ela mesma (22/10/2026, o Enzo viu "Mr. Mussar-Ellah contra mim mesmo" no celular): o amistoso de teste entre dois
 *  aparelhos dela, de antes de um deles entrar na conta. Cada aparelho guardou o próprio lado com o mesmo id e a sincronização (união por id) não
 *  sobrescreve: num aparelho o adversário é o nome da própria conta, no outro, a identidade anônima do outro aparelho. Ficam fora da aba: pelo
 *  nome (o adversário com um nome da própria pessoa) e, na conta do Enzo, pelo id do duelo (o lado do PC diz "Habin", o celular de antes). */
export const SELF_PVP: readonly { account: number; ids: readonly string[] }[] = [
  { account: 3176936172, ids: ["pvp:4YSP4J"] },
];
export function selfPvp(username: string, ownNames: readonly string[]): (match: PvpMatchRecord) => boolean {
  const account = username ? hashSeed(`conta:${username.trim().toLowerCase()}`) : null;
  const ids = new Set(SELF_PVP.find((entry) => entry.account === account)?.ids ?? []);
  const names = new Set(ownNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  return (match) => ids.has(match.id) || names.has(match.opponentName.trim().toLowerCase());
}

/** Contra pessoas: placar, acertos e tempo por resposta dos dois lados, e com quem a pessoa jogou. */
export type PeopleStats = { duels: number; ranked: number; wins: number; losses: number; draws: number; you: number; them: number; youMs: number | null; themMs: number | null; rivals: { name: string; code?: string; duels: number; wins: number; losses: number }[] };
export function peopleStats(matches: readonly PvpMatchRecord[], isSelf: (match: PvpMatchRecord) => boolean = () => false): PeopleStats {
  const list = matches.filter((match) => !isSelf(match)).sort((a, b) => a.at - b.at);
  const timed = list.filter((match) => typeof match.youMs === "number" && typeof match.opponentMs === "number");
  const timedRounds = timed.reduce((sum, match) => sum + match.totalRounds, 0);
  const rivals = new Map<string, PeopleStats["rivals"][number]>();
  // registro antigo sem o código de amigo: junta com o do mesmo nome que tem código
  const codeOfName = new Map(list.filter((match) => match.opponentCode).map((match) => [match.opponentName, match.opponentCode as string]));
  for (const match of list) {
    const key = match.opponentCode ?? codeOfName.get(match.opponentName) ?? match.opponentName;
    const rival = rivals.get(key) ?? { name: match.opponentName, ...(match.opponentCode ? { code: match.opponentCode } : {}), duels: 0, wins: 0, losses: 0 };
    rival.name = match.opponentName || rival.name;
    if (match.opponentCode) rival.code = match.opponentCode;
    rival.duels += 1;
    if (match.outcome === "win") rival.wins += 1; else if (match.outcome === "loss") rival.losses += 1;
    rivals.set(key, rival);
  }
  return {
    duels: list.length,
    ranked: list.filter((match) => match.mode === "ranked").length,
    wins: list.filter((match) => match.outcome === "win").length,
    losses: list.filter((match) => match.outcome === "loss").length,
    draws: list.filter((match) => match.outcome === "draw").length,
    you: list.length ? list.reduce((sum, match) => sum + match.youCorrect, 0) / list.length : 0,
    them: list.length ? list.reduce((sum, match) => sum + match.opponentCorrect, 0) / list.length : 0,
    youMs: timedRounds ? timed.reduce((sum, match) => sum + (match.youMs as number), 0) / timedRounds : null,
    themMs: timedRounds ? timed.reduce((sum, match) => sum + (match.opponentMs as number), 0) / timedRounds : null,
    rivals: [...rivals.values()].sort((a, b) => b.duels - a.duels).slice(0, 8),
  };
}
