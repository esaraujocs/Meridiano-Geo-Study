// Plugin do Vite que monta a API do PvP (/api/pvp) no servidor de desenvolvimento e no de produção (`vite preview`, o que o link do Tailscale publica). Os módulos
// TypeScript de server/ são embutidos pelo Vite ao carregar a configuração. As salas ficam na memória; os jogadores, em .pvp-data/players.json.
import { fileURLToPath } from "node:url";
import { createPvpHttp } from "./pvp-http.ts";
import { PlayerRegistry } from "./pvp-players.ts";
import { PvpRooms } from "./pvp-rooms.ts";

export function pvpPlugin() {
  const rooms = new PvpRooms();
  const players = new PlayerRegistry(fileURLToPath(new URL("../.pvp-data/players.json", import.meta.url)));
  const http = createPvpHttp({ rooms, players });
  const mount = (server) => {
    server.middlewares.use((req, res, next) => { if (!http.handle(req, res)) next(); });
    server.httpServer?.once("close", () => { http.dispose(); players.flush(); });
  };
  return { name: "meridiano-pvp", configureServer: mount, configurePreviewServer: mount };
}
