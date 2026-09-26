// Troféus e nível de jogo escondido (MMR) do Duelo. Lógica pura.
//
// Os troféus (o que a pessoa vê) rendem o mesmo em quase toda a escada: a vitória vale BASE_WIN e a derrota custa BASE_LOSS, com um
// extra na vitória pelo desempenho (acertos à frente do bot) e pela sequência. O MMR (o que a pessoa não vê) diz se ela joga melhor ou
// pior do que a liga em que está e é ele que faz os troféus render mais ou menos:
//  - jogando no nível da liga (ganhando e perdendo perto de 50%), o MMR segura a pessoa: ela sobe devagar, tem de provar mais;
//  - jogando acima da liga, ganha mais, perde menos e o sorteio passa a trazer bots de ligas mais altas (matchmaking pelo MMR);
//  - jogando abaixo, ganha menos e perde mais, com bots de ligas mais baixas.
// Só no alto (a partir do Diamante) a vitória começa a render menos e a derrota a custar mais: o teto teórico, que separa quem tem o
// melhor desempenho. Não há limite de troféus no Mestre, mas a curva vai se fechando.
import { LEAGUES, LEAGUE_SPAN, leagueFloor, leagueOf } from "./league.js";

export const expectedScore = (rating: number, opponent: number) => 1 / (1 + Math.pow(10, (opponent - rating) / 400));

/** Ganho e perda-base (com o MMR no nível da liga, sem sequência nem desempenho) de Bronze a Platina. Chute inicial, para ajustar jogando. */
export const BASE_WIN = 33;
export const BASE_LOSS = 27;
/** O teto da vitória é o ganho-base + isto (50 no começo): sequência e desempenho boostam até aí. */
export const WIN_CAP_EXTRA = 17;
/** Bônus por enfrentar bot de liga acima da sua, por liga de diferença (0, 1 ou 2): soma ao ganho e ao teto, então só a vitória sobre um bot
 *  duas ligas acima passa dos 50 (até 50 + 20 = 70). Quem joga acima da própria liga é sorteado com bots de ligas mais altas (matchmaking). */
export const LEAD_BONUS: readonly number[] = [0, 0, 20];
/** Bônus de desempenho: até PERF_MAX troféus quando a pessoa termina PERF_SPAN acertos (ou mais) à frente do bot. */
export const PERF_MAX = 8;
export const PERF_SPAN = 8;
/** Vitória e derrota rendem ao menos isto (no alto, onde a vitória encolhe, o piso da vitória é HIGH_MIN_WIN). */
export const MIN_WIN = 5;
export const MIN_LOSS = 5;
export const HIGH_MIN_WIN = 3;
/** A derrota apertada custa até 20% menos e a goleada até 10% mais. */
export const LOSS_CLOSE = 0.8;
export const LOSS_BLOWOUT = 1.1;

/** Alto elo: a partir de DECAY_START (o Diamante), a cada LEAGUE_SPAN troféus a vitória cai e a derrota sobe (e os bônus encolhem junto
 *  com a vitória). É o limite teórico: quanto mais alto, mais desempenho é preciso só para não descer. */
export const DECAY_START = leagueFloor(LEAGUES.indexOf("diamante"));
export const WIN_DECAY = 0.35;
export const LOSS_GROWTH = 0.15;

/** O MMR pesa por completo quando está GAP_SPAN troféus acima da pessoa (a vitória vai até +WIN_GAP e a derrota até −LOSS_GAP). Do lado de
 *  baixo, com os troféus à frente do MMR, o peso continua até GAP_DOWN vezes o vão (o MMR segura a subida). */
export const GAP_SPAN = 200;
export const GAP_DOWN = 3;
export const WIN_GAP = 0.35;
export const LOSS_GAP = 0.3;
export const WIN_FLOOR = 0.25;
/** Velocidade do MMR (Elo): o mesmo tamanho dos troféus, para os dois andarem juntos. Nas primeiras CALIB_GAMES partidas da escada o MMR anda
 *  mais depressa (K de MMR_K_START caindo até MMR_K), para achar o nível de quem chega dominando sem esperar dezenas de duelos. */
export const MMR_K = 64;
export const MMR_K_START = 160;
export const CALIB_GAMES = 20;
export const kFor = (games: number) => MMR_K + (MMR_K_START - MMR_K) * clamp01(1 - (Number.isFinite(games) ? games : CALIB_GAMES) / CALIB_GAMES);
/** Dominância: vencer por DOMINANCE_FROM+ acertos (cheio em DOMINANCE_FROM + DOMINANCE_SPAN) soma DOMINANCE pontos ao MMR mesmo contra bot fraco (e
 *  perder assim tira), o que deixa o MMR correr na frente dos troféus de quem domina. Some quando o MMR já está DOMINANCE_FADE acima do bot; sem esse
 *  limite o MMR fugia sem fim e o teto teórico deixava de existir. */
