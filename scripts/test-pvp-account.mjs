import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN, cleanUsername, passwordProblem, usernameKey, usernameProblem } from "../.tmp-pvp-account/src/domain/pvp-account.js";
import { ATTEMPT_WINDOW_MS, AccountRegistry, IP_ATTEMPTS, REGISTER_PER_HOUR, USER_ATTEMPTS, readAccountsFile } from "../.tmp-pvp-account/server/pvp-accounts.js";
import { PlayerRegistry, readPlayersFile } from "../.tmp-pvp-account/server/pvp-players.js";
import { PvpRooms } from "../.tmp-pvp-account/server/pvp-rooms.js";
import { createPvpHttp } from "../.tmp-pvp-account/server/pvp-http.js";

// ───────────── regras puras (usuário e senha) ─────────────
assert.deepEqual([USERNAME_MIN, USERNAME_MAX, PASSWORD_MIN, PASSWORD_MAX], [3, 20, 8, 128]);
assert.equal(usernameProblem("ab"), "short");
assert.equal(usernameProblem("a".repeat(21)), "long");
assert.equal(usernameProblem("a".repeat(20)), null);
assert.equal(usernameProblem("Enzo_Silva-1.0"), null, "letras, números, ponto, traço e sublinhado");
for (const bad of ["com espaço", "acentuação", "_comeca", ".ponto", "-traco", "emoji😀", "a<b>c"]) assert.equal(usernameProblem(bad), "chars", `inválido: ${bad}`);
assert.equal(passwordProblem("1234567"), "short");
assert.equal(passwordProblem("12345678"), null);
assert.equal(passwordProblem("x".repeat(128)), null);
assert.equal(passwordProblem("x".repeat(129)), "long");
assert.equal(passwordProblem("   senha com espaços   "), null, "sem regra de composição");
assert.equal(cleanUsername("  Ana  "), "Ana");
assert.equal(cleanUsername(null), "");
assert.equal(usernameKey("EnZo"), "enzo");

const secret = (n) => `segredo-de-teste-${String(n).padStart(8, "0")}-abcdef`;
const pid = (n) => `pjogador-de-teste-${String(n).padStart(6, "0")}`;
let clock = 1_000_000;
const now = () => clock;

