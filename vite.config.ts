import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { pvpPlugin } from "./server/pvp-plugin.mjs";
// Os países de Estados e províncias: o índice gerado por scripts/divisions/build.py é TypeScript do app (outro projeto do tsc), então é lido como texto.
const DIVISION_INDEX: { id: string; flags: boolean; map: { url: string; sha256: string } }[] = JSON.parse(
  /DIVISION_INDEX: readonly DivisionCountry\[\] = ([\s\S]*);\s*$/.exec(readFileSync(new URL("./src/domain/divisions-index.ts", import.meta.url), "utf8"))![1],
);

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
      "/favicon.svg",
      "/data/flag-overrides/manifest.json",
      "/data/legacy/catalog.json",
      "/data/legacy-map.json",
      "/data/legacy/flags.json",
      "/data/legacy/historical.json",
      "/data/legacy/historical-flags.json",
      "/data/legacy/languages.json",
      "/data/peoples.json",
      // Estados e províncias (scripts/divisions): o catálogo, as silhuetas e as bandeiras de cada país; o mapa do país vai para o cache na primeira
      // partida (sw.js)
      ...DIVISION_INDEX.flatMap((country) => ["units", "shapes", ...(country.flags ? ["flags"] : [])].map((file) => `/data/divisions/${country.id}/${file}.json`)),
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
    const mapsMarker = "/*__CARTA_DIVISION_MAPS__*/{}";
    if (!source.includes(marker) || !source.includes(mapsMarker)) {
      throw new Error(`Marcador de precache ou dos mapas de país não encontrado em ${outDir}/sw.js.`);
    }
    const maps = Object.fromEntries(DIVISION_INDEX.map((country) => [country.map.url, country.map.sha256]));
    await writeFile(
      serviceWorker,
      source.replace(marker, `/*__CARTA_PRECACHE__*/${JSON.stringify(precache)}`).replace(mapsMarker, `/*__CARTA_DIVISION_MAPS__*/${JSON.stringify(maps)}`),
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