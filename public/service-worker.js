const CACHE_NAME = "astra-shell-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/astra-192.svg", "/icons/astra-512.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const page = await fetch("/index.html", { cache: "reload" });
    if (page.ok) {
      const html = await page.clone().text();
      await cache.put("/index.html", page);
      const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)].map((match) => match[1]);
      await Promise.all([...SHELL, ...assets].map(async (url) => {
        try { const response = await fetch(url); if (response.ok) await cache.put(url, response); } catch { /* Keep the shell usable if an optional asset is offline. */ }
      }));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("astra-shell-") && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(async () => (await caches.match("/index.html")) || Response.error()));
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && /\.(?:js|css|svg|png|woff2)$/.test(requestUrl.pathname)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(event.request, response.clone());
    }
    return response;
  })());
});
