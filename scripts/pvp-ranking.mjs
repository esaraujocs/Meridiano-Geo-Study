// Contas do PvP e quem fica fora do ranking (contas de teste). Não precisa reiniciar o servidor: ele relê o arquivo ranking-hidden.json sempre que muda.
//
//   node scripts/pvp-ranking.mjs                           lista todas as contas (nome, código de amigo, usuário da conta, troféus, se aparece no ranking)
//   node scripts/pvp-ranking.mjs hide <nome|código|id> ... tira do ranking (o jogador continua existindo e jogando; só não aparece na lista dos outros)
//   node scripts/pvp-ranking.mjs show <nome|código|id> ... volta para o ranking
//
// <nome> é o nome exato (sem diferenciar maiúsculas), <código> é o código de amigo (ex.: 3ZT3FX) e <id> pode ser só o começo do id da lista (ex.: p1n5w4l0).
// Pasta de dados: PVP_DATA_DIR ou .pvp-data (a do servidor da porta 5000). Só LÊ players.json e accounts.json; escreve apenas ranking-hidden.json.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = process.env.PVP_DATA_DIR ? resolve(process.env.PVP_DATA_DIR) : fileURLToPath(new URL("../.pvp-data/", import.meta.url));
const HIDDEN = join(DATA, "ranking-hidden.json");
const read = (name) => { const file = join(DATA, name); return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null; };

const playersFile = read("players.json");
if (!playersFile) { console.error(`Não achei ${join(DATA, "players.json")}.`); process.exit(1); }
const players = Object.entries(playersFile.players ?? playersFile).map(([id, row]) => ({ id, ...row }));
const accounts = Object.values(read("accounts.json")?.accounts ?? {});
const accountOf = new Map(accounts.map((account) => [account.playerId, account.username]));

function readHidden() {
  if (!existsSync(HIDDEN)) return {};
  const listed = JSON.parse(readFileSync(HIDDEN, "utf8"))?.hidden;
  if (Array.isArray(listed)) return Object.fromEntries(listed.map((id) => [id, ""]));
  return listed && typeof listed === "object" ? { ...listed } : {};
}
function writeHidden(hidden) {
  const temporary = `${HIDDEN}.tmp`;
  writeFileSync(temporary, JSON.stringify({ hidden }, null, 2) + "\n", "utf8");
  renameSync(temporary, HIDDEN);
}

function list() {
  const hidden = readHidden();
  const rows = players
    .sort((a, b) => (b.ladders?.mapas?.trophies ?? -1) + (b.ladders?.bandeiras?.trophies ?? -1) - ((a.ladders?.mapas?.trophies ?? -1) + (a.ladders?.bandeiras?.trophies ?? -1)))
    .map((p) => ({
      id: p.id.slice(0, 8),
      nome: p.name || "(sem nome)",
      "código": p.code ?? "-",
      "usuário da conta": accountOf.get(p.id) ?? "-",
      "troféus mapas": p.ladders?.mapas?.trophies ?? "-",
      "troféus bandeiras": p.ladders?.bandeiras?.trophies ?? "-",
      rodadas: p.summary?.rounds ?? "-",
      "visto em": new Date(p.lastSeen).toISOString().slice(0, 16).replace("T", " "),
      ranking: hidden[p.id] !== undefined ? "FORA (oculto)" : p.ladders ? "aparece" : "não aparece (nunca informou troféus)",
    }));
  console.table(rows);
  console.log(`${players.length} contas, ${Object.keys(hidden).length} fora do ranking.`);
}

function find(selector) {
  const wanted = selector.trim().toLowerCase();
  return players.filter((p) => (p.name || "").toLowerCase() === wanted || (p.code ?? "").toLowerCase() === wanted || (wanted.length >= 4 && p.id.toLowerCase().startsWith(wanted)));
}

function change(action, selectors) {
  if (!selectors.length) { console.error(`Diga quem: node scripts/pvp-ranking.mjs ${action} <nome|código|id> ...`); process.exit(1); }
  const hidden = readHidden();
  let failed = false;
  for (const selector of selectors) {
    const found = find(selector);
    if (found.length === 0) { console.error(`✗ "${selector}": ninguém com esse nome, código ou id.`); failed = true; continue; }
    if (found.length > 1) { console.error(`✗ "${selector}": ${found.length} contas batem (${found.map((p) => `${p.name || "(sem nome)"} ${p.id.slice(0, 8)}`).join(", ")}). Use o código ou o começo do id.`); failed = true; continue; }
    const [p] = found;
    if (action === "hide") { hidden[p.id] = p.name || ""; console.log(`✓ ${p.name || "(sem nome)"} (${p.code ?? p.id.slice(0, 8)}) fora do ranking.`); }
    else if (hidden[p.id] !== undefined) { delete hidden[p.id]; console.log(`✓ ${p.name || "(sem nome)"} (${p.code ?? p.id.slice(0, 8)}) de volta ao ranking.`); }
    else console.log(`= ${p.name || "(sem nome)"} já estava no ranking.`);
  }
  writeHidden(hidden);
  if (failed) process.exitCode = 1;
}

const [command = "list", ...rest] = process.argv.slice(2);
if (command === "list") list();
else if (command === "hide" || command === "show") change(command, rest);
else { console.error("Uso: node scripts/pvp-ranking.mjs [list | hide <quem>... | show <quem>...]"); process.exit(1); }
