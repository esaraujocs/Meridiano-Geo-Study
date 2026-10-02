import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LEGS, LEG_ROUNDS, drawLegs, drawPvpGroups, groupDef, isGroupPair, pvpLegs } from "../.tmp-pvp/src/domain/duel-modes.js";
import {
  COUNTDOWN_MS, CROSS_DELAY_MS, DONE_TTL_MS, GRACE_MS, MATCH_COUNTDOWN_MS, OFFER_TTL_MS, OPEN_TTL_MS, QUEUE_TTL_MS, REOFFER_COOLDOWN_MS, ROOM_CODE_ALPHABET,
  cleanPlayerName, inviteLink, isValidRoomCode, normalizeRoomCode, parseCommand, parseInvite, parseOfferResponse, settlePvp, sideFinished, sideTotals,
} from "../.tmp-pvp/src/domain/pvp.js";
import { PVP_RATING_BASE, pvpExpectedScore, pvpRatingChange, pvpRatingFromHistory } from "../.tmp-pvp/src/domain/pvp-rating.js";
import { PvpError, PvpRooms } from "../.tmp-pvp/server/pvp-rooms.js";
import { PlayerRegistry } from "../.tmp-pvp/server/pvp-players.js";
import { PvpHistory } from "../.tmp-pvp/server/pvp-history.js";
import { PvpQueue } from "../.tmp-pvp/server/pvp-queue.js";
import { createPvpHttp } from "../.tmp-pvp/server/pvp-http.js";
import { FriendGraph } from "../.tmp-pvp/server/pvp-friends.js";
import { isFriendCode, isSocialEvent, parseSummary, tallyMatches, winRate } from "../.tmp-pvp/src/domain/pvp-social.js";

// ───────────── regras puras ─────────────
assert.ok(isValidRoomCode("K7Q2MP") && !isValidRoomCode("K7Q2M") && !isValidRoomCode("K7Q2M0") && !isValidRoomCode("k7q2mp") && !isValidRoomCode(null), "código: 6 letras do alfabeto sem I, O, 0 e 1");
assert.ok(![..."IO01"].some((char) => ROOM_CODE_ALPHABET.includes(char)));
assert.equal(normalizeRoomCode(" k7q-2mp "), "K7Q2MP");
assert.equal(parseInvite("https://exemplo.ts.net/?duelo=k7q2mp"), "K7Q2MP", "código de dentro do link");
assert.equal(parseInvite("k7q 2mp"), "K7Q2MP", "código digitado");
assert.equal(parseInvite("https://exemplo.ts.net/?duelo=ABC"), null);
assert.equal(parseInvite("lixo"), null);
assert.equal(inviteLink("https://x.ts.net/", "K7Q2MP"), "https://x.ts.net/?duelo=K7Q2MP");
assert.equal(cleanPlayerName("  Ana   <b>Silva</b>\n"), "Ana bSilva/b", "sem espaços dobrados nem < >");
assert.equal(cleanPlayerName("x".repeat(50)).length, 20);
assert.equal(cleanPlayerName(null), "");

const rounds = (n, ok, ms = 4000) => Array.from({ length: n }, (_, i) => ({ correct: i < ok, ms }));
const side = (a, b) => sideTotals([rounds(LEG_ROUNDS, a), rounds(LEG_ROUNDS, b)]);
// mais acertos vence
let verdict = settlePvp(side(8, 7), side(6, 7));
assert.deepEqual(verdict, { a: "win", b: "loss", tiebreak: false });
// empate nos acertos: o menor tempo total vence, e conta como desempate
verdict = settlePvp(sideTotals([rounds(10, 7, 3000), rounds(10, 7, 3000)]), sideTotals([rounds(10, 7, 4000), rounds(10, 7, 4000)]));
assert.deepEqual(verdict, { a: "win", b: "loss", tiebreak: true });
assert.deepEqual(settlePvp(sideTotals([rounds(10, 7, 4000), rounds(10, 7, 4000)]), sideTotals([rounds(10, 7, 3000), rounds(10, 7, 3000)])), { a: "loss", b: "win", tiebreak: true });
// mesmo tempo, ou tempo que falta: empate
assert.deepEqual(settlePvp(side(5, 5), side(5, 5)), { a: "draw", b: "draw", tiebreak: false });
const partial = sideTotals([rounds(10, 5), rounds(4, 2)], true);
assert.equal(partial.ms, null, "tempo incompleto não tem total");
assert.equal(partial.correct, 7, "o que já foi respondido conta");
assert.deepEqual(partial.legs.map((leg) => leg.answered), [10, 4]);
assert.equal(settlePvp(partial, sideTotals([rounds(10, 5), rounds(10, 2)])).a, "draw", "empate nos acertos sem tempo dos dois lados: empate");
assert.ok(sideFinished([rounds(10, 1), rounds(10, 1)], false) && !sideFinished([rounds(10, 1), rounds(9, 1)], false) && sideFinished([], true), "terminou: todos os tempos ou desistiu");

assert.deepEqual(parseCommand({ type: "ready", ready: true }), { type: "ready", ready: true });
assert.deepEqual(parseCommand({ type: "round", leg: 0, round: 3, correct: true, ms: 1234.4 }), { type: "round", leg: 0, round: 3, correct: true, ms: 1234 });
assert.equal(parseCommand({ type: "round", leg: 0, round: "3", correct: true, ms: 10 }), null);
assert.equal(parseCommand({ type: "round", leg: 0, round: 3, correct: true, ms: NaN }), null);
assert.equal(parseCommand({ type: "voar" }), null);
assert.equal(parseCommand(null), null);
assert.deepEqual(parseOfferResponse({ id: "ABCDEFGH2345", accept: true }), { id: "ABCDEFGH2345", accept: true });
assert.equal(parseOfferResponse({ id: "x", accept: true }), null, "id de proposta curto demais");
assert.equal(parseOfferResponse({ id: "ABCDEFGH2345", accept: "sim" }), null);

// os dois jogadores sorteiam o mesmo duelo pela semente da sala (sem ownedGroups, quem comprou o quê não pesa)
assert.deepEqual(drawLegs("mapas", "abc123"), drawLegs("mapas", "abc123"));

// ───────────── força do valendo (Elo simples, próprio, derivado do histórico) ─────────────
assert.equal(pvpExpectedScore(1000, 1000), 0.5, "força igual: 50-50");
assert.ok(pvpExpectedScore(1200, 1000) > 0.7, "quem está na frente é o favorito");
assert.equal(pvpRatingChange(1000, 1000, "win") > 0 && pvpRatingChange(1000, 1000, "loss") < 0, true);
assert.equal(pvpRatingChange(1000, 1000, "win"), -pvpRatingChange(1000, 1000, "loss"), "ganho e perda simétricos na mesma força");
assert.ok(pvpRatingChange(1000, 1400, "win") > pvpRatingChange(1000, 600, "win"), "vencer quem é mais forte vale mais");
assert.equal(pvpRatingChange(1000, 1000, "draw"), 0, "empate entre iguais não move nada");
assert.equal(pvpRatingFromHistory([]), PVP_RATING_BASE, "sem partida valendo, força de base");
const afterWins = pvpRatingFromHistory([{ opponentRating: 1000, outcome: "win" }, { opponentRating: 1000, outcome: "win" }]);
assert.ok(afterWins > PVP_RATING_BASE, "ganhando, a força sobe");
assert.ok(pvpRatingFromHistory([{ opponentRating: 1000, outcome: "loss" }]) < PVP_RATING_BASE, "perdendo, desce");
assert.ok(pvpRatingFromHistory([{ opponentRating: 1000, outcome: "loss" }]) >= 0, "nunca fica negativa");

// ───────────── máquina de estados, com relógio falso ─────────────
let now = 1_700_000_000_000;
let seedState = 7;
const random = () => { seedState = (seedState * 1103515245 + 12345) & 0x7fffffff; return seedState / 0x7fffffff; };
const make = () => new PvpRooms({ now: () => now, random, countdownMs: COUNTDOWN_MS, graceMs: GRACE_MS });
/** Troféus e MMR por escada, como o aparelho informa (mapas, bandeiras; o MMR, sem valor, igual aos troféus). */
const standings = (mapas, bandeiras = mapas, mapasMmr = mapas, bandeirasMmr = bandeiras) => ({ mapas: { trophies: mapas, mmr: mapasMmr }, bandeiras: { trophies: bandeiras, mmr: bandeirasMmr } });
const ana = { id: "ana-0000000000000001", name: "Ana", rating: 1200, ladders: standings(1100, 300, 1180, 320) };
const beto = { id: "beto-000000000000002", name: "Beto", rating: 900, ladders: standings(800) };
const caio = { id: "caio-000000000000003", name: "Caio", rating: 500, ladders: standings(400) };
const code = (view) => view.code;
const throwsCode = (fn, expected) => assert.throws(fn, (error) => error instanceof PvpError && error.code === expected, `esperava ${expected}`);

/** Leva uma sala até o começo do 1º tempo. */
function startDuel(rooms, setup = { ladder: "mapas", mode: "ranked" }) {
  const created = rooms.createRoom(ana, setup);
  const c = code(created);
  rooms.joinRoom(c, beto);
  rooms.command(c, ana.id, { type: "ready", ready: true });
  rooms.command(c, beto.id, { type: "ready", ready: true });
  now += COUNTDOWN_MS; rooms.tick();
  return c;
}
const play = (rooms, c, player, legs) => legs.forEach((leg, index) => leg.forEach((round, r) => rooms.command(c, player.id, { type: "round", leg: index, round: r, correct: round.correct, ms: round.ms })));

