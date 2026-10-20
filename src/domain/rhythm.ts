// "Seu ritmo" e a aba Modos do Progresso (20/10/2026, pedido do Enzo depois da análise de erro por horário: "quero que apliquemos o seu ritmo na
// interface"; mock em ../mockups-carta-cega/progresso-v1). Lógica pura: tudo sai das rodadas que já são gravadas (a hora de cada resposta,
// `answeredAt`, e o tempo, `responseTimeMs`); nada novo é guardado.
//
// O acerto de um horário é medido contra o **normal de cada modo** (`rel`: a média de acerto − o acerto médio do modo da rodada): sem isso, um
// horário em que se joga mais capital escrita pareceria pior só pelo modo. O Treino fica de fora (sem cronômetro, o tempo não diz nada).
import { LEGACY_VARIANT } from "./divisions.js";

export type RhythmFamily = "bandeiras" | "mapa" | "capitais" | "povos" | "divisoes" | "epocas";
export const RHYTHM_FAMILIES: readonly RhythmFamily[] = ["bandeiras", "mapa", "capitais", "povos", "divisoes", "epocas"];
export type RhythmFilter = RhythmFamily | "todos";

/** A família do Hub e o modo (a chave de `t.modes`) de uma partida; os dois sentidos das bandeiras, das históricas e das bandeiras dos estados contam
 *  juntos. Família fora do Hub (ou desconhecida) devolve nulo. */
export function rhythmMode(family: string, variant: string): { family: RhythmFamily; mode: string } | null {
  switch (family) {
    case "bandeiras": return { family: "bandeiras", mode: "atuais" };
    case "historicas": return { family: "bandeiras", mode: "historicas" };
    case "escrita": return variant === "escrita-capital" ? { family: "capitais", mode: "escrita-capital" } : { family: "bandeiras", mode: "escrita-pais" };
    case "capitais": return { family: "capitais", mode: "capital-pais" };
    case "mapa": return { family: "mapa", mode: "mapa" };
    case "silhueta": return { family: "mapa", mode: variant === "silhueta" ? "silhueta" : "silhueta-opcoes" };
    case "travel": return { family: "mapa", mode: "travel" };
    case "idiomas": case "gentilicos": case "moedas": return variant ? { family: "povos", mode: variant } : null;
    case "divisoes": case "brasil": case "epocas": {
      const v = LEGACY_VARIANT[variant] ?? variant;
      if (!v.startsWith("dv-")) return null;
      return { family: family === "epocas" ? "epocas" : "divisoes", mode: v === "dv-nome-bandeira" || v === "dv-bandeira-nome" ? "dv-bandeiras" : v };
    }
    default: return null;
  }
}

/** O que o Seu ritmo e os Modos leem de uma partida (`SurfaceSession` serve). */
export type RhythmSession = {
  family: string; variant: string; startedAt: number | null; duelId?: string; pace?: string;
  rounds: ReadonlyArray<{ correct: boolean; responseTimeMs: number | null; answeredAt?: number }>;
};
export type RhythmRound = { at: number; correct: boolean; ms: number | null; family: RhythmFamily; mode: string; training: boolean; duel: boolean };

