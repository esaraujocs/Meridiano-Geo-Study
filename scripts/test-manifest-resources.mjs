import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");
const manifest = JSON.parse(
  await readFile(join(dist, "manifest.webmanifest"), "utf8"),
);

assert.equal(manifest.start_url, "/");
await access(join(dist, "index.html"));

for (const icon of manifest.icons ?? []) {
  assert.equal(typeof icon.src, "string");
  assert.ok(icon.src.startsWith("/"), `Manifest icon must be root-relative: ${icon.src}`);
  await access(join(dist, icon.src.slice(1)));
}

console.log(`manifest resources: ${(manifest.icons ?? []).length} icon(s) verified`);