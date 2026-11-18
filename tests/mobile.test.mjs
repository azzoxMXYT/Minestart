import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { read, renderPage } from '../scripts/render-page.mjs';

test('la PWA a des icônes et une portée relatives ; l’APK est autonome', () => {
  const pwa = renderPage('pwa'), android = renderPage('android');
  const manifest = JSON.parse(read('docs/manifest.webmanifest'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.match(pwa, /rel="manifest" href="\.\/manifest.webmanifest"/);
  assert.match(pwa, /rel="apple-touch-icon"/);
  for (const [path, dimension] of [...manifest.icons.map(({ src, sizes }) => [src, Number(sizes.split('x')[0])]), ['icons/apple-touch-icon.png', 180]]) {
    const image = readFileSync(new URL(`../docs/${path}`, import.meta.url));
    assert.equal(image.subarray(1, 4).toString(), 'PNG');
    assert.equal(image.readUInt32BE(16), dimension);
    assert.equal(image.readUInt32BE(20), dimension);
  }
  assert.match(android, /data-edition="android"/);
  assert.doesNotMatch(android, /serviceWorker\.register|rel="manifest"|<(?:script|link)\s[^>]*(?:src|href)="https?:/);
  assert.doesNotMatch(read('mobile/android/AndroidManifest.xml'), /uses-permission/);
});

test('le service worker sert le jeu et ses icônes hors ligne sous un sous-chemin', async () => {
  const scope = 'https://example.test/Minestart/';
  const handlers = new Map(), assets = new Map(), evicted = [];
  const old = `minestart-mobile:${scope}:older`, unrelated = 'some-other-app';
  let key, claimed = false, skipped = false, online = true;
  runInNewContext(read('docs/service-worker.js'), {
    URL, Request,
    self: {
      registration: { scope },
      clients: { claim() { claimed = true; } },
      skipWaiting() { skipped = true; },
      addEventListener(name, listener) { handlers.set(name, listener); },
    },
    caches: {
      open(cache) {
        key = cache;
        return {
          addAll(requests) {
            assert.equal(online, true);
            for (const request of requests) assets.set(request.url, request.url);
          },
          match(url) { return assets.get(url); },
        };
      },
      keys() { return [key, old, unrelated]; },
      delete(name) { evicted.push(name); },
    },
    fetch() { throw new Error('Le jeu ne devrait pas utiliser le réseau dans ce test.'); },
  });
  const waited = (event) => new Promise((resolve) => handlers.get(event)({ waitUntil: resolve }));
  await waited('install');
  await waited('activate');
  assert.ok(claimed && skipped);
  assert.deepEqual(evicted, [old]);
  assert.equal(assets.size, 5);
  online = false;
  const request = (url, mode, method = 'GET') => {
    let result;
    handlers.get('fetch')({ request: { url, mode, method }, respondWith(response) { result = response; } });
    return result;
  };
  assert.equal(await request(`${scope}?launch=home`, 'navigate'), `${scope}index.html`);
  assert.equal(await request(`${scope}icons/apple-touch-icon.png`, 'same-origin'), `${scope}icons/apple-touch-icon.png`);
  assert.equal(request('https://example.test/other/', 'navigate'), undefined);
  assert.equal(request('https://other.test/Minestart/index.html', 'navigate'), undefined);
  assert.equal(request(`${scope}index.html`, 'same-origin', 'POST'), undefined);
});
