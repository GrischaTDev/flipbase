// Flipbase Extension - Background Service Worker

importScripts('autofill-core.js');
importScripts(
  'kleinanzeigen-local-core.js',
  'kleinanzeigen-local-sync.js',
  'kleinanzeigen-form-runtime.js',
  'kleinanzeigen-publication-policy.js',
  'kleinanzeigen-listing-runtime.js',
  'kleinanzeigen-publication-jobs.js',
  'kleinanzeigen-publication-results.js',
  'kleinanzeigen-relisting-jobs.js',
  'kleinanzeigen-local-background.js',
);
importScripts(
  'vinted-local-inbox-events.js',
  'vinted-negotiation-runtime.js',
  'vinted-local-negotiation.js',
  'vinted-local-core.js',
  'vinted-local-scheduler.js',
  'vinted-local-background.js',
);

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
      [
        'pending_kleinanzeigen_listing',
        'pending_kleinanzeigen_timestamp',
        'kleinanzeigen_work_tabs',
        'kleinanzeigen_assisted_listings',
      ],
      (data) => {
        const assisted = data.kleinanzeigen_assisted_listings?.[sender.tab?.id];
        if (assisted && assisted.expiresAt > Date.now()) {
          sendResponse({
            hasPending: true,
            listing: { ...assisted.payload, resuming: assisted.filled === true },
          });
          return;
        }
        if (
          sender.url?.includes('#flipbase-form-read') ||
          sender.url?.includes('#flipbase-assisted') ||
          sender.tab?.id === data.kleinanzeigen_work_tabs?.formTabId ||
          data.kleinanzeigen_work_tabs?.publicationTabIds?.includes(sender.tab?.id)
        ) {
          sendResponse({ hasPending: false });
          return;
        }
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
  if (message.type === 'UPDATE_PENDING_KLEINANZEIGEN_LISTING') {
    if (!isKleinanzeigenSender(sender) || !sender.tab?.id) return false;
    chrome.storage.local.get('kleinanzeigen_assisted_listings', (data) => {
      const values = data.kleinanzeigen_assisted_listings ?? {};
      const assisted = values[sender.tab.id];
      const state = message.state;
      if (
        !assisted ||
        assisted.expiresAt <= Date.now() ||
        !state ||
        typeof state.title !== 'string' ||
        state.title.length > 65 ||
        typeof state.description !== 'string' ||
        state.description.length > 4000 ||
        (state.price !== null &&
          (!Number.isSafeInteger(state.price) || state.price < 0 || state.price > 99999999)) ||
        !['FIXED', 'NEGOTIABLE'].includes(state.priceType) ||
        !['pickup', 'both'].includes(state.shippingType) ||
        (state.postalCode !== undefined && !/^\d{5}$/u.test(state.postalCode)) ||
        !Array.isArray(state.images) ||
        state.images.length > 20 ||
        state.images.some(
          (image) =>
            typeof image.url !== 'string' ||
            !image.url.startsWith('https://') ||
            typeof image.name !== 'string',
        )
      ) {
        sendResponse({ success: false });
        return;
      }
      chrome.storage.local.set(
        {
          kleinanzeigen_assisted_listings: {
            ...values,
            [sender.tab.id]: { ...assisted, payload: { ...assisted.payload, ...state } },
          },
        },
        () => sendResponse({ success: true }),
      );
    });
    return true;
  }

  if (message.type === 'CLEAR_PENDING_KLEINANZEIGEN_LISTING') {
    if (!isKleinanzeigenSender(sender)) return false;
    chrome.storage.local.get('kleinanzeigen_assisted_listings', (data) => {
      const values = data.kleinanzeigen_assisted_listings ?? {};
      const assisted = values[sender.tab?.id];
      if (assisted) {
        chrome.storage.local.set(
          {
            kleinanzeigen_assisted_listings: {
              ...values,
              [sender.tab.id]: { ...assisted, filled: true },
            },
          },
          () => sendResponse({ success: true }),
        );
      } else
        chrome.storage.local.remove(
          ['pending_kleinanzeigen_listing', 'pending_kleinanzeigen_timestamp'],
          () => sendResponse({ success: true }),
        );
    });
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
