// Flipbase Extension - Background Service Worker

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_KLEINANZEIGEN_LISTING') {
    const payload = message.payload;
    if (!payload) {
      sendResponse({ success: false, error: 'Keine Daten übergeben.' });
      return true;
    }

    // Speichere das Inserat zwischen
    chrome.storage.local.set(
      {
        pending_kleinanzeigen_listing: payload,
        pending_kleinanzeigen_timestamp: Date.now(),
      },
      () => {
        // Öffne Kleinanzeigen Inserats-Seite im neuen Tab
        chrome.tabs.create(
          { url: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben.html' },
          (tab) => {
            sendResponse({ success: true, tabId: tab.id });
          },
        );
      },
    );
    return true; // Asynchrone Antwort
  }

  if (message.type === 'GET_PENDING_KLEINANZEIGEN_LISTING') {
    chrome.storage.local.get(
      ['pending_kleinanzeigen_listing', 'pending_kleinanzeigen_timestamp'],
      (data) => {
        const payload = data.pending_kleinanzeigen_listing;
        const timestamp = data.pending_kleinanzeigen_timestamp;

        // Prüfen ob Daten vorhanden und nicht älter als 15 Minuten sind
        if (payload && timestamp && Date.now() - timestamp < 15 * 60 * 1000) {
          sendResponse({ hasPending: true, listing: payload });
        } else {
          sendResponse({ hasPending: false });
        }
      },
    );
    return true;
  }

  if (message.type === 'CLEAR_PENDING_KLEINANZEIGEN_LISTING') {
    chrome.storage.local.remove(
      ['pending_kleinanzeigen_listing', 'pending_kleinanzeigen_timestamp'],
      () => {
        sendResponse({ success: true });
      },
    );
    return true;
  }
});
