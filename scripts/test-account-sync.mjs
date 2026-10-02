import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BOT_RANKING_ROW_ID, SUPPLY_ROW_PREFIX, SYNC_LIMITS, SYNC_ROW_STORES, addCounters, chunkRows, countRows, countersFrom, diffCounters, diffManifests, emptyCounters, emptyRows,
  isEmptyCounters, manifestOf, mergeRow, parseCounters, parseManifest, parseRows, progressRowFrom, rowStamp,
} from "../.tmp-account-sync/src/domain/account-sync.js";
import { syncAccount, syncUntilSettled, SYNC_STATE_ID } from "../.tmp-account-sync/src/domain/account-sync-engine.js";
import { BOT_RANKING_ID } from "../.tmp-account-sync/src/domain/bot-ranking.js";
import { AccountData } from "../.tmp-account-sync/server/pvp-account-data.js";
import { AccountRegistry } from "../.tmp-account-sync/server/pvp-accounts.js";
import { PlayerRegistry } from "../.tmp-account-sync/server/pvp-players.js";
import { PvpRooms } from "../.tmp-account-sync/server/pvp-rooms.js";
import { createPvpHttp } from "../.tmp-account-sync/server/pvp-http.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

// ───────────── regras puras ─────────────
assert.equal(BOT_RANKING_ROW_ID, BOT_RANKING_ID, "o id do ranking dos bots é o mesmo nos dois módulos");
assert.deepEqual([...SYNC_ROW_STORES].sort(), ["achievements", "historicalCollection", "ledger", "preferences", "sessions", "unlocks"], "state e progress não entram como linhas");

// carimbo e juntar linhas
assert.equal(rowStamp("achievements", { id: "a", unlockedAt: 500 }), -500);
assert.equal(rowStamp("ledger", { id: "l", kind: "debit", amount: 90 }), 90);
assert.equal(rowStamp("ledger", { id: "l", kind: "credit", amount: 90 }), 0);
assert.equal(rowStamp("preferences", { id: "preset:x", updatedAt: 7 }), 7);
assert.equal(rowStamp("preferences", { id: BOT_RANKING_ROW_ID, revision: 4 }), 4);
assert.equal(rowStamp("sessions", { id: "s", endedAt: 99 }), 0);
assert.deepEqual(mergeRow("sessions", undefined, { id: "s" }), { id: "s" }, "linha nova entra");
assert.equal(mergeRow("sessions", { id: "s", a: 1 }, { id: "s", a: 2 }), null, "a que já existe fica");
assert.deepEqual(mergeRow("achievements", { id: "a", unlockedAt: 900 }, { id: "a", unlockedAt: 100 }), { id: "a", unlockedAt: 100 }, "a conquista mais antiga vence");
assert.equal(mergeRow("achievements", { id: "a", unlockedAt: 100 }, { id: "a", unlockedAt: 900 }), null);
assert.equal(mergeRow("ledger", { id: "d", kind: "debit", amount: 100 }, { id: "d", kind: "debit", amount: 50 }), null, "o preço antigo, mais barato, não devolve moedas");
assert.deepEqual(mergeRow("ledger", { id: "d", kind: "debit", amount: 50 }, { id: "d", kind: "debit", amount: 100 }), { id: "d", kind: "debit", amount: 100 });
assert.deepEqual(mergeRow("preferences", { id: "preset:1", updatedAt: 1, name: "velho" }, { id: "preset:1", updatedAt: 2, name: "novo" }), { id: "preset:1", updatedAt: 2, name: "novo" }, "a favorita editada por último vence");
assert.equal(mergeRow("preferences", { id: BOT_RANKING_ROW_ID, revision: 5 }, { id: BOT_RANKING_ROW_ID, revision: 5 }), null, "empate fica como está");