// ───────────── AccountRegistry ─────────────
{
  const dir = mkdtempSync(join(tmpdir(), "pvp-accounts-"));
  const file = join(dir, "accounts.json");
  const accounts = new AccountRegistry(file, now);
  assert.equal(await accounts.register(pid(1), "Enzo", "senha-do-enzo-1"), "ok");
  assert.equal(accounts.usernameOf(pid(1)), "Enzo", "guarda como foi escrito");
  assert.equal(await accounts.register(pid(2), "ENZO", "outra-senha-qualquer"), "taken", "usuário único sem distinguir maiúsculas");
  assert.equal(await accounts.register(pid(1), "Outro", "outra-senha-qualquer"), "has_account", "um jogador, uma conta");
  assert.equal(accounts.usernameOf(pid(2)), null);
  // dois pedidos iguais ao mesmo tempo: só um fica
  const race = await Promise.all([accounts.register(pid(3), "Corrida", "senha-da-corrida-1"), accounts.register(pid(4), "corrida", "senha-da-corrida-2")]);
  assert.deepEqual(race.sort(), ["ok", "taken"]);

  assert.equal(await accounts.login("enzo", "senha-do-enzo-1"), pid(1), "o usuário não distingue maiúsculas");
  assert.equal(await accounts.login("Enzo", "senha-errada-1"), null);
  assert.equal(await accounts.login("ninguem", "senha-do-enzo-1"), null, "usuário que não existe");
  assert.equal(await accounts.login("Enzo", ""), null);
  assert.equal(await accounts.login("Enzo", "SENHA-DO-ENZO-1"), null, "a senha distingue maiúsculas");
  const accented = "açaí-com-acento-1";
  assert.notEqual(accented.normalize("NFC"), accented.normalize("NFD"));
  assert.equal(await accounts.register(pid(5), "Acento", accented.normalize("NFC")), "ok");
  assert.equal(await accounts.login("Acento", accented.normalize("NFD")), pid(5), "acento composto ou decomposto é a mesma senha");

  // troca de senha
  assert.equal(await accounts.changePassword(pid(1), "errada-errada", "nova-senha-do-enzo"), false);
  assert.equal(await accounts.changePassword(pid(9), "senha-do-enzo-1", "nova-senha-do-enzo"), false, "quem não tem conta");
  assert.equal(await accounts.changePassword(pid(1), "senha-do-enzo-1", "nova-senha-do-enzo"), true);
  assert.equal(await accounts.login("Enzo", "senha-do-enzo-1"), null, "a antiga deixa de valer");
  assert.equal(await accounts.login("Enzo", "nova-senha-do-enzo"), pid(1));

  // arquivo: a senha nunca aparece, só hash com sal; sobrevive ao reinício
  accounts.flush();
  const text = readFileSync(file, "utf8");
  for (const plain of ["senha-do-enzo-1", "nova-senha-do-enzo", "senha-da-corrida"]) assert.ok(!text.includes(plain), "a senha não é gravada");
  const written = JSON.parse(text);
  assert.equal(written.version, 1);
  assert.deepEqual(Object.keys(written.accounts).sort(), ["acento", "corrida", "enzo"]);
  assert.match(written.accounts.enzo.hash, /^[0-9a-f]{128}$/);
  assert.match(written.accounts.enzo.salt, /^[0-9a-f]{32}$/);
  assert.notEqual(written.accounts.enzo.salt, written.accounts.corrida.salt, "um sal por conta");
  const again = new AccountRegistry(file, now);
  assert.equal(again.size, 3);
  assert.equal(again.usernameOf(pid(1)), "Enzo");
  assert.equal(await again.login("enzo", "nova-senha-do-enzo"), pid(1), "entra com a mesma senha depois de reiniciar");

  // linhas inválidas do arquivo são ignoradas (e dois usuários do mesmo jogador: vale o primeiro)
  const good = written.accounts.enzo;
  const rows = readAccountsFile({ version: 1, accounts: { ok: good, semHash: { ...good, hash: "xx" }, nomeRuim: { ...good, username: "a b" }, idRuim: { ...good, playerId: "x" }, lixo: 5 } });
  assert.deepEqual(rows.map(([key]) => key), ["enzo"]);
  assert.deepEqual(readAccountsFile({ version: 2, accounts: { enzo: good } }), [], "versão desconhecida: não lê");
  assert.deepEqual(readAccountsFile([]), []);

  // arquivo ilegível fica guardado ao lado, nunca sobrescrito
  writeFileSync(file, "{isto não é json");
  assert.equal(new AccountRegistry(file, now).size, 0);
  assert.ok(readdirSync(dir).some((name) => name.includes("ilegivel")));
  rmSync(dir, { recursive: true, force: true });
}

// ───────────── limites de tentativa ─────────────
{
  const accounts = new AccountRegistry(null, now);
  assert.equal(accounts.loginLockedFor("Ana", "1.1.1.1"), 0);
  for (let i = 0; i < USER_ATTEMPTS - 1; i += 1) accounts.noteLoginFailure("Ana", `10.0.0.${i}`);
  assert.equal(accounts.loginLockedFor("Ana", "9.9.9.9"), 0, "um erro a menos que o limite: ainda pode");
  accounts.noteLoginFailure("ANA", "10.0.0.99");
  assert.ok(accounts.loginLockedFor("ana", "9.9.9.9") > 0, "trava o usuário mesmo vindo de outro IP (e sem distinguir maiúsculas)");
  assert.equal(accounts.loginLockedFor("Beto", "9.9.9.9"), 0, "outro usuário não é afetado");
  clock += ATTEMPT_WINDOW_MS + 1;
  assert.equal(accounts.loginLockedFor("Ana", "9.9.9.9"), 0, "a trava expira sozinha");
  // acertar zera a contagem do usuário
  for (let i = 0; i < USER_ATTEMPTS - 1; i += 1) accounts.noteLoginFailure("Caio", "2.2.2.2");
  accounts.noteLoginSuccess("Caio");
  accounts.noteLoginFailure("Caio", "2.2.2.2");
  assert.equal(accounts.loginLockedFor("Caio", "3.3.3.3"), 0);
  // limite por IP
  for (let i = 0; i < IP_ATTEMPTS; i += 1) accounts.noteLoginFailure(`usuario${i}`, "8.8.8.8");
  assert.ok(accounts.loginLockedFor("qualquer", "8.8.8.8") > 0, "IP com erros demais trava, qualquer que seja o usuário");
  assert.equal(accounts.loginLockedFor("qualquer", "8.8.4.4"), 0);
  // criação de contas por IP
  for (let i = 0; i < REGISTER_PER_HOUR; i += 1) { assert.equal(accounts.registerLockedFor("5.5.5.5"), 0); accounts.noteRegister("5.5.5.5"); }
  assert.ok(accounts.registerLockedFor("5.5.5.5") > 0);
  clock += 60 * 60 * 1000 + 1;
  assert.equal(accounts.registerLockedFor("5.5.5.5"), 0);
}