{
  const rooms = make();
  const created = rooms.createRoom(ana, { ladder: "mapas", mode: "ranked" });
  const c = created.code;
  assert.ok(isValidRoomCode(c));
  assert.equal(created.phase, "open");
  assert.equal(created.seed, null, "o anfitrião não vê a semente (as perguntas) antes da contagem");
  assert.equal(created.opponent, null);
  assert.equal(created.host, true);
  assert.deepEqual(rooms.invite(c), { code: c, phase: "open", ladder: "mapas", mode: "ranked", hostName: "Ana", hostTrophies: 1100, full: false, groups: null }, "sorteio: os modos não aparecem no convite");
  assert.equal(rooms.roomCodeOf(ana.id), c);
  throwsCode(() => rooms.joinRoom(c, ana), "forbidden");
  throwsCode(() => rooms.joinRoom("ZZZZZZ", beto), "not_found");
  throwsCode(() => rooms.joinRoom("abc", beto), "not_found");

  const joined = rooms.joinRoom(c, beto);
  assert.equal(joined.phase, "lobby");
  assert.equal(joined.host, false);
  assert.equal(joined.opponent.name, "Ana");
  assert.equal(joined.opponent.rating, 1200);
  assert.ok(joined.seed, "a partir do lobby (o amigo já entrou) os dois já veem a semente/os modos, antes mesmo de ficar pronto");
  assert.equal(joined.seed, rooms.view(c, ana.id).seed, "a mesma semente para os dois, já no lobby");
  assert.equal(rooms.view(c, ana.id).opponent.name, "Beto", "o anfitrião vê quem entrou");
  assert.equal(rooms.invite(c).full, true);
  throwsCode(() => rooms.joinRoom(c, caio), "room_full");
  throwsCode(() => rooms.view(c, caio.id), "forbidden");
  assert.deepEqual(rooms.joinRoom(c, beto).phase, "lobby", "a mesma pessoa entrar de novo (recarregou a página) não muda nada");

  // pronto: os dois → contagem regressiva (a semente já apareceu no lobby, ver acima; aqui só confere que ela não muda)
  rooms.command(c, ana.id, { type: "ready", ready: true });
  assert.equal(rooms.view(c, ana.id).phase, "lobby");
  assert.equal(rooms.view(c, beto.id).opponent.ready, true, "o amigo vê que o outro está pronto");
  rooms.command(c, beto.id, { type: "ready", ready: true });
  const counting = rooms.view(c, ana.id);
  assert.equal(counting.phase, "countdown");
  assert.equal(counting.startAt, now + COUNTDOWN_MS);
  assert.equal(counting.seed, rooms.view(c, beto.id).seed, "os dois recebem a mesma semente");
  assert.ok(counting.seed && counting.seed.length >= 8);
  assert.deepEqual(drawLegs("mapas", counting.seed).map((leg) => leg.group), drawLegs("mapas", rooms.view(c, beto.id).seed).map((leg) => leg.group));
  // desmarcar durante a contagem volta ao lobby; marcar de novo recomeça
  rooms.command(c, beto.id, { type: "ready", ready: false });
  assert.equal(rooms.view(c, ana.id).phase, "lobby");
  assert.equal(rooms.view(c, ana.id).startAt, null);
  rooms.command(c, beto.id, { type: "ready", ready: true });
  assert.equal(rooms.view(c, ana.id).phase, "countdown");

  // antes da hora não dá para jogar
  throwsCode(() => rooms.command(c, ana.id, { type: "round", leg: 0, round: 0, correct: true, ms: 1000 }), "wrong_phase");
  now += COUNTDOWN_MS - 1; rooms.tick();
  assert.equal(rooms.view(c, ana.id).phase, "countdown");
  now += 1; rooms.tick();
  assert.equal(rooms.view(c, ana.id).phase, "playing");
  throwsCode(() => rooms.command(c, ana.id, { type: "ready", ready: false }), "wrong_phase");

  // rodadas: ordem, repetição, tempo anterior e limites
  throwsCode(() => rooms.command(c, ana.id, { type: "round", leg: 0, round: 1, correct: true, ms: 1000 }), "bad_request");
  throwsCode(() => rooms.command(c, ana.id, { type: "round", leg: 1, round: 0, correct: true, ms: 1000 }), "bad_request");
  throwsCode(() => rooms.command(c, ana.id, { type: "round", leg: 2, round: 0, correct: true, ms: 1000 }), "bad_request");
  throwsCode(() => rooms.command(c, ana.id, { type: "round", leg: 0, round: LEG_ROUNDS, correct: true, ms: 1000 }), "bad_request");
  rooms.command(c, ana.id, { type: "round", leg: 0, round: 0, correct: true, ms: 1500 });
  rooms.command(c, ana.id, { type: "round", leg: 0, round: 0, correct: false, ms: 9999 }); // repetida: ignorada
  const live = rooms.view(c, beto.id);
  assert.equal(live.opponent.legs[0].length, 1, "o amigo vê o progresso ao vivo");
  assert.deepEqual(live.opponent.legs[0][0], { correct: true, ms: 1500 }, "a rodada repetida não sobrescreve");
  rooms.command(c, ana.id, { type: "round", leg: 0, round: 1, correct: true, ms: 5 }); // rápido demais: sobe para o mínimo
  assert.equal(rooms.view(c, ana.id).you.legs[0][1].ms, 250);
  rooms.command(c, ana.id, { type: "round", leg: 0, round: 2, correct: true, ms: 9_999_999 }); // lento demais: limita
  assert.equal(rooms.view(c, ana.id).you.legs[0][2].ms, 120000);

  // termina: Ana 17 acertos × Beto 12 → Ana vence; o resultado sai quando o último termina
  const anaLegs = [rounds(10, 9, 2000), rounds(10, 8, 2000)];
  const anaTail = [anaLegs[0].slice(3), anaLegs[1]];
  anaTail.forEach((leg, index) => leg.forEach((round, r) => rooms.command(c, ana.id, { type: "round", leg: index, round: index === 0 ? r + 3 : r, correct: round.correct, ms: round.ms })));
  assert.equal(rooms.view(c, ana.id).phase, "playing", "falta o Beto");
  assert.equal(rooms.view(c, ana.id).result, null);
  play(rooms, c, beto, [rounds(10, 6, 2500), rounds(10, 6, 2500)]);
  const done = rooms.view(c, ana.id);
  assert.equal(done.phase, "done");
  assert.equal(done.result.outcome, "win");
  assert.equal(done.result.tiebreak, false);
  assert.equal(done.result.you.correct, 17, "Ana: 3 + 6 no 1º tempo e 8 no 2º");
  assert.equal(done.result.opponent.correct, 12);
  assert.equal(done.result.you.forfeited, false);
  const beto2 = rooms.view(c, beto.id);
  assert.equal(beto2.result.outcome, "loss", "cada um vê o resultado do seu lado");
  assert.equal(beto2.result.you.correct, 12);
  assert.equal(beto2.result.opponent.correct, done.result.you.correct);
  assert.equal(rooms.roomCodeOf(ana.id), null, "quem terminou fica livre para outra sala");
  throwsCode(() => rooms.command(c, ana.id, { type: "round", leg: 0, round: 0, correct: true, ms: 1000 }), "wrong_phase");
  throwsCode(() => rooms.joinRoom(c, caio), "wrong_phase");
  // a sala some depois do prazo
  now += DONE_TTL_MS + 1000; rooms.tick();
  assert.equal(rooms.has(c), false);
}

// desempate pelo tempo
{
  const rooms = make();
  const c = startDuel(rooms);
  play(rooms, c, ana, [rounds(10, 7, 3000), rounds(10, 7, 3000)]);
  play(rooms, c, beto, [rounds(10, 7, 3500), rounds(10, 7, 3500)]);
  const result = rooms.view(c, beto.id).result;
  assert.equal(result.outcome, "loss");
  assert.equal(result.tiebreak, true);
  assert.equal(rooms.view(c, ana.id).result.outcome, "win");
}

// empate de verdade
{
  const rooms = make();
  const c = startDuel(rooms);
  play(rooms, c, ana, [rounds(10, 5, 3000), rounds(10, 5, 3000)]);
  play(rooms, c, beto, [rounds(10, 5, 3000), rounds(10, 5, 3000)]);
  assert.equal(rooms.view(c, ana.id).result.outcome, "draw");
}

// desistência no meio: o que falta vale zero, o outro segue e o resultado sai quando ele termina
{
  const rooms = make();
  const c = startDuel(rooms);
  play(rooms, c, ana, [rounds(10, 8, 2000), rounds(4, 4, 2000)]);
  const afterLeave = rooms.command(c, ana.id, { type: "leave" });
  assert.equal(afterLeave.you.forfeited, true, "no meio do jogo, quem saiu ainda tem assento (só marcado como desistente)");
  const seen = rooms.view(c, beto.id);
  assert.equal(seen.phase, "playing", "o outro continua jogando");
  assert.equal(seen.opponent.forfeited, true, "e sabe que o adversário saiu");
  throwsCode(() => rooms.command(c, ana.id, { type: "round", leg: 1, round: 4, correct: true, ms: 1000 }), "wrong_phase");
  play(rooms, c, beto, [rounds(10, 5, 2000), rounds(10, 5, 2000)]);
  const result = rooms.view(c, beto.id).result;
  assert.equal(result.opponent.forfeited, true);
  assert.equal(result.opponent.correct, 12, "o que a Ana respondeu antes de sair conta");
  assert.equal(result.opponent.ms, null);
  assert.equal(result.outcome, "loss", "12 × 10: quem desistiu ainda pode vencer se estiver na frente");
}
// desistir depois de o outro já ter terminado fecha na hora
{
  const rooms = make();
  const c = startDuel(rooms);
  play(rooms, c, beto, [rounds(10, 9, 2000), rounds(10, 9, 2000)]);
  assert.equal(rooms.view(c, ana.id).phase, "playing");
  rooms.command(c, ana.id, { type: "leave" });
  const view = rooms.view(c, beto.id);
  assert.equal(view.phase, "done");
  assert.equal(view.result.outcome, "win");
  assert.equal(view.result.opponent.correct, 0);
}
// os dois desistem: empate em 0
{
  const rooms = make();
  const c = startDuel(rooms);
  rooms.command(c, ana.id, { type: "leave" });
  rooms.command(c, beto.id, { type: "leave" });
  assert.equal(rooms.view(c, ana.id).result.outcome, "draw");
}