// resumo e diferença
{
  const mine = manifestOf({ sessions: [{ id: "s1" }, { id: "s2" }], achievements: [{ id: "a1", unlockedAt: 10 }], preferences: [{ id: "supply:lupa", count: 3 }, { id: "duel:1" }] });
  assert.deepEqual(mine.sessions, { s1: 0, s2: 0 });
  assert.deepEqual(mine.preferences, { "duel:1": 0 }, "o estoque é contador, não linha");
  const theirs = manifestOf({ sessions: [{ id: "s2" }, { id: "s3" }], achievements: [{ id: "a1", unlockedAt: 5 }] });
  const { send, receive } = diffManifests(mine, theirs);
  assert.deepEqual([send.sessions, receive.sessions], [["s1"], ["s3"]]);
  assert.deepEqual([send.achievements, receive.achievements], [[], ["a1"]], "a conquista mais antiga do outro lado é pedida");
}
assert.equal(parseManifest({ sessions: { a: "x" } }), null);
assert.equal(parseManifest([]), null);
assert.deepEqual(parseManifest({ lixo: { a: 1 }, sessions: { a: 1 } }).sessions, { a: 1 }, "loja desconhecida é ignorada");
assert.equal(parseRows({ sessions: [{ noid: 1 }] }), null);
assert.equal(parseRows({ sessions: [{ id: "x".repeat(201) }] }), null);
assert.equal(parseRows({ sessions: [{ id: "s", big: "x".repeat(SYNC_LIMITS.rowBytes) }] }), null, "linha grande demais");
assert.equal(parseRows({ sessions: "não é lista" }), null);
assert.deepEqual(parseRows({ state: [{ id: "sync:v1" }], progress: [{ id: "current:1" }], preferences: [{ id: "supply:lupa", count: 1 }, { id: "duel:1" }] }).preferences, [{ id: "duel:1" }], "state/progress/estoque não entram como linhas");
assert.equal(countRows(parseRows({ state: [{ id: "x" }] })), 0);
{
  const rows = emptyRows();
  for (let i = 0; i < 10; i += 1) rows.sessions.push({ id: `s${i}`, pad: "x".repeat(1000) });
  const chunks = chunkRows(rows, 2500);
  assert.ok(chunks.length >= 4 && chunks.every((chunk) => countRows(chunk) >= 1));
  assert.equal(chunks.reduce((sum, chunk) => sum + countRows(chunk), 0), 10, "nenhuma linha se perde nos lotes");
  assert.equal(chunkRows(emptyRows()).length, 0);
  assert.equal(chunkRows({ ...emptyRows(), sessions: [{ id: "grande", pad: "x".repeat(5000) }] }, 100).length, 1, "linha maior que o lote vai sozinha");
}

// contadores
const card = (n, seen, correct, columns = {}, latest = 1790649325788 + n) => ({ id: `current:${n}`, entityId: String(n), seen, correct, columns: { bandeiras: 0, mapa: 0, capitais: 0, ...columns }, latest, mastery: 1, source: "current-v2" });
{
  const base = countersFrom([card(1, 10, 8, { mapa: 6 }), card(2, 3, 3)], [{ id: "supply:lupa", count: 5 }]);
  const now = countersFrom([card(1, 14, 11, { mapa: 6, bandeiras: 3 }, 5000), card(2, 3, 3), card(3, 2, 1)], [{ id: "supply:lupa", count: 3 }]);
  const delta = diffCounters(now, base);
  assert.deepEqual(Object.keys(delta.progress).sort(), ["current:1", "current:3"], "carta sem mudança não entra no delta");
  assert.deepEqual([delta.progress["current:1"].seen, delta.progress["current:1"].correct, delta.progress["current:1"].columns.bandeiras, delta.progress["current:1"].latest], [4, 3, 3, 5000]);
  assert.deepEqual(delta.supply, { lupa: -2 }, "o estoque pode ter diminuído (uso)");
  const sum = addCounters(base, delta);
  assert.deepEqual(sum.progress["current:1"].seen, 14);
  assert.deepEqual(sum.supply, { lupa: 3 });
  assert.deepEqual(addCounters(base, emptyCounters()), base, "somar nada não muda");
  assert.equal(base.progress["current:1"].seen, 10, "as entradas não são alteradas");
  // zerar o progresso no aparelho não derruba a conta (diferença negativa vira 0)
  assert.ok(isEmptyCounters(diffCounters(emptyCounters(), base)) || Object.keys(diffCounters(emptyCounters(), base).progress).length === 0);
  const lower = diffCounters(countersFrom([card(1, 2, 1)], []), base);
  assert.equal(lower.progress["current:1"], undefined, "carta que diminuiu não vira delta negativo");
  // validação
  assert.equal(parseCounters({ progress: { a: { seen: -1 } } }), null);
  assert.equal(parseCounters({ progress: { a: { seen: "3" } } }), null);
  assert.equal(parseCounters({ progress: { a: { seen: SYNC_LIMITS.counter + 1 } } }), null);
  assert.equal(parseCounters({ supply: { lupa: Infinity } }), null);
  assert.ok(parseCounters({ progress: { a: { seen: 1, latest: 1790649325788 } } }), "um instante em milissegundos (1,79e12) é válido em latest");
  assert.equal(parseCounters({ progress: { a: { seen: 1, latest: SYNC_LIMITS.timestamp + 1 } } }), null);
  assert.equal(parseCounters({ progress: { a: { seen: 1, latest: -1 } } }), null);
  assert.deepEqual(parseCounters(null), emptyCounters());
  assert.deepEqual(parseCounters(JSON.parse(JSON.stringify(delta))), delta, "o que vai pela rede volta igual");
  // linha de carta: maestria recalculada, campos extras mantidos
  const row = progressRowFrom("current:1", { ...now.progress["current:1"] }, { ...card(1, 1, 1), extra: "fica" });
  assert.equal(row.extra, "fica");
  assert.equal(row.mastery, 2, "duas colunas jogadas: maestria 2");
}

