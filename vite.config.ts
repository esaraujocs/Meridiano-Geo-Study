import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readdir, readFile, writeFile } from "node:fs/promises";

const injectPrecacheManifest = () => ({
  name: "carta-cega-precache-manifest",
  apply: "build" as const,
  async closeBundle() {
    const dist = new URL("./dist/", import.meta.url);
    const assets = await readdir(new URL("assets/", dist));
    const precache = [
      "/",
      "/manifest.webmanifest",
      "/data/legacy/catalog.json",
      "/data/legacy-map.json",
      "/data/legacy/flags.json",
      "/data/legacy/historical.json",
      "/data/legacy/historical-flags.json",
      "/data/legacy/languages.json",
      ...assets.map((asset) => `/assets/${asset}`),
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