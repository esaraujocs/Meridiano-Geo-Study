// Troféus e nível de jogo escondido (MMR) do Duelo. Lógica pura.
//
// Os troféus (o que a pessoa vê) rendem o mesmo em quase toda a escada: a vitória vale BASE_WIN e a derrota custa BASE_LOSS, com um extra na
// vitória pelo desempenho (acertos à frente do bot) e pela sequência. O MMR (o que a pessoa não vê) diz se ela joga melhor ou pior do que a liga
// em que está e é ele que faz os troféus render mais ou menos: jogando no nível da liga (~50%) o MMR segura a pessoa, acima da liga ela ganha
// mais e perde menos, abaixo o contrário. Só no alto (a partir do Diamante) a vitória começa a render menos e a derrota a custar mais: o teto teórico.
//
// O MMR vem com uma incerteza (sigma), como no Glicko/TrueSkill: começa alta e cai a cada duelo, e o passo do MMR (K) acompanha a incerteza. Quando
// os resultados fogem do esperado (uma "surpresa": vitórias demais, ou derrotas demais, para a força dos bots enfrentados) a incerteza volta a subir e
// o MMR passa a andar depressa até se acertar. O adversário é escolhido pelo MMR mais um otimismo proporcional à incerteza (quem está em
// surpresa positiva enfrenta bots mais fortes, em negativa, mais fracos), e a força do bot é contínua: acompanha o rating sorteado, sem saltos de liga.
import { LEAGUES, LEAGUE_SPAN, leagueFloor, leagueOf } from "./league.js";

export const expectedScore = (rating: number, opponent: number) => 1 / (1 + Math.pow(10, (opponent - rating) / 400));

/** Ganho e perda-base (com o MMR no nível da liga, sem sequência nem desempenho) de Bronze a Platina. Chute inicial, para ajustar jogando. */
export const BASE_WIN = 33;
export const BASE_LOSS = 27;
/** O teto da vitória é o ganho-base + isto (50 no começo): sequência e desempenho boostam até aí. */
export const WIN_CAP_EXTRA = 17;
/** Bônus por enfrentar um bot acima do nível da pessoa, crescente e sem degraus: LEAD_PER_LEAGUE troféus por liga de diferença (500 troféus de rating
 *  acima dos troféus da pessoa), até LEAD_MAX ligas. Soma ao ganho e ao teto, então com o bot meia liga acima o teto já passa dos 50 e só com um bot duas
 *  ligas acima chega a 50 + 20 = 70. */
export const LEAD_PER_LEAGUE = 10;
export const LEAD_MAX = 2;
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

/** Incerteza do MMR (sigma, na escala dos troféus): começa em SIGMA_START, cai a cada duelo (x SIGMA_DECAY) até SIGMA_MIN e o passo do MMR (K) vai
 *  de K_MIN (incerteza mínima) a K_MAX (máxima). K_MIN é o passo de um MMR já assentado, do tamanho dos troféus, para os dois andarem juntos. */
export const K_MIN = 64;
export const K_MAX = 160;
export const SIGMA_MIN = 60;
export const SIGMA_MAX = 250;
export const SIGMA_START = 250;
export const SIGMA_DECAY = 0.93;
/** Surpresa: nos últimos SURPRISE_WINDOW duelos (com ao menos SURPRISE_MIN), vitórias reais menos esperadas dividido pelo desvio esperado (z). A
 *  incerteza sobe a partir de |z| = SURPRISE_FROM e chega ao máximo em SURPRISE_FULL. */
export const SURPRISE_WINDOW = 10;
export const SURPRISE_MIN = 3;
export const SURPRISE_FROM = 1.5;
export const SURPRISE_FULL = 3.5;

/** Matchmaking: o rating do bot é o MMR mais OPTIMISM x (sigma - SIGMA_MIN), para cima em surpresa positiva e para baixo na negativa, preso entre o
 *  começo da liga da pessoa (nunca abaixo dela) e o fim da liga MATCH_UP acima (no Mestre, MASTER_MATCH_SPAN troféus além do começo). */
export const OPTIMISM = 1;
export const MATCH_UP = 2;
export const MASTER_MATCH_SPAN = 1000;

/** Versão da conta do MMR. O MMR de um registro só vale se ele foi gravado numa versão de MMR_VALID_MODELS; os anteriores contam o MMR como o próprio
 *  delta (assim mudar a conta não deixa o MMR de quem já jogou preso ao valor de uma fórmula antiga). A 4 acrescenta a incerteza e a esperança de cada
 *  duelo; os registros da 3 continuam valendo para o MMR e a incerteza deles vem da contagem de duelos. */
