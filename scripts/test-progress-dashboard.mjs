import assert from "node:assert/strict";
import { PILLAR_KEYS, bayesianScore, pillarOfSession, pillarStatus, pillarTotals } from "../.tmp-progress-dashboard/pillars.js";
import { dominatedFromSessions, dominatedIdsFromSessions } from "../.tmp-progress-dashboard/dominated.js";
import { deriveProgress, normalizeSession } from "../.tmp-progress-dashboard/progress-surfaces.js";
import { buildProgressDashboard, groupHistory } from "../.tmp-progress-dashboard/progress-dashboard.js";
import { formatDuration, relativeWhen, sessionLabel, sessionRegionLabel } from "../.tmp-progress-dashboard/session-view.js";

// ---------- pilares ----------
assert.deepEqual([...PILLAR_KEYS], ["bandeiras", "mapa", "capitais", "escrita"]);
assert.equal(pillarOfSession({ family: "mapa" }), "mapa");
assert.equal(pillarOfSession({ family: "silhueta" }), "mapa");
assert.equal(pillarOfSession({ family: "travel" }), "mapa");
assert.equal(pillarOfSession({ family: "bandeiras", variant: "nome-bandeira" }), "bandeiras");
assert.equal(pillarOfSession({ family: "capitais" }), "capitais");
assert.equal(pillarOfSession({ family: "escrita", variant: "escrita-capital" }), "escrita");
assert.equal(pillarOfSession({ family: "historicas" }), null, "históricas não alimentam pilar");
assert.equal(pillarOfSession({ family: "idiomas" }), null);
assert.equal(pillarOfSession({ column: "capitais", family: "mapa" }), "capitais", "a coluna gravada pelo perfil clássico manda");
assert.equal(pillarOfSession({ mode: "bn", subject: "capital" }), "capitais");
assert.equal(pillarOfSession({ mode: "escr" }), "escrita");
assert.equal(pillarOfSession({ mode: "nbhist" }), null);
assert.equal(pillarOfSession({ mode: "bn" }), "bandeiras");
assert.equal(bayesianScore(8, 10), (8 + 12 * 0.45) / 22);
assert.equal(pillarStatus(null, 0), "sem evidência");
assert.equal(pillarStatus(0.9, 5), "diagnóstico");
assert.equal(pillarStatus(0.8, 30), "forte");
assert.equal(pillarStatus(0.6, 30), "em desenvolvimento");
assert.equal(pillarStatus(0.4, 30), "revisar");
const totals = pillarTotals([
  { family: "mapa", rounds: [{ correct: true }, { correct: false }] },
  { family: "mapa", rounds: [], roundCount: 10, correct: 7 }, // partida antiga já resumida
  { family: "historicas", rounds: [{ correct: true }] },
]);
assert.deepEqual(totals.mapa, { seen: 12, correct: 8 });
assert.deepEqual(totals.bandeiras, { seen: 0, correct: 0 });

// ---------- perfil clássico migrado: rodadas em tupla dentro de `rounds` ----------
const migrated = normalizeSession({ id: "m", mode: "bn", column: "bandeiras", subject: "pais", rounds: [["br", true, 900, null], ["ar", false, 1200, 340]], startedAt: 10, endedAt: 20 });
assert.equal(migrated.rounds.length, 2);
assert.equal(migrated.rounds[0].targetId, "br");
assert.equal(migrated.correct, 1, "a tupla conta o acerto");
assert.equal(migrated.rounds[1].distanceKm, 340);
assert.equal(migrated.roundCount, 2);
assert.equal(migrated.column, "bandeiras");
assert.equal(migrated.subject, "pais");
const summarized = normalizeSession({ id: "s", modo: "mapa", ag: { ac: 7, rod: 10 } });
assert.equal(summarized.roundCount, 10, "partida resumida guarda o total do resumo");

