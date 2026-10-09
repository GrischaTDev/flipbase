import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, type Page } from 'playwright';
import { prepareVintedListingFields } from '../../src/vinted-browser-listing-fields.ts';
import { listingClaimFixture } from '../fixtures/marketplace-listing-claim.ts';
const snapshot = listingClaimFixture.snapshot;
const content = {
  ...snapshot.content,
  colorIds: [3],
  colorLabels: ['Grau'],
  materialIds: [149],
  materialLabels: ['Acryl'],
};
async function fixture(
  page: Page,
  options: {
    cached?: boolean;
    unknown?: boolean;
    disabledSize?: boolean;
    hiddenPackage?: boolean;
  } = {},
) {
  let writes = 0,
    account = '123';
  await page.route('**/*', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v2/users/current')
      return route.fulfill({ json: { user: { id: account, login: 'fixture' } } });
    if (route.request().method() !== 'GET') writes++;
    return route.fulfill({
      contentType: 'text/html',
      body: `<div id="content">
      <input name="photos" type="file" multiple accept="image/jpeg,image/gif,image/png,image/webp">
      <input name="title" id="title" value="${options.cached ? 'Eigene Arbeit' : ''}"><textarea name="description" id="description"></textarea><input name="price" id="price">
      <input readonly id="category" name="category"><input readonly id="brand" name="brand"><input readonly id="size" name="size"><input readonly id="condition" name="condition"><input readonly id="color" name="color"><input readonly id="material" name="material">
      ${options.unknown ? '<input id="isbn" name="isbn">' : ''}
      <div hidden id="category-options"><button type="button" id="catalog-5">Herren</button><div hidden id="category-leaves"><div role="radio" id="catalog-1223" aria-checked="false"><div class="web_ui__Cell__title">Bomberjacken</div></div></div></div>
      <div hidden id="brand-options"><div role="radio" id="empty-brand" aria-label="Keine Marke" aria-checked="false">Keine Marke</div></div>
      <div hidden id="size-options"><div role="checkbox" data-testid="size-group-14-grid-option-208" aria-label="M" aria-checked="false" aria-disabled="${options.disabledSize ? 'true' : 'false'}">M</div><div role="checkbox" data-testid="size-group-14-grid-option-209" aria-label="L" aria-checked="false">L</div></div>
      <div hidden id="condition-options"><div role="radio" id="condition-2" aria-checked="false"><div data-testid="condition-2--title">Sehr gut</div></div></div>
      <div hidden id="color-options"><div role="checkbox" id="color-3" aria-checked="false"><div data-testid="color-3--title">Grau</div></div></div>
      <div hidden id="material-options"><div role="checkbox" id="material-149" aria-checked="false"><div data-testid="material-149--title">Acryl</div></div></div>
      <button type="button" id="package-size-2">Mittel</button><label><input style="opacity:${options.hiddenPackage ? '0' : '1'}" type="radio" id="package_type_selector_2" aria-labelledby="package-size-2"></label>
      <button type="button" id="package-size-3">Groß</button><label><input style="opacity:${options.hiddenPackage ? '0' : '1'}" type="radio" id="package_type_selector_3" aria-labelledby="package-size-3" checked></label>
      <button type="button" data-testid="upload-form-save-button">Hochladen</button>
      </div><script>
      const fields=['category','brand','size','condition','color','material'];
      const hide=()=>fields.forEach(field=>document.querySelector('#'+field+'-options').hidden=true);
      fields.forEach(field=>{
        document.querySelector('#'+field).onclick=()=>{hide();document.querySelector('#'+field+'-options').hidden=false;if(field==='category'){document.querySelector('#catalog-5').hidden=false;document.querySelector('#category-leaves').hidden=true;}};
        document.querySelectorAll('#'+field+'-options [role=radio],#'+field+'-options [role=checkbox]').forEach(node=>node.onclick=()=>{
          if(node.getAttribute('aria-disabled')==='true') return;
          node.setAttribute('aria-checked',node.getAttribute('aria-checked')!=='true'?'true':'false');
          document.querySelector('#'+field).value=node.getAttribute('aria-label')||node.textContent;
          if(!['color','material'].includes(field)) hide();
        });
      });
      document.querySelector('#catalog-5').onclick=()=>{document.querySelector('#catalog-5').hidden=true;document.querySelector('#category-leaves').hidden=false;};
      document.onkeydown=event=>{if(event.key==='Escape') hide();};
      [2,3].forEach(id=>document.querySelector('#package-size-'+id).onclick=()=>{[2,3].forEach(other=>document.querySelector('#package_type_selector_'+other).checked=other===id);});
      document.querySelector('[data-testid="upload-form-save-button"]').onclick=()=>fetch('/fixture/save',{method:'POST'});
      </script>`,
    });
  });
  await page.goto('https://www.vinted.de/items/new');
  return {
    writes: () => writes,
    changeAccount: () => {
      account = '124';
    },
    authorize: async () => undefined,
  };
}
test('prepares actual category-dependent choices and decimal price without saving or uploading', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      f = await fixture(page);
    const schema = await prepareVintedListingFields(
      page,
      '123',
      content,
      snapshot.images,
      [5],
      f.authorize,
    );
    assert.equal(schema.categoryId, 1223);
    assert.equal(await page.locator('#title').inputValue(), 'Jacke');
    assert.equal(await page.locator('#description').inputValue(), 'Gebraucht');
    assert.equal(await page.locator('#price').inputValue(), '12,00');
    for (const field of schema.fields)
      assert.equal(field.choices.filter((choice) => choice.selected).length, 1);
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});
test('refuses label/ID contradictions, unknown fields and disabled choices before filling personal content', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const scenario of [
      { options: {}, content: { ...content, sizeLabel: 'XL' } },
      { options: { unknown: true }, content },
      { options: { disabledSize: true }, content },
    ]) {
      const page = await browser.newPage(),
        f = await fixture(page, scenario.options);
      await assert.rejects(
        prepareVintedListingFields(
          page,
          '123',
          scenario.content,
          snapshot.images,
          [5],
          f.authorize,
        ),
        /Inseratangaben/,
      );
      assert.equal(await page.locator('#title').inputValue(), '');
      assert.equal(f.writes(), 0);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
test('preserves cached user work and rejects foreign accounts before choosing a category', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      f = await fixture(page, { cached: true });
    await assert.rejects(
      prepareVintedListingFields(page, '123', content, snapshot.images, [5], f.authorize),
    );
    assert.equal(await page.locator('#title').inputValue(), 'Eigene Arbeit');
    assert.equal(await page.locator('#category').inputValue(), '');
    const other = await browser.newPage(),
      g = await fixture(other);
    await assert.rejects(
      prepareVintedListingFields(other, '124', content, snapshot.images, [5], g.authorize),
    );
    assert.equal(await other.locator('#category').inputValue(), '');
  } finally {
    await browser.close();
  }
});

