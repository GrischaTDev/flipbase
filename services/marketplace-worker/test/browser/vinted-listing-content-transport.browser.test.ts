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
