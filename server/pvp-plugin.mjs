// Plugin do Vite que monta a API do PvP (/api/pvp) no servidor de desenvolvimento e no de produção (`vite preview`, o que o link do Tailscale publica). Os módulos
// TypeScript de server/ são embutidos pelo Vite ao carregar a configuração. As salas e a fila ficam na memória; em .pvp-data/ (fora do git) ficam os jogadores
// (players.json: id + hash do segredo + último nome), as contas de usuário e senha (accounts.json: só hash scrypt), as amizades (friends.json) e o histórico de duelos
// (matches.jsonl, só de acréscimo; a força de cada um sai de relê-lo).
// O estado só nasce quando um servidor sobe: `vite build` também carrega o plugin, e não deve ler nem migrar os arquivos de .pvp-data/.
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPvpHttp } from "./pvp-http.ts";
import { FriendGraph } from "./pvp-friends.ts";
import { PvpHistory } from "./pvp-history.ts";
import { AccountRegistry } from "./pvp-accounts.ts";
import { PlayerRegistry } from "./pvp-players.ts";
import { PvpQueue } from "./pvp-queue.ts";
import { PvpRooms } from "./pvp-rooms.ts";

export function pvpPlugin() {
  // PVP_DATA_DIR troca a pasta dos dados (para testar contas e duelos num servidor de teste sem sujar nem competir com o .pvp-data de verdade, que o servidor da porta 5000 usa).
  const dataDir = process.env.PVP_DATA_DIR ? resolve(process.env.PVP_DATA_DIR) : fileURLToPath(new URL("../.pvp-data/", import.meta.url));
  const dataFile = (name) => join(dataDir, name);
  let state = null;
  const setup = () => {
    if (state) return state;
    const rooms = new PvpRooms();
    const players = new PlayerRegistry(dataFile("players.json"));
    const history = new PvpHistory(dataFile("matches.jsonl"));
    const queue = new PvpQueue({ rooms });
    const friends = new FriendGraph(dataFile("friends.json"));
    const accounts = new AccountRegistry(dataFile("accounts.json"));
    state = { players, friends, accounts, http: createPvpHttp({ rooms, players, queue, history, friends, accounts }) };
    return state;
  };
  const mount = (server) => {
    const { http, players, friends, accounts } = setup();
    server.middlewares.use((req, res, next) => { if (!http.handle(req, res)) next(); });
    server.httpServer?.once("close", () => { http.dispose(); players.flush(); friends.flush(); accounts.flush(); state = null; });
  };
  return { name: "meridiano-pvp", configureServer: mount, configurePreviewServer: mount };
}