// ---------- pilares no perfil: precisão por pilar, não dividida por todas as rodadas ----------
const oldStyle = deriveProgress([{ entityId: "a", mastery: 2, seen: 10, columns: { mapa: 8, bandeiras: 0 } }], ["a"]);
assert.equal(oldStyle.pillars.bandeiras.seen, 10, "sem partidas, o cálculo antigo é preservado");
const fixed = deriveProgress(
  [{ entityId: "a", mastery: 2, seen: 10, columns: { mapa: 4, bandeiras: 1 } }],
  ["a"],
  [normalizeSession({ id: "x", family: "mapa", rounds: [{ targetId: "a", correct: true }, { targetId: "a", correct: true }, { targetId: "a", correct: true }, { targetId: "a", correct: true }, { targetId: "a", correct: false }] })],
);
assert.deepEqual([fixed.pillars.mapa.seen, fixed.pillars.mapa.correct], [5, 4]);
assert.equal(fixed.pillars.bandeiras.seen, 1, "pilar sem partidas usa os acertos gravados na carta");
assert.equal(fixed.pillars.bandeiras.correct, 1);
assert.equal(fixed.pillars.capitais.bayesianScore, null);
assert.equal(fixed.pillars.mapa.bayesianScore, bayesianScore(4, 5));

// ---------- cenário do painel ----------
const at = (day, hour, minute = 0) => new Date(2026, 8, day, hour, minute).getTime(); // 20/09/2026 é domingo
const NOW = at(20, 9, 30);
const meta = {
  br: { pt: "Brasil", reg: "Americas", sub: "South America", fl: "br" },
  ar: { pt: "Argentina", reg: "Americas", sub: "South America", fl: "ar" },
  fr: { pt: "França", reg: "Europe", sub: "Western Europe", fl: "fr" },
  de: { pt: "Alemanha", reg: "Europe", sub: "Western Europe", fl: "de" },
  eg: { pt: "Egito", reg: "Africa", sub: "Northern Africa", fl: "eg" },
  jm: { pt: "Jamaica", reg: "Americas", sub: "Caribbean", fl: "jm" },
  nz: { pt: "Nova Zelândia", reg: "Oceania", sub: "Australia and New Zealand", fl: "nz" },
};
const universe = Object.keys(meta);
const rounds = (targets, pattern, ms, km) => targets.map((targetId, index) => ({
  targetId, correct: pattern[index] === "1", responseTimeMs: ms, distanceKm: pattern[index] === "1" ? null : km,
}));
const raw = [
  { id: "s1", family: "mapa", variant: "mapa", region: "mundo", regions: ["mundo"], startedAt: at(18, 20), endedAt: at(18, 20, 5), complete: true, rounds: rounds(["br", "ar", "fr", "de", "br", "ar", "fr", "de", "br", "ar"], "1110110010", 2000, 300) },
  { id: "s2", family: "bandeiras", variant: "nome-bandeira", region: "mundo", regions: ["mundo"], startedAt: at(19, 21), endedAt: at(19, 21, 6), complete: true, rounds: rounds(Array.from({ length: 20 }, (_, index) => ["br", "ar", "fr", "de", "jm"][index % 5]), Array.from({ length: 20 }, (_, index) => (index % 4 === 3 ? "0" : "1")).join(""), 1500, null) },
  { id: "s3", family: "escrita", variant: "escrita-pais", region: "mundo", regions: ["mundo"], startedAt: at(19, 21, 30), endedAt: at(19, 21, 34), complete: true, rounds: rounds(["br", "ar", "fr", "de", "jm"], "11110", 4000, null) },
  { id: "s4", family: "capitais", variant: "capital-pais", region: "europa", regions: ["europa"], startedAt: at(20, 8), endedAt: at(20, 8, 4), complete: true, rounds: rounds(["eg", "eg", "jm", "eg", "jm", "nz", "nz", "br", "ar", "fr"], "0001000111", 2500, null) },
];
const sessions = raw.map((session, index) => normalizeSession(session, index));
const records = [
  { entityId: "br", mastery: 3, seen: 6, columns: { bandeiras: 4, mapa: 2, capitais: 1 } },
  { entityId: "ar", mastery: 2, seen: 4, columns: { bandeiras: 2, mapa: 2 } },
  { entityId: "fr", mastery: 2, seen: 4, columns: { bandeiras: 2, capitais: 1 } },
  { entityId: "jm", mastery: 1, seen: 6, columns: { bandeiras: 3 } },
  { entityId: "outro", mastery: 1, seen: 1, columns: { mapa: 1 } },
];
const progress = deriveProgress(records, universe, sessions);
const build = (overrides = {}) => buildProgressDashboard({
  now: NOW, sessions, records, meta, universe,
  dominatedIds: ["br", "ar", "fr"], titleIds: [], pillars: progress.pillars,
  album: { discovered: progress.discovered, total: progress.total, distribution: progress.distribution },
  economy: { level: 3, xp: 350, xpBase: 300, xpNext: 600, completedSessions: 4, rounds: 45 },
  ...overrides,
});
const d = build();

