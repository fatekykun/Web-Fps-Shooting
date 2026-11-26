/* global build */
const scope = new URL(self.registration.scope);
const cachePrefix = `breakpoint:${scope.pathname}:`;
const cacheName = `${cachePrefix}${build.revision}`;
const modelCacheName = `${cachePrefix}models`;
const shell = new URL('index.html', scope);
const precached = new Set(build.paths.map((path) => new URL(path, scope).href));
const generatedAssets = new URL('assets/', scope).pathname;
const models = new Map(
  Object.entries(build.models).map(([path, revision]) => {
    const url = new URL(path, scope);
    const href = url.href;
    url.searchParams.set('revision', revision);
    return [href, url.href];
  }),
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) =>
      cache.addAll(
        [...precached].map(
          (url) =>
            new Request(url, {
              cache: new URL(url).pathname.startsWith(generatedAssets)
                ? 'default'
                : 'reload',
              priority: 'low',
            }),
        ),
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
          .filter(
            (key) =>
              key.startsWith(cachePrefix) &&
              key !== cacheName &&
              key !== modelCacheName,
          )
          .map((key) => caches.delete(key)),
      );
      try {
        const cache = await caches.open(modelCacheName);
        const current = new Set(models.values());
        const entries = await cache.keys();
        await Promise.all(
          entries
            .filter(({ url }) => !current.has(url))
            .map((request) => cache.delete(request)),
        );
      } catch {
        // Optional model storage should not block activation.
      }
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
  const model = models.get(key);
  if (model) {
    const result = caches
      .open(modelCacheName)
      .catch(() => undefined)
      .then(async (cache) => {
        const hit = await cache?.match(model).catch(() => undefined);
        if (hit) return { response: hit };
        const response = await fetch(request, { cache: 'no-cache' });
        const saved =
          cache && response.status === 200 && !response.redirected
            ? cache.put(model, response.clone()).catch(() => {})
            : undefined;
        return { response, saved };
      });
    event.respondWith(result.then(({ response }) => response));
    event.waitUntil(result.then(({ saved }) => saved).catch(() => {}));
    return;
  }
  if (!precached.has(key)) return;
  event.respondWith(
    caches
      .open(cacheName)
      .then((cache) => cache.match(key))
      .then((response) => response ?? fetch(request)),
  );
});
