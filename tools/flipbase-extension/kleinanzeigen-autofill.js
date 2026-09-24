// Flipbase Extension - Autofill Script für Kleinanzeigen.de
//
// Läuft auf p-anzeige-aufgeben-schritt2.html. Die eigentliche Ausfüll-Logik
// steht in autofill-core.js und ist dort getestet.

(async function initKleinanzeigenAutofill() {
  const autofill = globalThis.FlipbaseAutofill;
  if (!autofill) return;

  // 1. Prüfen, ob ein ausstehendes Inserat vorliegt
  const response = await chrome.runtime.sendMessage({ type: 'GET_PENDING_KLEINANZEIGEN_LISTING' });
  if (!response?.hasPending || !response.listing) return;

  const listing = response.listing;

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

  setStep('step-title', { status: 'pending', text: 'Warte auf das Formular …' });
  setStep('step-price', { status: 'pending', text: 'Preis & Preistyp' });
  setStep('step-description', { status: 'pending', text: 'Beschreibung' });
  setStep('step-category', {
    status: 'manual',
    text: listing.categoryHint
      ? `Kategorie selbst wählen (Artikelkategorie: ${listing.categoryHint})`
      : 'Kategorie selbst wählen',
  });
  setStep('step-location', { status: 'pending', text: 'Standort' });
  setStep('step-shipping', { status: 'pending', text: 'Versand' });
  setStep('step-images', { status: 'pending', text: 'Bilder' });

  try {
    // 3. Formular ausfüllen
    const result = await autofill.fillForm(document, listing, { timeoutMs: 20000 });
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

    // Erst jetzt löschen, damit ein Neuladen nicht doppelt ausfüllt.
    chrome.runtime.sendMessage({ type: 'CLEAR_PENDING_KLEINANZEIGEN_LISTING' });

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
    if (images.length === 0) {
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
        setStep('step-images', { status: 'success', text: `${files.length} Bilder übertragen` });
      }
    }

    setFooter(
      'Bitte Kategorie wählen, alle Angaben prüfen und dann auf „Anzeige aufgeben“ klicken.',
    );
  } catch (err) {
    console.error('[Flipbase Extension] Unerwarteter Fehler beim Ausfüllen:', err);
    setFooter('Unerwarteter Fehler beim Ausfüllen. Details stehen in der Browser-Konsole.');
  }
})();