// ───────────── PlayerRegistry: um segredo por aparelho ─────────────
{
  const dir = mkdtempSync(join(tmpdir(), "pvp-devices-"));
  const file = join(dir, "players.json");
  const players = new PlayerRegistry(file, now);
  assert.equal(players.authenticate(pid(1), secret(1)), true, "primeiro uso registra");
  assert.equal(players.addDevice(pid(9), secret(2)), false, "jogador desconhecido");
  assert.equal(players.addDevice(pid(1), "curto"), false, "segredo fora do formato");
  assert.equal(players.authenticate(pid(1), secret(2)), false, "um segredo que ninguém registrou não entra");
  assert.equal(players.addDevice(pid(1), secret(2)), true);
  assert.equal(players.addDevice(pid(1), secret(2)), true, "repetir não duplica");
  assert.equal(players.authenticate(pid(1), secret(2)), true, "o aparelho novo entra");
  assert.equal(players.authenticate(pid(1), secret(1)), true, "o primeiro continua entrando");
  players.flush();
  assert.equal(readFileSync(file, "utf8").includes(secret(2)), false, "só o hash do segredo é gravado");
  const reopened = new PlayerRegistry(file, now);
  assert.equal(reopened.authenticate(pid(1), secret(2)), true, "os aparelhos sobrevivem ao reinício");
  // sair: só o segredo daquele aparelho deixa de valer
  assert.equal(reopened.revoke(pid(1), secret(2)), true);
  assert.equal(reopened.authenticate(pid(1), secret(2)), false);
  assert.equal(reopened.authenticate(pid(1), secret(1)), true);
  assert.equal(reopened.revoke(pid(1), secret(2)), false, "revogar de novo não faz nada");
  // o primeiro segredo também pode sair; com outro aparelho, ele assume; sem nenhum, ninguém entra (e o jogador continua existindo)
  reopened.addDevice(pid(1), secret(3));
  assert.equal(reopened.revoke(pid(1), secret(1)), true);
  assert.equal(reopened.authenticate(pid(1), secret(1)), false);
  assert.equal(reopened.authenticate(pid(1), secret(3)), true, "o aparelho que sobrou assume");
  assert.equal(reopened.revoke(pid(1), secret(3)), true);
  assert.equal(reopened.authenticate(pid(1), secret(3)), false);
  assert.equal(reopened.has(pid(1)), true, "o jogador não some");
  assert.equal(reopened.authenticate(pid(1), secret(4)), false, "sem segredo válido, um segredo novo NÃO registra o jogador de novo");
  // trocar a senha: só o aparelho que trocou continua
  reopened.addDevice(pid(1), secret(5));
  reopened.addDevice(pid(1), secret(6));
  reopened.keepOnly(pid(1), secret(5));
  assert.deepEqual([secret(5), secret(6)].map((value) => reopened.authenticate(pid(1), value)), [true, false]);
  // limite de aparelhos: passou de 10, sai o mais antigo
  for (let n = 10; n < 22; n += 1) reopened.addDevice(pid(1), secret(n));
  assert.equal(reopened.authenticate(pid(1), secret(21)), true);
  assert.equal(reopened.authenticate(pid(1), secret(10)), false, "o mais antigo saiu");
  assert.equal(reopened.authenticate(pid(1), secret(5)), true, "o primeiro segredo não conta no limite");
  // lixo na lista de aparelhos do arquivo é ignorado
  const parsed = readPlayersFile({ version: 2, players: { [pid(1)]: { hash: "a".repeat(64), devices: ["b".repeat(64), "x", 3, "b".repeat(64)], createdAt: 1, lastSeen: 1, name: "" } } });
  assert.deepEqual(parsed.rows[0][1].devices, ["b".repeat(64)]);
  rmSync(dir, { recursive: true, force: true });
}

