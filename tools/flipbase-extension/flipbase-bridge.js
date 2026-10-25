// Flipbase Extension - Content Script für die Flipbase Webanwendung

(function initFlipbaseBridge() {
  const core = globalThis.FlipbaseVintedLocal;
  const isAllowedHost = window.top === window && core?.isAppOrigin(window.location.origin);

  if (!isAllowedHost) {
    return;
  }

  const kleinanzeigen = globalThis.FlipbaseKleinanzeigenLocal;
  let kleinanzeigenAvailable = false;
  let kleinanzeigenSyncAvailable = false;
  let kleinanzeigenPublishAvailable = false;
  let kleinanzeigenQuotaAvailable = false;
  let kleinanzeigenFormSchemaAvailable = false;
  let kleinanzeigenAssistedListings = false;
  let kleinanzeigenRelisting = false;
  let kleinanzeigenAccount;
  let localAccount;
  let readiness;
  let backgroundReachable = false;
  let vintedSourceDetailsAvailable = false;
  function announceExtension() {
    if (document.documentElement) {
      document.documentElement.dataset.flipbaseExtensionInstalled = String(
        backgroundReachable || kleinanzeigenAvailable,
      );
    }
    window.postMessage(
      {
        type: 'FLIPBASE_EXTENSION_STATUS',
        installed: backgroundReachable || kleinanzeigenAvailable,
        backgroundReachable,
        version: '1.11.0',
        vintedLocal: backgroundReachable,
        vintedSourceDetails: vintedSourceDetailsAvailable,
        kleinanzeigenQuota: kleinanzeigenQuotaAvailable,
        kleinanzeigenFormSchema: kleinanzeigenFormSchemaAvailable,
        kleinanzeigenAssistedListings,
        kleinanzeigenRelisting,
        kleinanzeigenCapabilities: {
          accounts: kleinanzeigenAvailable,
          sync: kleinanzeigenSyncAvailable,
          publish: kleinanzeigenPublishAvailable,
        },
        ...(kleinanzeigenAccount !== undefined ? { kleinanzeigenAccount } : {}),
        ...(localAccount !== undefined ? { localAccount } : {}),
        ...(readiness !== undefined ? { readiness } : {}),
      },
      window.location.origin,
    );
    if (backgroundReachable || kleinanzeigenAvailable)
      window.dispatchEvent(
        new CustomEvent('flipbase:extension-ready', {
          detail: { version: '1.11.0', ready: true },
        }),
      );
  }

  function refreshLocalAccount() {
    if (kleinanzeigen) {
      try {
        chrome.runtime.sendMessage(
          { type: 'FLIPBASE_KLEINANZEIGEN_STATUS', requestId: 'ka-readiness' },
          (response) => {
            kleinanzeigenAvailable = !chrome.runtime.lastError && response?.success === true;
            kleinanzeigenSyncAvailable =
              kleinanzeigenAvailable && response?.capabilities?.sync === true;
            kleinanzeigenPublishAvailable =
              kleinanzeigenAvailable && response?.capabilities?.publish === true;
            kleinanzeigenQuotaAvailable = kleinanzeigenAvailable && response?.quota === true;
            kleinanzeigenFormSchemaAvailable =
              kleinanzeigenAvailable && response?.formSchema === true;
            kleinanzeigenAssistedListings =
              kleinanzeigenAvailable && response?.assistedListings === true;
            kleinanzeigenRelisting = kleinanzeigenAvailable && response?.relisting === true;
            kleinanzeigenAccount = kleinanzeigenAvailable ? (response.result ?? null) : undefined;
            announceExtension();
          },
        );
      } catch {
        kleinanzeigenAvailable = false;
        kleinanzeigenSyncAvailable = false;
        kleinanzeigenPublishAvailable = false;
        kleinanzeigenFormSchemaAvailable = false;
        kleinanzeigenQuotaAvailable = false;
        kleinanzeigenAssistedListings = false;
        kleinanzeigenRelisting = false;
        kleinanzeigenAccount = undefined;
        announceExtension();
      }
    }
    try {
      chrome.runtime.sendMessage({ type: 'VINTED_LOCAL_ACCOUNT_STATUS' }, (response) => {
        backgroundReachable = !chrome.runtime.lastError && response?.success === true;
        vintedSourceDetailsAvailable =
          backgroundReachable && response?.capabilities?.sourceDetails === true;
        localAccount = backgroundReachable ? (response.result?.localAccount ?? null) : undefined;
        readiness = backgroundReachable ? response.result?.readiness : undefined;
        announceExtension();
      });
    } catch {
      // Ein nach dem Erweiterungsreload ungültiger Kontext bestätigt keine Erreichbarkeit.
      backgroundReachable = false;
      vintedSourceDetailsAvailable = false;
      localAccount = undefined;
      readiness = undefined;
      announceExtension();
    }
  }

  // Sofort und bei DOM-Events ankündigen
  announceExtension();
  refreshLocalAccount();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', announceExtension);
  }

  // Regelmäßig senden, damit neu gemountete SPAs es immer sofort mitbekommen
  setInterval(refreshLocalAccount, 1000);

  // Reagiere auf Anfragen der Web-App
  const seenRequests = new Set();
  window.addEventListener('message', (event) => {
    // Sicherheitscheck: Nur Events von der eigenen Seite verarbeiten
    if (event.source !== window || event.origin !== window.location.origin) return;

    const data = event.data;
    if (!data || typeof data !== 'object') return;

    const localRequest = core.parseRequest(data, event.origin);
    if (localRequest) {
      if (seenRequests.has(localRequest.requestId)) return;
      seenRequests.add(localRequest.requestId);
      if (seenRequests.size > 128) seenRequests.delete(seenRequests.values().next().value);
      chrome.runtime.sendMessage(data, (response) => {
        const runtimeError = chrome.runtime.lastError;
        window.postMessage(
          {
            type: 'FLIPBASE_VINTED_LOCAL_RESULT',
            requestId: localRequest.requestId,
            success: !runtimeError && response?.success === true,
            ...(!runtimeError && response?.success === true
              ? { result: response.result }
              : {
                  error:
                    response?.error ??
                    'Die Flipbase-Erweiterung ist nicht erreichbar. Lade die Seite neu.',
                }),
          },
          window.location.origin,
        );
      });
      return;
    }

    const kleinanzeigenRequest = kleinanzeigen?.parseRequest(data, event.origin);
    if (kleinanzeigenRequest) {
      const requestKey = 'kleinanzeigen:' + kleinanzeigenRequest.requestId;
      if (seenRequests.has(requestKey)) return;
      seenRequests.add(requestKey);
      if (seenRequests.size > 128) seenRequests.delete(seenRequests.values().next().value);
      chrome.runtime.sendMessage(data, (response) => {
        const runtimeError = chrome.runtime.lastError;
        window.postMessage(
          {
            type: 'FLIPBASE_KLEINANZEIGEN_RESULT',
            requestId: kleinanzeigenRequest.requestId,
            success: !runtimeError && response?.success === true,
            ...(!runtimeError && response?.success === true
              ? { result: response.result }
              : {
                  error:
                    response?.error ??
                    'Die Kleinanzeigen-Erweiterung ist nicht erreichbar. Lade die Seite neu.',
                }),
          },
          window.location.origin,
        );
      });
      return;
    }

    // Ping / Statusprüfung
    if (data.type === 'FLIPBASE_CHECK_EXTENSION') {
      announceExtension();
      refreshLocalAccount();
      return;
    }

    // Inserat auf Kleinanzeigen starten
    if (data.type === 'FLIPBASE_PUBLISH_KLEINANZEIGEN') {
      const payload = data.payload;
      const requestId = data.requestId;
      chrome.runtime.sendMessage(
        {
          type: 'START_KLEINANZEIGEN_LISTING',
          payload: payload,
        },
        (response) => {
          const runtimeError = chrome.runtime.lastError;
          window.postMessage(
            {
              type: 'FLIPBASE_PUBLISH_KLEINANZEIGEN_RESULT',
              requestId,
              success: !runtimeError && Boolean(response?.success),
              tabId: response?.tabId,
              error: runtimeError?.message || response?.error,
            },
            window.location.origin,
          );
        },
      );
    }
  });
})();
