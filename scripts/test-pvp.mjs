import assert from "node:assert/strict";
import http from "node:http";
import { LEGS, LEG_ROUNDS, drawLegs } from "../.tmp-pvp/src/domain/duel-modes.js";
import { COUNTDOWN_MS, DONE_TTL_MS, GRACE_MS, OPEN_TTL_MS, ROOM_CODE_ALPHABET, cleanPlayerName, inviteLink, isValidRoomCode, normalizeRoomCode, parseCommand, parseInvite, settlePvp, sideFinished, sideTotals } from "../.tmp-pvp/src/domain/pvp.js";
import { PVP_RATING_BASE, pvpExpectedScore, pvpRatingChange, pvpRatingFromHistory } from "../.tmp-pvp/src/domain/pvp-rating.js";
import { PvpError, PvpRooms } from "../.tmp-pvp/server/pvp-rooms.js";
import { PlayerRegistry } from "../.tmp-pvp/server/pvp-players.js";
import { createPvpHttp } from "../.tmp-pvp/server/pvp-http.js";

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
const ana = { id: "ana-0000000000000001", name: "Ana", rating: 1200, trophies: 1100 };
const beto = { id: "beto-000000000000002", name: "Beto", rating: 900, trophies: 800 };
const caio = { id: "caio-000000000000003", name: "Caio", rating: 500, trophies: 400 };
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
  assert.deepEqual(rooms.invite(c), { code: c, phase: "open", ladder: "mapas", mode: "ranked", hostName: "Ana", hostTrophies: 1100, full: false });
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
  const view = rooms.createRoom({ id: "x".repeat(20), name: "  ", rating: NaN, trophies: -5 }, { ladder: "mapas", mode: "friendly" });
  assert.equal(view.you.name, "Jogador");
  assert.equal(view.you.rating, 0);
  assert.equal(view.you.trophies, 0);
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

/** Abre a conexão SSE e devolve as visões que chegam, com uma espera por condição. */
async function stream(path, who) {
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
          if (block.includes("event: room") && data) { views.push(JSON.parse(data.slice(6))); for (const waiter of [...waiters]) waiter(); }
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
assert.deepEqual(invite.body.invite, { code: roomCode, phase: "open", ladder: "bandeiras", mode: "ranked", hostName: "Ana", hostTrophies: 1400, full: false });
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
assert.equal(lobbyForHost.opponent.rating, 1300);
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

hostStream.close(); guestStream.close();
await new Promise((resolve) => setTimeout(resolve, 100));
pvp.dispose();
await new Promise((resolve) => server.close(resolve));

console.log("pvp: regras, máquina de estados (duelo, desempate, empate, desistência, queda, lobby, expiração) e HTTP+SSE — ok");