// maestria e estágios (mesma conta do Hub: dominados ÷ universo)
assert.equal(d.empty, false);
assert.equal(d.hero.pct, 43);
assert.equal(d.hero.stageTitle, "Explorador");
assert.equal(d.hero.stageIndex, 2);
assert.deepEqual(d.hero.next, { name: "Navegador", at: 60 });
assert.equal(d.hero.missing, 2, "60% de 7 = 5 países; faltam 2");
assert.deepEqual(d.hero.stages.map((stage) => stage.name), ["Novato", "Aprendiz", "Explorador", "Navegador", "Geógrafo", "Cosmógrafo"]);
assert.equal(d.hero.titles.length, 4);
assert.equal(d.hero.titles.filter((title) => title.earned).length, 0);
assert.equal(build({ titleIds: ["cosmografo", "vexilologo"] }).hero.stageIndex, 5, "Cosmógrafo é o último estágio");
assert.equal(build({ titleIds: ["cosmografo"] }).hero.next, null);

// números rápidos
assert.equal(d.kpis.level, 3);
assert.equal(d.kpis.xpInLevel, 50);
assert.equal(d.kpis.xpSpan, 300);
assert.equal(d.kpis.sessions, 4);
assert.equal(d.kpis.rounds, 45);
assert.equal(d.kpis.accuracyPct, 64, "29 acertos em 45 rodadas");
assert.equal(d.kpis.accuracyDelta, null, "poucas partidas: sem comparação");
assert.equal(Math.round(d.kpis.avgTimeMs), Math.round((10 * 2000 + 20 * 1500 + 5 * 4000 + 10 * 2500) / 45));

// pilares: cada um com as próprias rodadas
const [bandeiras, mapa, capitais] = d.pillars;
assert.deepEqual([bandeiras.key, mapa.key, capitais.key], ["bandeiras", "mapa", "capitais"]);
assert.deepEqual([bandeiras.seen, bandeiras.correct], [20, 15]);
assert.deepEqual([mapa.seen, mapa.correct], [10, 6]);
assert.deepEqual([capitais.seen, capitais.correct], [10, 4]);
assert.equal(bandeiras.scorePct, Math.round(bayesianScore(15, 20) * 100));
assert.equal(bandeiras.gapPts, 90 - bandeiras.scorePct);
assert.equal(bandeiras.tone, "mid");
assert.equal(bandeiras.status, "Em desenvolvimento");
assert.equal(capitais.tone, "warn");
assert.equal(capitais.status, "Revisar");
assert.equal(mapa.writing, null, "Mapa não exige escrita");
assert.deepEqual(bandeiras.writing, { ok: true, count: 4, needed: 2 }, "4 acertos digitados validam a escrita");
assert.equal(bandeiras.coverage, 4, "br, ar, fr e jm têm acerto em Bandeiras (o id fora do atlas não conta)");
assert.equal(mapa.coverage, 2);
assert.equal(bandeiras.coverageTotal, 7);
assert.equal(build({ titleIds: ["cartografo"] }).pillars[1].earned, true);
assert.equal(build({ titleIds: ["cartografo"] }).pillars[1].status, "Título conquistado");
assert.equal(bandeiras.formPct, 75, "forma recente: 15 acertos nas 20 rodadas do pilar");
assert.equal(bandeiras.formDelta, null, "sem uma janela anterior para comparar");
assert.equal(mapa.formPct, 60);
assert.equal(d.pillars.every((pillar) => pillar.formPct !== null), true);

// domínio por recorte
const region = (key) => d.regions.find((row) => row.key === key);
assert.deepEqual(d.regions.map((row) => row.key), ["mundo", "caribe", "pacifico", "europa", "africa", "asia", "america-do-sul", "america-do-norte-central"]);
assert.deepEqual([region("mundo").found, region("mundo").total, region("mundo").pct], [3, 7, 43]);
assert.deepEqual([region("america-do-sul").found, region("america-do-sul").total, region("america-do-sul").pct], [2, 2, 100]);
assert.deepEqual([region("europa").found, region("europa").total], [1, 2]);
assert.deepEqual([region("america-do-norte-central").found, region("america-do-norte-central").total], [0, 0]);
assert.equal(region("america-do-sul").tag, "good");
assert.equal(region("caribe").tag, "warn", "empate no mais fraco: o primeiro da lista");
assert.equal(d.regions.filter((row) => row.tag).length, 2);
assert.equal(build({ dominatedIds: [] }).regions.filter((row) => row.tag).length, 0, "sem domínio, sem selos");