// queda de conexão: tolerância de GRACE_MS, depois vale desistência
{
  const rooms = make();
  const c = startDuel(rooms);
  rooms.connect(c, ana.id); rooms.connect(c, beto.id);
  rooms.disconnect(c, beto.id);
  assert.equal(rooms.view(c, ana.id).opponent.connected, false, "o amigo vê que a conexão do outro caiu");
  now += GRACE_MS - 1000; rooms.tick();
  rooms.connect(c, beto.id); // voltou a tempo
  assert.equal(rooms.view(c, ana.id).opponent.connected, true);
  assert.equal(rooms.view(c, ana.id).opponent.forfeited, false);
  rooms.disconnect(c, beto.id);
  now += GRACE_MS + 1000; rooms.tick();
  assert.equal(rooms.view(c, ana.id).opponent.forfeited, true, "ficou fora demais: desistiu");
}
// duas conexões (duas abas): só cai quando as duas caem
{
  const rooms = make();
  const c = startDuel(rooms);
  rooms.connect(c, beto.id); rooms.connect(c, beto.id);
  rooms.disconnect(c, beto.id);
  assert.equal(rooms.view(c, ana.id).opponent.connected, true);
  rooms.disconnect(c, beto.id);
  assert.equal(rooms.view(c, ana.id).opponent.connected, false);
}

// lobby: o amigo sai → a sala volta a ficar aberta e outro pode entrar; o anfitrião sai → a sala fecha
{
  const rooms = make();
  const c = rooms.createRoom(ana, { ladder: "bandeiras", mode: "friendly" }).code;
  rooms.joinRoom(c, beto);
  rooms.command(c, ana.id, { type: "ready", ready: true });
  assert.equal(rooms.command(c, beto.id, { type: "leave" }), null, "saiu do lobby: o assento é removido, não há mais visão para ele");
  const view = rooms.view(c, ana.id);
  assert.equal(view.phase, "open");
  assert.equal(view.opponent, null);
  assert.equal(view.you.ready, false, "o anfitrião precisa marcar pronto de novo");
  assert.equal(rooms.roomCodeOf(beto.id), null);
  assert.equal(rooms.joinRoom(c, caio).phase, "lobby");
  rooms.command(c, ana.id, { type: "leave" });
  assert.equal(rooms.view(c, caio.id).phase, "closed");
  assert.equal(rooms.view(c, caio.id).closedReason, "host-left");
  throwsCode(() => rooms.joinRoom(c, beto), "wrong_phase");
}
// anfitrião cancela a sala aberta
{
  const rooms = make();
  const c = rooms.createRoom(ana, { ladder: "mapas", mode: "friendly" }).code;
  rooms.command(c, ana.id, { type: "leave" });
  assert.equal(rooms.view(c, ana.id).closedReason, "cancelled");
}
// criar outra sala fecha a anterior
{
  const rooms = make();
  const first = rooms.createRoom(ana, { ladder: "mapas", mode: "friendly" }).code;
  const second = rooms.createRoom(ana, { ladder: "bandeiras", mode: "ranked" }).code;
  assert.notEqual(first, second);
  assert.equal(rooms.view(first, ana.id).phase, "closed");
  assert.equal(rooms.roomCodeOf(ana.id), second);
}
// sala aberta que ninguém aceita expira
{
  const rooms = make();
  const c = rooms.createRoom(ana, { ladder: "mapas", mode: "friendly" }).code;
  now += OPEN_TTL_MS + 1000; rooms.tick();
  assert.equal(rooms.view(c, ana.id).closedReason, "expired");
  throwsCode(() => rooms.joinRoom(c, beto), "wrong_phase");
}
// notificações: cada mudança avisa a sala
{
  const rooms = make();
  const changes = [];
  rooms.onChange = (c) => changes.push(c);
  const c = rooms.createRoom(ana, { ladder: "mapas", mode: "friendly" }).code;
  assert.equal(changes.length, 0, "criar não avisa ninguém (não há quem ouvir)");
  rooms.joinRoom(c, beto);
  rooms.command(c, ana.id, { type: "ready", ready: true });
  assert.ok(changes.length >= 2 && changes.every((x) => x === c));
}
// nome vazio vira "Jogador"; números ruins viram limites
{
  const rooms = make();
  const view = rooms.createRoom({ id: "x".repeat(20), name: "  ", rating: NaN, ladders: { mapas: { trophies: -5, mmr: NaN } } }, { ladder: "mapas", mode: "friendly" });
  assert.equal(view.you.name, "Jogador");
  assert.equal(view.you.rating, 0);
  assert.equal(view.you.trophies, 0);
  assert.equal(view.you.mmr, 0);
}
// troféus e MMR da sala são os da escada dela (a pessoa informa as duas)
{
  const rooms = make();
  const hostView = rooms.createRoom(ana, { ladder: "bandeiras", mode: "ranked" });
  assert.equal(hostView.you.trophies, 300, "sala de Bandeiras mostra os troféus de Bandeiras");
  assert.equal(hostView.you.mmr, 320);
  const guestView = rooms.joinRoom(hostView.code, beto);
  assert.equal(guestView.opponent.trophies, 300);
  assert.equal(guestView.opponent.mmr, 320, "o aparelho do adversário recebe o MMR (para a conta dos troféus)");
  const matched = make();
  const c = matched.createMatchedRoom(ana, beto, { ladder: "mapas", mode: "ranked" });
  assert.equal(matched.view(c, beto.id).opponent.trophies, 1100);
  assert.equal(matched.view(c, beto.id).opponent.mmr, 1180);
}
// o placar vai para o histórico uma vez, e a força que ele devolve aparece no resultado dos dois lados
{
  const rooms = make();
  const settled = [];
  rooms.onSettle = (match) => { settled.push(match); return { a: { before: 1000, after: 1012 }, b: { before: 1000, after: 988 } }; };
  const c = startDuel(rooms);
  play(rooms, c, ana, [rounds(10, 9), rounds(10, 9)]);
  play(rooms, c, beto, [rounds(10, 1), rounds(10, 1)]);
  assert.equal(settled.length, 1);
  assert.equal(settled[0].origin, "invite");
  assert.equal(settled[0].a.id, ana.id, "a é o anfitrião");
  assert.equal(settled[0].a.outcome, "win");
  assert.equal(settled[0].b.totals.correct, 2);
  assert.ok(settled[0].seed);
  assert.deepEqual(rooms.view(c, ana.id).result.rating, { you: { before: 1000, after: 1012 }, opponent: { before: 1000, after: 988 } });
  assert.deepEqual(rooms.view(c, beto.id).result.rating.you, { before: 1000, after: 988 });
  assert.equal(make().createRoom(ana, { ladder: "mapas", mode: "friendly" }).origin, "invite");
}

// ───────────── histórico no servidor (a força sai de reler o registro) ─────────────
const sideOf = (player, outcome, correct) => ({ id: player.id, name: player.name, trophies: 0, outcome, totals: sideTotals([rounds(10, correct), rounds(10, correct)]) });
const matchOf = (code, mode, a, b, at) => ({ code, at, origin: "queue", ladder: "mapas", mode, seed: "semente123", tiebreak: false, a, b });
{
  const history = new PvpHistory(null);
  assert.equal(history.ratingOf(ana.id), PVP_RATING_BASE, "sem duelo, força de base");
  assert.deepEqual(history.record(matchOf("AAAAAA", "ranked", sideOf(ana, "win", 8), sideOf(beto, "loss", 5), 1)), { a: { before: 1000, after: 1012 }, b: { before: 1000, after: 988 } });
  assert.deepEqual(history.record(matchOf("AAAAAA", "ranked", sideOf(ana, "win", 8), sideOf(beto, "loss", 5), 1)), { a: null, b: null }, "o mesmo duelo não conta duas vezes");
  assert.deepEqual(history.record(matchOf("BBBBBB", "friendly", sideOf(beto, "win", 9), sideOf(ana, "loss", 3), 2)), { a: null, b: null }, "amistoso não mexe na força");
  assert.equal(history.size, 2);
  assert.equal(history.ratingOf(ana.id), 1012);
  assert.deepEqual(history.profileOf(beto.id, "Beto", 5), { name: "Beto", rating: 988, ranked: { wins: 0, losses: 1, draws: 0 }, friendly: { wins: 1, losses: 0, draws: 0 }, since: 5 });
  const mine = history.matchesOf(ana.id);
  assert.equal(mine.length, 2);
  assert.equal(mine[0].code, "BBBBBB", "o mais novo primeiro");
  assert.equal(mine[0].you.outcome, "loss");
  assert.equal(mine[0].opponent.name, "Beto");
  assert.equal(mine[0].you.rating, null);
  assert.deepEqual(mine[1].you.rating, { before: 1000, after: 1012 });
  assert.equal(history.matchesOf(ana.id, 1).length, 1);
  assert.ok(!JSON.stringify(mine).includes(beto.id), "o id do adversário não sai do servidor");
}
{
  const dir = mkdtempSync(join(tmpdir(), "pvp-hist-"));
  const file = join(dir, "matches.jsonl");
  const history = new PvpHistory(file);
  history.record(matchOf("CCCCCC", "ranked", sideOf(ana, "win", 8), sideOf(beto, "loss", 5), 10));
  history.record(matchOf("DDDDDD", "ranked", sideOf(ana, "draw", 5), sideOf(caio, "draw", 5), 11));
  appendFileSync(file, '{"code":"EEEEEE","at":12,"ladder":"mapas"'); // o servidor caiu no meio da gravação
  const reread = new PvpHistory(file);
  assert.equal(reread.size, 2, "a linha cortada fica de fora");
  for (const player of [ana, beto, caio]) assert.equal(reread.ratingOf(player.id), history.ratingOf(player.id), "a força sai de reler o registro, igual");
  reread.record(matchOf("FFFFFF", "ranked", sideOf(caio, "win", 9), sideOf(beto, "loss", 2), 13));
  const third = new PvpHistory(file);
  assert.equal(third.size, 3, "a gravação depois da linha cortada começa numa linha nova (não se perde)");
  assert.equal(third.ratingOf(caio.id), reread.ratingOf(caio.id));
  rmSync(dir, { recursive: true, force: true });
}

