import { writeFileSync } from 'node:fs';
import { read, renderPage } from './render-page.mjs';

const html = renderPage();
if (process.argv.includes('--check')) {
  if (read('index.html') !== html) {
    console.error('index.html ne correspond pas aux sources. Lancez npm run build.');
    process.exitCode = 1;
  }
} else {
  writeFileSync(new URL('../index.html', import.meta.url), html);
  console.log(`index.html · ${Math.round(Buffer.byteLength(html) / 1024)} Kio · autonome`);
}