// para revisar: só quem tem 3+ tentativas e menos de 50%
assert.equal(d.review.total, 2);
assert.deepEqual(d.review.items.map((item) => item.id), ["eg", "jm"], "do pior para o menos ruim");
assert.equal(d.review.items[0].pct, 33);
assert.deepEqual([d.review.items[0].correct, d.review.items[0].tries], [1, 3]);
assert.deepEqual(d.review.items[0].weak, ["Capital"]);
assert.deepEqual(d.review.items[1].weak, ["Capital"]);
assert.equal(d.review.items[0].flag, "eg");
assert.equal(d.review.items[0].place, "África Setentrional", "não repete o continente quando a sub-região já o traz");

// atividade
const week = d.activity.weeks[11];
assert.equal(d.activity.weeks.length, 12);
assert.deepEqual(week, [0, 0, 0, 0, 10, 25, 10], "seg a dom desta semana");
assert.equal(d.activity.months[0], "", "jun e jul vizinhos: fica só o mais novo");
assert.equal(d.activity.months[1], "jul");
assert.equal(d.activity.months.filter(Boolean).length, 3, "jul, ago e set");
assert.equal(d.activity.streak, 3);
assert.equal(d.activity.bestStreak, 3);
assert.equal(d.activity.weekRounds, 45);
assert.equal(d.activity.weekAccuracy, 64);
assert.deepEqual([d.activity.activeDays, d.activity.daysTotal], [3, 84]);
// dia da semana anterior ao domingo: o resto da semana ainda é futuro
const midweek = build({ now: at(16, 12), sessions: sessions.filter((session) => session.startedAt < at(16, 12)) });
assert.deepEqual(midweek.activity.weeks[11].slice(3), [-1, -1, -1, -1], "dias que ainda não chegaram");
assert.equal(midweek.empty, true);
assert.equal(midweek.activity.streak, 0);
// sequência de hoje sem jogo ainda: conta até ontem
const tomorrow = build({ now: at(21, 8) });
assert.equal(tomorrow.activity.streak, 3, "hoje ainda sem jogo não zera a sequência");
assert.equal(build({ now: at(23, 8) }).activity.streak, 0, "dois dias sem jogar zera");

// recordes
assert.deepEqual(d.records.bestStreak, { value: 4, when: "19 set" });
assert.deepEqual(d.records.bestSession, { pct: 75, rounds: 20, when: "19 set" });
assert.equal(Math.round(d.records.fastest.ms), 1500);
assert.equal(d.records.fastest.family, "Bandeiras");
assert.deepEqual(d.records.bestMapError, { km: 120, when: "18 set" }, "4 erros de 300 km em 10 rodadas: acerto vale 0 km → 120 km de média");

// evolução
assert.deepEqual(d.evolution.points.map((point) => point.pct), [60, 75, 80, 40]);
assert.equal(d.evolution.deltaOver, 2);
assert.equal(d.evolution.delta, Math.round(60 - 67.5));
assert.equal(d.evolution.first, "18 set");
assert.equal(d.evolution.last, "hoje");

