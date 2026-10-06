import { t } from "./i18n/index.js";

export const MAP_URL = "/maps/meridiano-hd.pmtiles";
export const MAP_BYTES = 95_216_013;
export const MAP_VERSION =
  "6ff43c179555c6cd94e19f645a63dcf3b05daa7370633354228e28ef486ad183";
const OPFS_FILE = `meridiano-hd-${MAP_VERSION}.pmtiles`;
/** Os estados da família Brasil (scripts/brasil): 2,3 MB, guardado inteiro no cache do service worker na primeira partida (ver sw.js), então
 *  não entra no "Baixar mapa". Tamanho e hash precisam bater com o arquivo e com o sw.js (test:manifest confere). */
export const BRASIL_MAP_URL = "/maps/brasil-hd.pmtiles";
export const BRASIL_MAP_BYTES = 2_334_441;
export const BRASIL_MAP_VERSION =
  "02f271f5edb459bf1bf41ea105a8de5bd757fb4a53c882e74cb6aa926608da7e";

export type OfflineMapStatus =
  | "checking"
  | "available"
  | "downloading"
  | "installed"
  | "unavailable"
  | "error";

export async function hasOfflineMap() {
  await removeStaleMaps().catch(() => undefined);
  const file = await getMapFile(false);
  if (!file) return false;
  const size = (await file.getFile()).size;
  if (size === MAP_BYTES) return true;
  await removeOfflineMap();
  return false;
}

export async function downloadOfflineMap() {
  const file = await getMapFile(true);
  if (!file) throw new Error(t.errors.offlineCreate);
  const response = await fetch(MAP_URL);
  if (!response.ok) {
    throw new Error(t.errors.offlineDownload(response.status));
  }
  const writable = await file.createWritable();
  try {
    if (!response.body) {
      await writable.write(await response.arrayBuffer());
    } else {
      await response.body.pipeTo(writable);
      return verifyMapSize();
    }
    await writable.close();
  } catch (error) {
    await writable.abort();
    throw error;
  }
  return verifyMapSize();
}

export async function removeOfflineMap() {
  const root = await getOpfsRoot();
  try {
    await root.removeEntry(OPFS_FILE);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return;
    throw error;
  }
}

type OpfsFile = {
  getFile: () => Promise<File>;
  createWritable: () => Promise<WritableStream & {
    write: (data: ArrayBuffer) => Promise<void>;
    close: () => Promise<void>;
    abort: () => Promise<void>;
  }>;
};
type OpfsRoot = {
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<OpfsFile>;
  removeEntry: (name: string) => Promise<void>;
  keys?: () => AsyncIterable<string>;
};

/** O nome do arquivo leva o hash do mapa: o de uma versão anterior (o mapa antigo, de 28 MB, ou um HD regerado, de ~86 MB)
 * ficaria no aparelho para sempre. Só o mapa usa o OPFS, então todo `.pmtiles` que não é o atual sai. */
async function removeStaleMaps() {
  const root = await getOpfsRoot();
  if (typeof root.keys !== "function") return;
  const stale: string[] = [];
  for await (const name of root.keys()) if (name.endsWith(".pmtiles") && name !== OPFS_FILE) stale.push(name);
  for (const name of stale) await root.removeEntry(name).catch(() => undefined);
}

async function getOpfsRoot(): Promise<OpfsRoot> {
  const storage = navigator.storage as StorageManager & {
    getDirectory?: () => Promise<OpfsRoot>;
  };
  if (typeof storage.getDirectory !== "function") {
    throw new Error(t.errors.offlineUnsupported);
  }
  return storage.getDirectory();
}

async function getMapFile(create: boolean) {
  const root = await getOpfsRoot();
  try {
    return await root.getFileHandle(OPFS_FILE, { create });
  } catch (error) {
    if (!create && error instanceof DOMException && error.name === "NotFoundError") {
      return null;
    }
    throw error;
  }
}

async function verifyMapSize() {
  const file = await getMapFile(false);
  if (!file || (await file.getFile()).size !== MAP_BYTES) {
    await removeOfflineMap();
    throw new Error(t.errors.offlineSize);
  }
  return true;
}