export const MMR_MODEL = 4;
export const MMR_VALID_MODELS: readonly number[] = [3, 4];

/** Sequência: cada vitória seguida que a pessoa já tinha na escada soma STREAK_STEP troféus à próxima vitória, até STREAK_CAP vitórias
 *  (+12). Perder zera a sequência; o bônus só existe na vitória, a derrota não muda. */
export const STREAK_STEP = 3;
export const STREAK_CAP = 4;
export const streakBonus = (streak: number) => STREAK_STEP * Math.min(STREAK_CAP, Math.max(0, Math.floor(Number.isFinite(streak) ? streak : 0)));

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Quantas ligas o rating do bot está acima dos troféus da pessoa (0 se está abaixo), até LEAD_MAX. */
export const leadOf = (rating: number, trophies: number) => clamp(((Number.isFinite(rating) ? rating : 0) - (Number.isFinite(trophies) ? trophies : 0)) / LEAGUE_SPAN, 0, LEAD_MAX);

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

// ---- incerteza e surpresa ----
/** Passo do MMR para uma incerteza (de K_MIN a K_MAX). */
export const kFor = (sigma: number) => K_MIN + (K_MAX - K_MIN) * clamp01(((Number.isFinite(sigma) ? sigma : SIGMA_MIN) - SIGMA_MIN) / (SIGMA_MAX - SIGMA_MIN));
/** Incerteza de quem já jogou `games` duelos e não teve surpresa nenhuma (para os registros sem incerteza gravada). */
export const sigmaFromGames = (games: number) => Math.max(SIGMA_MIN, SIGMA_START * Math.pow(SIGMA_DECAY, Math.max(0, Number.isFinite(games) ? games : 0)));

/** Um duelo para a conta da surpresa: o que aconteceu (1 vitória, 0 derrota, 0,5 empate) e o que o MMR esperava. */
export type SurpriseSample = { score: number; expected: number };
export const outcomeScore = (outcome: "win" | "loss" | "draw") => (outcome === "win" ? 1 : outcome === "loss" ? 0 : 0.5);

/** Surpresa (z) dos últimos duelos: positiva se a pessoa venceu mais do que o MMR esperava, negativa se menos; 0 com poucos duelos. */
export function surprise(samples: readonly SurpriseSample[]) {
  const recent = samples.slice(-SURPRISE_WINDOW);
  if (recent.length < SURPRISE_MIN) return 0;
  const excess = recent.reduce((sum, sample) => sum + sample.score - sample.expected, 0);
  const variance = recent.reduce((sum, sample) => sum + sample.expected * (1 - sample.expected), 0);
  return excess / Math.sqrt(Math.max(variance, 0.5));
}

/** Incerteza depois de um duelo: cai um pouco e volta a subir se a surpresa dos últimos duelos (com este) foi grande. */
export function sigmaNext(sigma: number, samples: readonly SurpriseSample[]) {
  const settled = Math.max(SIGMA_MIN, (Number.isFinite(sigma) ? sigma : SIGMA_MIN) * SIGMA_DECAY);
  const pushed = SIGMA_MIN + (SIGMA_MAX - SIGMA_MIN) * clamp01((Math.abs(surprise(samples)) - SURPRISE_FROM) / (SURPRISE_FULL - SURPRISE_FROM));
  return Math.min(SIGMA_MAX, Math.max(settled, pushed));
}

// ---- matchmaking ----
/** Rating do bot que a pessoa enfrenta: o MMR mais o otimismo pela incerteza (para cima com surpresa positiva ou nula, para baixo com a negativa),
 *  preso entre o começo da liga da pessoa e o fim da liga MATCH_UP acima. */
export function matchRating(trophies: number, mmr: number, sigma = SIGMA_MIN, z = 0) {
  const home = leagueOf(trophies).index;
  const topIndex = Math.min(LEAGUES.length - 1, home + MATCH_UP);
  const high = leagueFloor(topIndex) + (topIndex === LEAGUES.length - 1 ? MASTER_MATCH_SPAN : LEAGUE_SPAN) - 1;
  const bump = OPTIMISM * Math.max(0, (Number.isFinite(sigma) ? sigma : SIGMA_MIN) - SIGMA_MIN) * (z < 0 ? -1 : 1);
  return Math.round(clamp((Number.isFinite(mmr) ? mmr : 0) + bump, leagueFloor(home), high));
}
/** O adversário: a liga e a divisão do rating sorteado (o bot sai dessa liga) e o próprio rating, que decide a força dele. */
export function matchmaking(trophies: number, mmr: number, sigma = SIGMA_MIN, z = 0) {
  const rating = matchRating(trophies, mmr, sigma, z);
  return { ...leagueOf(rating), rating };
}