// partidas
assert.equal(d.recent.length, 4);
assert.equal(d.recent[0].id, "s4", "a mais recente primeiro");
assert.equal(d.recent[0].title, "Capitais · Clicar no mapa");
assert.equal(d.recent[0].region, "Europa");
assert.equal(d.recent[0].pct, 40);
assert.equal(d.recent[0].when, "hoje, 08:00");
assert.equal(d.recent[0].duration, "4 min");
assert.equal(d.recent[1].id, "s3");
assert.equal(d.recent[1].title, "Bandeiras · Escrita");
assert.equal(d.recent[2].when, "ontem, 21:00");
assert.equal(d.history.find((row) => row.id === "s1").pattern, "1110110010");
assert.equal(d.history.find((row) => row.id === "s1").bestStreak, 3);
assert.deepEqual(d.history.find((row) => row.id === "s1").misses.map((miss) => miss.id), ["de", "fr", "ar"]);
const groups = groupHistory(d.history, NOW);
assert.deepEqual(groups.map((group) => group.key), ["hoje", "ontem", "semana"]);
assert.deepEqual(groups.map((group) => group.label), ["Hoje", "Ontem", "Esta semana"]);
assert.deepEqual(groups.map((group) => group.sessions), [1, 2, 1]);
assert.equal(groups[1].rounds, 25);
assert.equal(groups[1].pct, 76);
const old = groupHistory([{ ...d.history[0], startedAt: new Date(2025, 10, 3, 10).getTime() }, { ...d.history[0], startedAt: new Date(2026, 6, 3, 10).getTime() }], NOW);
assert.deepEqual(old.map((group) => group.label), ["Novembro 2025", "Julho"]);

// duelo: uma linha só no histórico (as duas partidas que o compõem somem da lista, mas seguem contando para maestria e pilares)
const duelTargets = ["br", "ar", "fr", "de", "jm", "br", "ar", "fr", "de", "jm"];
const legSession = (id, leg, startedAt, pattern, complete = true, duelId = "dz1") => normalizeSession({ id, family: "bandeiras", variant: "nome-bandeira", region: "mundo", regions: ["mundo"], startedAt, endedAt: startedAt + 90_000, complete, duelId, duelLeg: leg, rounds: rounds(duelTargets, pattern, 2000, null) });
const duelSessions = [legSession("dl0", 0, at(20, 8, 40), "1111011110"), legSession("dl1", 1, at(20, 8, 42), "1010110111")];
assert.deepEqual([duelSessions[1].duelId, duelSessions[1].duelLeg], ["dz1", 1], "a partida guarda a que duelo e a que tempo pertence");
const duelRecord = { id: "duel:dz1", sessionId: "dz1", at: at(20, 8, 44), botId: "bot-prata-4", ladder: "bandeiras", family: "bandeiras", variant: "nome-bandeira", playerCorrect: 15, total: 20, botCorrect: 12, outcome: "win", tiebreak: false, delta: 37, legs: [
  { group: "atuais", playerCorrect: 8, botCorrect: 6, total: 10, playerMs: 30_000, botMs: 40_000 },
  { group: "historicas", playerCorrect: 7, botCorrect: 6, total: 10, playerMs: 35_000, botMs: 42_000 },
] };
const withDuel = build({ sessions: [...sessions, ...duelSessions], duels: [duelRecord] });
assert.equal(withDuel.history.length, 5, "4 partidas soltas + 1 duelo (e não 6: os dois tempos viram uma linha)");
assert.ok(!withDuel.history.some((row) => row.id === "dl0" || row.id === "dl1"), "os tempos não aparecem como partidas");
const duelRow = withDuel.history[0];
assert.equal(withDuel.recent[0].id, duelRow.id, "o duelo também abre as recentes");
assert.equal(duelRow.title, "Duelo · Bandeiras");
assert.deepEqual([duelRow.rounds, duelRow.pct, duelRow.complete, duelRow.duration, duelRow.region], [20, 75, true, "3 min", "Mundo"]);
assert.deepEqual([duelRow.duel.botName, duelRow.duel.botLeague, duelRow.duel.outcome, duelRow.duel.playerCorrect, duelRow.duel.botCorrect, duelRow.duel.delta], ["Bruna Sul", "Prata", "win", 15, 12, 37]);
assert.match(duelRow.duel.botStyle, /^Especialista/);
assert.deepEqual(duelRow.duel.legs.map((leg) => [leg.mode, leg.playerCorrect, leg.botCorrect, leg.pattern]), [["Bandeiras atuais", 8, 6, "1111011110"], ["Históricas", 7, 6, "1010110111"]]);
assert.deepEqual(duelRow.duel.legs[0].misses.map((miss) => miss.name), ["Jamaica"], "o que errou em cada tempo");
assert.deepEqual([duelRow.duel.playerMs, duelRow.duel.botMs], [65_000, 82_000], "o tempo dos dois é a soma dos tempos");
assert.equal(duelRow.duel.abandoned, false);
assert.equal(duelRow.avgTimeMs, 2000);
assert.equal(groupHistory(withDuel.history, NOW)[0].sessions, 2, "hoje: a partida s4 e o duelo, que conta como 1 partida (e não 3)");
const bothLegs = build({ sessions: [...sessions, ...duelSessions] });
assert.equal(bothLegs.history.length, 6, "sem o registro do duelo, as partidas continuam aparecendo (nada some)");
const left = build({ sessions: [...sessions, legSession("dl0", 0, at(20, 8, 40), "111", false)], duels: [{ ...duelRecord, playerCorrect: 3, botCorrect: 7, outcome: "loss", delta: -27, legs: duelRecord.legs.map((leg) => ({ ...leg, playerCorrect: 0 })), abandoned: true }] }).history[0];
assert.deepEqual([left.complete, left.duel.abandoned, left.duel.outcome], [false, true, "loss"]);
const orphan = build({ sessions, duels: [{ ...duelRecord, legs: duelRecord.legs.map(({ playerMs, botMs, ...leg }) => leg) }] }).history[0];
assert.deepEqual([orphan.pattern, orphan.region, orphan.duel.playerMs, orphan.duel.legs[0].pattern, orphan.duration], ["", "Mundo", null, "", null], "sem as partidas (ou sem os tempos gravados), o registro sozinho basta");
const v1 = build({ sessions: [...sessions, normalizeSession({ id: "old1", family: "bandeiras", variant: "nome-bandeira", region: "mundo", regions: ["mundo"], startedAt: at(20, 8, 40), endedAt: at(20, 8, 45), complete: true, rounds: rounds(duelTargets, "1111011110", 2000, null) })], duels: [{ id: "duel:old1", sessionId: "old1", at: at(20, 8, 46), botId: "bot-bronze", ladder: "bandeiras", family: "bandeiras", variant: "nome-bandeira", playerCorrect: 9, total: 10, botCorrect: 6, outcome: "win", tiebreak: false, delta: 30 }] });
assert.equal(v1.history.length, 5, "duelo antigo (uma partida só) também vira uma linha");
assert.deepEqual([v1.history[0].duel.botName, v1.history[0].duel.legs.length, v1.history[0].duel.legs[0].mode], ["Bot Bronze", 1, "Nome → bandeira"], "bot antigo sem nome vira Bot + liga");

