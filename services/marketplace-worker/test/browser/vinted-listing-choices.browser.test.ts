import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import {
  readVintedListingChoices,
  readVintedListingCategoryFields,
} from '../../src/vinted-browser-listing-form.ts';

test('reads actual popup choices and retains the category binding without saving', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let writes = 0;
    await page.route('**/*', (route) => {
      const request = route.request();
      if (request.method() !== 'GET') writes++;
      if (new URL(request.url()).pathname === '/api/v2/users/current')
        return route.fulfill({ json: { user: { id: 789, login: 'fixture' } } });
      return route.fulfill({
        contentType: 'text/html',
        body: `<div id="content"><input name="photos" type="file" multiple accept="image/jpeg,image/gif,image/png,image/webp"><input name="title"><textarea name="description"></textarea>
        <input readonly id="category"><input readonly id="size"><input readonly id="condition"><input id="isbn"><div style="opacity:0"><input id="book_series"></div>
        <div id="category-options" hidden>
          <button id="catalog-5">Herren</button>
          <div id="category-leaves" hidden><div role="radio" id="catalog-1223" aria-checked="true"><div class="web_ui__Cell__title">Bomberjacken</div><label><input id="1223-catalog-radio" aria-hidden="true" type="radio" checked></label></div></div>
        </div>
        <div id="size-options" hidden>
          <div role="checkbox" data-testid="size-group-14-grid-option-208" aria-label="M" aria-checked="true">M</div>
          <div role="checkbox" data-testid="size-group-14-grid-option-209" aria-label="L" aria-checked="false">L</div>
        </div>
        <div hidden><div role="checkbox" data-testid="size-group-31-grid-option-607" aria-label="38">38</div></div>
        <div id="condition-options" hidden><div role="radio" id="condition-2" aria-checked="true"><div data-testid="condition-2--title">Sehr gut</div></div></div></div>
        <script>
          document.querySelector('#category').onclick = () => { document.querySelector('#category-options').hidden = false; document.querySelector('#category-leaves').hidden = true; document.querySelector('#catalog-5').hidden = false; };
          document.querySelector('#catalog-5').onclick = () => { document.querySelector('#category-leaves').hidden = false; document.querySelector('#catalog-5').hidden = true; };
          document.querySelector('#size').onclick = () => document.querySelector('#size-options').hidden = false;
          document.querySelector('#condition').onclick = () => document.querySelector('#condition-options').hidden = false;
          document.onkeydown = event => { if(event.key==='Escape') { document.querySelector('#size-options').hidden = true; document.querySelector('#category-options').hidden = true; document.querySelector('#condition-options').hidden = true; }};
        </script>`,
      });
    });
    await page.goto('https://www.vinted.de/items/new');
    const result = await readVintedListingChoices(page, '789', 1223, 'size', [5]);
    assert.equal(result.sizeGroupId, 14);
    assert.deepEqual(
      result.choices.map((choice) => choice.id),
      [208, 209],
    );
    assert.equal(await page.locator('#size-options').isVisible(), false);
    assert.equal(writes, 0);
    await assert.rejects(readVintedListingChoices(page, '789', 2738, 'size', [5]), /Kategorie/);
    await assert.rejects(readVintedListingChoices(page, '790', 1223, 'size'), /Konto/);
    const fields = await readVintedListingCategoryFields(page, '789', 1223, [5]);
    assert.deepEqual(fields.unknownFields, ['isbn']);
    assert.deepEqual(
      fields.fields.map((field) => field.field),
      ['size', 'condition'],
    );
    assert.deepEqual(fields.acceptedPhotoMimeTypes, [
      'image/jpeg',
      'image/gif',
      'image/png',
      'image/webp',
    ]);
    assert.equal(fields.titleMaxLength, null);
    assert.equal(fields.aiPhoto, null);
    assert.equal(fields.bump, null);
    assert.equal(writes, 0);
  } finally {
    await browser.close();
  }
});

test('collects visible ARIA options and package labels without reading hidden native controls', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<div role="radio" id="brand-53" aria-label="Nike" aria-checked="true" aria-disabled="false"><input id="brand-radio-53" aria-hidden="true" type="radio"></div>
      <div role="radio" id="brand-14" aria-label="adidas" aria-checked="false" aria-disabled="true"></div>
      <div style="opacity:0"><div role="radio" id="brand-99" aria-label="Hidden"></div></div>
      <div role="radio" id="condition-2" aria-checked="true"><div data-testid="condition-2--title">Sehr gut</div><p>Beschreibung</p></div>
      <div role="checkbox" id="color-3" aria-checked="true"><div data-testid="color-3--title">Grau</div><input id="color-checkbox-3" aria-hidden="true"></div>
      <div role="checkbox" id="material-149" aria-checked="true"><div data-testid="material-149--title">Acryl</div></div>
      <button id="package-size-2">Mittel Für Artikel in einem Schuhkarton</button><label><input id="package_type_selector_2" type="radio" checked aria-labelledby="package-size-2"></label>`);
    const { collectVintedListingChoices, parseVintedListingChoices } =
      await import('../../src/vinted-listing-contracts.ts');
    for (const [field, id, label] of [
      ['brand', 53, 'Nike'],
      ['condition', 2, 'Sehr gut'],
      ['color', 3, 'Grau'],
      ['material', 149, 'Acryl'],
      ['package', 2, 'Mittel Für Artikel in einem Schuhkarton'],
    ] as const) {
      const choices = parseVintedListingChoices(
        field,
        await page.evaluate(collectVintedListingChoices, field),
      ).choices;
      assert.equal(choices[0]?.id, id);
      assert.equal(choices[0]?.label, label);
      assert.equal(choices[0]?.selected, true);
      if (field === 'brand') {
        assert.equal(choices.length, 2);
        assert.equal(choices[1]?.disabled, true);
      }
    }
  } finally {
    await browser.close();
  }
});

test('refuses a different domain or route before interacting with a form', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => route.fulfill({ body: '<input id="size">' }));
    for (const url of [
      'https://www.vinted.de.attacker.test/items/new',
      'https://www.vinted.de/items/123',
    ]) {
      await page.goto(url);
      await assert.rejects(readVintedListingChoices(page, '789', 1223, 'size'), /Formular/);
    }
  } finally {
    await browser.close();
  }
});
