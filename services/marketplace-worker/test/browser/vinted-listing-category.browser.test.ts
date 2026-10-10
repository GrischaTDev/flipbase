import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { createVintedListingFormFixture as fixture } from '../fixtures/vinted-listing-form.ts';
import {
  readVintedListingNewCategory,
  selectVintedListingNewCategory,
} from '../../src/vinted-browser-listing-category.ts';
import { vintedBrowserActions } from '../../src/vinted-browser-actions.ts';
import { isolatedBrowserActions } from '../../src/isolated-browser-actions.ts';
import { BrowserSessionCommands } from '../../src/browser-session-commands.ts';

test('equivalent category suggestions with the same ID remain selectable', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const f = await fixture(page);
    await page.evaluate(() => {
      const existing = document.getElementById('catalog-1223')!;
      const suggestion = existing.cloneNode(true) as HTMLElement;
      suggestion.id = 'catalog-suggestion-1223';
      suggestion.onclick = () => existing.click();
      existing.parentElement!.append(suggestion);
    });
    assert.equal(
      await selectVintedListingNewCategory(page, '123', 1223, [5], f.authorize),
      'Bomberjacken',
    );
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});

test('the real isolated transport returns current category choices and preserves user work', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext(),
      original = await context.newPage();
    const f = await fixture(
      { route: context.route.bind(context), goto: original.goto.bind(original) },
      { publishing: true },
    );
    await original.locator('#title').fill('Meine eigene Arbeit');
    const commands = new BrowserSessionCommands(vintedBrowserActions(browser));
    const actions = isolatedBrowserActions({ request: (input) => commands.request(input) });
    let authorizations = 0;
    const result = await actions.readListingCategory!('123', 1223, [5], () => {
      authorizations++;
      return Promise.resolve();
    });
    assert.equal(result.categoryId, 1223);
    assert.equal(result.fields.find((field) => field.field === 'size')?.sizeGroupId, 14);
    assert.ok(authorizations > 5);
    assert.equal(await original.locator('#title').inputValue(), 'Meine eigene Arbeit');
    assert.deepEqual(context.pages(), [original]);
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});

test('reads category-specific options on its own fresh page without saving or touching user work', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const f = await fixture(
      { route: context.route.bind(context), goto: () => Promise.resolve(null) },
      { publishing: true, unknown: true },
    );
    const userPage = await context.newPage();
    await userPage.goto('https://www.vinted.de/items/new');
    await userPage.locator('#title').fill('Eigene Arbeit');
    const page = await context.newPage();
    const result = await readVintedListingNewCategory(page, '123', 1223, [5], f.authorize);
    assert.equal(result.categoryId, 1223);
    assert.deepEqual(
      result.fields
        .find((field) => field.field === 'size')
        ?.choices.map((choice) => ({
          id: choice.id,
          label: choice.label,
          group: choice.sizeGroupId,
        })),
      [
        { id: 208, label: 'M', group: 14 },
        { id: 209, label: 'L', group: 14 },
      ],
    );
    assert.deepEqual(result.unknownFields, ['isbn']);
    assert.equal(page.isClosed(), true);
    assert.equal(userPage.isClosed(), false);
    assert.equal(await userPage.locator('#title').inputValue(), 'Eigene Arbeit');
    assert.equal(f.writes(), 0);
    assert.equal(f.uploads(), 0);
    assert.equal(f.saves(), 0);
  } finally {
    await browser.close();
  }
});

test('rejects an existing page without navigating or closing it', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const f = await fixture(page);
    await page.locator('#title').fill('Eigene Arbeit');
    await assert.rejects(
      readVintedListingNewCategory(page, '123', 1223, [5], f.authorize),
      /reserviert/,
    );
    assert.equal(page.isClosed(), false);
    assert.equal(await page.locator('#title').inputValue(), 'Eigene Arbeit');
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});

test('rejects cached private content or another account before choosing a category', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const cached of [true, false]) {
      const context = await browser.newContext();
      const f = await fixture(
        { route: context.route.bind(context), goto: () => Promise.resolve(null) },
        { cached },
      );
      const page = await context.newPage();
      await assert.rejects(
        readVintedListingNewCategory(page, cached ? '123' : '124', 1223, [5], f.authorize),
      );
      assert.equal(page.isClosed(), true);
      assert.equal(f.writes(), 0);
      await context.close();
    }
  } finally {
    await browser.close();
  }
});

test('discards category choices when authority is revoked during reading', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const f = await fixture({
      route: context.route.bind(context),
      goto: () => Promise.resolve(null),
    });
    const page = await context.newPage();
    const authorize = async () => {
      if (!page.url().startsWith('https://www.vinted.de')) return;
      const size = page.locator('#size-options');
      if (await size.isVisible()) throw new Error('revoked');
    };
    await assert.rejects(
      readVintedListingNewCategory(page, '123', 1223, [5], authorize),
      /revoked/,
    );
    assert.equal(page.isClosed(), true);
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});