// ───────────── jogadores: migração do players.json v1 → v2 (os ids reais e seus hashes não podem se perder) ─────────────
{
  const dir = mkdtempSync(join(tmpdir(), "pvp-players-"));
  const file = join(dir, "players.json");
  const backup = join(dir, "players.v1.bak.json");
  const enzo = "penzo000000000000000000001";
  const secret = "segredo-real-do-enzo-0000000001";
  const hash = createHash("sha256").update(secret).digest("hex");
  // o formato de hoje (versão 1): o objeto { id: { hash, createdAt, lastSeen } } direto, sem "version"
  const v1 = { [enzo]: { hash, createdAt: 1000, lastSeen: 2000 }, pamigo000000000000000000002: { hash: "ab".repeat(32), createdAt: 1100, lastSeen: 1200 }, pamiga000000000000000000003: { hash: "cd".repeat(32), createdAt: 1300, lastSeen: 1300 } };
  writeFileSync(file, JSON.stringify(v1));
  const migrated = new PlayerRegistry(file);
  assert.equal(migrated.loadedVersion, 1);
  assert.equal(migrated.size, 3, "os 3 ids continuam");
  assert.ok(existsSync(backup), "o original fica copiado ao lado");
  assert.deepEqual(JSON.parse(readFileSync(backup, "utf8")), v1);
  const written = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(written.version, 2);
  assert.deepEqual(Object.keys(written.players).sort(), Object.keys(v1).sort());
  assert.equal(written.players[enzo].hash, hash, "o hash que autentica não muda");
  assert.deepEqual([written.players[enzo].createdAt, written.players[enzo].name], [1000, ""], "data de criação mantida, sem nome ainda");
  assert.equal(migrated.authenticate(enzo, secret), true, "o mesmo segredo continua entrando");
  assert.equal(migrated.authenticate(enzo, "outro-segredo-qualquer-00000000000"), false);
  migrated.setName(enzo, "  Enzo ");
  migrated.flush();
  migrated.setStandings(enzo, standings(640, 120, 700, 150));
  migrated.flush();
  const again = new PlayerRegistry(file);
  assert.equal(again.loadedVersion, 2, "já no formato novo: não migra de novo");
  assert.equal(again.nameOf(enzo), "Enzo");
  assert.deepEqual(again.standingsOf(enzo), standings(640, 120, 700, 150), "troféus e MMR por escada sobrevivem ao reinício");
  const enzoCode = again.codeOf(enzo);
  assert.ok(isFriendCode(enzoCode), "código de amigo sorteado na primeira vez");
  assert.deepEqual(again.leaderboard("bandeiras", 10, enzo), [{ name: "Enzo", trophies: 120, you: true, code: enzoCode }]);
  again.flush();
  assert.equal(new PlayerRegistry(file).codeOf(enzo), enzoCode, "o código de amigo não muda depois de reiniciar");
  assert.equal(new PlayerRegistry(file).idOfCode(enzoCode), enzo);
  assert.equal(again.createdAtOf(enzo), 1000);
  assert.deepEqual(JSON.parse(readFileSync(backup, "utf8")), v1, "a cópia do original não é tocada de novo");
  writeFileSync(file, "{isto não é json");
  assert.equal(new PlayerRegistry(file).size, 0);
  assert.ok(readdirSync(dir).some((name) => name.includes("ilegivel")), "arquivo ilegível fica guardado ao lado, nunca sobrescrito");
  rmSync(dir, { recursive: true, force: true });
}

// ───────────── fila ("Buscar duelo"), com relógio falso ─────────────
const MAPAS_RANKED = { ladder: "mapas", mode: "ranked" };
const BANDEIRAS_FRIENDLY = { ladder: "bandeiras", mode: "friendly" };
const makeQueue = (options = {}) => {
  const rooms = make();
  const queue = new PvpQueue({ rooms, now: () => now, random, ...options });
  rooms.onQueueRoomLeft = (_code, remaining) => queue.requeue(remaining);
  return { rooms, queue };
};
const online = (queue, ...players) => players.forEach((player) => queue.connect(player.id));
/** Ana e Beto se acham e aceitam; devolve o código da sala. */
function matchAnaBeto(queue, prefs = MAPAS_RANKED) {
  queue.join(ana, prefs);
  const offer = queue.join(beto, prefs).offer;
  queue.respond(ana.id, offer.id, true);
  return queue.respond(beto.id, offer.id, true).room;
}

