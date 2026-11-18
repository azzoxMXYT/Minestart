/* Generated copy in docs/. Cache names include the deployment scope and build hash. */
const ROOT = new URL(self.registration.scope);
const PREFIX = `minestart-mobile:${ROOT.href}:`;
const CACHE = `${PREFIX}2dec5ddd3823ec48d2fc`;
const FILES = ["index.html","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png"];
const PATHS = new Map(FILES.map((file) => {
  const url = new URL(file, ROOT);
  return [url.pathname, url.href];
}));
const ENTRY = new URL('index.html', ROOT).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(Array.from(PATHS.values(), (url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const stale = (await caches.keys()).filter((name) => name.startsWith(PREFIX) && name !== CACHE);
    await Promise.all(stale.map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== ROOT.origin) return;
  const asset = url.pathname === ROOT.pathname && event.request.mode === 'navigate' ? ENTRY : PATHS.get(url.pathname);
  if (!asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(asset)) ?? fetch(event.request);
  })());
});
