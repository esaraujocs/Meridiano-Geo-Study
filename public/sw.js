const CACHE = "carta-cega-shell-v2";
const MAP_URL = "/maps/carta-boundary-candidate.pmtiles";
const MAP_BYTES = 27741358;
const MAP_FILE = "carta-boundary-candidate-bacb912022100213501a4f57bd7a564df7b65e6b0a643bdb3f42f3bd33456ca7.pmtiles";
const CORE = /*__CARTA_PRECACHE__*/[];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key !== CACHE)
              .map((key) => caches.delete(key)),
          ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const range = event.request.headers.get("range");
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname === MAP_URL) {
    if (!range) {
      event.respondWith(fetch(event.request));
      return;
    }
    event.respondWith(rangeFromOpfs(range).catch(() => fetch(event.request)));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request).then((response) => {
          if (response.ok && new URL(event.request.url).origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        }),
    ),
  );
});

async function rangeFromOpfs(range) {
  const storage = self.navigator.storage;
  if (!storage || typeof storage.getDirectory !== "function") {
    throw new Error("OPFS indisponível.");
  }
  const root = await storage.getDirectory();
  const handle = await root.getFileHandle(MAP_FILE);
  const file = await handle.getFile();
  if (file.size !== MAP_BYTES) throw new Error("Mapa offline inválido.");

  const match = /^bytes=(\d+)-(\d*)$/.exec(range);
  if (!match) throw new Error("Range inválido.");
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : file.size - 1;
  const end = Math.min(requestedEnd, file.size - 1);
  if (start > end) throw new Error("Range fora do arquivo.");

  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${file.size}`,
      "Content-Type": "application/octet-stream",
    },
  });
}