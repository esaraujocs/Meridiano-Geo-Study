export const MAP_URL = "/maps/carta-boundary-candidate.pmtiles";
export const MAP_BYTES = 27_823_584;
export const MAP_VERSION =
  "5781307c2aad1358a93311a32f0740723ba98a0104a29aaa10fdde2537a49316";
const OPFS_FILE = `carta-boundary-candidate-${MAP_VERSION}.pmtiles`;

export type OfflineMapStatus =
  | "checking"
  | "available"
  | "downloading"
  | "installed"
  | "unavailable"
  | "error";

export async function hasOfflineMap() {
  const file = await getMapFile(false);
  if (!file) return false;
  const size = (await file.getFile()).size;
  if (size === MAP_BYTES) return true;
  await removeOfflineMap();
  return false;
}

export async function downloadOfflineMap() {
  const file = await getMapFile(true);
  if (!file) throw new Error("Não foi possível criar o arquivo offline.");
  const response = await fetch(MAP_URL);
  if (!response.ok) {
    throw new Error(`Falha ao baixar o mapa (${response.status}).`);
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
};

async function getOpfsRoot(): Promise<OpfsRoot> {
  const storage = navigator.storage as StorageManager & {
    getDirectory?: () => Promise<OpfsRoot>;
  };
  if (typeof storage.getDirectory !== "function") {
    throw new Error("Este navegador não oferece armazenamento offline (OPFS).");
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
    throw new Error("O mapa baixado não tem o tamanho esperado.");
  }
  return true;
}