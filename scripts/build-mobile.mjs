import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { read, renderPage } from './render-page.mjs';

const publicDir = new URL('../docs/', import.meta.url);
const check = process.argv.includes('--check');
const icons = [
  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
];
const files = {
  'index.html': renderPage('pwa'),
  'manifest.webmanifest': JSON.stringify({
    id: './', name: 'Minestart', short_name: 'Minestart', lang: 'fr',
    description: 'Un jeu de blocs léger : construis en Créatif ou explore en Survie.',
    start_url: './', scope: './', display: 'standalone', orientation: 'any',
    background_color: '#131610', theme_color: '#151813', icons,
  }, null, 2) + '\n',
};
const assets = [...icons.map(({ src }) => src), 'icons/apple-touch-icon.png'];
const hash = createHash('sha256');
for (const [name, content] of Object.entries(files)) hash.update(name).update(content);
for (const name of assets) hash.update(name).update(readFileSync(new URL(name, publicDir)));
const sw = read('mobile/service-worker.js');
files['service-worker.js'] = sw.replace('__BUILD_HASH__', hash.update(sw).digest('hex').slice(0, 20))
  .replace('__OFFLINE_FILES__', JSON.stringify([...Object.keys(files), ...assets]));
files['.nojekyll'] = '';

for (const [name, content] of Object.entries(files)) {
  const target = new URL(name, publicDir);
  if (check) {
    if (readFileSync(target, 'utf8') !== content) {
      console.error(`docs/${name} ne correspond pas aux sources. Lancez npm run build:mobile.`);
      process.exitCode = 1;
    }
  } else writeFileSync(target, content);
}
if (!check) console.log(`docs/ · Minestart mobile installable (PWA) · ${Math.ceil(Buffer.byteLength(files['index.html']) / 1024)} Kio de jeu`);