// ───────────── armazenamento local de teste (o do navegador é o IndexedDB) ─────────────
class MemStore {
  constructor() { this.data = Object.fromEntries([...SYNC_ROW_STORES, "progress"].map((store) => [store, new Map()])); this.state = null; this.local = {}; this.failApply = false; }
  put(store, row) { this.data[store].set(row.id, clone(row)); return this; }
  get(store, id) { return this.data[store].get(id); }
  progressRows() { return [...this.data.progress.values()]; }
  counters() { return countersFrom(this.progressRows(), [...this.data.preferences.values()]); }
  async snapshot() {
    const rows = emptyRows();
    for (const store of SYNC_ROW_STORES) rows[store] = [...this.data[store].values()].filter((row) => !(store === "preferences" && row.id.startsWith(SUPPLY_ROW_PREFIX))).map(clone);
    return { rows, progress: this.progressRows().map(clone), supply: [...this.data.preferences.values()].filter((row) => row.id.startsWith(SUPPLY_ROW_PREFIX)).map(clone), local: { ...this.local } };
  }
  async readState() { return this.state ? clone(this.state) : null; }
  async writeState(state) { this.state = clone(state); }
  async applyLocal(wanted, compute) {
    const writes = compute({
      progress: this.progressRows().map(clone), supply: [...this.data.preferences.values()].filter((row) => row.id.startsWith(SUPPLY_ROW_PREFIX)).map(clone),
      row: (store, id) => { const found = this.data[store].get(id); return found ? clone(found) : undefined; },
    });
    if (this.failApply) throw new Error("falha ao gravar");
    for (const row of writes.progress) this.put("progress", row);
    for (const row of writes.supply) this.put("preferences", row);
    for (const store of SYNC_ROW_STORES) for (const row of writes.rows[store]) this.put(store, row);
    this.state = clone(writes.state);
  }
}

let counter = 0;
const newId = () => `dispositivo-${String(++counter).padStart(4, "0")}`;
const directTransport = (data, playerId, hooks = {}) => ({
  async plan(manifest) { return clone(data.plan(playerId, clone(manifest))); },
  async pushRows(rows) { const parsed = parseRows(clone(rows)); assert.ok(parsed, "o servidor aceita as linhas que o aparelho manda"); data.pushRows(playerId, parsed); },
  async commit(args) {
    const result = clone(data.commit(playerId, args.deviceId, args.seq, parseCounters(clone(args.delta)), clone(args.local)));
    if (hooks.loseCommitResponse) { hooks.loseCommitResponse = false; throw new Error("a resposta se perdeu na rede"); }
    return result;
  },
});
const sync = (store, data, playerId, extra = {}) => syncAccount({ owner: playerId, store, transport: directTransport(data, playerId, extra.hooks), newDeviceId: newId, ...extra });
const PLAYER = "pjogador-de-teste-000001";
const OTHER_PLAYER = "pjogador-de-teste-000002";

const seed = (store, n = 6) => {
  for (let i = 1; i <= n; i += 1) store.put("progress", card(i, 10 + i, 8 + i, { mapa: 5 + i, bandeiras: 2 }));
  for (let i = 0; i < 20; i += 1) store.put("sessions", { id: `current-v2-sessao-${i}`, endedAt: 1000 + i, rounds: [{ targetId: "4", correct: true }] });
  for (let i = 0; i < 12; i += 1) store.put("ledger", { id: `spoils:sessao-${i}`, kind: "credit", amount: 100 + i, createdAt: 1000 + i });
  store.put("achievements", { id: "current:band100", achievementId: "band100", unlockedAt: 5000 });
  store.put("unlocks", { id: "theme:prata", key: "theme:prata", source: "league", unlockedAt: 6000 });
  store.put("historicalCollection", { id: "current:aceh", entityId: "aceh" });
  store.put("preferences", { id: "duel:1", at: 1, outcome: "win" });
  store.put("preferences", { id: "supply:lupa", source: "supply-v1", count: 5 });
  store.local = { "carta-theme": "pigmentos" };
  return store;
};

// ───────────── o beta tester: o primeiro envio leva tudo para a conta, e enviar de novo não soma nada ─────────────
{
  const server = new AccountData(null);
  const phone = seed(new MemStore());
  const before = clone(phone.counters());
  const first = await sync(phone, server, PLAYER);
  assert.deepEqual([first.status, first.firstSync], ["ok", true]);
  assert.equal(first.pushedRows, 20 + 12 + 1 + 1 + 1 + 1, "todas as linhas comuns subiram (o estoque e as cartas vão como contadores)");
  const account = server.commit(PLAYER, "outro-aparelho-qualquer", 0, emptyCounters()).totals;
  assert.deepEqual(account, before, "os totais da conta são exatamente os do aparelho");
  assert.deepEqual(phone.counters(), before, "o aparelho continua igual");
  assert.deepEqual(phone.state.baseline, before);
  assert.equal(phone.state.pending, null);
  assert.equal(phone.state.owner, PLAYER);
  // sincronizar de novo sem jogar nada: nada sobe, nada soma
  const again = await sync(phone, server, PLAYER);
  assert.deepEqual([again.pushedRows, again.pulledRows, again.changedFromAccount, again.firstSync], [0, 0, false, false]);
  for (let i = 0; i < 3; i += 1) await sync(phone, server, PLAYER);
  assert.deepEqual(server.commit(PLAYER, "outro-aparelho-qualquer", 0, emptyCounters()).totals, before, "repetir a sincronização nunca soma duas vezes");
  assert.equal(server.commit(PLAYER, "outro-aparelho-qualquer", 0, emptyCounters()).local["carta-theme"], "pigmentos", "o tema vai junto");
}