// ───────────── HTTP de verdade ─────────────
const registry = new PlayerRegistry(null, now);
const accountsHttp = new AccountRegistry(null, now);
const pvp = createPvpHttp({ rooms: new PvpRooms(), players: registry, accounts: accountsHttp, tickMs: 50, heartbeatMs: 60000 });
const server = http.createServer((req, res) => { if (!pvp.handle(req, res)) { res.writeHead(404); res.end("fora"); } });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/api/pvp`;
const call = async (method, path, who, body, extra = {}) => {
  const headers = { "content-type": "application/json", ...(who ? { "x-pvp-player": who.id, "x-pvp-secret": who.secret } : {}), ...extra };
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};
const login = (username, password, deviceSecret, ip = "7.7.7.7") => call("POST", "/account/login", null, { username, password, secret: deviceSecret }, { "x-forwarded-for": `1.2.3.4, ${ip}` });

const ana = { id: pid(101), secret: secret(101) };
const beto = { id: pid(102), secret: secret(102) };
const firstOf = (who) => call("POST", "/me/profile", who, { name: "Ana" }); // cria a identidade
assert.equal((await firstOf(ana)).status, 200);
assert.equal((await firstOf(beto)).status, 200);

// consultar a conta não registra ninguém à toa
{
  const stranger = { id: pid(199), secret: secret(199) };
  const answer = await call("GET", "/account", stranger);
  assert.deepEqual([answer.status, answer.body.account.username], [200, null]);
  assert.equal(registry.has(stranger.id), false, "GET /account não cria identidade");
  assert.deepEqual((await call("GET", "/account", ana)).body.account, { username: null }, "sem conta ainda");
  assert.equal((await call("GET", "/account", { id: ana.id, secret: secret(555) })).status, 401, "segredo errado");
}

// criar a conta
assert.equal((await call("POST", "/account/register", null, { username: "Ana_1", password: "senha-da-ana-1" })).status, 401, "precisa estar identificado");
assert.equal((await call("POST", "/account/register", ana, { username: "a b", password: "senha-da-ana-1" })).status, 400);
assert.equal((await call("POST", "/account/register", ana, { username: "ab", password: "senha-da-ana-1" })).status, 400);
assert.equal((await call("POST", "/account/register", ana, { username: "Ana_1", password: "curta" })).status, 400);
assert.equal((await call("POST", "/account/register", ana, { username: "Ana_1" })).status, 400);
assert.equal((await call("POST", "/account/register", ana, { username: "Ana_1", password: "x".repeat(129) })).status, 400);
{
  const created = await call("POST", "/account/register", ana, { username: "Ana_1", password: "senha-da-ana-1" });
  assert.deepEqual([created.status, created.body.account.username], [201, "Ana_1"]);
}
{
  const dup = await call("POST", "/account/register", beto, { username: "ana_1", password: "senha-do-beto-1" });
  assert.deepEqual([dup.status, dup.body.error], [409, "taken"], "usuário repetido (sem distinguir maiúsculas)");
  const again = await call("POST", "/account/register", ana, { username: "Outro", password: "senha-da-ana-1" });
  assert.equal(again.status, 409, "quem já tem conta não cria outra");
}
assert.deepEqual((await call("GET", "/account", ana)).body.account, { username: "Ana_1" });
assert.deepEqual((await call("GET", "/account", beto)).body.account, { username: null });

// entrar em outro aparelho
const anaPhone = { id: ana.id, secret: secret(201) };
{
  const wrong = await login("Ana_1", "senha-errada-1", anaPhone.secret);
  assert.deepEqual([wrong.status, wrong.body.error], [401, "unauthorized"]);
  assert.equal((await call("GET", "/me", anaPhone)).status, 401, "o segredo do aparelho só vale depois de entrar");
  const unknown = await login("ninguem", "senha-qualquer-1", anaPhone.secret);
  assert.deepEqual([unknown.status, unknown.body.message], [401, wrong.body.message], "usuário inexistente e senha errada dão a mesma resposta");
  assert.equal((await login("Ana_1", "senha-da-ana-1", "curto")).status, 400, "segredo do aparelho fora do formato");
  assert.equal((await call("POST", "/account/login", null, { username: "Ana_1", secret: anaPhone.secret })).status, 400, "sem senha");
  const ok = await login("ana_1", "senha-da-ana-1", anaPhone.secret);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.account, { username: "Ana_1" });
  assert.deepEqual(ok.body.player, { id: ana.id, name: "Ana" }, "devolve o id do jogador e o nome");
}
assert.equal((await call("GET", "/me", anaPhone)).status, 200, "depois de entrar o aparelho novo é o mesmo jogador");
assert.equal((await call("GET", "/me", ana)).status, 200, "o primeiro aparelho continua entrado");
assert.deepEqual((await call("GET", "/account", anaPhone)).body.account, { username: "Ana_1" });

// sair revoga só o aparelho que saiu
assert.equal((await call("POST", "/account/logout", anaPhone)).status, 200);
assert.equal((await call("GET", "/me", anaPhone)).status, 401);
assert.equal((await call("GET", "/me", ana)).status, 200);
assert.equal((await call("POST", "/account/logout", anaPhone)).status, 401, "sair duas vezes: já não está identificado");

// trocar a senha
await login("Ana_1", "senha-da-ana-1", anaPhone.secret);
{
  const tablet = { id: ana.id, secret: secret(202) };
  await login("Ana_1", "senha-da-ana-1", tablet.secret);
  assert.equal((await call("POST", "/account/password", anaPhone, { current: "errada-errada", next: "senha-nova-da-ana" })).status, 401);
  assert.equal((await call("POST", "/account/password", anaPhone, { current: "senha-da-ana-1", next: "curta" })).status, 400);
  assert.equal((await call("POST", "/account/password", beto, { current: "x", next: "senha-nova-do-beto" })).status, 404, "quem não tem conta");
  assert.equal((await call("POST", "/account/password", anaPhone, { current: "senha-da-ana-1", next: "senha-nova-da-ana" })).status, 200);
  assert.equal((await call("GET", "/me", anaPhone)).status, 200, "o aparelho que trocou continua");
  assert.equal((await call("GET", "/me", tablet)).status, 401, "os outros aparelhos saem");
  assert.equal((await call("GET", "/me", ana)).status, 401, "inclusive o primeiro");
  assert.equal((await login("Ana_1", "senha-da-ana-1", tablet.secret)).status, 401, "a senha antiga não entra mais");
  assert.equal((await login("Ana_1", "senha-nova-da-ana", tablet.secret)).status, 200);
  assert.equal((await call("GET", "/me", tablet)).status, 200);
}

// tentativas demais travam (mesmo com a senha certa), e o aviso diz quanto falta
{
  for (let i = 0; i < USER_ATTEMPTS; i += 1) assert.equal((await login("Beto_2", "senha-errada-1", secret(300 + i), `6.6.6.${i}`)).status, 401);
  const locked = await login("Beto_2", "senha-errada-1", secret(399), "6.6.6.200");
  assert.deepEqual([locked.status, locked.body.error], [429, "too_many"]);
  assert.match(locked.body.message, /\d+ min/);
  // o usuário do exemplo nem existe: travar não revela se existe
  await call("POST", "/account/register", beto, { username: "Beto_2", password: "senha-do-beto-1" });
  assert.equal((await login("Beto_2", "senha-do-beto-1", secret(398), "6.6.6.201")).status, 429, "mesmo com a senha certa, enquanto trava");
  clock += ATTEMPT_WINDOW_MS + 1;
  assert.equal((await login("Beto_2", "senha-do-beto-1", secret(398), "6.6.6.201")).status, 200, "a trava passa");
}
// limite por IP: o cabeçalho do proxy vale pelo ÚLTIMO item (os de antes o cliente pode inventar)
{
  for (let i = 0; i < IP_ATTEMPTS; i += 1) await call("POST", "/account/login", null, { username: `alvo${i}`, password: "senha-errada-1", secret: secret(500) }, { "x-forwarded-for": `${i}.0.0.1, 9.9.9.9` });
  const blocked = await call("POST", "/account/login", null, { username: "outro-alvo", password: "senha-errada-1", secret: secret(500) }, { "x-forwarded-for": "0.0.0.0, 9.9.9.9" });
  assert.equal(blocked.status, 429, "o IP real (último item) travou");
  const elsewhere = await call("POST", "/account/login", null, { username: "outro-alvo", password: "senha-errada-1", secret: secret(500) }, { "x-forwarded-for": "9.9.9.9, 8.8.8.8" });
  assert.equal(elsewhere.status, 401, "outro IP não é afetado");
}
// tentativas simultâneas: o scrypt é assíncrono, então a trava tem de contar a tentativa já na chegada (antes, 60 senhas de uma vez passavam todas)
{
  clock += ATTEMPT_WINDOW_MS + 1;
  const dono = { id: pid(700), secret: secret(700) };
  assert.equal((await call("POST", "/account/register", dono, { username: "Rajada", password: "senha-da-rajada-1" }, { "x-forwarded-for": "5.5.5.1" })).status, 201);
  const burst = await Promise.all(Array.from({ length: 40 }, (_, i) => login("Rajada", `chute-${i}-errado`, secret(710 + i), `5.5.${i}.9`)));
  assert.ok(burst.every((r) => r.status === 401 || r.status === 429));
  assert.equal(burst.filter((r) => r.status === 401).length, USER_ATTEMPTS, "numa rajada, só o limite de senhas é conferido");
  const fromIp = await Promise.all(Array.from({ length: IP_ATTEMPTS + 10 }, (_, i) => login(`ninguem${i}`, "chute-errado-1", secret(760 + i), "5.6.7.8")));
  assert.equal(fromIp.filter((r) => r.status === 401).length, IP_ATTEMPTS, "e só o limite por IP numa rajada de usuários diferentes");
  // entrar com a senha certa devolve a vaga do IP: muitos logins do mesmo Wi-Fi não travam ninguém
  clock += ATTEMPT_WINDOW_MS + 1;
  for (let i = 0; i < IP_ATTEMPTS + 2; i += 1) assert.equal((await login("Rajada", "senha-da-rajada-1", secret(810 + i), "5.9.9.9")).status, 200);
  assert.equal((await login("Rajada", "chute-errado-2", secret(850), "5.9.9.9")).status, 401, "o IP não travou pelos acertos");
}
// criação de contas por IP
{
  clock += 2 * 60 * 60 * 1000;
  let last = 0;
  for (let i = 0; i <= REGISTER_PER_HOUR; i += 1) {
    const who = { id: pid(600 + i), secret: secret(600 + i) };
    last = (await call("POST", "/account/register", who, { username: `massa${i}`, password: "senha-em-massa-1" }, { "x-forwarded-for": "4.4.4.4" })).status;
  }
  assert.equal(last, 429, "a conta depois do limite por hora é recusada");
}

await new Promise((resolve) => setTimeout(resolve, 100));
pvp.dispose();
await new Promise((resolve) => server.close(resolve));

console.log("pvp-account: regras de usuário e senha, registro (hash scrypt, sem senha em claro, reinício, arquivo ruim), tentativas e trava, um segredo por aparelho, HTTP (criar, entrar, sair, trocar senha, limites) — ok");