export const DOMINANCE = 30;
export const DOMINANCE_FROM = 4;
export const DOMINANCE_SPAN = 6;
export const DOMINANCE_FADE = 400;
/** Sequência de vitórias no MMR: a partir da 3ª vitória seguida, cada vitória a mais soma STREAK_MMR_STEP ao MMR (até STREAK_MMR_CAP), com o mesmo limite da
 *  dominância. Quem emenda vitórias está claramente acima da própria liga, e sem isso o MMR (que anda menos que os troféus) nunca o levava a bots mais fortes. */
export const STREAK_MMR_STEP = 6;
export const STREAK_MMR_CAP = 30;

/** Matchmaking pelo MMR: o bot sai da liga do MMR, no máximo MATCH_UP ligas acima da liga em troféus e nunca abaixo dela (quem está com o MMR
 *  atrás dos troféus enfrenta os bots mais fracos da própria liga, não os de uma liga inferior). */
export const MATCH_UP = 2;
export const MATCH_DOWN = 0;
/** Sequência quente: com HOT_STREAKS[0] vitórias seguidas o sorteio sobe uma liga e com HOT_STREAKS[1], duas (até MATCH_UP), mesmo que o MMR ainda
 *  não tenha alcançado a sequência. Perdeu, a sequência zera e o sorteio volta ao MMR. */
export const HOT_STREAKS: readonly number[] = [5, 10];

/** Versão da conta do MMR. O MMR de um registro só vale se ele foi gravado nesta versão; os anteriores contam o MMR como o próprio delta
 *  (assim mudar a conta não deixa o MMR de quem já jogou preso ao valor de uma fórmula antiga). */
export const MMR_MODEL = 3;

/** Sequência: cada vitória seguida que a pessoa já tinha na escada soma STREAK_STEP troféus à próxima vitória, até STREAK_CAP vitórias
 *  (+12). Perder zera a sequência; o bônus só existe na vitória, a derrota não muda. */
export const STREAK_STEP = 3;
export const STREAK_CAP = 4;
export const streakBonus = (streak: number) => STREAK_STEP * Math.min(STREAK_CAP, Math.max(0, Math.floor(Number.isFinite(streak) ? streak : 0)));

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Ganho e perda-base de quem está com esses troféus: iguais até a Platina e, no alto, encolhendo e crescendo com a altura. `scale` é quanto o
 *  ganho já encolheu (1 fora do alto): os bônus de sequência e desempenho encolhem na mesma proporção, senão furariam o limite. */
export function baseStakes(trophies: number) {
  const above = Math.max(0, trophies - DECAY_START) / LEAGUE_SPAN;
  if (above <= 0) return { win: BASE_WIN, loss: BASE_LOSS, scale: 1, minWin: MIN_WIN };
  const win = Math.max(HIGH_MIN_WIN, Math.round(BASE_WIN / (1 + WIN_DECAY * above)));
  return { win, loss: Math.round(BASE_LOSS * (1 + LOSS_GROWTH * above)), scale: Math.min(1, win / BASE_WIN), minWin: HIGH_MIN_WIN };
}

/** Quanto o MMR muda o ganho e a perda: `gap` é MMR menos troféus (positivo = joga melhor que a liga). */
export function gapFactors(gap: number) {
  const g = Math.min(1, Math.max(-GAP_DOWN, (Number.isFinite(gap) ? gap : 0) / GAP_SPAN));
  return { win: Math.max(WIN_FLOOR, 1 + WIN_GAP * g), loss: 1 - LOSS_GAP * g };
}

/** Com quem a pessoa enfrenta: a liga e a divisão do MMR (ou a liga da sequência quente, se maior), presas entre a liga em troféus (menos MATCH_DOWN) e MATCH_UP ligas acima dela. */
export function matchmaking(trophies: number, mmr: number, streak = 0) {
  const home = leagueOf(trophies).index;
  const hot = HOT_STREAKS.filter((need) => streak >= need).length;
  const wanted = Math.max(leagueOf(mmr).index, home + hot);
  const index = Math.min(LEAGUES.length - 1, Math.max(0, Math.min(home + MATCH_UP, Math.max(home - MATCH_DOWN, wanted))));
  const low = leagueFloor(index);
  return leagueOf(Math.min(low + LEAGUE_SPAN - 1, Math.max(low, Math.floor(Number.isFinite(mmr) ? mmr : 0))));
}

