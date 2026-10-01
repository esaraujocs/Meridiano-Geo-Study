import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const sourcePath = new URL("carta-cega-0.13.5.html", root);
const outputDir = new URL("public/data/legacy/", root);
const html = await readFile(sourcePath, "utf8");
const marker = '<script id="payload" type="application/json">';
const start = html.indexOf(marker);

if (start < 0) throw new Error("Payload legado não encontrado.");

const contentStart = start + marker.length;
const end = html.indexOf("</script>", contentStart);
if (end < 0) throw new Error("Fim do payload legado não encontrado.");

const sourceText = html.slice(contentStart, end);
const legacy = JSON.parse(sourceText);
// Nomes atuais de exibição; preservar o nome anterior do país na escrita.
legacy.meta["156"].cap = "Beijing";
legacy.meta["528"].pt = "Países Baixos";
legacy.meta["528"].al = [...new Set(["Holanda", ...(legacy.meta["528"].al ?? [])])]
  .filter((name) => name !== "Países Baixos");
legacy.names3.NLD = "Países Baixos";
const envelope = {
  sourceVersion: "0.13.5",
  sourceHash: createHash("sha256").update(sourceText).digest("hex"),
};

const mapEntityIds = Object.entries(legacy.meta)
  .filter(([, meta]) =>
    meta.mapa !== false &&
    !meta.soBandeira &&
    !meta.absorvido
  )
  .map(([id]) => id);

const outputs = {
  "catalog.json": {
    ...envelope,
    meta: legacy.meta,
    names3: legacy.names3,
    mapEntityIds,
  },
  "flags.json": {
    ...envelope,
    flags: legacy.flags,
  },
  "historical.json": {
    ...envelope,
    entities: legacy.hist,
  },
  "historical-flags.json": {
    ...envelope,
    flags: legacy.histFlags,
  },
  "languages.json": {
    ...envelope,
    entries: legacy.lang,
  },
};

await mkdir(outputDir, { recursive: true });
const report = {};

for (const [name, data] of Object.entries(outputs)) {
  const text = JSON.stringify(data);
  await writeFile(new URL(name, outputDir), text);
  report[name] = {
    bytes: Buffer.byteLength(text),
    sha256: createHash("sha256").update(text).digest("hex"),
  };
}

await writeFile(
  new URL("manifest.json", outputDir),
  `${JSON.stringify({ ...envelope, files: report }, null, 2)}\n`,
);

console.log(JSON.stringify(report, null, 2));