// ───────────── dois aparelhos: o que um joga chega ao outro, sem duplicar ─────────────
{
  const server = new AccountData(null);
  const phone = seed(new MemStore());
  await sync(phone, server, PLAYER);
  const base = clone(phone.counters());

  // o celular joga mais e sincroniza: o servidor soma só o que mudou
  phone.put("progress", card(1, 20, 15, { mapa: 11, bandeiras: 2 }, 9000)); // +? em relação à carta 1 (11,9 → 20,15)
  phone.put("progress", card(9, 4, 2, { capitais: 4 }));
  phone.put("sessions", { id: "current-v2-nova-1", endedAt: 9000 });
  phone.put("ledger", { id: "spoils:nova-1", kind: "credit", amount: 777, createdAt: 9000 });
  phone.put("preferences", { id: "supply:lupa", source: "supply-v1", count: 4 });
  const played = await sync(phone, server, PLAYER);
  assert.deepEqual([played.pushedRows, played.firstSync], [2, false], "só as linhas novas sobem");
  const totals1 = server.commit(PLAYER, "outro-aparelho-qualquer", 0, emptyCounters()).totals;
  assert.equal(totals1.progress["current:1"].seen, 20);
  assert.equal(totals1.progress["current:9"].seen, 4);
  assert.deepEqual(totals1.supply, { lupa: 4 });

  // um computador sem nada entra na conta: recebe tudo e fica igual
  const pc = new MemStore();
  const pcFirst = await sync(pc, server, PLAYER);
  assert.deepEqual([pcFirst.status, pcFirst.firstSync, pcFirst.changedFromAccount], ["ok", true, true]);
  assert.deepEqual(pc.counters(), phone.counters(), "o computador adota o total da conta");
  assert.equal(pc.data.sessions.size, 21);
  assert.equal(pc.data.ledger.size, 13);
  assert.equal(pc.get("achievements", "current:band100").unlockedAt, 5000);
  assert.equal(pc.local["carta-theme"] ?? "pigmentos", "pigmentos", "o tema é aplicado só se faltava");

  // os dois jogam ANTES de sincronizar: nada se perde, nada duplica
  phone.put("progress", card(1, 25, 19, { mapa: 14, bandeiras: 3 }, 9500)); // +5 vistas, +4 certas em relação a 20/15
  phone.put("sessions", { id: "current-v2-celular-2", endedAt: 9500 });
  const pcCard1 = pc.get("progress", "current:1");
  pc.put("progress", { ...pcCard1, seen: pcCard1.seen + 7, correct: pcCard1.correct + 6, columns: { ...pcCard1.columns, capitais: 7 }, latest: 9600 });
  pc.put("progress", card(40, 3, 3, { escrita: 3 }));
  pc.put("sessions", { id: "current-v2-pc-2", endedAt: 9600 });
  await sync(phone, server, PLAYER);
  await sync(pc, server, PLAYER);
  await sync(phone, server, PLAYER);
  await sync(pc, server, PLAYER);
  const final = server.commit(PLAYER, "outro-aparelho-qualquer", 0, emptyCounters()).totals;
  assert.equal(final.progress["current:1"].seen, 20 + 5 + 7, "20 + o que o celular jogou (5) + o que o computador jogou (7)");
  assert.equal(final.progress["current:1"].correct, 15 + 4 + 6);
  assert.equal(final.progress["current:1"].columns.capitais, 7);
  assert.equal(final.progress["current:40"].columns.escrita, 3);
  assert.deepEqual(phone.counters(), final, "o celular termina igual à conta");
  assert.deepEqual(pc.counters(), final, "o computador também");
  assert.equal(phone.data.sessions.size, 23);
  assert.equal(pc.data.sessions.size, 23);
  assert.ok(phone.get("progress", "current:1").mastery >= 2);
  // uma terceira rodada de sincronização não muda nada
  await sync(phone, server, PLAYER); await sync(pc, server, PLAYER);
  assert.deepEqual(server.commit(PLAYER, "outro-aparelho-qualquer", 0, emptyCounters()).totals, final);
  void base;
}

