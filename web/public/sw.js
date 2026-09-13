const CACHE = "kq-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => {
      // Try to cache all files we know about (shell + common asset patterns)
      const urls = [
        ...SHELL,
        "/index.js", // fallback in case no-hash build
      ];
      return Promise.allSettled(urls.map(url => c.add(url).catch(() => null)));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // API calls: network-only (don't cache mutable data)
  if (url.pathname.startsWith("/api/")) return;

  // App shell & assets: stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const fetched = fetch(request).then((res) => {
        if (res.ok) cache.put(request, res.clone());
        return res;
      }).catch(() => cached ?? new Response("Offline", { status: 503 }));
      return cached ?? fetched;
    })
  );
});
