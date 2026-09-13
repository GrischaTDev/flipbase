// Flipbase Extension - Background Service Worker

importScripts('autofill-core.js');

// Direkt das Formular öffnen: Auf p-anzeige-aufgeben.html steht nur die
// Kategorie-Auswahl, die Kategorie lässt sich auch auf Schritt 2 wählen.
const LISTING_FORM_URL = 'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html';
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;

function senderHost(sender) {
  try {
    return new URL(sender.url ?? '').hostname;
  } catch {
    return '';
  }
}

function isFlipbaseSender(sender) {
  const host = senderHost(sender);
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.localhost') ||
    host === 'flipbase.de' ||
    host.endsWith('.flipbase.de')
  );
}

function isKleinanzeigenSender(sender) {
  const host = senderHost(sender);
  return host === 'www.kleinanzeigen.de' || host === 'kleinanzeigen.de';
}

// Nur Adressen, die Flipbase selbst übergibt: signierte Speicher-URLs oder
// eingebettete Bilder.
function isAllowedImageUrl(url) {
  return typeof url === 'string' && (url.startsWith('https://') || url.startsWith('data:image/'));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_KLEINANZEIGEN_LISTING') {
    if (!isFlipbaseSender(sender)) return false;
    const payload = message.payload;
    if (!payload) {
      sendResponse({ success: false, error: 'Keine Daten übergeben.' });
      return false;
    }

    chrome.storage.local.set(
      {
        pending_kleinanzeigen_listing: payload,
        pending_kleinanzeigen_timestamp: Date.now(),
      },
      () => {
        chrome.tabs.create({ url: LISTING_FORM_URL }, (tab) => {
          sendResponse({ success: true, tabId: tab.id });
        });
      },
    );
    return true; // Asynchrone Antwort
  }

  if (message.type === 'GET_PENDING_KLEINANZEIGEN_LISTING') {
    if (!isKleinanzeigenSender(sender)) return false;
    chrome.storage.local.get(
      ['pending_kleinanzeigen_listing', 'pending_kleinanzeigen_timestamp'],
      (data) => {
        const payload = data.pending_kleinanzeigen_listing;
        const timestamp = data.pending_kleinanzeigen_timestamp;
        if (payload && timestamp && Date.now() - timestamp < PENDING_MAX_AGE_MS) {
          sendResponse({ hasPending: true, listing: payload });
        } else {
          sendResponse({ hasPending: false });
        }
      },
    );
    return true;
  }

  if (message.type === 'CLEAR_PENDING_KLEINANZEIGEN_LISTING') {
    if (!isKleinanzeigenSender(sender)) return false;
    chrome.storage.local.remove(
      ['pending_kleinanzeigen_listing', 'pending_kleinanzeigen_timestamp'],
      () => sendResponse({ success: true }),
    );
    return true;
  }

  if (message.type === 'FETCH_LISTING_IMAGES') {
    if (!isKleinanzeigenSender(sender)) return false;
    const images = Array.isArray(message.images) ? message.images : [];
    Promise.all(
      images.map(async (image, index) => {
        const name = image?.name || `artikel-bild-${index + 1}.jpg`;
        if (!isAllowedImageUrl(image?.url)) {
          return { ok: false, name, error: 'Adresse nicht erlaubt' };
        }
        const result = await self.FlipbaseAutofill.fetchImageAsDataUrl(
          (url) => fetch(url, { credentials: 'omit' }),
          image.url,
        );
        return { ...result, name };
      }),
    ).then((results) => sendResponse({ images: results }));
    return true;
  }

  return false;
});