// ───────────── estoque: compra num aparelho, uso no outro ─────────────
{
  const server = new AccountData(null);
  const a = new MemStore().put("preferences", { id: "supply:lupa", source: "supply-v1", count: 2 });
  const b = new MemStore();
  await sync(a, server, PLAYER); await sync(b, server, PLAYER);
  assert.equal(b.get("preferences", "supply:lupa").count, 2);
  a.put("preferences", { id: "supply:lupa", source: "supply-v1", count: 5 }); // comprou 3
  b.put("preferences", { id: "supply:lupa", source: "supply-v1", count: 1 }); // usou 1
  await sync(a, server, PLAYER); await sync(b, server, PLAYER); await sync(a, server, PLAYER);
  assert.equal(a.get("preferences", "supply:lupa").count, 4, "2 + 3 − 1");
  assert.equal(b.get("preferences", "supply:lupa").count, 4);
  // nunca fica negativo
  b.put("preferences", { id: "supply:lupa", source: "supply-v1", count: 0 });
  a.put("preferences", { id: "supply:lupa", source: "supply-v1", count: 0 });
  await sync(a, server, PLAYER); await sync(b, server, PLAYER); await sync(a, server, PLAYER);
  assert.ok(a.get("preferences", "supply:lupa").count >= 0 && b.get("preferences", "supply:lupa").count >= 0);
}

// ───────────── rede que falha: o reenvio não soma duas vezes e o que foi jogado nesse meio tempo não se perde ─────────────
{
  const server = new AccountData(null);
  const phone = seed(new MemStore());
  await sync(phone, server, PLAYER);
  phone.put("progress", card(1, 30, 25, { mapa: 20, bandeiras: 3 })); // delta: +seen/+correct em relação a 11/9
  const hooks = { loseCommitResponse: true };
  await assert.rejects(() => sync(phone, server, PLAYER, { hooks }), /perdeu na rede/);
  assert.notEqual(phone.state.pending, null, "o delta ficou guardado no aparelho antes de ir para a rede");
  const afterLoss = server.commit(PLAYER, "outro-aparelho-qualquer", 0, emptyCounters()).totals.progress["current:1"].seen;
  assert.equal(afterLoss, 30, "o servidor já tinha somado");
  phone.put("progress", card(1, 33, 27, { mapa: 22, bandeiras: 3 })); // jogou mais enquanto a rede estava fora
  const retry = await syncUntilSettled({ owner: PLAYER, store: phone, transport: directTransport(server, PLAYER, hooks), newDeviceId: newId });
  assert.equal(retry.status, "ok");
  const totals = server.commit(PLAYER, "outro-aparelho-qualquer", 0, emptyCounters()).totals;
  assert.equal(totals.progress["current:1"].seen, 33, "30 (enviado uma vez só) + 3 jogados depois");
  assert.equal(phone.get("progress", "current:1").seen, 33, "o aparelho não perdeu nem duplicou o que jogou");
  assert.equal(phone.state.pending, null);
  // falha na hora de gravar no aparelho: nada é perdido e o reenvio fecha
  phone.put("progress", card(2, 50, 40, { mapa: 30, bandeiras: 3 }));
  phone.failApply = true;
  await assert.rejects(() => sync(phone, server, PLAYER), /falha ao gravar/);
  phone.failApply = false;
  await sync(phone, server, PLAYER);
  assert.equal(server.commit(PLAYER, "outro-aparelho-qualquer", 0, emptyCounters()).totals.progress["current:2"].seen, 50);
  assert.equal(phone.get("progress", "current:2").seen, 50);
}