// duelo com amigo (PvP): a mesma ideia do duelo contra bot, uma linha só, ao lado dele no mesmo histórico
const pvpSessions = [legSession("pl0", 0, at(20, 8, 50), "1111111110", true, "pz1"), legSession("pl1", 1, at(20, 8, 52), "1111100000", true, "pz1")];
const pvpRecord = {
  id: "pvp:pz1", code: "pz1", at: at(20, 8, 54), ladder: "bandeiras", mode: "ranked", opponentName: "Beto", opponentRating: 1000,
  youCorrect: 14, opponentCorrect: 10, totalRounds: 20, outcome: "win", tiebreak: false, youForfeited: false, opponentForfeited: false,
  youMs: 60_000, opponentMs: 70_000, ratingDelta: 12,
  legs: [
    { group: "atuais", youCorrect: 9, opponentCorrect: 5, total: 10, youMs: 30_000, opponentMs: 35_000 },
    { group: "historicas", youCorrect: 5, opponentCorrect: 5, total: 10, youMs: 30_000, opponentMs: 35_000 },
  ],
};
const withPvp = build({ sessions: [...sessions, ...duelSessions, ...pvpSessions], duels: [duelRecord], pvpMatches: [pvpRecord] });
assert.equal(withPvp.history.length, 6, "4 partidas soltas + 1 duelo contra bot + 1 duelo com amigo (não 8: os tempos somem dos dois)");
assert.ok(!withPvp.history.some((row) => row.id === "pl0" || row.id === "pl1"), "os tempos do duelo com amigo não aparecem soltos");
const pvpRow = withPvp.history.find((row) => row.id === "pvp:pz1");
assert.equal(pvpRow.title, "Duelo com amigo · Bandeiras", "título distinto do duelo contra bot");
assert.deepEqual([pvpRow.rounds, pvpRow.pct, pvpRow.complete], [20, 70, true]);
assert.deepEqual([pvpRow.duel.kind, pvpRow.duel.botName, pvpRow.duel.botLeague, pvpRow.duel.outcome, pvpRow.duel.playerCorrect, pvpRow.duel.botCorrect], ["pvp", "Beto", "", "win", 14, 10], "o adversário é uma pessoa: sem liga");
assert.deepEqual([pvpRow.duel.deltaLabel, pvpRow.duel.delta, pvpRow.duel.deltaText], ["Força", 12, "+12 de força"], "valendo de antes de 28/09: só a força");
const rankedTrophies = build({ sessions: [...sessions, ...pvpSessions], pvpMatches: [{ ...pvpRecord, trophyDelta: 38 }] }).history.find((row) => row.id === "pvp:pz1");
assert.deepEqual([rankedTrophies.duel.deltaLabel, rankedTrophies.duel.delta, rankedTrophies.duel.deltaText], ["Troféus", 38, "+38 troféus"], "valendo desde 28/09: troféus da escada");
assert.deepEqual(pvpRow.duel.legs.map((leg) => [leg.mode, leg.playerCorrect, leg.botCorrect, leg.pattern]), [["Bandeiras atuais", 9, 5, "1111111110"], ["Históricas", 5, 5, "1111100000"]]);
assert.equal(withPvp.history.some((row) => row.id === duelRow.id), true, "o duelo contra bot continua do lado do duelo com amigo, sem se misturar");
const friendly = build({ sessions: [...sessions, ...pvpSessions], pvpMatches: [{ ...pvpRecord, mode: "friendly", ratingDelta: null }] }).history.find((row) => row.id === "pvp:pz1");
assert.deepEqual([friendly.duel.deltaLabel, friendly.duel.deltaText], [null, "Amistoso"], "amistoso não mexe em força: sem rótulo, só o aviso");
const pvpLeft = build({ sessions: [...sessions, legSession("pl0", 0, at(20, 8, 50), "111", true, "pz1")], pvpMatches: [{ ...pvpRecord, youForfeited: true }] }).history.find((row) => row.id === "pvp:pz1");
assert.deepEqual([pvpLeft.complete, pvpLeft.duel.abandoned], [false, true], "quem saiu no meio do duelo com amigo também aparece como incompleto");

