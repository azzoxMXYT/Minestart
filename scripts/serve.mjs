import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT || 3000);
const page = new URL('../index.html', import.meta.url);

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (!['/', '/index.html', '/Minestart.html'].includes(path)) {
    res.writeHead(404).end();
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const html = await readFile(page);
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
      ...(path === '/Minestart.html' ? { 'content-disposition': 'attachment; filename="Minestart.html"' } : {}),
    });
    res.end(req.method === 'HEAD' ? undefined : html);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('Le fichier index.html est introuvable. Lancez npm run build.');
  }
}).listen(port, '0.0.0.0', () => console.log(`Minestart écoute sur le port ${port}.`));
