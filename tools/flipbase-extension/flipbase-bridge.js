// Flipbase Extension - Content Script für die Flipbase Webanwendung

(function initFlipbaseBridge() {
  // Markiere die Seite sofort als mit Erweiterung ausgestattet
  document.documentElement.dataset.flipbaseExtensionInstalled = 'true';
  window.dispatchEvent(
    new CustomEvent('flipbase:extension-ready', {
      detail: { version: '1.0.0', ready: true },
    }),
  );

  // Reagiere auf Anfragen der Web-App
  window.addEventListener('message', (event) => {
    // Sicherheitscheck: Nur Events von der eigenen Seite verarbeiten
    if (event.source !== window) return;

    const data = event.data;
    if (!data || typeof data !== 'object') return;

    // Ping / Statusprüfung
    if (data.type === 'FLIPBASE_CHECK_EXTENSION') {
      window.postMessage(
        {
          type: 'FLIPBASE_EXTENSION_STATUS',
          installed: true,
          version: '1.0.0',
        },
        '*',
      );
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

  // Wiederhole die Ankündigung, falls die SPA später initialisiert
  setInterval(() => {
    document.documentElement.dataset.flipbaseExtensionInstalled = 'true';
  }, 2000);
})();
