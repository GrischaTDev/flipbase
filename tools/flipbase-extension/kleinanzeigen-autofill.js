// Flipbase Extension - Autofill Script für Kleinanzeigen.de

(async function initKleinanzeigenAutofill() {
  // 1. Prüfen, ob ein ausstehendes Inserat vorliegt
  const response = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_PENDING_KLEINANZEIGEN_LISTING' }, resolve);
  });

  if (!response || !response.hasPending || !response.listing) {
    return;
  }

  const listing = response.listing;

  // 2. HUD (Status-Banner) erstellen
  const hud = document.createElement('div');
  hud.id = 'flipbase-hud';
  hud.innerHTML = `
    <div class="flipbase-hud-header">
      <div class="flipbase-hud-title">
        <span>Flipbase Assistent</span>
        <span class="flipbase-hud-badge">1-Klick</span>
      </div>
      <button class="flipbase-hud-close" title="Schließen">&times;</button>
    </div>
    <ul class="flipbase-hud-steps">
      <li id="step-title" class="flipbase-hud-step pending"><span class="flipbase-hud-icon">⏳</span> Titel übertragen</li>
      <li id="step-price" class="flipbase-hud-step pending"><span class="flipbase-hud-icon">⏳</span> Preis & Preistyp setzen</li>
      <li id="step-desc" class="flipbase-hud-step pending"><span class="flipbase-hud-icon">⏳</span> Beschreibung übertragen</li>
      <li id="step-shipping" class="flipbase-hud-step pending"><span class="flipbase-hud-icon">⏳</span> Versand & Standort</li>
      <li id="step-images" class="flipbase-hud-step pending"><span class="flipbase-hud-icon">⏳</span> Bilder hochladen</li>
    </ul>
    <div class="flipbase-hud-footer">
      Daten wurden automatisch eingefüllt. Bitte Angaben kurz prüfen und auf <strong>„Anzeige aufgeben“</strong> klicken.
    </div>
  `;

  document.body.appendChild(hud);
  hud.querySelector('.flipbase-hud-close')?.addEventListener('click', () => hud.remove());

  function setStep(id, status, text) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `flipbase-hud-step ${status}`;
    const icon = status === 'success' ? '✓' : status === 'error' ? '✕' : '⏳';
    el.innerHTML = `<span class="flipbase-hud-icon">${icon}</span> ${text}`;
  }

  // Hilfsfunktion: Setze Wert in React-/Standard-Formularfeld und triggere Events
  function fillInput(el, val) {
    if (!el) return false;
    el.focus();
    // React value setter hack für kontrollierte Inputs
    const nativeSetter =
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

    if (nativeSetter) {
      nativeSetter.call(el, val);
    } else {
      el.value = val;
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  // Warten auf Elemente
  function waitFor(selector, timeoutMs = 5000) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }, timeoutMs);
    });
  }

  // 3. Formularfelder ausfüllen
  try {
    // A. Titel
    const titleInput =
      document.querySelector('#post-ad-title') ||
      document.querySelector('input[name="title"]') ||
      document.querySelector('input[id*="title"]');

    if (titleInput && listing.title) {
      fillInput(titleInput, listing.title);
      setStep('step-title', 'success', 'Titel übertragen');
    } else {
      setStep('step-title', 'error', 'Titel-Feld nicht gefunden');
    }

    // B. Preis & Preistyp
    const priceInput =
      document.querySelector('#post-ad-price') ||
      document.querySelector('input[name="price"]') ||
      document.querySelector('input[id*="price"]');

    if (priceInput && listing.price !== undefined && listing.price !== null) {
      fillInput(priceInput, Math.round(listing.price).toString());

      // Preistyp (VB vs. Festpreis)
      if (listing.priceType === 'NEGOTIABLE') {
        const vbRadio =
          document.querySelector('input[type="radio"][value="NEGOTIABLE"]') ||
          document.querySelector('input[type="radio"][id*="negotiable"]') ||
          Array.from(document.querySelectorAll('label')).find((l) =>
            l.textContent?.toLowerCase().includes('vb'),
          );
        if (vbRadio) vbRadio.click();
      } else {
        const fixedRadio =
          document.querySelector('input[type="radio"][value="FIXED"]') ||
          document.querySelector('input[type="radio"][id*="fixed"]') ||
          Array.from(document.querySelectorAll('label')).find((l) =>
            l.textContent?.toLowerCase().includes('festpreis'),
          );
        if (fixedRadio) fixedRadio.click();
      }

      setStep('step-price', 'success', `Preis (${listing.price} €) gesetzt`);
    } else {
      setStep('step-price', 'error', 'Preis-Feld nicht gefunden');
    }

    // C. Beschreibung
    const descInput =
      document.querySelector('#post-ad-description') ||
      document.querySelector('textarea[name="description"]') ||
      document.querySelector('textarea[id*="description"]');

    if (descInput && listing.description) {
      fillInput(descInput, listing.description);
      setStep('step-desc', 'success', 'Beschreibung übertragen');
    } else {
      setStep('step-desc', 'error', 'Beschreibungs-Feld nicht gefunden');
    }

    // D. Standort / PLZ & Versand
    if (listing.postalCode) {
      const plzInput =
        document.querySelector('#post-ad-postalcode') ||
        document.querySelector('input[name="postalCode"]') ||
        document.querySelector('input[id*="postal"]') ||
        document.querySelector('input[name="zipCode"]');
      if (plzInput) {
        fillInput(plzInput, listing.postalCode);
      }
    }

    // Versandoptionen aktivieren, falls gewünscht
    if (listing.shippingType === 'shipping' || listing.shippingType === 'both') {
      const shippingCheckbox =
        document.querySelector('input[type="checkbox"][name*="shipping"]') ||
        document.querySelector('input[type="checkbox"][id*="shipping"]') ||
        Array.from(document.querySelectorAll('label')).find((l) =>
          l.textContent?.toLowerCase().includes('versand möglich'),
        );
      if (
        shippingCheckbox &&
        !(shippingCheckbox instanceof HTMLInputElement && shippingCheckbox.checked)
      ) {
        shippingCheckbox.click();
      }
    }
    setStep('step-shipping', 'success', 'Versand & Standort eingerichtet');

    // E. Bilder hochladen
    if (Array.isArray(listing.images) && listing.images.length > 0) {
      setStep('step-images', 'pending', `Lade ${listing.images.length} Bilder herunter...`);

      const fileInput = await waitFor('input[type="file"]', 3000);
      if (fileInput && fileInput instanceof HTMLInputElement) {
        const files = [];
        let successCount = 0;

        for (let i = 0; i < listing.images.length; i++) {
          const img = listing.images[i];
          const imgUrl = typeof img === 'string' ? img : img.url;
          if (!imgUrl) continue;

          try {
            const resp = await fetch(imgUrl);
            const blob = await resp.blob();
            const fileName = (typeof img === 'object' && img.name) || `artikel-bild-${i + 1}.jpg`;
            const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
            files.push(file);
            successCount++;
            setStep(
              'step-images',
              'pending',
              `Bilder bereit: ${successCount}/${listing.images.length}`,
            );
          } catch (e) {
            console.warn('[Flipbase Extension] Fehler beim Laden des Bildes:', imgUrl, e);
          }
        }

        if (files.length > 0) {
          const dt = new DataTransfer();
          files.forEach((f) => dt.items.add(f));
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          fileInput.dispatchEvent(new Event('input', { bubbles: true }));

          // Auch Drag & Drop Event simulieren, falls Dropzone aktiv ist
          const dropzone = fileInput.closest('.dropzone') || fileInput.parentElement;
          if (dropzone) {
            dropzone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
          }

          setStep('step-images', 'success', `${files.length} Bilder erfolgreich übertragen`);
        } else {
          setStep('step-images', 'error', 'Bilder konnten nicht geladen werden');
        }
      } else {
        setStep('step-images', 'error', 'Bilder-Upload-Feld nicht gefunden');
      }
    } else {
      setStep('step-images', 'success', 'Keine Bilder im Inserat hinterlegt');
    }

    // 4. Pending-Eintrag leeren, damit Neuladen der Seite nicht erneut ausfüllt
    chrome.runtime.sendMessage({ type: 'CLEAR_PENDING_KLEINANZEIGEN_LISTING' });
  } catch (err) {
    console.error('[Flipbase Extension] Unerwarteter Fehler beim Ausfüllen:', err);
  }
})();
