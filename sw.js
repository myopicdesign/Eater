const CACHE = "eater-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./data/recipes.json"
];

// install: cache base
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// activate: pulizia cache vecchie
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// fetch: network-first per JSON (così vedi aggiornamenti), cache-first per il resto
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Aggiorna spesso il JSON ricette
  if (url.pathname.endsWith("/data/recipes.json")) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Statici: cache-first
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
