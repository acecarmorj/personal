const CACHE_NAME = "profitness-shell-20260712-final-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./painel.html",
  "./prof.html",
  "./manifest.webmanifest",
  "./assets/css/style.css",
  "./assets/css/painel.css",
  "./assets/css/prof.css",
  "./assets/js/app-config.js",
  "./assets/js/demo-data.js",
  "./assets/js/shared-data.js",
  "./assets/js/finance-core.js",
  "./assets/js/app.js",
  "./assets/js/painel.js",
  "./assets/js/prof.js",
  "./assets/js/pwa.js",
  "./assets/vendor/qrcode.min.js",
  "./assets/images/pro-fitness-fachada.png",
  "./assets/images/pro-fitness-header-oficial.jpg",
  "./assets/images/pro-fitness-header-fino.jpg",
  "./assets/images/pro-fitness-logo-oficial.jpg",
  "./assets/images/pf-app-icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes("/macros/s/")) return;

  const networkFirst = () => fetch(request, { cache: "no-store" }).then((response) => {
    if (response.ok) {
      caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")));

  if (request.mode === "navigate" || /\.(?:js|css|html|json|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(networkFirst());
    return;
  }

  event.respondWith(caches.match(request).then((cached) => {
    const update = fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(() => cached);
    return cached || update;
  }));
});