// entidade histórica errada num tempo de Históricas: fora de `meta` de propósito (decisão 1 do CLAUDE.md), então sem `historicalMeta` o "Você
// errou" caía no id cru (bug real, achado em 28/09 testando um duelo com amigo de Bandeiras/Históricas: apareceu "anhalt-ducado" em vez do nome)
const historicalMeta = { "reino-teste": { pt: "Reino de Teste", fl: "reino-teste" } };
const histTargets = ["reino-teste", "br", "ar", "fr", "de", "reino-teste", "br", "ar", "fr", "de"];
const histSession = normalizeSession({ id: "plh1", family: "historicas", variant: "nome-historica", region: "mundo", regions: ["mundo"], startedAt: at(20, 8, 52), endedAt: at(20, 8, 52) + 90_000, complete: true, duelId: "pzh1", duelLeg: 1, rounds: rounds(histTargets, "0111111111", 2000, null) });
const pvpHistRecord = { ...pvpRecord, id: "pvp:pzh1", code: "pzh1", legs: [{ group: "atuais", youCorrect: 9, opponentCorrect: 5, total: 10, youMs: 30_000, opponentMs: 35_000 }, { group: "historicas", youCorrect: 9, opponentCorrect: 5, total: 10, youMs: 30_000, opponentMs: 35_000 }] };
const histRow = build({ sessions: [...sessions, legSession("plh0", 0, at(20, 8, 50), "1111111110", true, "pzh1"), histSession], pvpMatches: [pvpHistRecord], historicalMeta }).history.find((row) => row.id === "pvp:pzh1");
assert.deepEqual(histRow.duel.legs[1].misses.map((miss) => miss.name), ["Reino de Teste"], "com historicalMeta, o nome da entidade histórica aparece (não o id cru)");

