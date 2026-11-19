import { readFileSync } from 'node:fs';

export const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const font = (name) => readFileSync(new URL(`../src/fonts/${name}.woff2`, import.meta.url)).toString('base64');
const licenses = ['pixelify-sans', 'variable-space-grotesk', 'ibm-plex-mono']
  .map((name) => read(`src/fonts/fontsource-${name}-5.3.0-LICENSE.txt`).trim()).join('\n\n');
const css = ['style', 'mobile', 'menu'].map((name) => read(`src/${name}.css`)).join('\n')
  .replace('__PIXELIFY__', font('pixelify-sans-latin-700-normal'))
  .replace('__GROTESK__', font('space-grotesk-latin-wght-normal'))
  .replace('__PLEX__', font('ibm-plex-mono-latin-500-normal'));
const game = ['terrain', 'survival', 'art', 'render', 'inventory', 'fps', 'game'].map((file) => read(`src/${file}.js`).trim()).join('\n\n');
const webDownload = `<a class="button download" id="download" href="./index.html" download="Minestart.html" title="Télécharger le jeu pour y jouer sans Internet">
        <svg class="icon" aria-hidden="true"><use href="#i-download"/></svg><span>Télécharger</span>
      </a>`;
const appHead = `<link rel="manifest" href="./manifest.webmanifest">
  <link rel="apple-touch-icon" sizes="180x180" href="./icons/apple-touch-icon.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Minestart">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`;
const installButton = `<button class="button app-action tap-target" type="button" id="install-app">
        <svg class="icon" aria-hidden="true"><use href="#i-download"/></svg><span>Installer</span>
      </button>`;
const installDialog = `<dialog id="install-dialog" aria-labelledby="install-title">
    <form method="dialog" class="dialog-head">
      <span class="icon-tile"><svg class="icon" aria-hidden="true"><use href="#i-download"/></svg></span>
      <h2 id="install-title">Installer Minestart</h2>
      <button type="submit" class="bare-button dialog-close" aria-label="Fermer"><svg class="icon" aria-hidden="true"><use href="#i-x"/></svg></button>
    </form>
    <ol class="app-instructions" id="install-ios" hidden>
      <li>Ouvre cette page dans <strong>Safari</strong>, en dehors de l’aperçu intégré.</li>
      <li>Dans <strong>Partager</strong>, choisis <strong>Sur l’écran d’accueil</strong> puis <strong>Ajouter</strong>.</li>
      <li>Ouvre l’icône Minestart une fois en ligne et attends <strong>Prêt hors ligne</strong>.</li>
    </ol>
    <ol class="app-instructions" id="install-other" hidden>
      <li>Ouvre cette page dans un navigateur compatible, comme <strong>Chrome</strong>.</li>
      <li>Dans son menu, choisis <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.</li>
      <li>Ouvre Minestart une fois en ligne et attends <strong>Prêt hors ligne</strong>.</li>
    </ol>
    <p class="app-note">Tes mondes restent sur cet appareil. Supprimer les données du navigateur ou de l’app peut effacer tes parties.</p>
  </dialog>`;

export function renderPage(edition = 'web') {
  const pwa = edition === 'pwa';
  const apk = edition === 'android';
  const js = pwa ? `${game}\n\n${read('src/install-app.js').trim()}` : game;
  return read('src/template.html')
    .replace('__EDITION__', edition)
    .replace('__EDITION_LABEL__', edition === 'web' ? 'ÉDITION WEB' : 'ÉDITION MOBILE')
    .replace('<!-- __APP_HEAD__ -->', pwa ? appHead : '')
    .replace('<!-- __APP_ACTION__ -->', pwa ? installButton : apk ? '<span class="app-state" data-ready>Hors ligne</span>' : webDownload)
    .replace('<!-- __APP_STATUS__ -->', pwa ? '<div class="app-state" id="offline-state" role="status">Préparation hors ligne…</div>' : '')
    .replace('<!-- __APP_DIALOG__ -->', pwa ? installDialog : '')
    .replace('<!-- __FONT_LICENSES__ -->', () => `<!-- Polices incorporées · SIL Open Font License\n${licenses.replaceAll('--', '—')}\n-->`)
    .replace('/* __STYLE__ */', () => css)
    .replace('/* __SCRIPT__ */', () => `(() => {\n'use strict';\n\n${js}\n})();`)
    .replace(/^ +\n/gm, '');
}
