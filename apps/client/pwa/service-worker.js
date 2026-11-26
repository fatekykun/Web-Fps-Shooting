/* global build */
const scope = new URL(self.registration.scope);
const cachePrefix = `breakpoint:${scope.pathname}:`;
const cacheName = `${cachePrefix}${build.revision}`;
const shell = new URL('index.html', scope);
const precached = new Set(build.paths.map((path) => new URL(path, scope).href));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) =>
        cache.addAll(
          [...precached].map((url) => new Request(url, { cache: 'reload' })),
        ),
      ),
  );
});

self.addEventListener('activate', (event) => {
  // Keep the old cache and worker together until the last old window closes.
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(cachePrefix) && key !== cacheName)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin) return;
  const appNavigation =
    request.mode === 'navigate' &&
    (url.pathname === scope.pathname || url.pathname === shell.pathname);
  const key = appNavigation ? shell.href : url.href;
  if (!precached.has(key)) return;
  event.respondWith(
    caches
      .open(cacheName)
      .then((cache) => cache.match(key))
      .then((response) => response ?? fetch(request)),
  );
});
