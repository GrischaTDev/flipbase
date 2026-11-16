import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { vintedBrowserActions } from '../../src/vinted-browser-actions.ts';
import { isolatedBrowserActions } from '../../src/isolated-browser-actions.ts';
import { BrowserSessionCommands } from '../../src/browser-session-commands.ts';
import { createVintedListingEditFormFixture } from '../fixtures/vinted-listing-edit-form.ts';
import { VintedListingReadError } from '../../src/vinted-listing-read-error.ts';

test('the isolated sold listing reader preserves all content and copies a confirmed single-item package size', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const original = await context.newPage();
    const description = 'Vollständige Beschreibung\nGröße 45 – Weiß';
    const photos = Array.from({ length: 9 }, (_, index) => ({
      id: 200 + index,
      url: `https://images1.vinted.net/tc/${index}.webp`,
      is_hidden: false,
    }));
    const flight =
      ':HL["https://marketplace-web-assets.vinted.com/_next/static/chunks/fixture.css","style"]\n'.repeat(
        2,
      ) +
      '1:' +
      JSON.stringify({
        id: 98765,
        seller_id: 123,
        catalog_id: 1453,
        title: 'Laufschuhe',
        price: { amount: '98.9', currency_code: 'EUR' },
        photos,
        plugins: [
          { type: 'description', data: { item_id: 98765, description } },
          { type: 'attributes', data: { item_id: 98765, attributes: [] } },
        ],
        item_id: 98765,
        breadcrumbs: [{ url: '/catalog/1453-laufschuhe', title: 'Laufschuhe' }],
      }) +
      '\n';
    let writes = 0;
    let transactionReads = 0;
    let transactionMode: 'valid' | 'unavailable' | 'invalid' = 'valid';
    await context.route('**/*', (route) => {
      if (route.request().method() !== 'GET') writes++;
      if (new URL(route.request().url()).pathname === '/api/v2/users/current')
        return route.fulfill({ json: { user: { id: 123, login: 'fixture' } } });
      if (new URL(route.request().url()).pathname === '/api/v2/transactions/456') {
        transactionReads++;
        if (transactionMode === 'unavailable') return route.fulfill({ status: 404, json: {} });
        if (transactionMode === 'invalid')
          return route.fulfill({ contentType: 'application/json', body: '{' });
        return route.fulfill({
          json: {
            transaction: {
              id: 456,
              seller_id: 123,
              user_side: 'seller',
              item_id: 98765,
              items_count: 1,
              order: {
                transaction_id: 456,
                item_ids: [98765],
                item_count: 1,
                items: [{ id: 98765 }],
                package_size_id: 2,
                package_size_selected: true,
                package_size: { id: 2, title: 'Mittel' },
              },
            },
          },
        });
      }
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<main data-testid="item-page-summary-plugin">Verkauft</main><script>self.__next_f.push(${JSON.stringify([1, flight])})</script>`,
      });
    });
    const commands = new BrowserSessionCommands(vintedBrowserActions(browser));
    const actions = isolatedBrowserActions({ request: (input) => commands.request(input) });
    const source = await actions.readSoldListingSource!(
      '123',
      '98765',
      async () => undefined,
      '456',
    );
    assert.equal(source.description, description);
    assert.deepEqual(
      source.photoReferences,
      photos.map((photo) => photo.url),
    );
    assert.equal(source.attributeHints.category, 'Laufschuhe');
    assert.equal(source.attributeHints.package_size_id, '2');
    assert.equal(transactionReads, 1);
    for (const mode of ['unavailable', 'invalid'] as const) {
      transactionMode = mode;
      const withoutPackage = await actions.readSoldListingSource!(
        '123',
        '98765',
        async () => undefined,
        '456',
      );
      assert.equal(withoutPackage.description, description);
      assert.deepEqual(withoutPackage.photoReferences, source.photoReferences);
      assert.equal(withoutPackage.attributeHints.package_size_id, undefined);
    }
    assert.equal(transactionReads, 3);
    assert.deepEqual(context.pages(), [original]);
    assert.equal(writes, 0);
  } finally {
    await browser.close();
  }
});

test('the real isolated transport returns the current listing content and preserves user work', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext(),
      original = await context.newPage();
    const f = await createVintedListingEditFormFixture({ route: context.route.bind(context) });
    await original.goto('https://www.vinted.de/items/98765');
    const commands = new BrowserSessionCommands(vintedBrowserActions(browser));
    const actions = isolatedBrowserActions({ request: (input) => commands.request(input) });
    let authorizations = 0;
    const result = await actions.readListingContent!('123', '98765', () => {
      authorizations++;
      return Promise.resolve();
    });
    assert.equal(result.externalId, '98765');
    assert.equal(result.content.title, 'Meine Schuhe');
    assert.equal(result.content.priceCents, 2050);
    assert.deepEqual(result.content.colorIds, [1, 2]);
    assert.ok(authorizations > 5);
    assert.deepEqual(context.pages(), [original]);
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});

test('the real isolated content reader supports modern bound buttons and dynamic native text ids', async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const original = await context.newPage();
    const fixture = await createVintedListingEditFormFixture(
      { route: context.route.bind(context) },
      { modernControls: true },
    );
    await original.goto('https://www.vinted.de/items/98765/edit');
    assert.equal(await original.locator('#category').count(), 0);
    assert.equal(await original.locator('input[name="category"]').inputValue(), '2738');
    const commands = new BrowserSessionCommands(vintedBrowserActions(browser));
    const actions = isolatedBrowserActions({ request: (input) => commands.request(input) });
    const result = await actions.readListingContent!('123', '98765', async () => undefined);
    assert.equal(result.content.categoryId, 2738);
    assert.equal(result.content.categoryLabel, 'Fußballschuhe');
    assert.equal(result.content.brandLabel, 'Jako');
    assert.equal(result.content.sizeLabel, '38');
    assert.deepEqual(result.schema.unknownFields, []);
    assert.equal(result.content.title, 'Meine Schuhe');
    assert.equal(result.content.priceCents, 2050);
    assert.deepEqual(context.pages(), [original]);
    assert.equal(fixture.writes(), 0);
    assert.equal(fixture.saves(), 0);
  } finally {
    await browser.close();
  }
});

test('the real isolated content reader preserves a typed choice failure and closes only its own page', async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const original = await context.newPage();
    const fixture = await createVintedListingEditFormFixture({
      route: context.route.bind(context),
    });
    await context.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        document.querySelector('#material-149')?.removeAttribute('aria-checked');
      });
    });
    await original.goto('https://www.vinted.de/items/98765');
    const commands = new BrowserSessionCommands(vintedBrowserActions(browser));
    const actions = isolatedBrowserActions({ request: (input) => commands.request(input) });
    await assert.rejects(
      actions.readListingContent!('123', '98765', async () => undefined),
      (error) => error instanceof VintedListingReadError && error.step === 'material_parse',
    );
    assert.deepEqual(context.pages(), [original]);
    assert.equal(fixture.writes(), 0);
  } finally {
    await browser.close();
  }
});

test('beide Speicherwege übernehmen den Preis durch den echten isolierten Transport nach dem Fokuswechsel', async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const original = await context.newPage();
    const f = await createVintedListingEditFormFixture(
      { route: context.route.bind(context) },
      { formatPriceOnFocus: true },
    );
    await original.goto('https://www.vinted.de/items/98765');
    const commands = new BrowserSessionCommands(vintedBrowserActions(browser));
    const actions = isolatedBrowserActions({ request: (input) => commands.request(input) });
    const allow = async () => undefined;
    const base = await actions.readListingContent!('123', '98765', allow);
    assert.equal(
      await actions.updateListingContent!(
        '123',
        '98765',
        base.content,
        { ...base.content, priceCents: 1675 },
        allow,
      ),
      'confirmed',
    );
    assert.equal(
      (await actions.updateListingPrice!('98765', '123', 1675, 1550, allow)).status,
      'confirmed',
    );
    assert.equal(f.saves(), 2);
    assert.equal(f.state().price, '15,50 €');
    assert.equal(f.state().title, 'Meine Schuhe');
    assert.equal(f.state().description, 'Sehr gut erhalten.');
    assert.deepEqual(context.pages(), [original]);
  } finally {
    await browser.close();
  }
});
