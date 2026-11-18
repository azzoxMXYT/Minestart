// This code is included only in the hosted edition, not the offline HTML/APK.
const installButton = $('install-app');
const offlineState = $('offline-state');
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let installPrompt;
installButton.hidden = standalone;
$('install-ios').hidden = !apple;
$('install-other').hidden = apple;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
});
window.addEventListener('appinstalled', () => { installButton.hidden = true; });
installButton.addEventListener('click', async () => {
  const prompt = installPrompt;
  installPrompt = undefined;
  if (prompt) {
    try { await prompt.prompt(); return; }
    catch { /* Show the manual instructions if the prompt cannot open. */ }
  }
  if (!installDialog.open) openDialog(installDialog);
});

function prepareOffline() {
  const unsupported = () => { offlineState.textContent = 'Hors ligne indisponible sur cette page'; };
  if (!window.isSecureContext || !navigator.serviceWorker) { unsupported(); return; }
  const worker = new URL('./service-worker.js', location.href);
  let timeout;
  const check = () => {
    if (navigator.serviceWorker.controller?.scriptURL !== worker.href) return;
    clearTimeout(timeout);
    offlineState.textContent = 'Prêt hors ligne';
    offlineState.dataset.ready = '';
  };
  timeout = setTimeout(unsupported, 16000);
  navigator.serviceWorker.addEventListener('controllerchange', check);
  check();
  navigator.serviceWorker.register(worker, { scope: './', updateViaCache: 'none' }).then(check, () => {
    clearTimeout(timeout);
    if (!Object.hasOwn(offlineState.dataset, 'ready')) unsupported();
  });
}
prepareOffline();