export type TrophyInput = {
  trophies: number;
  mmr: number;
  /** Vitórias seguidas que a pessoa já tinha na escada. */
  streak: number;
  outcome: "win" | "loss" | "draw";
  /** Acertos da pessoa menos os do bot. */
  margin: number;
  /** Quantas ligas o bot está acima da liga da pessoa (matchmaking pelo MMR); só a vitória usa. */
  lead?: number;
  /** Bônus por liga de diferença (sem valor, LEAD_BONUS). */
  leadBonus?: readonly number[];
};
export type TrophyChange = { delta: number; streakBonus: number; perfBonus: number };

/** Quanto o duelo mexe nos troféus (antes do chão em zero): o valor-base, o MMR, a sequência e o desempenho. */
export function trophyChange({ trophies, mmr, streak, outcome, margin, lead = 0, leadBonus = LEAD_BONUS }: TrophyInput): TrophyChange {
  const { win, loss, scale, minWin } = baseStakes(trophies);
  const factors = gapFactors(mmr - trophies);
  if (outcome === "win") {
    const base = Math.round(win * factors.win);
    // os bônus também encolhem quando os troféus estão à frente do MMR (senão sequência e desempenho furavam a "trava" do MMR)
    const hold = scale * Math.min(1, factors.win);
    const room = Math.max(0, win + Math.round(WIN_CAP_EXTRA * scale) - base);
    const streakApplied = Math.min(room, Math.round(streakBonus(streak) * hold));
    const perfApplied = Math.min(room - streakApplied, Math.round(PERF_MAX * hold * clamp01(margin / PERF_SPAN)));
    const leadExtra = Math.round((leadBonus[Math.min(Math.max(0, Math.floor(lead)), leadBonus.length - 1)] ?? 0) * scale);
    return { delta: Math.max(minWin, base + streakApplied + perfApplied + leadExtra), streakBonus: streakApplied, perfBonus: perfApplied };
  }
  if (outcome === "loss") {
    const severity = LOSS_CLOSE + (LOSS_BLOWOUT - LOSS_CLOSE) * clamp01((Math.abs(margin) - 1) / (PERF_SPAN + 1));
    return { delta: -Math.max(MIN_LOSS, Math.round(loss * factors.loss * severity)), streakBonus: 0, perfBonus: 0 };
  }
  return { delta: Math.round(0.5 * win * factors.win - 0.5 * loss * factors.loss), streakBonus: 0, perfBonus: 0 };
}

/** Quanto o duelo mexe no MMR: Elo contra a nota do bot, com o placar contando pelo desempenho (vitória apertada vale menos que goleada), K de calibração
 *  nas primeiras partidas da escada (`games` = duelos já jogados; sem valor, K normal), o bônus de dominância e o da sequência de vitórias (`streak` = as que a
 *  pessoa já tinha antes deste duelo). */
export function mmrChange(mmr: number, opponent: number, outcome: "win" | "loss" | "draw", margin: number, games = CALIB_GAMES, streak = 0) {
  const score = outcome === "win" ? 0.85 + 0.15 * clamp01(margin / PERF_SPAN)
    : outcome === "loss" ? 0.15 * (1 - clamp01(Math.abs(margin) / PERF_SPAN))
      : 0.5;
  const crush = outcome === "draw" ? 0 : clamp01((Math.abs(margin) - DOMINANCE_FROM) / DOMINANCE_SPAN) * (outcome === "win" ? 1 : -1);
  const fade = clamp01(1 - (mmr - opponent) / DOMINANCE_FADE);
  const hot = outcome === "win" ? Math.min(STREAK_MMR_CAP, STREAK_MMR_STEP * Math.max(0, Math.floor(Number.isFinite(streak) ? streak : 0) - 2)) : 0;
  return Math.round(kFor(games) * (score - expectedScore(mmr, opponent)) + DOMINANCE * crush * fade + hot * fade);
}

/** O que está em jogo antes do duelo, como faixa: vitória de `win[0]` (apertada) a `win[1]` (goleada); derrota de `loss[0]` (apertada) a
 *  `loss[1]` (goleada, negativos). O chão em zero vale nas duas. */
export function stakesRange(trophies: number, mmr: number, streak = 0, lead = 0) {
  const floor = (delta: number) => Math.max(0, trophies + delta) - Math.max(0, trophies);
  const at = (outcome: "win" | "loss", margin: number) => floor(trophyChange({ trophies, mmr, streak, outcome, margin, lead }).delta);
  return { win: [at("win", 0), at("win", PERF_SPAN)] as [number, number], loss: [at("loss", -1), at("loss", -(PERF_SPAN + 2))] as [number, number] };
}