// par exato: proposta na hora; os dois aceitam → sala da fila já na contagem
{
  const { rooms, queue } = makeQueue();
  online(queue, ana, beto);
  const first = queue.join(ana, MAPAS_RANKED);
  assert.equal(first.state, "waiting");
  assert.equal(first.waiting, 1);
  const second = queue.join(beto, MAPAS_RANKED);
  assert.equal(second.state, "offer", "par exato: proposta na hora");
  assert.deepEqual([second.offer.switchLadder, second.offer.switchMode], [false, false]);
  assert.equal(second.offer.opponent.name, "Ana");
  assert.equal(second.offer.opponent.trophies, 1100, "a proposta mostra os troféus do adversário na escada dela");
  assert.equal(second.offer.expiresAt, now + OFFER_TTL_MS);
  const offerId = second.offer.id;
  assert.equal(queue.view(ana.id).offer.id, offerId, "a mesma proposta para os dois");
  assert.equal(queue.respond(ana.id, offerId, true).offer.youAccepted, true);
  assert.equal(queue.view(beto.id).offer.opponentAccepted, true, "o outro vê que já aceitaram");
  const matched = queue.respond(beto.id, offerId, true);
  assert.equal(matched.state, "matched");
  assert.ok(isValidRoomCode(matched.room));
  assert.equal(queue.view(ana.id).room, matched.room);
  assert.equal(queue.size, 0);
  const room = rooms.view(matched.room, ana.id);
  assert.equal(room.origin, "queue");
  assert.equal(room.phase, "countdown", "aceitar vale como pronto: a sala nasce na contagem");
  assert.equal(room.host, true, "quem esperava há mais tempo é o anfitrião");
  assert.equal(room.startAt, now + MATCH_COUNTDOWN_MS);
  assert.deepEqual([room.ladder, room.mode], ["mapas", "ranked"]);
  assert.ok(room.seed, "os dois já veem os modos na contagem");
  assert.equal(rooms.phaseOf(beto.id), "countdown");
  rooms.connect(matched.room, ana.id); rooms.connect(matched.room, beto.id);
  now += MATCH_COUNTDOWN_MS; rooms.tick();
  assert.equal(rooms.view(matched.room, beto.id).phase, "playing", "com os dois conectados, começa na hora");
  assert.equal(queue.respond(ana.id, offerId, false).state, "matched", "resposta a uma proposta que já acabou só devolve a visão");
  queue.forgetMatch(ana.id);
  assert.equal(queue.view(ana.id).state, "idle");
}
// recusar o que você mesmo pediu: sai da fila; o outro volta ao lugar que tinha; o mesmo par espera o intervalo
{
  const { queue } = makeQueue();
  online(queue, ana, beto, caio);
  const sinceAna = queue.join(ana, MAPAS_RANKED).since;
  const offer = queue.join(beto, MAPAS_RANKED).offer;
  queue.respond(ana.id, offer.id, true);
  assert.equal(queue.respond(beto.id, offer.id, false).state, "idle", "recusar o que pediu tira da fila");
  const back = queue.view(ana.id);
  assert.equal(back.state, "waiting");
  assert.equal(back.since, sinceAna, "no lugar que tinha");
  assert.equal(back.notice.kind, "opponent-declined");
  assert.equal(queue.join(beto, MAPAS_RANKED).state, "waiting", "quem recusou volta logo, mas não é oferecido de novo ao mesmo par durante o intervalo");
  const caioView = queue.join(caio, MAPAS_RANKED);
  assert.equal(caioView.state, "offer");
  assert.equal(caioView.offer.opponent.name, "Ana", "o terceiro recebe a mais antiga");
  assert.equal(queue.view(beto.id).state, "waiting");
  queue.leave(caio.id);
  now += REOFFER_COOLDOWN_MS; queue.tick();
  assert.equal(queue.view(ana.id).state, "offer", "passado o intervalo, o par volta a valer");
}
// sem resposta no prazo: quem não respondeu sai, quem aceitou volta ao lugar
{
  const { queue } = makeQueue();
  online(queue, ana, beto, caio, { id: "dora-000000000000005" });
  queue.join(ana, MAPAS_RANKED);
  const offer = queue.join(beto, MAPAS_RANKED).offer;
  queue.respond(ana.id, offer.id, true);
  now += OFFER_TTL_MS - 1; queue.tick();
  assert.equal(queue.view(beto.id).state, "offer", "ainda no prazo");
  now += 1; queue.tick();
  assert.equal(queue.view(beto.id).state, "idle");
  assert.equal(queue.view(beto.id).notice.kind, "you-timeout");
  assert.equal(queue.view(ana.id).state, "waiting");
  assert.equal(queue.view(ana.id).notice.kind, "opponent-timeout");
  // os dois em silêncio: os dois saem
  queue.join(caio, MAPAS_RANKED); // casa com a Ana
  now += OFFER_TTL_MS; queue.tick();
  assert.deepEqual([queue.view(ana.id).state, queue.view(caio.id).state], ["idle", "idle"]);
}
// padrão (CROSS_DELAY_MS = 0): sem par exato, a proposta de troca vem na hora
{
  assert.equal(CROSS_DELAY_MS, 0);
  const { queue } = makeQueue();
  online(queue, ana, beto);
  queue.join(ana, MAPAS_RANKED);
  const toBeto = queue.join(beto, BANDEIRAS_FRIENDLY);
  assert.equal(toBeto.state, "offer", "troca proposta na hora, sem esperar um par exato");
  assert.deepEqual([toBeto.offer.ladder, toBeto.offer.mode, toBeto.offer.switchLadder, toBeto.offer.switchMode], ["mapas", "ranked", true, true]);
}
// com espera configurada (crossDelayMs, para quando a fila encher): a troca só vem depois dela; primeiro o que pediu o mais antigo, depois o inverso
const WAIT = 15000;
{
  const { queue } = makeQueue({ crossDelayMs: WAIT });
  online(queue, ana, beto, caio);
  queue.join(ana, MAPAS_RANKED);
  assert.equal(queue.join(beto, BANDEIRAS_FRIENDLY).state, "waiting", "sem par exato: espera um pouco antes de propor troca");
  now += WAIT - 1; queue.tick();
  assert.equal(queue.view(beto.id).state, "waiting");
  now += 1; queue.tick();
  const toBeto = queue.view(beto.id).offer;
  assert.ok(toBeto, "passou o tempo: proposta de troca");
  assert.deepEqual([toBeto.ladder, toBeto.mode], ["mapas", "ranked"], "primeiro vale o que pediu quem espera há mais tempo");
  assert.deepEqual([toBeto.switchLadder, toBeto.switchMode], [true, true], "para o Beto é troca de escada e de modo");
  const toAna = queue.view(ana.id).offer;
  assert.deepEqual([toAna.switchLadder, toAna.switchMode], [false, false], "para a Ana é exatamente o que ela pediu");
  assert.equal(queue.respond(beto.id, toBeto.id, false).state, "offer", "recusar a troca não tira da fila: vem a proposta inversa");
  const inverse = queue.view(ana.id).offer;
  assert.notEqual(inverse.id, toBeto.id);
  assert.deepEqual([inverse.ladder, inverse.mode], ["bandeiras", "friendly"], "o inverso: vale o que o Beto pediu");
  assert.deepEqual([inverse.switchLadder, inverse.switchMode], [true, true], "agora quem troca é a Ana");
  assert.equal(queue.respond(ana.id, inverse.id, false).state, "waiting", "a Ana também não quer trocar: continua na fila");
  assert.equal(queue.view(beto.id).state, "waiting");
  assert.equal(queue.view(beto.id).notice.kind, "switch-declined");
  now += REOFFER_COOLDOWN_MS * 3; queue.tick();
  assert.equal(queue.view(ana.id).state, "waiting", "par que recusou as duas trocas não é proposto de novo");
  const caioView = queue.join(caio, BANDEIRAS_FRIENDLY);
  assert.equal(caioView.offer?.opponent.name, "Beto", "quem chega querendo exatamente o mesmo casa na hora");
  assert.equal(caioView.offer.switchLadder, false);
}
// troca aceita: a sala sai com o que o mais antigo pediu
{
  const { rooms, queue } = makeQueue({ crossDelayMs: WAIT });
  online(queue, ana, beto);
  queue.join(ana, { ladder: "bandeiras", mode: "friendly" });
  queue.join(beto, { ladder: "mapas", mode: "friendly" });
  now += WAIT; queue.tick();
  const offer = queue.view(beto.id).offer;
  assert.deepEqual([offer.switchLadder, offer.switchMode], [true, false], "só a escada muda");
  queue.respond(beto.id, offer.id, true);
  const done = queue.respond(ana.id, offer.id, true);
  assert.equal(done.state, "matched");
  assert.deepEqual([rooms.view(done.room, beto.id).ladder, rooms.view(done.room, beto.id).mode], ["bandeiras", "friendly"]);
}
// com espera configurada, o par exato que chega dentro dela passa na frente da troca
{
  const { queue } = makeQueue({ crossDelayMs: WAIT });
  online(queue, ana, beto, caio);
  queue.join(ana, MAPAS_RANKED);
  queue.join(beto, { ladder: "bandeiras", mode: "ranked" });
  now += WAIT - 1000; queue.tick();
  assert.equal(queue.join(caio, MAPAS_RANKED).offer?.opponent.name, "Ana");
  assert.equal(queue.view(beto.id).state, "waiting");
}
// presença (o app aberto) e tempo máximo da busca
{
  const { queue } = makeQueue();
  queue.join(ana, MAPAS_RANKED); // sem abrir o canal
  now += GRACE_MS; queue.tick();
  assert.equal(queue.view(ana.id).state, "waiting", "dentro da tolerância");
  now += 1; queue.tick();
  assert.equal(queue.view(ana.id).state, "idle", "sem o app aberto, o pedido cai");
  assert.equal(queue.view(ana.id).notice.kind, "connection-lost");
  queue.connect(beto.id);
  queue.join(beto, MAPAS_RANKED);
  queue.disconnect(beto.id);
  now += GRACE_MS - 1; queue.tick();
  queue.connect(beto.id); // voltou a tempo
  now += GRACE_MS * 2; queue.tick();
  assert.equal(queue.view(beto.id).state, "waiting");
  now += QUEUE_TTL_MS; queue.tick();
  assert.equal(queue.view(beto.id).state, "idle");
  assert.equal(queue.view(beto.id).notice.kind, "search-expired");
}
// sair da fila com proposta aberta vale como recusa; mudar a escolha mantém o lugar
{
  const { queue } = makeQueue();
  online(queue, ana, beto);
  const first = queue.join(ana, MAPAS_RANKED);
  now += 5000;
  const changed = queue.join(ana, BANDEIRAS_FRIENDLY);
  assert.equal(changed.since, first.since, "mudar o que busca não perde o lugar");
  assert.deepEqual(changed.prefs, BANDEIRAS_FRIENDLY);
  queue.join(beto, BANDEIRAS_FRIENDLY);
  assert.equal(queue.leave(ana.id).state, "idle");
  assert.equal(queue.view(beto.id).state, "waiting");
  assert.equal(queue.view(beto.id).notice.kind, "opponent-declined");
}
// sala da fila desfeita antes de começar (o outro saiu): quem ficou volta ao lugar que tinha
{
  const { rooms, queue } = makeQueue();
  online(queue, ana, beto);
  const code = matchAnaBeto(queue);
  const sinceAna = queue.view(ana.id).since; // null: fora da fila, com a sala achada
  assert.equal(sinceAna, null);
  rooms.connect(code, ana.id); rooms.connect(code, beto.id);
  rooms.command(code, beto.id, { type: "leave" });
  const closed = rooms.view(code, ana.id);
  assert.equal(closed.phase, "closed");
  assert.equal(closed.closedReason, "opponent-left", "sala da fila não reabre esperando convite");
  const back = queue.view(ana.id);
  assert.equal(back.state, "waiting", "quem ficou volta para a fila");
  assert.equal(back.notice.kind, "opponent-left");
  assert.equal(rooms.phaseOf(ana.id), null);
}
// quem aceitou e não apareceu na sala: ela não começa sem os dois; passada a tolerância, fecha e o outro volta para a fila
{
  const { rooms, queue } = makeQueue();
  online(queue, ana, beto);
  const code = matchAnaBeto(queue);
  rooms.connect(code, ana.id); // o Beto nunca abre a sala
  now += MATCH_COUNTDOWN_MS; rooms.tick();
  assert.equal(rooms.view(code, ana.id).phase, "countdown", "sala da fila só começa com os dois conectados");
  now += GRACE_MS; rooms.tick();
  assert.equal(rooms.view(code, ana.id).closedReason, "opponent-left");
  assert.equal(queue.view(ana.id).state, "waiting");
}
// os dois somem da sala da fila antes de começar (fecharam o app): a sala fecha e NINGUÉM volta para a fila como fantasma
// (achado no teste de navegador: o segundo a cair pela tolerância era devolvido à fila e proposto a quem buscasse logo depois)
{
  const { rooms, queue } = makeQueue();
  online(queue, ana, beto);
  const code = matchAnaBeto(queue);
  rooms.connect(code, ana.id); rooms.connect(code, beto.id);
  rooms.disconnect(code, ana.id); rooms.disconnect(code, beto.id);
  queue.disconnect(ana.id); queue.disconnect(beto.id);
  now += GRACE_MS + 1; rooms.tick();
  assert.equal(rooms.view(code, ana.id).closedReason, "opponent-left");
  assert.equal(queue.size, 0, "ninguém volta para a fila sem estar conectado");
  queue.connect(caio.id);
  assert.equal(queue.join(caio, MAPAS_RANKED).state, "waiting", "quem busca depois não recebe proposta de um fantasma");
}
// quem ficou conectado na sala, mas já sem o canal da fila, também não volta
{
  const { rooms, queue } = makeQueue();
  online(queue, ana, beto);
  const code = matchAnaBeto(queue);
  rooms.connect(code, ana.id); rooms.connect(code, beto.id);
  queue.disconnect(ana.id);
  rooms.command(code, beto.id, { type: "leave" });
  assert.equal(queue.view(ana.id).state, "idle");
}
// cada mudança avisa quem ela afeta
{
  const { queue } = makeQueue();
  const touched = [];
  queue.onChange = (id) => touched.push(id);
  online(queue, ana, beto);
  queue.join(ana, MAPAS_RANKED);
  queue.join(beto, MAPAS_RANKED);
  assert.ok(touched.includes(ana.id) && touched.includes(beto.id));
  assert.ok(queue.view(ana.id).rev > 0);
}