/** As rodadas com hora, na ordem: a hora é a da resposta (sem ela, a do começo da partida). */
export function rhythmRounds(sessions: readonly RhythmSession[]): RhythmRound[] {
  const out: RhythmRound[] = [];
  for (const session of sessions) {
    const kind = rhythmMode(session.family, session.variant);
    if (!kind) continue;
    for (const round of session.rounds) {
      const at = typeof round.answeredAt === "number" ? round.answeredAt : session.startedAt;
      if (typeof at !== "number" || !Number.isFinite(at)) continue;
      out.push({ at, correct: Boolean(round.correct), ms: typeof round.responseTimeMs === "number" ? round.responseTimeMs : null, family: kind.family, mode: `${kind.family}:${kind.mode}`, training: session.pace === "training", duel: Boolean(session.duelId) });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** O relógio do aparelho (a hora local); os testes passam um fixo. */
export type Clock = { hour: (at: number) => number; weekday: (at: number) => number; day: (at: number) => string };
export const localClock: Clock = {
  hour: (at) => new Date(at).getHours(),
  weekday: (at) => new Date(at).getDay(),
  day: (at) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; },
};

export const PERIODS = [
  { key: "madrugada", from: 0, to: 6 }, { key: "manha", from: 6, to: 12 }, { key: "tarde", from: 12, to: 18 }, { key: "fim", from: 18, to: 21 }, { key: "noite", from: 21, to: 24 },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];
/** A noite de jogo: uma pausa maior que isto começa outra. */
export const NIGHT_GAP_MIN = 45;
/** Faixas da curva da noite, em minutos desde a primeira resposta da noite. */
export const WARM_BUCKETS: readonly (readonly [number, number])[] = [[0, 10], [10, 20], [20, 45], [45, 90], [90, Infinity]];
/** Abaixo disto a hora (ou o período, ou a família) é "poucos dados": não pinta nem vira frase. */
export const MIN_HOUR = 40;
export const MIN_PERIOD = 300;
export const MIN_FAMILY = 300;

export type Cell = {
  n: number;
  acc: number | null;
  /** Acerto contra o normal de cada modo, em fração (0,019 = +1,9 pontos). */
  rel: number | null;
  /** Tempo mediano das respostas certas, em ms. */
  med: number | null;
  /** Velocidade contra o normal de cada modo: a média de log(tempo / mediana do modo) nas certas, centrada na média do filtro em `buildRhythm`
   *  (negativo = mais rápido que o seu costume; os tempos têm cauda longa, então sem centrar todo horário pareceria "mais lento"). */
  speed: number | null;
};
const median = (values: number[]) => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
const validMs = (ms: number | null): ms is number => typeof ms === "number" && ms > 200 && ms < 60_000;

type Baseline = Map<string, { acc: number; med: number | null }>;
/** O normal de cada modo: o acerto e o tempo mediano nas partidas cronometradas (todas as famílias, independente do filtro). */
export function baselineOf(rounds: readonly RhythmRound[]): Baseline {
  const by = new Map<string, RhythmRound[]>();
  for (const round of rounds) if (!round.training) (by.get(round.mode) ?? by.set(round.mode, []).get(round.mode)!).push(round);
  return new Map([...by].map(([mode, list]) => [mode, { acc: list.filter((r) => r.correct).length / list.length, med: median(list.filter((r) => r.correct && validMs(r.ms)).map((r) => r.ms as number)) }]));
}
export function cellOf(rounds: readonly RhythmRound[], baseline: Baseline): Cell {
  if (!rounds.length) return { n: 0, acc: null, rel: null, med: null, speed: null };
  let ok = 0, rel = 0, logs = 0, timed = 0;
  const times: number[] = [];
  for (const round of rounds) {
    const base = baseline.get(round.mode);
    if (round.correct) ok += 1;
    rel += (round.correct ? 1 : 0) - (base?.acc ?? 0);
    if (round.correct && validMs(round.ms)) {
      times.push(round.ms);
      if (base?.med) { logs += Math.log(round.ms / base.med); timed += 1; }
    }
  }
  return { n: rounds.length, acc: ok / rounds.length, rel: rel / rounds.length, med: median(times), speed: timed ? logs / timed : null };
}

export type PeriodCell = Cell & { key: PeriodKey; from: number; to: number };
export type WarmCell = Cell & { from: number; to: number };
export type Insight =
  | { kind: "best"; period: PeriodKey; rel: number; n: number }
  | { kind: "worst"; period: PeriodKey; rel: number; n: number; faster: boolean }
  | { kind: "warmup"; low: WarmCell; high: WarmCell };
export type Rhythm = {
  /** Rodadas cronometradas no filtro. */
  total: number;
  hours: Cell[];
  periods: PeriodCell[];
  warmup: WarmCell[];
  /** [dia da semana (0 = domingo)][período]. */
  week: Cell[][];
  nights: { count: number; medianMinutes: number | null };
  insights: Insight[];
};

/** O Seu ritmo de uma família (ou de todas): horas, períodos, a curva da noite, a semana e as frases. */
export function buildRhythm(all: readonly RhythmRound[], filter: RhythmFilter, clock: Clock = localClock): Rhythm {
  const baseline = baselineOf(all);
  const rounds = all.filter((round) => !round.training && (filter === "todos" || round.family === filter));
  const hourOf = rounds.map((round) => clock.hour(round.at));
  const overall = cellOf(rounds, baseline).speed;
  const cell = (list: RhythmRound[]): Cell => { const c = cellOf(list, baseline); return { ...c, speed: c.speed === null || overall === null ? null : c.speed - overall }; };
  const hours = Array.from({ length: 24 }, (_, h) => cell(rounds.filter((_, i) => hourOf[i] === h)));
  const periods: PeriodCell[] = PERIODS.map((p) => ({ ...cell(rounds.filter((_, i) => hourOf[i] >= p.from && hourOf[i] < p.to)), key: p.key, from: p.from, to: p.to }));
  // noites: em ordem, uma pausa de mais de NIGHT_GAP_MIN começa outra
  const minuteIn: number[] = [];
  const lengths: number[] = [];
  let start = -Infinity, last = -Infinity;
  for (const round of rounds) {
    if (round.at - last > NIGHT_GAP_MIN * 60_000) { if (Number.isFinite(start)) lengths.push((last - start) / 60_000); start = round.at; }
    last = round.at;
    minuteIn.push((round.at - start) / 60_000);
  }
  if (Number.isFinite(start)) lengths.push((last - start) / 60_000);
  const warmup: WarmCell[] = WARM_BUCKETS.map(([from, to]) => ({ ...cell(rounds.filter((_, i) => minuteIn[i] >= from && minuteIn[i] < to)), from, to }));
  const week = Array.from({ length: 7 }, (_, d) => PERIODS.map((p) => cell(rounds.filter((round, i) => clock.weekday(round.at) === d && hourOf[i] >= p.from && hourOf[i] < p.to))));
  // frases: só com dados que bastam
  const insights: Insight[] = [];
  const solid = periods.filter((p) => p.n >= MIN_PERIOD && p.rel !== null);
  if (solid.length >= 2) {
    const best = [...solid].sort((a, b) => (b.rel as number) - (a.rel as number))[0];
    const worst = [...solid].sort((a, b) => (a.rel as number) - (b.rel as number))[0];
    if ((best.rel as number) > 0.005) insights.push({ kind: "best", period: best.key, rel: best.rel as number, n: best.n });
    if ((worst.rel as number) < -0.005) insights.push({ kind: "worst", period: worst.key, rel: worst.rel as number, n: worst.n, faster: (worst.speed ?? 0) < 0 });
  }
  const warm = warmup.filter((w) => w.n >= MIN_HOUR * 2 && w.rel !== null);
  if (warm.length >= 3) {
    const low = [...warm].sort((a, b) => (a.rel as number) - (b.rel as number))[0];
    const high = [...warm].filter((w) => w.from > low.from).sort((a, b) => (b.rel as number) - (a.rel as number))[0];
    if (high && (high.rel as number) - (low.rel as number) > 0.015) insights.push({ kind: "warmup", low, high });
  }
  return { total: rounds.length, hours, periods, warmup, week, nights: { count: lengths.length, medianMinutes: median(lengths) }, insights };
}

/** Quantas rodadas cronometradas cada filtro tem (o filtro com menos de MIN_FAMILY fica apagado). */
export function rhythmTotals(rounds: readonly RhythmRound[]): Record<RhythmFilter, number> {
  const out = Object.fromEntries([["todos", 0], ...RHYTHM_FAMILIES.map((f) => [f, 0])]) as Record<RhythmFilter, number>;
  for (const round of rounds) if (!round.training) { out.todos += 1; out[round.family] += 1; }
  return out;
}

// ---- Modos: volume, acerto, tempo e os picos de cada um ----
export type ModePeak = { acc: number; med: number | null; from: number; to: number };
export type ModeOverview = {
  family: RhythmFamily; mode: string;
  /** Rodadas, Treino incluído. */
  rounds: number; acc: number; med: number | null; duel: number; training: number; last: number;
  /** A maior sequência de acertos seguidos (Treino incluído). */
  streak: { len: number; from: number; to: number } | null;
  /** As melhores 100 rodadas seguidas fora do Treino: mais acertos e, no empate, a mediana mais rápida. */
  best: ModePeak | null;
};
export const PEAK_WINDOW = 100;
export function modesOverview(rounds: readonly RhythmRound[]): ModeOverview[] {
  const by = new Map<string, RhythmRound[]>();
  for (const round of rounds) (by.get(round.mode) ?? by.set(round.mode, []).get(round.mode)!).push(round);
  const out: ModeOverview[] = [];
  for (const [key, list] of by) {
    const [family, mode] = key.split(":") as [RhythmFamily, string];
    let streak: ModeOverview["streak"] = null, run = 0, runFrom = 0;
    for (const round of list) {
      if (round.correct) { if (!run) runFrom = round.at; run += 1; if (!streak || run > streak.len) streak = { len: run, from: runFrom, to: round.at }; } else run = 0;
    }
    const timed = list.filter((round) => !round.training);
    let best: ModePeak | null = null;
    if (timed.length >= PEAK_WINDOW) {
      let hits = timed.slice(0, PEAK_WINDOW).filter((round) => round.correct).length;
      for (let i = 0; i + PEAK_WINDOW <= timed.length; i += 1) {
        if (i > 0) hits += (timed[i + PEAK_WINDOW - 1].correct ? 1 : 0) - (timed[i - 1].correct ? 1 : 0);
        const acc = hits / PEAK_WINDOW;
        if (best && acc < best.acc) continue;
        const window = timed.slice(i, i + PEAK_WINDOW);
        const med = median(window.filter((round) => round.correct && validMs(round.ms)).map((round) => round.ms as number));
        if (!best || acc > best.acc || (med !== null && (best.med === null || med < best.med))) best = { acc, med, from: window[0].at, to: window[PEAK_WINDOW - 1].at };
      }
    }
    out.push({
      family, mode, rounds: list.length, acc: list.filter((round) => round.correct).length / list.length,
      med: median(list.filter((round) => round.correct && validMs(round.ms)).map((round) => round.ms as number)),
      duel: list.filter((round) => round.duel).length, training: list.filter((round) => round.training).length, last: list[list.length - 1].at, streak, best,
    });
  }
  return out.sort((a, b) => b.rounds - a.rounds);
}
