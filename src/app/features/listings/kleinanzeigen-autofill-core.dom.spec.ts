import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Die Erweiterung ist kein Angular-Code, sondern ein klassisches Chrome-Skript.
// Der Test führt die Datei deshalb genauso aus wie Chrome: als Skript, das
// seine Funktionen an `globalThis` hängt.
type StepStatus = 'success' | 'error' | 'manual';

interface StepResult {
  status: StepStatus;
  text: string;
}

interface ListingInput {
  title: string;
  description: string;
  price: number;
  priceType: 'FIXED' | 'NEGOTIABLE';
  postalCode?: string;
  shippingType: 'pickup' | 'shipping' | 'both';
}

interface FillResult {
  formFound: boolean;
  steps: {
    title: StepResult;
    price: StepResult;
    description: StepResult;
    location: StepResult;
    shipping: StepResult;
  };
}

interface FlipbaseAutofillApi {
  setFieldValue(element: Element | null, value: string): boolean;
  fillForm(
    doc: Document,
    listing: ListingInput,
    options?: { timeoutMs?: number },
  ): Promise<FillResult>;
  applyShipping(doc: Document, shippingType: ListingInput['shippingType']): StepResult;
  fetchImageAsDataUrl(
    fetchFn: (url: string) => Promise<Response>,
    url: string,
  ): Promise<{ ok: boolean; dataUrl?: string; error?: string }>;
  dataUrlToFile(dataUrl: string, name: string): File;
}

let api: FlipbaseAutofillApi;

beforeAll(() => {
  const source = readFileSync(
    join(process.cwd(), 'tools/flipbase-extension/autofill-core.js'),
    'utf8',
  );
  new Function(source)();
  api = (globalThis as unknown as { FlipbaseAutofill: FlipbaseAutofillApi }).FlipbaseAutofill;
});

afterEach(() => {
  document.body.innerHTML = '';
});

const listing: ListingInput = {
  title: 'Nintendo Switch OLED',
  description: 'Wenig benutzt.\nMit Originalverpackung.',
  price: 219.6,
  priceType: 'FIXED',
  shippingType: 'pickup',
};

function renderStepTwoForm(): void {
  document.body.innerHTML = `
    <input id="ad-title" name="title" type="text" />
    <textarea id="ad-description" name="description"></textarea>
    <input id="ad-price-amount" name="priceAmount" type="text" />
    <button id="ad-price-type" type="button" role="combobox" aria-expanded="false">Festpreis</button>
    <input id="ad-zip-code" name="zipCode" type="text" value="32289" />
  `;
}

