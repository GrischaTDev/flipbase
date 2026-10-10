import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { submitVintedListing } from '../../src/vinted-browser-listing-submit.ts';
import { createVintedListingFormFixture } from '../fixtures/vinted-listing-form.ts';
import { listingClaimFixture } from '../fixtures/marketplace-listing-claim.ts';
import { vintedBrowserActions } from '../../src/vinted-browser-actions.ts';
import { isolatedBrowserActions } from '../../src/isolated-browser-actions.ts';
import { BrowserSessionCommands } from '../../src/browser-session-commands.ts';

test('publishing writes once after Begin and confirms only the saved content, photos and active ID', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const options of [
      {},
      { brandSearch: 'matching' as const },
      { savedPrice: '11,00' },
      { active: false },
      { noSaveNavigation: true },
    ]) {
      const page = await browser.newPage(),
        f = await createVintedListingFormFixture(page, { publishing: true, ...options });
      await page.goto('about:blank');
      let begin = 0;
      const result = await submitVintedListing(
        page,
        '123',
        'publish',
        options.brandSearch
          ? {
              ...listingClaimFixture.snapshot,
              content: {
                ...listingClaimFixture.snapshot.content,
                brandId: 254956,
                brandLabel: 'Jako',
              },
            }
          : listingClaimFixture.snapshot,
        () => {
          begin++;
          assert.equal(f.writes(), 0);
          return Promise.resolve();
        },
        () => Promise.resolve(),
        (id) =>
          Promise.resolve({
            id,
            fileName: 'jacke.jpg',
            mimeType: 'image/jpeg',
            bytes: new Uint8Array(123),
          }),
        [5],
        { saveTimeoutMs: 400 },
      );
      assert.equal(begin, 1);
      assert.equal(f.uploads(), 1);
      assert.equal(f.saves(), 1);
      assert.equal(
        result.outcome,
        options.savedPrice || options.active === false || options.noSaveNavigation
          ? 'outcome_unknown'
          : 'confirmed',
      );
      if (options.brandSearch) assert.deepEqual(f.brandQueries(), ['Jako', 'Jako']);
      if (result.outcome === 'confirmed') {
        assert.equal(result.externalId, '456');
        assert.equal(result.externalAccountId, '123');
        assert.equal(result.providerState, 'active');
      }
      assert.equal(page.isClosed(), true);
    }
  } finally {
    await browser.close();
  }
});

test('native draft, existing user page, missing Begin acknowledgment and foreign account cannot publish', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const mode of ['draft', 'existing', 'begin', 'account'] as const) {
      const page = await browser.newPage(),
        f = await createVintedListingFormFixture(page, { publishing: true });
      if (mode !== 'existing') await page.goto('about:blank');
      const operation = () =>
        submitVintedListing(
          page,
          mode === 'account' ? '124' : '123',
          mode === 'draft' ? 'vinted_draft' : 'publish',
          listingClaimFixture.snapshot,
          () => (mode === 'begin' ? Promise.reject(new Error('ACK fehlt')) : Promise.resolve()),
          () => Promise.resolve(),
          (id) =>
            Promise.resolve({
              id,
              fileName: 'jacke.jpg',
              mimeType: 'image/jpeg',
              bytes: new Uint8Array(123),
            }),
          [5],
        );
      if (mode === 'draft')
        assert.deepEqual(await operation(), { outcome: 'failed', errorCode: 'unsupported' });
      else await assert.rejects(operation());
      assert.equal(f.writes(), 0);
      if (mode === 'existing') {
        assert.equal(page.isClosed(), false);
        assert.equal(await page.locator('#title').inputValue(), '');
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});

test('revoked authority after uploading prevents save and the native AI option is checked again', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const revoke of [false, true]) {
      const page = await browser.newPage(),
        f = await createVintedListingFormFixture(page, { publishing: true });
      await page.goto('about:blank');
      const operation = submitVintedListing(
        page,
        '123',
        'publish',
        { ...listingClaimFixture.snapshot, aiPhoto: true },
        () => Promise.resolve(),
        () =>
          revoke && f.uploads()
            ? Promise.reject(new Error('Freigabe entzogen'))
            : Promise.resolve(),
        (id) =>
          Promise.resolve({
            id,
            fileName: 'jacke.jpg',
            mimeType: 'image/jpeg',
            bytes: new Uint8Array(123),
          }),
        [5],
      );
      if (revoke) {
        await assert.rejects(operation, /Freigabe entzogen/);
        assert.equal(f.saves(), 0);
      } else assert.equal((await operation).outcome, 'confirmed');
      assert.equal(f.uploads(), 1);
      assert.equal(page.isClosed(), true);
    }
  } finally {
    await browser.close();
  }
});

test('the real isolated transport publishes in its own tab and preserves the existing user form', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext(),
      original = await context.newPage();
    const f = await createVintedListingFormFixture(
      { route: context.route.bind(context), goto: original.goto.bind(original) },
      { publishing: true },
    );
    await original.locator('#title').fill('Meine eigene Arbeit');
    const commands = new BrowserSessionCommands(vintedBrowserActions(browser));
    const actions = isolatedBrowserActions({ request: (input) => commands.request(input) });
    let begins = 0;
    const result = await actions.submitListing!(
      '123',
      'publish',
      listingClaimFixture.snapshot,
      () => {
        begins++;
        assert.equal(f.writes(), 0);
        return Promise.resolve();
      },
      () => Promise.resolve(),
      (id) =>
        Promise.resolve({
          id,
          fileName: 'jacke.jpg',
          mimeType: 'image/jpeg',
          bytes: new Uint8Array(123),
        }),
      [5],
    );
    assert.equal(result.outcome, 'confirmed');
    assert.equal(begins, 1);
    assert.equal(f.uploads(), 1);
    assert.equal(f.saves(), 1);
    assert.equal(await original.locator('#title').inputValue(), 'Meine eigene Arbeit');
    assert.deepEqual(context.pages(), [original]);
  } finally {
    await browser.close();
  }
});
