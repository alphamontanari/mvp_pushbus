const CACHE_NAME = "mvppushbs-v0-0-4-map-controls";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/mapa.html",
  "/linha-01a-pontos.html",
  "/realtime-pontos.html",
  "/pushbus.css",
  "/pushbus.js",
  "/pushbus-data.js",
  "/mapa.css",
  "/mapa.js",
  "/linha-01a-pontos.css",
  "/linha-01a-pontos.js",
  "/realtime-pontos.css",
  "/realtime-pontos.js",
  "/nav.css",
  "/nav.js",
  "/manifest.webmanifest",
  "/pushbus-icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(url.pathname).then(cached => cached || caches.match("/")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;

        return caches.match(url.pathname).then(fallback => fallback || fetch(event.request));
      })
  );
});