// ───────────── os 2 modos do duelo entre pessoas ─────────────
{
  // sorteio: nunca dois do mesmo eixo (Capitais clicar + Capitais escrita, Silhueta opções + Silhueta escrita)
  const pairs = new Map();
  for (let i = 0; i < 4000; i += 1) {
    for (const ladder of ["mapas", "bandeiras"]) {
      const [a, b] = drawPvpGroups(ladder, `semente-${i}`);
      assert.notEqual(groupDef(a).axis, groupDef(b).axis, `${ladder} ${a} + ${b}: um de cada eixo`);
      assert.ok(groupDef(a).ladder === ladder && groupDef(b).ladder === ladder);
      if (ladder === "mapas") pairs.set(`${a}+${b}`, (pairs.get(`${a}+${b}`) ?? 0) + 1);
    }
  }
  assert.ok(![...pairs.keys()].some((key) => key === "capitais-clique+capitais-escrita" || key === "capitais-escrita+capitais-clique" || key === "silhueta-opcoes+silhueta-escrita" || key === "silhueta-escrita+silhueta-opcoes"));
  assert.ok(pairs.size >= 10, "as outras combinações de eixos diferentes aparecem");
  assert.deepEqual(drawPvpGroups("mapas", "x"), drawPvpGroups("mapas", "x"), "a mesma semente dá os mesmos modos");
  assert.ok(isGroupPair("mapas", ["capitais-clique", "capitais-escrita"]), "à mão (amistoso) vale qualquer par da escada");
  assert.ok(!isGroupPair("mapas", ["mapa", "mapa"]) && !isGroupPair("mapas", ["mapa", "atuais"]) && !isGroupPair("mapas", ["mapa"]) && !isGroupPair("mapas", null));
  const legs = pvpLegs("semente", ["silhueta-escrita", "mapa"]);
  assert.deepEqual(legs.map((leg) => leg.group), ["silhueta-escrita", "mapa"]);
  assert.deepEqual(pvpLegs("semente", ["silhueta-escrita", "mapa"]), legs, "sentido e baralho da semente: iguais nos dois aparelhos");
  // a sala: o amistoso aceita os modos do anfitrião (aparecem desde o convite); o valendo ignora e sorteia
  const rooms = make();
  const chosen = rooms.createRoom(ana, { ladder: "mapas", mode: "friendly", groups: ["capitais-escrita", "silhueta-opcoes"] });
  assert.deepEqual([chosen.chosen, chosen.groups, chosen.seed], [true, ["capitais-escrita", "silhueta-opcoes"], null], "o anfitrião vê a própria escolha; a semente ainda não");
  assert.deepEqual(rooms.invite(chosen.code).groups, ["capitais-escrita", "silhueta-opcoes"], "o convite mostra os modos escolhidos");
  const ranked = rooms.createRoom(beto, { ladder: "mapas", mode: "ranked", groups: ["capitais-escrita", "capitais-clique"] });
  assert.deepEqual([ranked.chosen, ranked.groups], [false, null], "no valendo a escolha é ignorada e o sorteio só aparece no lobby");
  const lobby = rooms.joinRoom(ranked.code, caio);
  assert.equal(lobby.groups.length, 2);
  assert.notEqual(groupDef(lobby.groups[0]).axis, groupDef(lobby.groups[1]).axis);
  const bad = rooms.createRoom(caio, { ladder: "bandeiras", mode: "friendly", groups: ["mapa", "atuais"] });
  assert.equal(bad.chosen, false, "modos de outra escada: vira sorteio");
}

// ───────────── amizades (estado puro, com arquivo) ─────────────
{
  let clock = 1000;
  const graph = new FriendGraph(null, () => clock);
  assert.equal(graph.request("a", "a"), "self");
  assert.equal(graph.request("a", "b"), "sent");
  assert.equal(graph.request("a", "b"), "sent", "pedir de novo não duplica");
  assert.deepEqual([graph.state("a", "b"), graph.state("b", "a"), graph.state("a", "c"), graph.state("a", "a")], ["outgoing", "incoming", "none", "self"]);
  assert.deepEqual(graph.list("b").incoming.map((item) => item.id), ["a"]);
  assert.equal(graph.respond("b", "c", true), false, "sem pedido, nada a responder");
  clock = 2000;
  assert.equal(graph.respond("b", "a", true), true);
  assert.deepEqual([graph.state("a", "b"), graph.state("b", "a")], ["friends", "friends"]);
  assert.deepEqual(graph.list("a").friends, [{ id: "b", since: 2000 }]);
  assert.equal(graph.request("a", "b"), "already");
  // pedido cruzado vira amizade na hora
  graph.request("c", "a");
  assert.equal(graph.request("a", "c"), "accepted", "os dois pediram: amigos");
  // recusar, cancelar e desfazer
  graph.request("d", "a");
  assert.equal(graph.respond("a", "d", false), true);
  assert.equal(graph.state("a", "d"), "none", "recusado some");
  graph.request("a", "e");
  assert.equal(graph.remove("a", "e"), true, "cancelar o pedido enviado");
  assert.equal(graph.state("e", "a"), "none");
  assert.equal(graph.remove("a", "b"), true, "desfazer a amizade");
  assert.equal(graph.state("a", "b"), "none");
  assert.equal(graph.link("a", "b"), true, "convite por link: amizade direta");
  assert.equal(graph.link("b", "a"), false, "já eram");
  // sobrevive ao reinício
  const dir = mkdtempSync(join(tmpdir(), "pvp-friends-"));
  const file = join(dir, "friends.json");
  const saved = new FriendGraph(file, () => clock);
  saved.link("x", "y"); saved.request("z", "x");
  saved.flush();
  const again = new FriendGraph(file, () => clock);
  assert.deepEqual([again.state("x", "y"), again.state("x", "z")], ["friends", "incoming"]);
  writeFileSync(file, "{quebrado");
  assert.equal(new FriendGraph(file, () => clock).state("x", "y"), "none", "arquivo ilegível: começa vazio");
  assert.ok(readdirSync(dir).some((name) => name.includes("ilegivel")), "e o arquivo fica guardado ao lado");
  rmSync(dir, { recursive: true, force: true });
}
// resumo do perfil e placar
{
  assert.equal(parseSummary(null), null);
  const summary = parseSummary({ level: 0, xp: -5, mastery: 250, dominated: 12.4, rounds: "900", collection: { discovered: 40, total: 262 }, achievements: { unlocked: 9 }, botDuels: { wins: 3 } });
  assert.deepEqual(summary, { level: 1, xp: 0, mastery: 100, dominated: 12, rounds: 900, sessions: 0, collection: { discovered: 40, total: 262 }, achievements: { unlocked: 9, total: 0 }, botDuels: { wins: 3, losses: 0, draws: 0 } });
  const tally = tallyMatches([{ mode: "ranked", you: { outcome: "win" } }, { mode: "ranked", you: { outcome: "loss" } }, { mode: "friendly", you: { outcome: "draw" } }]);
  assert.deepEqual(tally, { ranked: { wins: 1, losses: 1, draws: 0 }, friendly: { wins: 0, losses: 0, draws: 1 } });
  assert.deepEqual([winRate(tally.ranked), winRate({ wins: 0, losses: 0, draws: 0 }), winRate({ wins: 2, losses: 1, draws: 1 })], [50, null, 63]);
  assert.ok(isSocialEvent({ kind: "challenge", from: { code: "ABCDEF", name: "Ana" }, at: 1, room: "K7Q2MP", ladder: "mapas", mode: "ranked" }));
  assert.ok(!isSocialEvent({ kind: "challenge", from: { code: "ABCDEF", name: "Ana" }, at: 1, ladder: "mapas", mode: "ranked" }), "desafio sem sala");
  assert.ok(isFriendCode("K7Q2MP") && !isFriendCode("K7Q2M0"));
}

// ───────────── contas fora do ranking (contas de teste) ─────────────
{
  const dir = mkdtempSync(join(tmpdir(), "pvp-hidden-"));
  const hiddenFile = join(dir, "ranking-hidden.json");
  const registry = new PlayerRegistry(null, Date.now, hiddenFile);
  const ids = ["pteste-oculto-000000001", "pjogador-real-0000000002", "pconta-teste-00000000003"];
  ids.forEach((id, index) => { registry.authenticate(id, `segredo-de-teste-${index}-0000000000000`); registry.setName(id, ["Teste", "Real", "Outro teste"][index]); registry.setStandings(id, standings(500 - index * 100)); });
  const names = () => registry.leaderboard("mapas", 50, ids[1]).map((row) => row.name);
  assert.deepEqual(names(), ["Teste", "Real", "Outro teste"], "sem arquivo, todos aparecem");
  writeFileSync(hiddenFile, JSON.stringify({ hidden: [ids[0], ids[2], "id-invalido", 42] }));
  assert.deepEqual(names(), ["Real"], "quem está na lista some do ranking, sem reiniciar (lista em formato de array; ids inválidos são ignorados)");
  assert.equal(registry.leaderboard("mapas", 50, ids[1])[0].you, true, "quem vê continua marcado como você");
  assert.deepEqual(registry.leaderboard("mapas", 50, ids[0]).map((row) => row.you), [false], "quem está escondido não aparece nem para si mesmo");
  await new Promise((resolve) => setTimeout(resolve, 30)); // garante outro mtime
  writeFileSync(hiddenFile, JSON.stringify({ hidden: { [ids[1]]: "Real" } }));
  assert.deepEqual(names(), ["Teste", "Outro teste"], "o arquivo mudou: relido (formato de objeto id → nome)");
  await new Promise((resolve) => setTimeout(resolve, 30));
  writeFileSync(hiddenFile, "{isto não é json");
  assert.deepEqual(names(), ["Teste", "Real", "Outro teste"], "arquivo ilegível: ninguém fica de fora");
  rmSync(hiddenFile);
  assert.deepEqual(names(), ["Teste", "Real", "Outro teste"], "sem arquivo de novo: todos aparecem");
  assert.equal(registry.has(ids[0]), true, "esconder do ranking não apaga o jogador");
  rmSync(dir, { recursive: true, force: true });
}

// ───────────── HTTP + SSE de verdade ─────────────
const registry = new PlayerRegistry(null);
assert.equal(registry.authenticate("id-curto", "segredo-curto"), false, "id e segredo fora do formato");
const A = { id: "ana-http-0000000001", secret: "segredo-da-ana-000000000000001" };
const B = { id: "beto-http-000000000002", secret: "segredo-do-beto-00000000000002" };
assert.equal(registry.authenticate(A.id, A.secret), true, "primeiro uso registra");
assert.equal(registry.authenticate(A.id, A.secret), true);
assert.equal(registry.authenticate(A.id, "outro-segredo-qualquer-0000000000"), false, "outro segredo com o mesmo id não entra");
assert.equal(registry.authenticate(B.id, B.secret), true);

