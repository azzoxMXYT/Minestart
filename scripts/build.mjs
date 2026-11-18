import { readFileSync, writeFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const font = (name) => readFileSync(new URL(`../src/fonts/${name}.woff2`, import.meta.url)).toString('base64');
const licenses = ['pixelify-sans', 'variable-space-grotesk', 'ibm-plex-mono']
  .map((name) => read(`src/fonts/fontsource-${name}-5.3.0-LICENSE.txt`).trim()).join('\n\n');
const css = read('src/style.css')
  .replace('__PIXELIFY__', font('pixelify-sans-latin-700-normal'))
  .replace('__GROTESK__', font('space-grotesk-latin-wght-normal'))
  .replace('__PLEX__', font('ibm-plex-mono-latin-500-normal'));
const js = ['terrain', 'art', 'render', 'game'].map((file) => read(`src/${file}.js`).trim()).join('\n\n');
const html = read('src/template.html')
  .replace('<!-- __FONT_LICENSES__ -->', () => `<!-- Polices incorporées · SIL Open Font License\n${licenses.replaceAll('--', '—')}\n-->`)
  .replace('/* __STYLE__ */', () => css)
  .replace('/* __SCRIPT__ */', () => `(() => {\n'use strict';\n\n${js}\n})();`);
if (process.argv.includes('--check')) {
  if (read('index.html') !== html) {
    console.error('index.html ne correspond pas aux sources. Lancez npm run build.');
    process.exitCode = 1;
  }
} else {
  writeFileSync(new URL('../index.html', import.meta.url), html);
  console.log(`index.html · ${Math.round(Buffer.byteLength(html) / 1024)} Kio · autonome`);
}