// ───────────── aparelho com progresso entrando numa conta que já tem: a pessoa escolhe ─────────────
{
  const server = new AccountData(null);
  const main = seed(new MemStore());
  await sync(main, server, PLAYER);
  const accountTotals = clone(server.commit(PLAYER, "outro-aparelho-qualquer", 0, emptyCounters()).totals);

  const guest = new MemStore();
  guest.put("progress", card(1, 100, 90, { mapa: 100 }));
  guest.put("progress", card(77, 4, 4, { capitais: 4 }));
  guest.put("sessions", { id: "current-v2-convidado-1", endedAt: 1 });
  const ask = await sync(guest, server, PLAYER);
  assert.deepEqual(ask, { status: "needs-choice" });
  assert.equal(guest.state, null, "nada foi gravado enquanto a pessoa não escolheu");
  assert.equal(guest.get("progress", "current:1").seen, 100);
  assert.deepEqual(server.commit(PLAYER, "outro-aparelho-qualquer", 0, emptyCounters()).totals, accountTotals, "nem a conta mudou");

  // somar: o que o convidado jogou entra na conta
  const summed = new MemStore();
  summed.data = Object.fromEntries(Object.entries(guest.data).map(([k, v]) => [k, new Map(v)]));
  const sumServer = new AccountData(null);
  await sync(seed(new MemStore()), sumServer, PLAYER);
  const ok = await sync(summed, sumServer, PLAYER, { mode: "sum" });
  assert.equal(ok.status, "ok");
  const sumTotals = sumServer.commit(PLAYER, "outro-aparelho-qualquer", 0, emptyCounters()).totals;
  assert.equal(sumTotals.progress["current:1"].seen, accountTotals.progress["current:1"].seen + 100);
  assert.equal(sumTotals.progress["current:77"].seen, 4);
  assert.equal(summed.get("progress", "current:1").seen, accountTotals.progress["current:1"].seen + 100, "o aparelho adota a soma");
  assert.equal(summed.data.sessions.size, 21);

  // usar o da conta: nas cartas que a conta já tem vale o número dela; as que só o aparelho tem sobem normalmente
  const adopt = await syncUntilSettled({ owner: PLAYER, store: guest, transport: directTransport(server, PLAYER), newDeviceId: newId, mode: "adopt" });
  assert.equal(adopt.status, "ok");
  assert.equal(guest.get("progress", "current:1").seen, accountTotals.progress["current:1"].seen, "adotou o da conta (descartou os 100 daqui)");
  assert.equal(guest.get("progress", "current:77").seen, 4, "o que a conta não tem fica no aparelho");
  assert.equal(guest.get("sessions", "current-v2-convidado-1").endedAt, 1, "as linhas do aparelho não são apagadas");
  await sync(guest, server, PLAYER);
  await sync(guest, server, PLAYER);
  const totals = server.commit(PLAYER, "outro-aparelho-qualquer", 0, emptyCounters()).totals;
  assert.equal(totals.progress["current:77"].seen, 4, "a carta que só o aparelho tinha entrou na conta, uma vez só");
  assert.equal(totals.progress["current:1"].seen, accountTotals.progress["current:1"].seen, "a carta em comum ficou com o número da conta");
  assert.ok(server.manifestOf(PLAYER).sessions["current-v2-convidado-1"] !== undefined, "as linhas do aparelho foram para a conta (união)");

  // aparelho sem progresso não pergunta nada
  const empty = new MemStore();
  assert.equal((await sync(empty, server, PLAYER)).status, "ok");
  // a mesma conta no mesmo aparelho de novo: não é a primeira vez
  assert.equal((await sync(main, server, PLAYER)).firstSync, false);
  // outra conta no mesmo aparelho recomeça (e pergunta se a nova já tem progresso)
  const second = new AccountData(null);
  await sync(seed(new MemStore()), second, OTHER_PLAYER);
  assert.deepEqual(await sync(main, second, OTHER_PLAYER), { status: "needs-choice" });
  assert.equal(main.state.owner, PLAYER, "o estado do aparelho continua sendo o da conta anterior até a pessoa escolher");
}

// ───────────── o arquivo da conta se perde no servidor: o aparelho reenvia tudo e nunca encolhe ─────────────
{
  const server = new AccountData(null);
  const phone = seed(new MemStore());
  await sync(phone, server, PLAYER);
  const before = clone(phone.counters());
  const rebuilt = new AccountData(null); // outro "arquivo": epoch novo
  const result = await sync(phone, rebuilt, PLAYER);
  assert.equal(result.status, "ok");
  assert.equal(result.firstSync, false, "não é a primeira vez: não pergunta");
  assert.deepEqual(rebuilt.commit(PLAYER, "outro-aparelho-qualquer", 0, emptyCounters()).totals, before, "a conta foi refeita com tudo o que o aparelho tem");
  assert.deepEqual(phone.counters(), before, "o aparelho não encolheu");
  assert.equal(rebuilt.manifestOf(PLAYER).sessions["current-v2-sessao-3"], 0);
}

// ───────────── regras de linha vindas da conta ─────────────
{
  const server = new AccountData(null);
  const a = new MemStore();
  a.put("achievements", { id: "current:x", unlockedAt: 900 });
  a.put("ledger", { id: "debit:unlock:theme:noturno", kind: "debit", amount: 100, createdAt: 1 });
  a.put("preferences", { id: "preset:1", name: "velha", updatedAt: 10 });
  a.put("preferences", { id: BOT_RANKING_ROW_ID, revision: 2, bots: [] });
  a.put("sessions", { id: "s1", v: "a" });
  const b = new MemStore();
  b.put("achievements", { id: "current:x", unlockedAt: 100 });
  b.put("ledger", { id: "debit:unlock:theme:noturno", kind: "debit", amount: 150, createdAt: 1 });
  b.put("preferences", { id: "preset:1", name: "nova", updatedAt: 20 });
  b.put("preferences", { id: BOT_RANKING_ROW_ID, revision: 7, bots: [1] });
  b.put("sessions", { id: "s1", v: "b" });
  await sync(a, server, PLAYER);
  await sync(b, server, PLAYER); await sync(a, server, PLAYER); await sync(b, server, PLAYER);
  for (const store of [a, b]) {
    assert.equal(store.get("achievements", "current:x").unlockedAt, 100, "a conquista mais antiga");
    assert.equal(store.get("ledger", "debit:unlock:theme:noturno").amount, 150, "o valor realmente pago");
    assert.equal(store.get("preferences", "preset:1").name, "nova", "a favorita editada por último");
    assert.equal(store.get("preferences", BOT_RANKING_ROW_ID).revision, 7, "a revisão mais alta do ranking dos bots");
  }
  assert.equal(a.get("sessions", "s1").v, "a", "linha comum: cada aparelho fica com a sua (não há como saber qual é a certa)");
  // um aparelho que se recusa a gravar uma linha
  const c = new MemStore();
  await syncAccount({ owner: PLAYER, store: c, transport: directTransport(server, PLAYER), newDeviceId: newId, acceptRow: (store, row) => row.id !== BOT_RANKING_ROW_ID });
  assert.equal(c.get("preferences", BOT_RANKING_ROW_ID), undefined, "linha recusada não entra");
  assert.equal(c.get("preferences", "preset:1").name, "nova");
}

