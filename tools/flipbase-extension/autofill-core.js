// Flipbase Extension - Ausfüll-Logik für das Kleinanzeigen-Formular.
//
// Klassisches Skript ohne Module: Chrome lädt es als Content Script vor
// kleinanzeigen-autofill.js, der Service Worker per importScripts und der Test
// per Dateisystem. Alles hängt deshalb an globalThis.FlipbaseAutofill.

(function defineFlipbaseAutofill(root) {
  // Live geprüft am 14.09.2026 auf
  // https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html
  const SELECTORS = {
    title: '#ad-title',
    description: '#ad-description',
    priceAmount: '#ad-price-amount',
    priceType: '#ad-price-type',
    zipCode: '#ad-zip-code',
    // Erscheinen erst, nachdem eine Kategorie gewählt wurde.
    shippingYes: '#ad-shipping-enabled-yes',
    shippingNo: '#ad-shipping-enabled-no',
    imageInput: 'input[type="file"]',
  };

  const PRICE_TYPE_OPTION_INDEX = { FIXED: 0, NEGOTIABLE: 1 };
  const PRICE_TYPE_LABEL = { FIXED: 'Festpreis', NEGOTIABLE: 'VB' };
  const SHIPPING_MANUAL_TEXT = 'Versand nach Wahl der Kategorie selbst festlegen';

  function step(status, text) {
    return { status, text };
  }

  // React merkt sich den letzten Wert am Element selbst. Nur der Setter des
  // Prototyps umgeht diesen Zwischenspeicher, sonst verwirft React die Eingabe.
  // Der Setter muss zum Elementtyp passen: Der Input-Setter auf einem Textarea
  // wirft „Illegal invocation“.
  function findValueSetter(element) {
    let prototype = Object.getPrototypeOf(element);
    while (prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      if (descriptor?.set) return descriptor.set;
      prototype = Object.getPrototypeOf(prototype);
    }
    return null;
  }

  function setFieldValue(element, value) {
    if (!element) return false;
    const setter = findValueSetter(element);
    element.focus?.();
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('focusout', { bubbles: true }));
    return true;
  }

  // Die Auswahlmenüs reagieren teils auf pointerdown, teils auf click. Die
  // Reihenfolge entspricht einem echten Mausklick.
  function activate(element) {
    if (typeof PointerEvent === 'function') {
      element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    }
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    element.click();
  }

  function waitForElement(doc, selector, timeoutMs) {
    const existing = doc.querySelector(selector);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const found = doc.querySelector(selector);
        if (!found) return;
        clearTimeout(timer);
        observer.disconnect();
        resolve(found);
      });
      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(doc.querySelector(selector));
      }, timeoutMs);
      observer.observe(doc.documentElement, { childList: true, subtree: true });
    });
  }

  async function selectPriceType(doc, priceType, timeoutMs) {
    const index = PRICE_TYPE_OPTION_INDEX[priceType];
    const combobox = doc.querySelector(SELECTORS.priceType);
    if (index === undefined || !combobox) return false;
    // Kleinanzeigen startet mit „Festpreis“ – dann ist nichts zu tun.
    if (combobox.textContent?.trim().startsWith(PRICE_TYPE_LABEL[priceType])) return true;

    const optionSelector = `#ad-price-type-menu-option-${index}`;
    let option = doc.querySelector(optionSelector);
    if (!option) {
      activate(combobox);
      option = await waitForElement(doc, optionSelector, timeoutMs);
    }
    if (!option) return false;
    activate(option);
    return true;
  }

  function applyShipping(doc, shippingType) {
    const wantsShipping = shippingType === 'shipping' || shippingType === 'both';
    const target = doc.querySelector(wantsShipping ? SELECTORS.shippingYes : SELECTORS.shippingNo);
    if (!target) return step('manual', SHIPPING_MANUAL_TEXT);
    if (!target.checked) activate(target);
    return step('success', wantsShipping ? 'Versand möglich gewählt' : 'Nur Abholung gewählt');
  }

  async function fillForm(doc, listing, options = {}) {
    const timeoutMs = options.timeoutMs ?? 15000;
    const steps = {
      title: step('error', 'Titel-Feld nicht gefunden'),
      price: step('error', 'Preis-Feld nicht gefunden'),
      description: step('error', 'Beschreibungs-Feld nicht gefunden'),
      location: step('manual', 'Standort bitte prüfen'),
      shipping: step('manual', SHIPPING_MANUAL_TEXT),
    };

    const titleInput = await waitForElement(doc, SELECTORS.title, timeoutMs);
    if (!titleInput) return { formFound: false, steps };

    steps.title = listing.title
      ? (setFieldValue(titleInput, listing.title), step('success', 'Titel übertragen'))
      : step('error', 'Kein Titel im Inserat');

    const descriptionInput = doc.querySelector(SELECTORS.description);
    if (descriptionInput) {
      steps.description = listing.description
        ? (setFieldValue(descriptionInput, listing.description),
          step('success', 'Beschreibung übertragen'))
        : step('error', 'Keine Beschreibung im Inserat');
    }

    const priceInput = doc.querySelector(SELECTORS.priceAmount);
    if (priceInput && Number.isFinite(listing.price)) {
      // Kleinanzeigen nimmt nur ganze Euro an.
      const roundedPrice = Math.round(listing.price);
      setFieldValue(priceInput, String(roundedPrice));
      const priceTypeSelected = await selectPriceType(
        doc,
        listing.priceType,
        Math.min(timeoutMs, 3000),
      );
      steps.price = priceTypeSelected
        ? step('success', `Preis ${roundedPrice} € (${PRICE_TYPE_LABEL[listing.priceType]})`)
        : step('error', `Preis ${roundedPrice} € eingetragen, Preistyp bitte selbst wählen`);
    }

    const zipInput = doc.querySelector(SELECTORS.zipCode);
    const postalCode = listing.postalCode?.trim();
    if (!zipInput) {
      steps.location = step('error', 'PLZ-Feld nicht gefunden');
    } else if (postalCode && zipInput.value !== postalCode) {
      setFieldValue(zipInput, postalCode);
      steps.location = step('success', `PLZ ${postalCode} eingetragen – Ort bitte prüfen`);
    } else if (zipInput.value) {
      steps.location = step('success', `PLZ ${zipInput.value} übernommen`);
    }

    steps.shipping = applyShipping(doc, listing.shippingType);

    return { formFound: true, steps };
  }

  async function fetchImageAsDataUrl(fetchFn, url) {
    try {
      const response = await fetchFn(url);
      if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
      const blob = await response.blob();
      const type = (response.headers.get('content-type') || blob.type || '').split(';')[0].trim();
      if (!type.startsWith('image/'))
        return { ok: false, error: `Kein Bild (${type || 'unbekannt'})` };

      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return { ok: true, dataUrl: `data:${type};base64,${btoa(binary)}` };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  function dataUrlToFile(dataUrl, name) {
    const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
    if (!match) throw new Error('Ungültige Daten-Adresse');
    const binary = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new File([bytes], name, { type: match[1] || 'application/octet-stream' });
  }

  // Nur ein change-Ereignis: Ein zusätzliches drop würde die Bilder doppelt
  // hochladen.
  function attachImages(fileInput, files) {
    if (!fileInput || files.length === 0) return false;
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  root.FlipbaseAutofill = Object.freeze({
    SELECTORS,
    setFieldValue,
    waitForElement,
    selectPriceType,
    applyShipping,
    fillForm,
    fetchImageAsDataUrl,
    dataUrlToFile,
    attachImages,
  });
})(globalThis);
