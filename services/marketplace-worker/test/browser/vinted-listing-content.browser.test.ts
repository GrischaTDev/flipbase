import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, type Page } from 'playwright';
import { readVintedListingCurrentContent } from '../../src/vinted-browser-listing-content.ts';

/** Ausschließlich synthetische Anbieterantworten, einschließlich aller Fotoabrufe. */
async function fixture(
  page: Page,
  options: { foreign?: boolean; unknown?: boolean; changed?: boolean; unsafePhoto?: boolean } = {},
) {
  let writes = 0;
  await page.route('**/*', (route) => {
    if (route.request().method() !== 'GET') writes++;
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v2/users/current')
      return route.fulfill({
        json: { user: { id: options.foreign ? '456' : '123', login: 'fixture' } },
      });
    if (url.hostname.endsWith('.vinted.net') || url.pathname === '/unsafe.png')
      return route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
          'base64',
        ),
      });
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<main id="content">
      <input name="photos" type="file" accept="image/jpeg,image/png"><input name="title" value="Meine Schuhe"><textarea name="description">Sehr gut erhalten.</textarea><input name="price" value="20,50 €">
      <input id="ai_photo" type="checkbox" checked><input id="bump" type="checkbox">
      <input id="category" readonly value="Fußballschuhe"><input id="brand" readonly value="Jako"><input id="size" readonly value="38"><input id="condition" readonly value="Sehr gut"><input id="color" readonly value="Blau, Gelb"><input id="material" readonly value="Acryl">
      ${options.unknown ? '<input name="isbn" id="isbn" value="Unbekanntes Merkmal">' : ''}
      <div id="category-options" hidden><div role="radio" id="catalog-suggestion-2738" aria-checked="true"><span class="web_ui__Cell__title">Fußballschuhe</span><span>Kinder > Jungs > Schuhe > Sportschuhe</span></div></div>
      <div id="brand-options" hidden><div role="radio" id="suggested-brand-254956" aria-checked="true"><span class="web_ui__Cell__title">Jako</span></div><div role="radio" id="brand-254956" aria-checked="true"><span class="web_ui__Cell__title">Jako</span></div><div role="radio" id="brand-1" aria-checked="false" aria-disabled="true">Gesperrte Marke</div></div>
      <div id="size-options" hidden><div role="checkbox" data-testid="size-group-31-grid-option-607" aria-checked="true">38</div></div>
      <div id="condition-options" hidden><div role="radio" id="condition-2" aria-checked="true">Sehr gut</div></div>
      <div id="color-options" hidden><div role="checkbox" id="color-1" aria-checked="true">Blau</div><div role="checkbox" id="color-2" aria-checked="true">Gelb</div></div>
      <div id="material-options" hidden><div role="checkbox" id="material-149" aria-checked="true">Acryl</div></div>
      <span id="package-label">Mittel</span><label><input type="radio" id="package_type_selector_2" aria-labelledby="package-label" checked></label>
      <div data-testid="media-upload-grid"><div data-testid="image-wrapper-0"><img src="${options.unsafePhoto ? 'https://www.vinted.de/unsafe.png' : 'https://images1.vinted.net/tc/fixtureA/f800/1788288106.webp'}"></div><div data-testid="image-wrapper-1"><img src="https://images2.vinted.net/t/fixtureB/800x600/1788288107.webp"></div></div>
      <button id="save">Speichern</button>
      </main><script>
      const names=['category','brand','size','condition','color','material'];
      const hide=()=>names.forEach(name=>document.querySelector('#'+name+'-options').hidden=true);
      names.forEach(name=>document.querySelector('#'+name).onclick=()=>{hide();document.querySelector('#'+name+'-options').hidden=false;${options.changed ? "if(name==='material')document.querySelector('[name=price]').value='21,00 €';" : ''}});
      document.onkeydown=event=>{if(event.key==='Escape')hide();};
      document.querySelector('#save').onclick=()=>fetch('/fixture/save',{method:'POST'});
      </script>`,
    });
  });
  return () => writes;
}

test('reads the complete selected content and ordered photos from an own fresh tab without saving', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(),
      writes = await fixture(page);
    const result = await readVintedListingCurrentContent(page, '123', '98765', () =>
      Promise.resolve(),
    );
    assert.equal(page.isClosed(), true);
    assert.equal(result.externalId, '98765');
    assert.equal(result.externalAccountId, '123');
    assert.deepEqual(result.content, {
      title: 'Meine Schuhe',
      description: 'Sehr gut erhalten.',
      priceCents: 2050,
      currency: 'EUR',
      categoryId: 2738,
      categoryLabel: 'Fußballschuhe',
      brandId: 254956,
      brandLabel: 'Jako',
      sizeId: 607,
      sizeLabel: '38',
      conditionId: 2,
      conditionLabel: 'Sehr gut',
      colorIds: [1, 2],
      colorLabels: ['Blau', 'Gelb'],
      materialIds: [149],
      materialLabels: ['Acryl'],
      packageSizeId: 2,
      attributes: {},
    });
    assert.equal(result.aiPhoto, true);
    assert.equal(result.bump, false);
    assert.equal(result.photoUrls.length, 2);
    assert.equal(
      result.schema.fields
        .find((field) => field.field === 'brand')
        ?.choices.find((choice) => choice.id === 1)?.disabled,
      true,
    );
    assert.equal(writes(), 0);
  } finally {
    await browser.close();
  }
});
test('keeps unknown fields visible and rejects foreign accounts, changed content and unsafe photo sources', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const writes = await fixture(page, { unknown: true });
    const result = await readVintedListingCurrentContent(page, '123', '98765', () =>
      Promise.resolve(),
    );
    assert.deepEqual(result.schema.unknownFields, ['isbn']);
    assert.equal(writes(), 0);
    for (const options of [{ foreign: true }, { changed: true }, { unsafePhoto: true }]) {
      const other = await browser.newPage(),
        count = await fixture(other, options);
      await assert.rejects(
        readVintedListingCurrentContent(other, '123', '98765', () => Promise.resolve()),
      );
      assert.equal(other.isClosed(), true);
      assert.equal(count(), 0);
    }
  } finally {
    await browser.close();
  }
});
test('preserves existing user pages and closes its own page after revocation', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await fixture(page);
    await page.goto('https://www.vinted.de/items/98765/edit');
    await assert.rejects(
      readVintedListingCurrentContent(page, '123', '98765', () => Promise.resolve()),
    );
    assert.equal(page.isClosed(), false);
    assert.equal(await page.locator('input[name=title]').inputValue(), 'Meine Schuhe');
    const own = await browser.newPage();
    await fixture(own);
    let checks = 0;
    await assert.rejects(
      readVintedListingCurrentContent(own, '123', '98765', async () => {
        if (++checks > 5) throw new Error('revoked');
      }),
      /revoked/,
    );
    assert.equal(own.isClosed(), true);
  } finally {
    await browser.close();
  }
});
