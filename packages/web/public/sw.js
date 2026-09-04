/* MEDIA! app shell — do not cache video or API streams (iOS Cache API is tiny). */
const CACHE_NAME = "media-pwa-v1";
const BASE_PATH = self.location.pathname.replace(/\/sw\.js$/, "");

function appUrl(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}

const PRECACHE = [appUrl("/"), appUrl("/downloads/")];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function shouldBypass(request, url) {
  if (request.method !== "GET") return true;
  if (request.headers.has("range")) return true;
  if (url.pathname.includes("/api/stream/")) return true;
  if (url.pathname.includes("/api/offline/")) return true;
  if (url.pathname.includes("/api/watch-progress")) return true;
  if (url.pathname.endsWith("/sw.js")) return true;
  const dest = request.destination;
  if (dest === "video" || dest === "audioworklet") return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (shouldBypass(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.includes("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const downloads = await cache.match(appUrl("/downloads/"));
    if (downloads) return downloads;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}
