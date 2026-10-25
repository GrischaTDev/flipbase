// Flipbase Extension - Autofill Script für Kleinanzeigen.de
//
// Läuft auf p-anzeige-aufgeben-schritt2.html. Die eigentliche Ausfüll-Logik
// steht in autofill-core.js und ist dort getestet.

async function initKleinanzeigenAutofill() {
  if (document.getElementById('flipbase-hud')) return;
  const autofill = globalThis.FlipbaseAutofill;
  if (!autofill) return;

  // 1. Prüfen, ob ein ausstehendes Inserat vorliegt
  const response = await chrome.runtime.sendMessage({ type: 'GET_PENDING_KLEINANZEIGEN_LISTING' });
  if (!response?.hasPending || !response.listing) return;
  // Der Hintergrund unterscheidet gesicherte Formular-Tabs von reinen Lesetabs.
  // Automatischer Start und ausdrückliche Nachricht können gleichzeitig antworten.
  if (document.getElementById('flipbase-hud')) return;

  const listing = response.listing;
  if (
    listing.expectedExternalAccountId &&
    globalThis.FlipbaseKleinanzeigenReader?.pageIdentity(
      document,
      '/p-anzeige-aufgeben-schritt2.html',
    )?.externalAccountId !== listing.expectedExternalAccountId
  )
    return;

  // 2. HUD (Status-Banner) erstellen
  const hud = document.createElement('div');
  hud.id = 'flipbase-hud';
  hud.setAttribute('role', 'status');
  hud.innerHTML = `
    <div class="flipbase-hud-header">
      <div class="flipbase-hud-title">
        <span>Flipbase Assistent</span>
        <span class="flipbase-hud-badge">1-Klick</span>
      </div>
      <button class="flipbase-hud-close" type="button" aria-label="Schließen">&times;</button>
    </div>
    <ul class="flipbase-hud-steps">
      <li id="step-title" class="flipbase-hud-step pending"></li>
      <li id="step-price" class="flipbase-hud-step pending"></li>
      <li id="step-description" class="flipbase-hud-step pending"></li>
      <li id="step-category" class="flipbase-hud-step manual"></li>
      <li id="step-location" class="flipbase-hud-step pending"></li>
      <li id="step-shipping" class="flipbase-hud-step pending"></li>
      <li id="step-images" class="flipbase-hud-step pending"></li>
    </ul>
    <div class="flipbase-hud-footer"></div>
  `;
  document.body.appendChild(hud);
  hud.querySelector('.flipbase-hud-close')?.addEventListener('click', () => hud.remove());

  const ICONS = { success: '✓', error: '✕', manual: '!', pending: '⏳' };
  const footer = hud.querySelector('.flipbase-hud-footer');

  function setStep(id, { status, text }) {
    const element = document.getElementById(id);
    if (!element) return;
    element.className = `flipbase-hud-step ${status}`;
    const icon = document.createElement('span');
    icon.className = 'flipbase-hud-icon';
    icon.textContent = ICONS[status] ?? '';
    element.replaceChildren(icon, document.createTextNode(` ${text}`));
  }

  function setFooter(text) {
    if (footer) footer.textContent = text;
  }

  let transferring = true;
  if (listing.expectedExternalAccountId) {
    let bypassLink = null;
    let savingNavigation = false;
    document.addEventListener(
      'click',
      async (event) => {
        const link = event.target?.closest?.('a');
        if (
          !link ||
          !['Kategorie ändern', 'Wähle deine Kategorie'].includes(link.textContent.trim())
        )
          return;
        if (bypassLink === link) {
          bypassLink = null;
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (transferring || savingNavigation || document.querySelector('[role="progressbar"]')) {
          setFooter(
            'Die Übertragung läuft noch. Öffne die Kategorie nach Abschluss der Bilder erneut.',
          );
          return;
        }
        savingNavigation = true;
        try {
          const value = (id) => document.getElementById(id)?.value ?? '';
          const images = [...document.querySelectorAll('input[type="hidden"]')]
            .filter((node) => /^adImages\[[0-9]+\]\.url$/u.test(node.name))
            .map((node, index) => ({ url: node.value, name: `bild-${index + 1}.jpg` }));
          const result = await chrome.runtime.sendMessage({
            type: 'UPDATE_PENDING_KLEINANZEIGEN_LISTING',
            state: {
              title: value('ad-title'),
              description: value('ad-description'),
              price: value('ad-price-amount') ? Number(value('ad-price-amount')) : null,
              priceType: document
                .getElementById('ad-price-type')
                ?.textContent.trim()
                .startsWith('VB')
                ? 'NEGOTIABLE'
                : 'FIXED',
              shippingType: document.getElementById('ad-shipping-enabled-no')?.checked
                ? 'pickup'
                : listing.shippingType,
              postalCode: value('ad-zip-code') || undefined,
              images,
            },
          });
          if (!result?.success) {
            setFooter(
              'Die Angaben konnten noch nicht gesichert werden. Bitte prüfe sie und versuche es erneut.',
            );
            return;
          }
          bypassLink = link;
          link.click();
        } catch {
          setFooter('Die Angaben bleiben in Flipbase gesichert. Bitte lade das Formular erneut.');
        } finally {
          savingNavigation = false;
        }
      },
      true,
    );
  }

  setStep('step-title', { status: 'pending', text: 'Warte auf das Formular …' });
  setStep('step-price', { status: 'pending', text: 'Preis & Preistyp' });
  setStep('step-description', { status: 'pending', text: 'Beschreibung' });
  setStep('step-category', {
    status: listing.categoryReady ? 'success' : 'manual',
    text: listing.categoryReady
      ? 'Kategorie übernommen – Eigenschaften bitte prüfen'
      : listing.categoryPath
        ? 'Kategorie nicht gefunden. Bitte Kategorie ergänzen.'
        : listing.categoryHint
          ? `Kategorie selbst wählen (Artikelkategorie: ${listing.categoryHint})`
          : 'Kategorie selbst wählen',
  });
  setStep('step-location', { status: 'pending', text: 'Standort' });
  setStep('step-shipping', { status: 'pending', text: 'Versand' });
  setStep('step-images', { status: 'pending', text: 'Bilder' });

  try {
    // 3. Formular ausfüllen
    const result = await autofill.fillForm(document, listing, {
      timeoutMs: 20000,
      preserveExisting: listing.resuming === true,
    });
    setStep('step-title', result.steps.title);
    setStep('step-price', result.steps.price);
    setStep('step-description', result.steps.description);
    setStep('step-location', result.steps.location);
    setStep('step-shipping', result.steps.shipping);

    if (!result.formFound) {
      // Daten bleiben gespeichert: Nach dem Anmelden oder Neuladen geht es weiter.
      setStep('step-images', { status: 'manual', text: 'Bilder warten auf das Formular' });
      setFooter(
        'Formular nicht gefunden. Bist du angemeldet? Die Daten bleiben 15 Minuten gespeichert – lade die Seite danach neu.',
      );
      return;
    }

    // Die Versandauswahl blendet Kleinanzeigen erst nach der Kategorie ein.
    if (result.steps.shipping.status === 'manual') {
      autofill
        .waitForElement(document, autofill.SELECTORS.shippingYes, 10 * 60 * 1000)
        .then((element) => {
          if (element)
            setStep('step-shipping', autofill.applyShipping(document, listing.shippingType));
        });
    }

    // 4. Bilder über den Service Worker laden (dort gilt die CORS-Sperre nicht)
    const images = Array.isArray(listing.images)
      ? listing.images.filter((image) => image?.url)
      : [];
    let imagesComplete = images.length === 0;
    const existingImages = document.querySelectorAll(
      'input[type="hidden"][name^="adImages["][name$="].url"]',
    ).length;
    if (listing.resuming && existingImages > 0) {
      imagesComplete = existingImages === images.length;
      setStep('step-images', {
        status: imagesComplete ? 'success' : 'manual',
        text: `${existingImages} vorhandene Bilder erhalten – bitte prüfen`,
      });
    } else if (images.length === 0) {
      setStep('step-images', {
        status: 'manual',
        text: 'Keine Bilder übergeben – bitte selbst hochladen',
      });
    } else {
      setStep('step-images', { status: 'pending', text: `Lade ${images.length} Bilder …` });
      const fetched = await chrome.runtime.sendMessage({ type: 'FETCH_LISTING_IMAGES', images });
      const results = fetched?.images ?? [];
      results
        .filter((image) => !image.ok)
        .forEach((image) =>
          console.warn('[Flipbase Extension] Bild nicht geladen:', image.name, image.error),
        );
      const loaded = results.filter((image) => image.ok && image.dataUrl);
      const files = loaded.map((image) => autofill.dataUrlToFile(image.dataUrl, image.name));
      const fileInput = await autofill.waitForElement(
        document,
        autofill.SELECTORS.imageInput,
        5000,
      );

      if (files.length === 0) {
        setStep('step-images', { status: 'error', text: 'Bilder konnten nicht geladen werden' });
      } else if (!autofill.attachImages(fileInput, files)) {
        setStep('step-images', { status: 'error', text: 'Bilder-Feld nicht gefunden' });
      } else if (files.length < images.length) {
        setStep('step-images', {
          status: 'manual',
          text: `${files.length} von ${images.length} Bildern übertragen – Rest selbst hochladen`,
        });
      } else {
        imagesComplete = true;
        setStep('step-images', { status: 'success', text: `${files.length} Bilder übertragen` });
      }
    }
    if (listing.expectedExternalAccountId && images.length && imagesComplete) {
      const end = Date.now() + 45000;
      while (
        Date.now() < end &&
        [...document.querySelectorAll('input[type="hidden"]')].filter((node) =>
          /^adImages\[[0-9]+\]\.url$/u.test(node.name),
        ).length < images.length
      )
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    transferring = false;
    const categoryConfirmed = Boolean(
      (listing.categoryReady || listing.resuming) &&
      document.getElementById('ad-category-path')?.textContent.trim(),
    );
    if (categoryConfirmed)
      setStep('step-category', {
        status: 'success',
        text: 'Kategorie gewählt – Eigenschaften bitte prüfen',
      });
    if (imagesComplete)
      await chrome.runtime.sendMessage({ type: 'CLEAR_PENDING_KLEINANZEIGEN_LISTING' });

    setFooter(
      categoryConfirmed
        ? 'Bitte Eigenschaften und alle Angaben prüfen und dann auf „Anzeige aufgeben“ klicken.'
        : 'Bitte Kategorie ergänzen, alle Angaben prüfen und dann auf „Anzeige aufgeben“ klicken.',
    );
  } catch (err) {
    console.error('[Flipbase Extension] Unerwarteter Fehler beim Ausfüllen:', err);
    setFooter('Unerwarteter Fehler beim Ausfüllen. Deine Fassung bleibt in Flipbase gesichert.');
  } finally {
    transferring = false;
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    sender.tab ||
    message?.type !== 'KLEINANZEIGEN_ASSISTED_FILL'
  )
    return false;
  respond({ started: true });
  void initKleinanzeigenAutofill();
  return false;
});
void initKleinanzeigenAutofill();
