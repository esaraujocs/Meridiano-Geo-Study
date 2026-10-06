const CACHE = "carta-cega-shell-v2";
const MAP_URL = "/maps/meridiano-hd.pmtiles";
const MAP_BYTES = 95216013;
const MAP_FILE = "meridiano-hd-6ff43c179555c6cd94e19f645a63dcf3b05daa7370633354228e28ef486ad183.pmtiles";
const CORE = /*__CARTA_PRECACHE__*/[];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

// O servidor do duelo entre pessoas (/api/pvp/...) responde coisas que mudam a cada instante (fila, sala, ranking): nunca vem do cache.
const isApi = (url) => url.origin === self.location.origin && url.pathname.startsWith("/api/");

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
      )
      // até 28/09 as respostas de /api/ também iam para o cache (e voltavam velhas): tira as que ficaram
      .then(() => caches.open(CACHE))
      .then((cache) => cache.keys().then((requests) => Promise.all(requests.filter((request) => isApi(new URL(request.url))).map((request) => cache.delete(request))))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const range = event.request.headers.get("range");
  const url = new URL(event.request.url);
  if (isApi(url)) return;
  if (url.origin === self.location.origin && url.pathname === MAP_URL) {
    if (!range) {
      event.respondWith(fetch(event.request));
      return;
    }
    event.respondWith(rangeFromOpfs(range).catch(() => fetch(event.request)));
    return;
  }

  // A página (navegação) vem da rede primeiro: depois de publicar uma versão nova, já a primeira abertura roda o código novo (com cache primeiro, a 1ª
  // abertura ainda rodava a versão velha e dois jogadores podiam duelar com versões diferentes). Sem internet, cai na cópia guardada.
  if (event.request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && !url.search) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("/"))),
    );
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