const realRooms = new PvpRooms({ countdownMs: 150 });
const pvp = createPvpHttp({ rooms: realRooms, players: registry, tickMs: 50, heartbeatMs: 60000 });
const server = http.createServer((req, res) => { if (!pvp.handle(req, res)) { res.writeHead(404); res.end("fora"); } });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/api/pvp`;
const headers = (who) => ({ "content-type": "application/json", "x-pvp-player": who.id, "x-pvp-secret": who.secret });
const call = async (method, path, who, body) => {
  const response = await fetch(base + path, { method, headers: who ? headers(who) : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};

/** Abre a conexão SSE e devolve as visões que chegam (do evento `event`: "room" na sala, "queue" no canal do jogador), com uma espera por condição. */
async function stream(path, who, event = "room") {
  const controller = new AbortController();
  const response = await fetch(`${base}${path}?player=${who.id}&secret=${who.secret}`, { signal: controller.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/event-stream/);
  const views = [];
  const waiters = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, cut); buffer = buffer.slice(cut + 2);
          const data = block.split("\n").find((line) => line.startsWith("data: "));
          if (block.includes(`event: ${event}`) && data) { views.push(JSON.parse(data.slice(6))); for (const waiter of [...waiters]) waiter(); }
        }
      }
    } catch { /* fechado */ }
  })();
  const waitFor = (predicate, label) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`tempo esgotado esperando: ${label}`)), 5000);
    const check = () => { const found = views.find(predicate); if (found) { clearTimeout(timeout); waiters.splice(waiters.indexOf(check), 1); resolve(found); return true; } return false; };
    if (!check()) waiters.push(check);
  });
  return { views, waitFor, close: () => controller.abort() };
}

const health = await call("GET", "/health");
assert.equal(health.status, 200);
assert.equal((await call("GET", "/rooms/ABCDE2/invite")).status, 404, "convite de sala que não existe");
assert.equal((await call("POST", "/rooms", null, { ladder: "mapas", mode: "friendly" })).status, 401, "sem identidade");
assert.equal((await call("POST", "/rooms", { id: A.id, secret: "segredo-errado-do-ana-0000000001" }, { ladder: "mapas", mode: "friendly" })).status, 401, "segredo errado");
assert.equal((await call("POST", "/rooms", A, { ladder: "xadrez", mode: "friendly" })).status, 400, "escada inválida");
assert.equal((await call("POST", "/rooms", A, { ladder: "mapas", mode: "virtual" })).status, 400, "modo inválido");
const bigResponse = await fetch(base + "/rooms", { method: "POST", headers: headers(A), body: JSON.stringify({ ladder: "mapas", mode: "friendly", name: "x".repeat(20000) }) }).catch(() => null);
assert.ok(!bigResponse || bigResponse.status === 400, "pedido grande demais é recusado");
assert.equal((await fetch(base + "/rooms", { method: "POST", headers: headers(A), body: "{quebrado" })).status, 400, "JSON quebrado");

const created = await call("POST", "/rooms", A, { ladder: "bandeiras", mode: "ranked", name: "Ana", rating: 1500, trophies: 1400 });
assert.equal(created.status, 201);
const roomCode = created.body.room.code;
assert.equal(created.body.room.seed, null);
const invite = await call("GET", `/rooms/${roomCode.toLowerCase()}/invite`);
assert.equal(invite.status, 200, "o convite não precisa de identidade e aceita minúsculas");
assert.deepEqual(invite.body.invite, { code: roomCode, phase: "open", ladder: "bandeiras", mode: "ranked", hostName: "Ana", hostTrophies: 1400, full: false, groups: null });
assert.equal((await call("POST", `/rooms/${roomCode}/join`, A, { name: "Ana" })).status, 403, "o anfitrião não entra na própria sala");
assert.equal((await call("GET", `/rooms/${roomCode}`, B)).status, 403, "quem não está na sala não vê");
assert.equal((await fetch(`${base}/rooms/${roomCode}/events?player=${B.id}&secret=${B.secret}`)).status, 403, "nem ouve os eventos");

const hostStream = await stream(`/rooms/${roomCode}/events`, A);
await hostStream.waitFor((view) => view.phase === "open", "visão inicial do anfitrião");
const joined = await call("POST", `/rooms/${roomCode}/join`, B, { name: "Beto", rating: 1300, trophies: 1250 });
assert.equal(joined.status, 200);
assert.equal(joined.body.room.phase, "lobby");
const guestStream = await stream(`/rooms/${roomCode}/events`, B);
const lobbyForHost = await hostStream.waitFor((view) => view.phase === "lobby" && view.opponent?.name === "Beto", "o anfitrião vê o amigo chegar");
assert.equal(lobbyForHost.opponent.rating, PVP_RATING_BASE, "a força vem do servidor (1000 sem duelo valendo), não do que o aparelho mandou (1300)");
assert.equal(lobbyForHost.opponent.trophies, 1250, "os troféus contra bot são os que o aparelho informou (só para mostrar)");
assert.ok(lobbyForHost.seed, "no lobby (amigo já dentro) a semente/os modos já aparecem, antes de ficar pronto");
assert.equal(joined.body.room.seed, lobbyForHost.seed, "a mesma semente para os dois já no lobby");
assert.equal((await call("POST", `/rooms/${roomCode}/join`, { id: "caio-http-000000000003", secret: "segredo-do-caio-00000000000003" }, { name: "Caio" })).status, 409, "sala cheia");
assert.equal((await call("POST", `/rooms/${roomCode}/command`, A, { type: "explodir" })).status, 400, "comando inválido");

assert.equal((await call("POST", `/rooms/${roomCode}/command`, A, { type: "ready", ready: true })).status, 200);
await guestStream.waitFor((view) => view.opponent?.ready === true, "o amigo vê o anfitrião pronto");
await call("POST", `/rooms/${roomCode}/command`, B, { type: "ready", ready: true });
const counting = await hostStream.waitFor((view) => view.phase === "countdown", "contagem");
assert.ok(counting.seed && counting.startAt > counting.serverNow - 1000);
const playing = await guestStream.waitFor((view) => view.phase === "playing", "começou (o servidor avança a contagem sozinho)");
assert.equal(playing.seed, counting.seed);

// o anfitrião joga, o amigo acompanha ao vivo
const round = (who, leg, r, correct, ms) => call("POST", `/rooms/${roomCode}/command`, who, { type: "round", leg, round: r, correct, ms });
assert.equal((await round(A, 0, 0, true, 1200)).status, 200);
const liveView = await guestStream.waitFor((view) => view.opponent?.legs[0]?.length === 1, "progresso ao vivo");
assert.deepEqual(liveView.opponent.legs[0][0], { correct: true, ms: 1200 });
assert.equal((await round(A, 0, 5, true, 1200)).status, 400, "rodada fora de ordem");
for (let leg = 0; leg < LEGS; leg += 1) for (let r = leg === 0 ? 1 : 0; r < LEG_ROUNDS; r += 1) assert.equal((await round(A, leg, r, r % 3 !== 0, 1500)).status, 200);
for (let leg = 0; leg < LEGS; leg += 1) for (let r = 0; r < LEG_ROUNDS; r += 1) assert.equal((await round(B, leg, r, r % 2 === 0, 1400)).status, 200);
const finalHost = await hostStream.waitFor((view) => view.phase === "done", "resultado para o anfitrião");
const finalGuest = await guestStream.waitFor((view) => view.phase === "done", "resultado para o amigo");
assert.equal(finalHost.result.you.correct, 13, "Ana: 7 no 1º tempo e 6 no 2º");
assert.equal(finalGuest.result.you.correct, 10, "Beto: 5 em cada tempo");
assert.equal(finalHost.result.outcome, "win");
assert.equal(finalGuest.result.outcome, "loss");
assert.equal(finalHost.result.opponent.correct, finalGuest.result.you.correct);
assert.ok(finalHost.rev > liveView.rev, "cada mudança sobe a revisão");
const stale = (await call("GET", `/rooms/${roomCode}`, A)).body.room;
assert.equal(stale.phase, "done", "a visão por GET bate com a do SSE");
// valendo: o servidor calcula e guarda a força dos dois (Elo, 1000 × 1000, vitória da Ana)
assert.deepEqual(finalHost.result.rating, { you: { before: 1000, after: 1012 }, opponent: { before: 1000, after: 988 } });
assert.deepEqual(finalGuest.result.rating.you, { before: 1000, after: 988 });

hostStream.close(); guestStream.close();

// ───────────── perfil no servidor ─────────────
const meA = (await call("GET", "/me", A)).body.profile;
assert.equal(meA.name, "Ana", "o último nome usado");
assert.equal(meA.rating, 1012);
assert.deepEqual(meA.ranked, { wins: 1, losses: 0, draws: 0 });
assert.equal((await call("GET", "/me", null)).status, 401);
const matchesB = (await call("GET", "/me/matches?limit=5", B)).body.matches;
assert.equal(matchesB.length, 1);
assert.equal(matchesB[0].code, roomCode);
assert.equal(matchesB[0].you.outcome, "loss");
assert.equal(matchesB[0].you.totals.correct, 10);
assert.equal(matchesB[0].opponent.name, "Ana");
assert.deepEqual(matchesB[0].you.rating, { before: 1000, after: 988 });
assert.equal(matchesB[0].seed, finalGuest.seed, "com a semente, o aparelho refaz os dois tempos");
assert.deepEqual(matchesB[0].groups, finalGuest.groups, "os 2 modos jogados ficam no histórico do servidor");

// ───────────── fila por HTTP, com o canal do jogador (SSE /me/events) ─────────────
const anaChannel = await stream("/me/events", A, "queue");
const betoChannel = await stream("/me/events", B, "queue");
await anaChannel.waitFor((view) => view.state === "idle", "canal aberto, fora da fila");
assert.equal((await call("POST", "/queue", A, { ladder: "xadrez", mode: "ranked" })).status, 400, "escolha inválida");
const queuedA = await call("POST", "/queue", A, { ladder: "mapas", mode: "friendly", name: "Ana", trophies: 1400 });
assert.equal(queuedA.status, 200);
assert.equal(queuedA.body.queue.state, "waiting");
await call("POST", "/queue", B, { ladder: "mapas", mode: "friendly", name: "Beto" });
const offerForA = await anaChannel.waitFor((view) => view.state === "offer", "a proposta chega pelo canal");
assert.equal(offerForA.offer.opponent.name, "Beto");
assert.equal(offerForA.offer.opponent.rating, 988, "a força do adversário é a do servidor");
assert.equal(offerForA.offer.opponent.trophies, 1250, "sem troféus no pedido, valem os últimos que o aparelho informou (número antigo vale para as duas escadas)");
assert.equal((await call("POST", "/queue/offer", A, { id: "x", accept: true })).status, 400, "resposta inválida");
await call("POST", "/queue/offer", A, { id: offerForA.offer.id, accept: true });
await call("POST", "/queue/offer", B, { id: offerForA.offer.id, accept: true });
const matchedB = await betoChannel.waitFor((view) => view.state === "matched", "sala achada");
const queueRoom = (await call("GET", `/rooms/${matchedB.room}`, A)).body.room;
assert.equal(queueRoom.origin, "queue");
assert.equal(queueRoom.phase, "countdown");
assert.equal((await call("POST", "/queue", A, { ladder: "mapas", mode: "friendly" })).status, 409, "já num duelo: não dá para buscar outro");
// o convidado sai antes de começar: a sala fecha e a Ana (conectada à sala, como o app faz) volta para a fila; o Beto, que saiu, não fica com a sala na visão dele
const anaRoomStream = await stream(`/rooms/${matchedB.room}/events`, A);
await anaRoomStream.waitFor((view) => view.phase === "countdown", "a Ana na sala da fila");
await call("POST", `/rooms/${matchedB.room}/command`, B, { type: "leave" });
await anaRoomStream.waitFor((view) => view.phase === "closed" && view.closedReason === "opponent-left", "a sala fecha para a Ana");
await anaChannel.waitFor((view) => view.state === "waiting" && view.notice?.kind === "opponent-left", "de volta à fila");
anaRoomStream.close();
assert.equal((await call("GET", "/queue", B)).body.queue.state, "idle");
// criar um convite tira da fila
assert.equal((await call("POST", "/rooms", A, { ladder: "mapas", mode: "friendly", name: "Ana" })).status, 201);
assert.equal((await call("GET", "/queue", A)).body.queue.state, "idle");
// e entrar na fila cancela o convite aberto (ainda sem ninguém)
assert.equal((await call("POST", "/queue", A, { ladder: "bandeiras", mode: "ranked" })).body.queue.state, "waiting");
assert.equal((await call("POST", "/queue/leave", A)).body.queue.state, "idle");
assert.equal((await call("GET", "/health")).body.queue, 0);

// ───────────── amigos e perfil ─────────────
{
  const C = { id: "caio-http-000000000003", secret: "segredo-do-caio-00000000000003" };
  // a Ana e o Beto viraram amigos quando o Beto aceitou o convite por link, lá em cima
  const anaFriends = (await call("GET", "/friends", A)).body.friends;
  assert.ok(isFriendCode(anaFriends.code), "cada um tem um código de amigo");
  assert.deepEqual(anaFriends.friends.map((friend) => friend.name), ["Beto"], "aceitar convite por link vira amizade");
  const betoCode = anaFriends.friends[0].code;
  assert.equal((await call("GET", "/friends", null)).status, 401);
  // o Caio pede amizade à Ana pelo código; ela recebe o aviso na hora
  const anaSocial = await stream("/me/events", A, "social");
  const caioFriends = (await call("GET", "/friends", C)).body.friends;
  assert.equal((await call("POST", "/friends", C, { code: "ZZZZZZ" })).status, 404, "código de ninguém");
  assert.equal((await call("POST", "/friends", C, { code: caioFriends.code })).status, 400, "o próprio código");
  const sent = await call("POST", "/friends", C, { code: anaFriends.code.toLowerCase() });
  assert.deepEqual([sent.status, sent.body.result, sent.body.friends.outgoing.map((item) => item.name)], [200, "sent", ["Ana"]], "o código aceita minúsculas");
  const request = await anaSocial.waitFor((event) => event.kind === "request", "pedido chega pelo canal");
  assert.equal(request.from.code, caioFriends.code);
  const incoming = (await call("GET", "/friends", A)).body.friends.incoming;
  assert.deepEqual(incoming.map((item) => item.code), [caioFriends.code]);
  const accepted = await call("POST", "/friends/respond", A, { code: caioFriends.code, accept: true });
  assert.deepEqual(accepted.body.friends.friends.map((friend) => friend.code).sort(), [betoCode, caioFriends.code].sort());
  assert.equal((await call("POST", "/friends/respond", A, { code: caioFriends.code, accept: true })).status, 404, "pedido já respondido");
  // online: a Ana está com o canal aberto, o Caio não
  const caioView = (await call("GET", "/friends", C)).body.friends;
  assert.equal(caioView.friends.find((friend) => friend.name === "Ana").online, true);
  // desafio direto: só amigo online; a Ana recebe o convite pelo canal
  assert.equal((await call("POST", "/friends/challenge", A, { code: caioFriends.code, ladder: "mapas", mode: "ranked" })).status, 409, "amigo sem o app aberto");
  const challenge = await call("POST", "/friends/challenge", C, { code: anaFriends.code, ladder: "bandeiras", mode: "friendly", name: "Caio" });
  assert.equal(challenge.status, 201);
  const challengeEvent = await anaSocial.waitFor((event) => event.kind === "challenge", "desafio chega pelo canal");
  assert.deepEqual([challengeEvent.room, challengeEvent.ladder, challengeEvent.mode, challengeEvent.from.name], [challenge.body.room.code, "bandeiras", "friendly", "Caio"]);
  assert.equal((await call("POST", "/friends/challenge", C, { code: betoCode, ladder: "mapas", mode: "ranked" })).status, 403, "só amigos");
  await call("POST", `/rooms/${challenge.body.room.code}/command`, C, { type: "leave" });
  // perfil: a Ana vê o Beto (o duelo valendo lá de cima está no confronto direto)
  await call("POST", "/me/profile", B, { summary: { level: 7, xp: 2400, mastery: 31, dominated: 20, rounds: 800, sessions: 60, collection: { discovered: 120, total: 262 }, achievements: { unlocked: 12, total: 49 }, botDuels: { wins: 5, losses: 4, draws: 0 } } });
  const profile = (await call("GET", `/players/${betoCode}`, A)).body.profile;
  assert.deepEqual([profile.name, profile.friendship, profile.online, profile.summary.level, profile.summary.collection.discovered], ["Beto", "friends", true, 7, 120], "o Beto está com o canal da fila aberto: online");
  assert.deepEqual(profile.headToHead.ranked, { wins: 1, losses: 0, draws: 0 }, "do ponto de vista de quem pergunta");
  assert.equal(profile.headToHead.recent[0].opponent.code, betoCode, "os duelos trazem o código de amigo dos dois lados");
  assert.deepEqual(profile.pvp.ranked, { wins: 0, losses: 1, draws: 0 }, "o placar do Beto contra todo mundo");
  assert.equal(profile.recent[0].you.name, "Beto", "os duelos recentes do perfil são do ponto de vista dele");
  const own = (await call("GET", `/players/${anaFriends.code}`, A)).body.profile;
  assert.deepEqual([own.friendship, own.headToHead.recent.length], ["self", 0]);
  assert.equal((await call("GET", `/players/${betoCode}`, null)).status, 401, "perfil só com identidade");
  assert.equal((await call("GET", "/players/ZZZZZZ", A)).status, 404);
  // desfazer a amizade
  assert.deepEqual((await call("POST", "/friends/remove", A, { code: caioFriends.code })).body.friends.friends.map((friend) => friend.code), [betoCode]);
  assert.equal((await call("GET", `/players/${caioFriends.code}`, A)).body.profile.friendship, "none");
  anaSocial.close();
}

// ───────────── onde cada um está nas escadas e o ranking (só gente de verdade) ─────────────
assert.equal((await call("POST", "/me/profile", null, {})).status, 401);
assert.equal((await call("POST", "/me/profile", A, { name: "Ana", ladders: { mapas: { trophies: 700, mmr: 750 }, bandeiras: { trophies: 90, mmr: 100 } } })).status, 200);
await call("POST", "/me/profile", B, { ladders: { mapas: { trophies: 900, mmr: 880 }, bandeiras: { trophies: 20, mmr: 20 } } });
const boardA = (await call("GET", "/leaderboard?ladder=mapas", A)).body.leaderboard;
assert.deepEqual(boardA.map((row) => [row.name, row.trophies, row.you]), [["Beto", 900, false], ["Ana", 700, true]], "do mais alto ao mais baixo, com você marcado");
assert.ok(boardA.every((row) => isFriendCode(row.code)), "cada linha traz o código de amigo (abre o perfil)");
const boardAnon = (await call("GET", "/leaderboard?ladder=bandeiras")).body.leaderboard;
assert.deepEqual(boardAnon.map((row) => [row.name, row.trophies, row.you]), [["Ana", 90, false], ["Beto", 20, false]], "sem identidade dá para ver, sem ninguém marcado");
assert.equal((await call("GET", "/leaderboard?ladder=mapas", { id: A.id, secret: "segredo-errado-do-ana-0000000001" })).body.leaderboard.some((row) => row.you), false, "segredo errado não marca ninguém");
assert.equal((await call("GET", "/leaderboard?ladder=xadrez")).status, 400);
// a sala usa o que o aparelho informou por último, na escada dela
const lastRoom = (await call("POST", "/rooms", A, { ladder: "bandeiras", mode: "friendly" })).body.room;
assert.deepEqual([lastRoom.you.trophies, lastRoom.you.mmr], [90, 100]);
await call("POST", `/rooms/${lastRoom.code}/command`, A, { type: "leave" });

anaChannel.close(); betoChannel.close();
await new Promise((resolve) => setTimeout(resolve, 100));
pvp.dispose();
await new Promise((resolve) => server.close(resolve));

console.log("pvp: regras, máquina de estados (duelo, desempate, empate, desistência, queda, lobby, expiração), fila (par exato, troca, recusa, prazo, presença, volta à fila), histórico e migração de jogadores, troféus por escada e ranking, amigos e perfil, HTTP+SSE — ok");