test('uses the visible package label when its native radio control is hidden', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      f = await fixture(page, { hiddenPackage: true });
    const schema = await prepareVintedListingFields(
      page,
      '123',
      content,
      snapshot.images,
      [5],
      f.authorize,
    );
    assert.equal(
      schema.fields
        .find((field) => field.field === 'package')
        ?.choices.find((choice) => choice.selected)?.id,
      2,
    );
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});

test('stops filling personal content when the authorization disappears during preparation', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      f = await fixture(page);
    const authorize = async () => {
      if (await page.locator('#title').inputValue()) throw new Error('Freigabe entzogen');
    };
    await assert.rejects(
      prepareVintedListingFields(page, '123', content, snapshot.images, [5], authorize),
      /Freigabe entzogen/,
    );
    assert.equal(await page.locator('#title').inputValue(), 'Jacke');
    assert.equal(await page.locator('#description').inputValue(), '');
    assert.equal(await page.locator('#price').inputValue(), '');
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});

test('stops filling when the category changes between authorization and the next field', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      f = await fixture(page);
    const authorize = async () => {
      if (await page.locator('#title').inputValue()) {
        await page.locator('#category').evaluate((element: HTMLInputElement) => {
          element.value = 'Andere Kategorie';
        });
      }
    };
    await assert.rejects(
      prepareVintedListingFields(page, '123', content, snapshot.images, [5], authorize),
      /Inseratangaben/,
    );
    assert.equal(await page.locator('#description').inputValue(), '');
    assert.equal(await page.locator('#price').inputValue(), '');
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});
