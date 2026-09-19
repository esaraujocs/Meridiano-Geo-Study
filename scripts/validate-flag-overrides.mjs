import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";

const root = new URL("../public/data/flag-overrides/", import.meta.url);
const files = (await readdir(root)).filter((name) => /\.(svg|png)$/i.test(name));
let failures = 0;
const manifest = {};
for (const name of files) {
  const path = join(root.pathname, name);
  const bytes = await readFile(path);
  const ext = extname(name).toLowerCase();
  let ratio = null;
  if (ext === ".svg") {
    const text = bytes.toString("utf8");
    const viewBox = text.match(/\bviewBox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
    const width = text.match(/\bwidth\s*=\s*["']([\d.]+)["']/i)?.[1];
    const height = text.match(/\bheight\s*=\s*["']([\d.]+)["']/i)?.[1];
    if (!/<svg[\s>]/i.test(text) || !/<\/svg\s*>/i.test(text)) { console.error(`${name}: invalid SVG root`); failures++; continue; }
    if (viewBox) ratio = Number(viewBox[1]) / Number(viewBox[2]);
    else if (width && height) ratio = Number(width) / Number(height);
    // Only remove harmless inter-tag whitespace; no transforms or path rewrites.
    const optimized = text.replace(/>\s+</g, "><").trim();
    if (optimized !== text) await writeFile(path, optimized);
  } else {
    if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47 || bytes.toString("ascii", 1, 4) !== "PNG") { console.error(`${name}: invalid PNG`); failures++; continue; }
    ratio = bytes.readUInt32BE(16) / bytes.readUInt32BE(20);
  }
  if (ratio && (!Number.isFinite(ratio) || ratio <= 0)) { console.error(`${name}: invalid ratio`); failures++; }
  const weight = bytes.length / 1024;
  if (weight > 100) console.warn(`${name}: ${weight.toFixed(1)} KiB (consider reducing weight)`);
  const id = name.slice(0, -ext.length);
  const existing = manifest[id];
  if (!existing || ext === ".svg") {
    manifest[id] = { src: `/data/flag-overrides/${encodeURIComponent(name)}`, ratio };
  }
  console.log(`${name}: valid${ratio ? ` ratio ${ratio.toFixed(4)}` : ""}`);
}
if (!failures) {
  await writeFile(new URL("manifest.json", root), `${JSON.stringify(manifest, null, 2)}\n`);
}
if (failures) process.exitCode = 1;