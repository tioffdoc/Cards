// sw.js — caches every app file on install so the PWA works completely
// offline after the first visit. Bump CACHE_NAME whenever files change
// to invalidate old caches on the next load.

const CACHE_NAME = "flashcards-cache-v3";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "css/tokens.css",
  "css/base.css",
  "css/components.css",
  "js/main.js",
  "js/db.js",
  "js/utils.js",
  "js/charts.js",
  "js/icons.js",
  "js/ui.js",
  "js/nav.js",
  "js/views/home.js",
  "js/views/study.js",
  "js/views/manage.js",
  "js/views/search.js",
  "js/views/profile.js",
  "js/views/settings.js",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// cache-first, falling back to network, and caching same-origin GETs as
// they come in — so newly visited routes stay available offline too.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
