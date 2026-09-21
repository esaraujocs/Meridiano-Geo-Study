import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

// O MapLibre resolve o worker como ./maplibre-gl-worker.mjs relativo ao bundle, e esse worker
// importa ./maplibre-gl-shared.mjs. O Vite não emite nenhum dos dois, então no build de
// produção o worker falhava (404/HTML) e o mapa nunca carregava. Copiamos ambos para dist/assets.
const MAPLIBRE_WORKER_FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

const injectPrecacheManifest = () => ({
  name: "carta-cega-precache-manifest",
  apply: "build" as const,
  async writeBundle(_options: unknown, bundle: Record<string, unknown>) {
    const dist = new URL("./dist/", import.meta.url);
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
      "/data/absorbed-territories.geojson",
      "/data/legacy/flags.json",
      "/data/legacy/historical.json",
      "/data/legacy/historical-flags.json",
      "/data/legacy/languages.json",
      ...assets.map((asset) => `/${asset}`),
    ];
    const serviceWorker = new URL("sw.js", dist);
    const source = await readFile(serviceWorker, "utf8");
    const marker = "/*__CARTA_PRECACHE__*/[]";
    if (!source.includes(marker)) {
      throw new Error("Marcador de precache não encontrado em dist/sw.js.");
    }
    await writeFile(
      serviceWorker,
      source.replace(marker, `/*__CARTA_PRECACHE__*/${JSON.stringify(precache)}`),
    );
  },
});

export default defineConfig({
  plugins: [react(), injectPrecacheManifest()],
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