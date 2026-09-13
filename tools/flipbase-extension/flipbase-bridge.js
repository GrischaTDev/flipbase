// Flipbase Extension - Content Script für die Flipbase Webanwendung

(function initFlipbaseBridge() {
  const host = window.location.hostname;
  // Nur auf localhost, 127.0.0.1 oder Flipbase-Domains ausführen
  const isAllowedHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.flipbase.de') ||
    host === 'flipbase.de';

  if (!isAllowedHost) {
    return;
  }

  function announceExtension() {
    if (document.documentElement) {
      document.documentElement.dataset.flipbaseExtensionInstalled = 'true';
    }
    window.postMessage(
      {
        type: 'FLIPBASE_EXTENSION_STATUS',
        installed: true,
        version: '1.0.1',
      },
      '*',
    );
    window.dispatchEvent(
      new CustomEvent('flipbase:extension-ready', {
        detail: { version: '1.0.1', ready: true },
      }),
    );
  }

  // Sofort und bei DOM-Events ankündigen
  announceExtension();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', announceExtension);
  }

  // Regelmäßig senden, damit neu gemountete SPAs es immer sofort mitbekommen
  setInterval(announceExtension, 1000);

  // Reagiere auf Anfragen der Web-App
  window.addEventListener('message', (event) => {
    // Sicherheitscheck: Nur Events von der eigenen Seite verarbeiten
    if (event.source !== window) return;

    const data = event.data;
    if (!data || typeof data !== 'object') return;

    // Ping / Statusprüfung
    if (data.type === 'FLIPBASE_CHECK_EXTENSION') {
      announceExtension();
      return;
    }

    // Inserat auf Kleinanzeigen starten
    if (data.type === 'FLIPBASE_PUBLISH_KLEINANZEIGEN') {
      const payload = data.payload;
      chrome.runtime.sendMessage(
        {
          type: 'START_KLEINANZEIGEN_LISTING',
          payload: payload,
        },
        (response) => {
          window.postMessage(
            {
              type: 'FLIPBASE_PUBLISH_KLEINANZEIGEN_RESULT',
              success: Boolean(response?.success),
              tabId: response?.tabId,
              error: response?.error,
            },
            '*',
          );
        },
      );
    }
  });
})();