// ---- troféus ----
export type TrophyInput = {
  trophies: number;
  mmr: number;
  /** Vitórias seguidas que a pessoa já tinha na escada. */
  streak: number;
  outcome: "win" | "loss" | "draw";
  /** Acertos da pessoa menos os do bot. */
  margin: number;
  /** Quantas ligas o bot está acima da pessoa (ver leadOf; pode ser fracionário); só a vitória usa. */
  lead?: number;
  /** Bônus por liga de diferença (sem valor, LEAD_PER_LEAGUE). */
  leadBonus?: number;
};
export type TrophyChange = { delta: number; streakBonus: number; perfBonus: number };

/** Quanto o duelo mexe nos troféus (antes do chão em zero): o valor-base, o MMR, a sequência e o desempenho. */
export function trophyChange({ trophies, mmr, streak, outcome, margin, lead = 0, leadBonus = LEAD_PER_LEAGUE }: TrophyInput): TrophyChange {
  const { win, loss, scale, minWin } = baseStakes(trophies);
  const factors = gapFactors(mmr - trophies);
  if (outcome === "win") {
    const base = Math.round(win * factors.win);
    // os bônus também encolhem quando os troféus estão à frente do MMR (senão sequência e desempenho furavam a "trava" do MMR)
    const hold = scale * Math.min(1, factors.win);
    const room = Math.max(0, win + Math.round(WIN_CAP_EXTRA * scale) - base);
    const streakApplied = Math.min(room, Math.round(streakBonus(streak) * hold));
    const perfApplied = Math.min(room - streakApplied, Math.round(PERF_MAX * hold * clamp01(margin / PERF_SPAN)));
    const leadExtra = Math.round(clamp(Number.isFinite(lead) ? lead : 0, 0, LEAD_MAX) * leadBonus * scale);
    return { delta: Math.max(minWin, base + streakApplied + perfApplied + leadExtra), streakBonus: streakApplied, perfBonus: perfApplied };
  }
  if (outcome === "loss") {
    const severity = LOSS_CLOSE + (LOSS_BLOWOUT - LOSS_CLOSE) * clamp01((Math.abs(margin) - 1) / (PERF_SPAN + 1));
    return { delta: -Math.max(MIN_LOSS, Math.round(loss * factors.loss * severity)), streakBonus: 0, perfBonus: 0 };
  }
  return { delta: Math.round(0.5 * win * factors.win - 0.5 * loss * factors.loss), streakBonus: 0, perfBonus: 0 };
}

/** Quanto o duelo mexe no MMR: Elo contra o rating do bot, com o placar contando pelo desempenho (vitória apertada vale menos que goleada) e o
 *  passo K vindo da incerteza (`sigma`; sem valor, a mínima). */
export function mmrChange(mmr: number, opponent: number, outcome: "win" | "loss" | "draw", margin: number, sigma = SIGMA_MIN) {
  const score = outcome === "win" ? 0.85 + 0.15 * clamp01(margin / PERF_SPAN)
    : outcome === "loss" ? 0.15 * (1 - clamp01(Math.abs(margin) / PERF_SPAN))
      : 0.5;
  return Math.round(kFor(sigma) * (score - expectedScore(mmr, opponent)));
}

/** O que está em jogo antes do duelo, como faixa: vitória de `win[0]` (apertada) a `win[1]` (goleada); derrota de `loss[0]` (apertada) a
 *  `loss[1]` (goleada, negativos). O chão em zero vale nas duas. */
export function stakesRange(trophies: number, mmr: number, streak = 0, lead = 0) {
  const floor = (delta: number) => Math.max(0, trophies + delta) - Math.max(0, trophies);
  const at = (outcome: "win" | "loss", margin: number) => floor(trophyChange({ trophies, mmr, streak, outcome, margin, lead }).delta);
  return { win: [at("win", 0), at("win", PERF_SPAN)] as [number, number], loss: [at("loss", -1), at("loss", -(PERF_SPAN + 2))] as [number, number] };
}