// ───────────── armazenamento do servidor ─────────────
{
  const dir = mkdtempSync(join(tmpdir(), "pvp-sync-"));
  const data = new AccountData(dir);
  const phone = seed(new MemStore());
  await sync(phone, data, PLAYER);
  data.flush();
  const files = readdirSync(dir);
  assert.deepEqual(files, [`${PLAYER}.json`]);
  const written = JSON.parse(readFileSync(join(dir, files[0]), "utf8"));
  assert.equal(written.version, 1);
  assert.equal(Object.keys(written.rows.sessions).length, 20);
  assert.ok(written.epoch && written.rev > 0);
  assert.equal(readFileSync(join(dir, files[0]), "utf8").includes("senha"), false);
  // reiniciar: tudo volta e o aparelho continua sincronizado sem reenviar nada
  const reopened = new AccountData(dir);
  assert.deepEqual(reopened.manifestOf(PLAYER), data.manifestOf(PLAYER));
  const again = await sync(phone, reopened, PLAYER);
  assert.deepEqual([again.pushedRows, again.pulledRows, again.changedFromAccount], [0, 0, false]);
  assert.deepEqual(reopened.commit(PLAYER, "outro-aparelho-qualquer", 0, emptyCounters()).totals, phone.counters());
  // arquivo ilegível: guardado ao lado, nunca sobrescrito, e nasce outra conta limpa (o aparelho reenvia tudo)
  writeFileSync(join(dir, `${PLAYER}.json`), "{isto não é json");
  const broken = new AccountData(dir);
  assert.equal(countRows(broken.plan(PLAYER, manifestOf({})).rows), 0);
  assert.ok(readdirSync(dir).some((name) => name.includes("ilegivel")));
  const heal = await sync(phone, broken, PLAYER);
  assert.equal(heal.status, "ok");
  assert.deepEqual(broken.commit(PLAYER, "outro-aparelho-qualquer", 0, emptyCounters()).totals, phone.counters(), "a conta se refaz com o que o aparelho tem");
  // id de jogador estranho não vira nome de arquivo
  assert.throws(() => data.plan("../../fora", manifestOf({})), /inválido/i);
  assert.throws(() => data.commit(PLAYER, "curto", 1, emptyCounters()), /inválido/i);
  assert.throws(() => data.commit(PLAYER, "dispositivo-valido-1", -1, emptyCounters()), /inválido/i);
  rmSync(dir, { recursive: true, force: true });
}

