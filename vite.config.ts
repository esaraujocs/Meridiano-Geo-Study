import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { pvpPlugin } from "./server/pvp-plugin.mjs";

// O MapLibre resolve o worker como ./maplibre-gl-worker.mjs relativo ao bundle, e esse worker
// importa ./maplibre-gl-shared.mjs. O Vite não emite nenhum dos dois, então no build de
// produção o worker falhava (404/HTML) e o mapa nunca carregava. Copiamos ambos para dist/assets.
const MAPLIBRE_WORKER_FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

// Escreve na pasta de saída configurada (`build.outDir`, padrão dist/). Com `--outDir` dá para conferir um build sem tocar no dist/ que o servidor ao vivo serve.
const injectPrecacheManifest = () => {
  let outDir = "dist";
  return {
  name: "carta-cega-precache-manifest",
  apply: "build" as const,
  configResolved(config: { root: string; build: { outDir: string } }) { outDir = resolve(config.root, config.build.outDir); },
  async writeBundle(_options: unknown, bundle: Record<string, unknown>) {
    const dist = pathToFileURL(`${outDir}/`);
    await mkdir(new URL("assets/", dist), { recursive: true });
    for (const file of MAPLIBRE_WORKER_FILES) {
      await copyFile(
        new URL(`./node_modules/maplibre-gl/dist/${file}`, import.meta.url),
        new URL(`assets/${file}`, dist),
      );
    }
    const assets = [
      ...Object.keys(bundle).filter((file) => file.startsWith("assets/")),
      ...MAPLIBRE_WORKER_FILES.map((file) => `assets/${file}`),
    ];
    const precache = [
      "/",
      "/manifest.webmanifest",
      "/data/legacy/catalog.json",
      "/data/legacy-map.json",
      "/data/legacy/flags.json",
      "/data/legacy/historical.json",
      "/data/legacy/historical-flags.json",
      "/data/legacy/languages.json",
      "/data/peoples.json",
      // família Brasil (scripts/brasil): o catálogo, as silhuetas e as bandeiras dos estados; o mapa dos estados vai para o cache na primeira partida (sw.js)
      "/data/brasil/states.json",
      "/data/brasil/shapes.json",
      "/data/brasil/flags.json",
      // Peças locais do museu: adquiridas continuam visíveis sem conexão.
      ...(await readdir(new URL("./public/museum/", import.meta.url)))
        .filter((file) => /\.(jpg|png|webp|svg)$/.test(file))
        .map((file) => `/museum/${file}`),
      // conteúdo traduzido (ver scripts/i18n/build-i18n.mjs): pequeno, vai junto para o jogo abrir offline em qualquer idioma
      ...["en", "es"].flatMap((locale) => ["catalog", "historical", "languages"].map((file) => `/data/i18n/${locale}/${file}.json`)),
      ...assets.map((asset) => `/${asset}`),
    ];
    const serviceWorker = new URL("sw.js", dist);
    const source = await readFile(serviceWorker, "utf8");
    const marker = "/*__CARTA_PRECACHE__*/[]";
    if (!source.includes(marker)) {
      throw new Error(`Marcador de precache não encontrado em ${outDir}/sw.js.`);
    }
    await writeFile(
      serviceWorker,
      source.replace(marker, `/*__CARTA_PRECACHE__*/${JSON.stringify(precache)}`),
    );
  },
  };
};

export default defineConfig({
  plugins: [react(), injectPrecacheManifest(), pvpPlugin()],
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
  },
});