describe('Flipbase-Erweiterung – Kleinanzeigen-Formular', () => {
  it('trägt Text in ein mehrzeiliges Beschreibungsfeld ein und meldet die Eingabe', () => {
    document.body.innerHTML = '<textarea id="ad-description"></textarea>';
    const textarea = document.getElementById('ad-description') as HTMLTextAreaElement;
    const onInput = vi.fn();
    textarea.addEventListener('input', onInput);

    expect(api.setFieldValue(textarea, 'Zeile 1\nZeile 2')).toBe(true);

    expect(textarea.value).toBe('Zeile 1\nZeile 2');
    expect(onInput).toHaveBeenCalled();
  });

  it('füllt Titel, Beschreibung und gerundeten Preis mit den echten Feldkennungen', async () => {
    renderStepTwoForm();

    const result = await api.fillForm(document, listing, { timeoutMs: 200 });

    expect(result.formFound).toBe(true);
    expect((document.getElementById('ad-title') as HTMLInputElement).value).toBe(listing.title);
    expect((document.getElementById('ad-description') as HTMLTextAreaElement).value).toBe(
      listing.description,
    );
    expect((document.getElementById('ad-price-amount') as HTMLInputElement).value).toBe('220');
    expect(result.steps.title.status).toBe('success');
    expect(result.steps.description.status).toBe('success');
    expect(result.steps.price.status).toBe('success');
  });

  it('wartet, bis das Formular nachträglich eingeblendet wird', async () => {
    setTimeout(renderStepTwoForm, 30);

    const result = await api.fillForm(document, listing, { timeoutMs: 1000 });

    expect(result.formFound).toBe(true);
    expect((document.getElementById('ad-title') as HTMLInputElement).value).toBe(listing.title);
  });

  it('meldet ein fehlendes Formular, statt Erfolg vorzutäuschen', async () => {
    document.body.innerHTML = '<h1>Kategorie auswählen</h1>';

    const result = await api.fillForm(document, listing, { timeoutMs: 50 });

    expect(result.formFound).toBe(false);
    expect(result.steps.title.status).toBe('error');
    expect(result.steps.shipping.status).not.toBe('success');
  });

  it('wählt „VB“ über das Preistyp-Aufklappmenü aus', async () => {
    renderStepTwoForm();
    const onOptionClick = vi.fn();
    document.getElementById('ad-price-type')?.addEventListener('click', () => {
      const option = document.createElement('li');
      option.id = 'ad-price-type-menu-option-1';
      option.setAttribute('role', 'option');
      option.textContent = 'VB';
      option.addEventListener('click', onOptionClick);
      document.body.appendChild(option);
    });

    const result = await api.fillForm(
      document,
      { ...listing, priceType: 'NEGOTIABLE' },
      { timeoutMs: 200 },
    );

    expect(onOptionClick).toHaveBeenCalledTimes(1);
    expect(result.steps.price.status).toBe('success');
  });

  it('meldet den Preis als Fehler, wenn sich der Preistyp nicht wählen lässt', async () => {
    renderStepTwoForm();

    const result = await api.fillForm(
      document,
      { ...listing, priceType: 'NEGOTIABLE' },
      { timeoutMs: 50 },
    );

    expect(result.steps.price.status).toBe('error');
  });

  it('trägt eine abweichende Postleitzahl ein', async () => {
    renderStepTwoForm();

    const result = await api.fillForm(
      document,
      { ...listing, postalCode: '10115' },
      { timeoutMs: 200 },
    );

    expect((document.getElementById('ad-zip-code') as HTMLInputElement).value).toBe('10115');
    expect(result.steps.location.status).toBe('success');
  });

  it('verlangt die Versandwahl von Hand, solange Kleinanzeigen die Auswahl noch nicht zeigt', () => {
    renderStepTwoForm();

    expect(api.applyShipping(document, 'shipping').status).toBe('manual');
  });

  it('wählt „Versand möglich“, sobald die Auswahl vorhanden ist', () => {
    document.body.innerHTML = `
      <input id="ad-shipping-enabled-yes" type="radio" name="shipping" />
      <input id="ad-shipping-enabled-no" type="radio" name="shipping" />
    `;

    const result = api.applyShipping(document, 'both');

    expect((document.getElementById('ad-shipping-enabled-yes') as HTMLInputElement).checked).toBe(
      true,
    );
    expect(result.status).toBe('success');
  });

  it('wählt „Nur Abholung“ für Abholung', () => {
    document.body.innerHTML = `
      <input id="ad-shipping-enabled-yes" type="radio" name="shipping" />
      <input id="ad-shipping-enabled-no" type="radio" name="shipping" />
    `;

    api.applyShipping(document, 'pickup');

    expect((document.getElementById('ad-shipping-enabled-no') as HTMLInputElement).checked).toBe(
      true,
    );
  });
});

describe('Flipbase-Erweiterung – Bilder', () => {
  it('lehnt eine Fehlerseite ab, statt sie als Bild hochzuladen', async () => {
    const fetchFn = vi.fn(async () => new Response('<html>Not found</html>', { status: 404 }));

    const result = await api.fetchImageAsDataUrl(fetchFn, 'https://example.test/bild.jpg');

    expect(result.ok).toBe(false);
  });

  it('lehnt eine Antwort ohne Bildinhalt ab', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response('{"error":"expired"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const result = await api.fetchImageAsDataUrl(fetchFn, 'https://example.test/bild.jpg');

    expect(result.ok).toBe(false);
  });

  it('liefert ein Bild als Daten-Adresse und baut daraus wieder eine Datei', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const fetchFn = vi.fn(
      async () => new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } }),
    );

    const result = await api.fetchImageAsDataUrl(fetchFn, 'https://example.test/bild.jpg');
    const file = api.dataUrlToFile(result.dataUrl ?? '', 'bild.jpg');

    expect(result.ok).toBe(true);
    expect(file.name).toBe('bild.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(file.size).toBe(bytes.length);
  });
});
