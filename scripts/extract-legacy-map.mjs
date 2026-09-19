import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const sourcePath = new URL("../carta-cega-0.13.5.html", import.meta.url);
const outputPath = new URL("../public/data/legacy-map.json", import.meta.url);
const html = await readFile(sourcePath, "utf8");
const marker = '<script id="payload" type="application/json">';
const start = html.indexOf(marker);

if (start < 0) {
  throw new Error("Payload legado não encontrado.");
}

const contentStart = start + marker.length;
const end = html.indexOf("</script>", contentStart);

if (end < 0) {
  throw new Error("Fim do payload legado não encontrado.");
}

const legacy = JSON.parse(html.slice(contentStart, end));
const sourceHash = createHash("sha256")
  .update(html.slice(contentStart, end))
  .digest("hex");
const mapPayload = {
  sourceVersion: "0.13.5",
  sourceHash,
  topo: legacy.topo,
  meta: legacy.meta,
  points: legacy.points,
  extras: legacy.extras,
};

await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
await writeFile(outputPath, JSON.stringify(mapPayload));

console.log(
  `Mapa legado extraído: ${Object.keys(mapPayload.meta).length} entidades, ` +
    `${mapPayload.points.length} pontos e ${mapPayload.extras.length} extras.`,
);