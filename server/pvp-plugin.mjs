// Plugin do Vite que monta a API do PvP (/api/pvp) no servidor de desenvolvimento e no de produção (`vite preview`, o que o link do Tailscale publica). Os módulos
// TypeScript de server/ são embutidos pelo Vite ao carregar a configuração. As salas e a fila ficam na memória; em .pvp-data/ (fora do git) ficam os jogadores
// (players.json: id + hash do segredo + último nome), as amizades (friends.json) e o histórico de duelos (matches.jsonl, só de acréscimo; a força de cada um sai de relê-lo).
// O estado só nasce quando um servidor sobe: `vite build` também carrega o plugin, e não deve ler nem migrar os arquivos de .pvp-data/.
import { fileURLToPath } from "node:url";
import { createPvpHttp } from "./pvp-http.ts";
import { FriendGraph } from "./pvp-friends.ts";
import { PvpHistory } from "./pvp-history.ts";
import { PlayerRegistry } from "./pvp-players.ts";
import { PvpQueue } from "./pvp-queue.ts";
import { PvpRooms } from "./pvp-rooms.ts";

export function pvpPlugin() {
  const dataFile = (name) => fileURLToPath(new URL(`../.pvp-data/${name}`, import.meta.url));
  let state = null;
  const setup = () => {
    if (state) return state;
    const rooms = new PvpRooms();
    const players = new PlayerRegistry(dataFile("players.json"));
    const history = new PvpHistory(dataFile("matches.jsonl"));
    const queue = new PvpQueue({ rooms });
    const friends = new FriendGraph(dataFile("friends.json"));
    state = { players, friends, http: createPvpHttp({ rooms, players, queue, history, friends }) };
    return state;
  };
  const mount = (server) => {
    const { http, players, friends } = setup();
    server.middlewares.use((req, res, next) => { if (!http.handle(req, res)) next(); });
    server.httpServer?.once("close", () => { http.dispose(); players.flush(); friends.flush(); state = null; });
  };
  return { name: "meridiano-pvp", configureServer: mount, configurePreviewServer: mount };
}
