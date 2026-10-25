import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { vintedBrowserActions } from '../../src/vinted-browser-actions.ts';
import { isolatedBrowserActions } from '../../src/isolated-browser-actions.ts';
import { BrowserSessionCommands } from '../../src/browser-session-commands.ts';
import { createVintedListingEditFormFixture } from '../fixtures/vinted-listing-edit-form.ts';

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