// perfil novo
const empty = buildProgressDashboard({ now: NOW, sessions: [], records: [], meta, universe, dominatedIds: [], titleIds: [], pillars: {}, album: { discovered: 0, total: 7, distribution: [7, 0, 0, 0, 0, 0] }, economy: { level: 1, xp: 0, xpBase: 0, xpNext: 50, completedSessions: 0, rounds: 0 } });
assert.equal(empty.empty, true);
assert.equal(empty.hero.pct, 0);
assert.equal(empty.hero.stageTitle, "Novato");
assert.equal(empty.hero.missing, 2, "20% de 7 = 2 países");
assert.equal(empty.kpis.accuracyPct, null);
assert.equal(empty.kpis.avgTimeMs, null);
assert.equal(empty.review.total, 0);
assert.equal(empty.records.bestStreak, null);
assert.equal(empty.evolution.points.length, 0);
assert.equal(empty.evolution.delta, null);
assert.equal(empty.pillars[0].scorePct, null);
assert.equal(empty.pillars[0].status, "Sem dados");
assert.equal(empty.activity.streak, 0);
assert.equal(empty.history.length, 0);

// muitas partidas: comparação das últimas 5 com as anteriores
const many = Array.from({ length: 8 }, (_, index) => normalizeSession({
  id: `m${index}`, family: "mapa", variant: "mapa", region: "mundo", startedAt: at(1 + index, 10), endedAt: at(1 + index, 10, 5), complete: true,
  rounds: rounds(["br", "ar", "fr", "de", "eg"], index < 3 ? "10000" : "11110", index < 3 ? 4000 : 2000, 200),
}));
const trend = build({ sessions: many });
assert.equal(trend.kpis.accuracyDelta, 80 - 20, "últimas 5 a 80% contra 20% nas anteriores");
assert.equal(trend.kpis.timeDeltaMs, 2000 - 4000);
assert.equal(trend.evolution.deltaOver, 4);

// rótulos
assert.deepEqual(sessionLabel({ family: "bandeiras", variant: "nome-bandeira" }), { group: "bandeiras", family: "Bandeiras", variant: "Nome → bandeira" });
assert.deepEqual(sessionLabel({ family: "escrita", variant: "escrita-capital" }), { group: "capitais", family: "Capitais", variant: "Escrita" });
assert.deepEqual(sessionLabel({ family: "escrita", variant: "escrita-pais" }), { group: "bandeiras", family: "Bandeiras", variant: "Escrita" });
assert.deepEqual(sessionLabel({ family: "silhueta", variant: "silhueta" }), { group: "mapa", family: "Mapa", variant: "Silhueta + escrita" });
assert.deepEqual(sessionLabel({ mode: "bn", subject: "capital" }), { group: "capitais", family: "Capitais", variant: "Bandeira → nome" });
assert.equal(sessionLabel({ mode: "nbhist" }).group, "historicas");
assert.equal(sessionLabel({ family: "idiomas", variant: "idioma-pais" }).family, "Idiomas");
assert.equal(sessionRegionLabel({ region: "america-sul" }), "América do Sul", "recorte do perfil clássico");
assert.equal(sessionRegionLabel({ region: "europa", regions: ["europa", "asia"] }), "2 recortes");
assert.equal(sessionRegionLabel({ region: "mundo", regions: ["mundo"] }), "Mundo");
assert.equal(formatDuration(45_000), "45 s");
assert.equal(formatDuration(5 * 60_000 + 12_000), "5 min 12 s");
assert.equal(formatDuration(20 * 60_000), "20 min");
assert.equal(formatDuration(3_900_000), "1 h 05");
assert.equal(formatDuration(8 * 3600_000), null, "relógio impossível");
assert.equal(formatDuration(null), null);
assert.equal(relativeWhen(at(20, 7, 2), NOW), "hoje, 07:02");
assert.equal(relativeWhen(at(19, 21, 40), NOW), "ontem, 21:40");
assert.equal(relativeWhen(at(12, 9), NOW), "12 set");
assert.equal(relativeWhen(new Date(2025, 0, 5, 9).getTime(), NOW), "5 jan 2025");

// domínio: ids e contagem batem
const dominatedSession = { complete: true, family: "mapa", variant: "mapa", rounds: [{ targetId: "x", correct: true, column: "mapa" }, { targetId: "x", correct: true, column: "bandeiras" }, { targetId: "x", correct: true, column: "mapa" }, { targetId: "y", correct: true, column: "mapa" }] };
assert.deepEqual([...dominatedIdsFromSessions([dominatedSession])], ["x"]);
assert.equal(dominatedFromSessions([dominatedSession]), 1);

console.log("progress dashboard: pillars, regions, review, activity, records, evolution, history and empty state verified");
