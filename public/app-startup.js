/* Läuft vor Angular, auch wenn ein Anwendungsskript nicht geladen werden kann. */
(() => {
  let preference = 'system';
  try {
    preference = localStorage.getItem('flipbase_theme') || 'system';
  } catch {
    // Die Systemwahl funktioniert auch bei gesperrtem Browser-Speicher.
  }
  const isDark =
    preference === 'dark' ||
    (preference !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? '#1f1f1f' : '#f4f5f7');

  const screen = document.getElementById('app-startup');
  const status = document.getElementById('app-startup-status');
  const retry = document.getElementById('app-startup-retry');
  if (!screen || !status || !retry) return;
  let routeReady = false;
  let updatesReady = false;

  const warnTimer = window.setTimeout(() => {
    if (!retry.hidden) return;
    status.textContent = 'Der Start dauert länger. Bitte prüfe deine Verbindung.';
  }, 10_000);
  const failTimer = window.setTimeout(fail, 30_000);

  function fail() {
    window.clearTimeout(warnTimer);
    window.clearTimeout(failTimer);
    status.textContent = 'Flipbase konnte noch nicht gestartet werden. Bitte versuche es erneut.';
    retry.hidden = false;
    screen.classList.add('fb-app-startup--failed');
  }

  function ready() {
    if (!routeReady || !updatesReady) return;
    window.clearTimeout(warnTimer);
    window.clearTimeout(failTimer);
    window.removeEventListener('flipbase:startup-ready', routeFinished);
    window.removeEventListener('flipbase:updates-ready', updatesFinished);
    window.removeEventListener('flipbase:startup-updating', updating);
    window.removeEventListener('flipbase:startup-failed', fail);
    window.removeEventListener('error', assetFailed, true);
    screen.remove();
  }

  function routeFinished() {
    routeReady = true;
    ready();
  }
  function updatesFinished() {
    updatesReady = true;
    ready();
  }
  function updating() {
    status.textContent = 'Flipbase wird aktualisiert …';
  }

  function assetFailed(event) {
    if (event.target instanceof HTMLScriptElement) fail();
  }

  retry.addEventListener('click', () => window.location.reload());
  window.addEventListener('flipbase:startup-ready', routeFinished);
  window.addEventListener('flipbase:updates-ready', updatesFinished);
  window.addEventListener('flipbase:startup-updating', updating);
  window.addEventListener('flipbase:startup-failed', fail);
  window.addEventListener('error', assetFailed, true);
})();