// ───────────── HTTP de verdade ─────────────
{
  const players = new PlayerRegistry(null);
  const accounts = new AccountRegistry(null);
  const accountData = new AccountData(null);
  const pvp = createPvpHttp({ rooms: new PvpRooms(), players, accounts, accountData, tickMs: 50, heartbeatMs: 60000 });
  const server = http.createServer((req, res) => { if (!pvp.handle(req, res)) { res.writeHead(404); res.end("fora"); } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/pvp`;
  const call = async (method, path, who, body) => {
    const response = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(who ? { "x-pvp-player": who.id, "x-pvp-secret": who.secret } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const ana = { id: "pana-http-sync-0000001", secret: "segredo-da-ana-sync-0000000001" };
  await call("POST", "/me/profile", ana, { name: "Ana" });

  assert.equal((await call("POST", "/sync/plan", null, { manifest: {} })).status, 401, "precisa de identidade");
  assert.equal((await call("POST", "/sync/plan", ana, { manifest: {} })).status, 403, "e de conta");
  assert.equal((await call("GET", "/sync/plan", ana)).status, 404);
  await call("POST", "/account/register", ana, { username: "Ana_sync", password: "senha-da-ana-1" });
  const plan = await call("POST", "/sync/plan", ana, { manifest: { sessions: { s1: 0 } } });
  assert.equal(plan.status, 200);
  assert.deepEqual(plan.body.plan.need.sessions, ["s1"], "a conta pede o que não tem");
  assert.equal(plan.body.plan.hasProgress, false);
  assert.equal((await call("POST", "/sync/plan", ana, { manifest: { sessions: { s1: "x" } } })).status, 400);
  assert.equal((await call("POST", "/sync/rows", ana, { rows: { sessions: [{ semId: 1 }] } })).status, 400);
  assert.equal((await call("POST", "/sync/commit", ana, { deviceId: "curto", seq: 1, delta: {} })).status, 400);
  assert.equal((await call("POST", "/sync/commit", ana, { deviceId: "dispositivo-http-1", seq: 1, delta: { progress: { a: { seen: -5 } } } })).status, 400);
  assert.equal((await call("POST", "/sync/nada", ana, {})).status, 404);
  const pushed = await call("POST", "/sync/rows", ana, { rows: { sessions: [{ id: "s1", endedAt: 5 }], state: [{ id: "x" }] } });
  assert.deepEqual([pushed.status, pushed.body.pushed.changed], [200, 1]);
  const commit = await call("POST", "/sync/commit", ana, { deviceId: "dispositivo-http-1", seq: 1, delta: { progress: { "current:1": { seen: 4, correct: 3, columns: { mapa: 4 }, latest: 9 } }, supply: { lupa: 2 } }, local: { "carta-theme": "noturno", "carta-lixo": "x" } });
  assert.equal(commit.status, 200);
  assert.deepEqual([commit.body.commit.applied, commit.body.commit.totals.progress["current:1"].seen, commit.body.commit.totals.supply.lupa], [true, 4, 2]);
  assert.deepEqual(commit.body.commit.local, { "carta-theme": "noturno" }, "só as preferências conhecidas");
  const repeat = await call("POST", "/sync/commit", ana, { deviceId: "dispositivo-http-1", seq: 1, delta: { progress: { "current:1": { seen: 4, correct: 3, columns: { mapa: 4 }, latest: 9 } } } });
  assert.deepEqual([repeat.body.commit.applied, repeat.body.commit.totals.progress["current:1"].seen], [false, 4], "o mesmo envio repetido não soma");
  const second = await call("POST", "/sync/commit", ana, { deviceId: "dispositivo-http-1", seq: 2, delta: { progress: { "current:1": { seen: 1, correct: 1, columns: {}, latest: 10 } } } });
  assert.equal(second.body.commit.totals.progress["current:1"].seen, 5);
  // outro aparelho da mesma conta vê o mesmo
  const ana2 = { id: ana.id, secret: "segredo-do-celular-sync-0000002" };
  await call("POST", "/account/login", null, { username: "Ana_sync", password: "senha-da-ana-1", secret: ana2.secret });
  const seen = await call("POST", "/sync/plan", ana2, { manifest: {} });
  assert.deepEqual(seen.body.plan.rows.sessions.map((row) => row.id), ["s1"]);
  assert.equal(seen.body.plan.hasProgress, true);
  // outra conta não enxerga os dados da Ana
  const beto = { id: "pbeto-http-sync-0000002", secret: "segredo-do-beto-sync-0000000002" };
  await call("POST", "/me/profile", beto, { name: "Beto" });
  await call("POST", "/account/register", beto, { username: "Beto_sync", password: "senha-do-beto-1" });
  const betoPlan = await call("POST", "/sync/plan", beto, { manifest: {} });
  assert.equal(betoPlan.body.plan.rows.sessions.length, 0);
  assert.equal(betoPlan.body.plan.hasProgress, false);
  // corpo grande: aceito até 8 MB nas rotas de sincronização, recusado acima; as outras rotas continuam em 8 KB
  const big = await call("POST", "/sync/rows", ana, { rows: { sessions: Array.from({ length: 3 }, (_, i) => ({ id: `grande-${i}`, pad: "x".repeat(300_000) })) } });
  assert.equal(big.status, 200, "um lote de ~1 MB passa");
  const huge = await fetch(base + "/sync/rows", { method: "POST", headers: { "content-type": "application/json", "x-pvp-player": ana.id, "x-pvp-secret": ana.secret }, body: JSON.stringify({ pad: "x".repeat(SYNC_LIMITS.bodyBytes + 1000) }) }).then((r) => r.status).catch(() => 0);
  assert.ok(huge === 400 || huge === 0, "corpo acima do limite é recusado");
  const small = await call("POST", "/me/profile", ana, { name: "x".repeat(20000) }).then((r) => r.status).catch(() => 0);
  assert.ok(small === 400 || small === 0, "as outras rotas seguem com o limite pequeno (8 KB)");
  pvp.dispose();
  await new Promise((resolve) => server.close(resolve));
}

console.log("account-sync: regras de linhas e contadores, motor (primeiro envio, repetir sem somar, dois aparelhos, estoque, rede que falha, escolha somar/usar a conta, arquivo refeito), servidor (arquivo, reinício, arquivo ruim) e HTTP — ok");
