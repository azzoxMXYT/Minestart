import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT || 3000);
const mobileRoot = process.argv.includes('--mobile');
const mobileFiles = new Map([
  ['index.html', 'text/html; charset=utf-8'],
  ['manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['service-worker.js', 'application/javascript; charset=utf-8'],
  ['icons/icon-192.png', 'image/png'], ['icons/icon-512.png', 'image/png'], ['icons/apple-touch-icon.png', 'image/png'],
]);

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }
  if (path === '/mobile') { res.writeHead(302, { location: './mobile/' }).end(); return; }
  let file, type, download = false;
  if (mobileRoot || path.startsWith('/mobile/')) {
    const name = (path.startsWith('/mobile/') ? path.slice(8) : path.slice(1)) || 'index.html';
    type = mobileFiles.get(name);
    if (type) file = `docs/${name}`;
  } else if (['/', '/index.html', '/Minestart.html'].includes(path)) {
    file = 'index.html'; type = 'text/html; charset=utf-8'; download = path === '/Minestart.html';
  }
  if (!file) { res.writeHead(404).end(); return; }
  try {
    const bytes = await readFile(new URL(`../${file}`, import.meta.url));
    res.writeHead(200, {
      'content-type': type,
      'cache-control': 'no-cache',
      ...(download ? { 'content-disposition': 'attachment; filename="Minestart.html"' } : {}),
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('Lancez npm run build pour générer les fichiers du jeu.');
  }
}).listen(port, '0.0.0.0', () => console.log(`Minestart${mobileRoot ? ' mobile' : ''} écoute sur le port ${port}.`));
