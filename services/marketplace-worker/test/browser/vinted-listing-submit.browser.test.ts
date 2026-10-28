import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { submitVintedListing } from '../../src/vinted-browser-listing-submit.ts';
import { createVintedListingFormFixture } from '../fixtures/vinted-listing-form.ts';
import { listingClaimFixture } from '../fixtures/marketplace-listing-claim.ts';
import { vintedBrowserActions } from '../../src/vinted-browser-actions.ts';
import { isolatedBrowserActions } from '../../src/isolated-browser-actions.ts';
import { BrowserSessionCommands } from '../../src/browser-session-commands.ts';
import { VintedListingReadError } from '../../src/vinted-listing-read-error.ts';

test('publishing writes once after Begin and confirms only the saved content, photos and active ID', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const options of [
      {},
      { localForm: true },
      {
        localForm: true,
        categoryLoadingDelayMs: 200,
        brandLoadingDelayMs: 400,
        brandChoicesDelayMs: 6000,
        nativePackage: true,
      },
      { brandSearch: 'matching' as const, brandSearchStartsEmpty: true, brandSearchPortal: true },
      { savedPrice: '11,00' },
      { active: false },
      { noSaveNavigation: true },
    ]) {
      const page = await browser.newPage(),
        f = await createVintedListingFormFixture(page, { publishing: true, ...options });
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      let identityReads = 0;
      let identityReadsBeforeUpload = 0;
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/v2/users/current') identityReads++;
      });
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
          : options.localForm
            ? {
                ...listingClaimFixture.snapshot,
                content: {
                  ...listingClaimFixture.snapshot.content,
                  sizeId: 5,
                  conditionId: 3,
                  attributes: { flipbaseListingForm: '1' },
                },
              }
            : listingClaimFixture.snapshot,
        () => {
          begin++;
          identityReadsBeforeUpload = identityReads;
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
      assert.ok(
        identityReadsBeforeUpload <= 50,
        `Account lookup budget before first upload: ${identityReadsBeforeUpload}`,
      );
      assert.equal(f.uploads(), 1);
      assert.equal(f.saves(), 1);
      assert.deepEqual(pageErrors, [], JSON.stringify(options));
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

test('publishes ten original photos in order with bounded account lookups between uploads', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const form = await createVintedListingFormFixture(page, { publishing: true });
    const original = listingClaimFixture.snapshot.images[0];
    assert.ok(original);
    const images = Array.from({ length: 10 }, (_, index) => ({
      ...original,
      id: (BigInt(original.id) + BigInt(index)).toString(),
      storagePath: `20000000-0000-4000-8000-000000000001/12/20000000-0000-4000-8000-${String(index + 9).padStart(12, '0')}.jpg`,
      fileName: `photo-${index + 1}.jpg`,
    }));
    let accountLookups = 0;
    const lookupsAtUpload: number[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path === '/api/v2/users/current') accountLookups++;
      if (path === '/fixture/photo') lookupsAtUpload.push(accountLookups);
    });
    await page.goto('about:blank');
    let begins = 0;
    const result = await submitVintedListing(
      page,
      '123',
      'publish',
      { ...listingClaimFixture.snapshot, images },
      async () => {
        begins++;
        assert.equal(form.uploads(), 0);
      },
      async () => undefined,
      async (id) => {
        const image = images.find((image) => image.id === id);
        assert.ok(image);
        return {
          id,
          fileName: image.fileName,
          mimeType: image.mimeType,
          bytes: new Uint8Array(image.byteSize),
        };
      },
      [5],
      { saveTimeoutMs: 400 },
    );
    assert.equal(result.outcome, 'confirmed');
    assert.equal(begins, 1);
    assert.equal(form.uploads(), 10);
    assert.equal(form.saves(), 1);
    assert.deepEqual(
      form.uploadedFileNames(),
      images.map((image) => image.fileName),
    );
    assert.equal(lookupsAtUpload.length, 10);
    for (let index = 1; index < lookupsAtUpload.length; index++) {
      const current = lookupsAtUpload[index],
        previous = lookupsAtUpload[index - 1];
      assert.ok(current !== undefined && previous !== undefined);
      assert.ok(current - previous <= 5, `Account lookups between uploads: ${current - previous}`);
    }
  } finally {
    await browser.close();
  }
});

test('query or hash changes during preparation stop before article texts are entered', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const suffix of ['?other-form=1', '#other-form']) {
      const page = await browser.newPage();
      const form = await createVintedListingFormFixture(page, { publishing: true });
      await page.goto('about:blank');
      let hasChangedRoute = false;
      let hasEnteredTitle = false;
      let begins = 0;
      await assert.rejects(
        submitVintedListing(
          page,
          '123',
          'publish',
          listingClaimFixture.snapshot,
          async () => {
            begins++;
          },
          async () => {
            if (!page.url().startsWith('https://www.vinted.de/items/new')) return;
            hasEnteredTitle ||= !!(await page.locator('#title').inputValue());
            if (!hasChangedRoute && (await page.locator('#category').inputValue())) {
              hasChangedRoute = true;
              await page.evaluate(
                (suffix) => history.replaceState(null, '', location.pathname + suffix),
                suffix,
              );
            }
          },
          async () => {
            throw new Error('Unexpected photo request');
          },
          [5],
        ),
      );
      assert.equal(hasChangedRoute, true);
      assert.equal(hasEnteredTitle, false);
      assert.equal(begins, 0);
      assert.equal(form.uploads(), 0);
      assert.equal(form.saves(), 0);
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

test('preflight failures preserve a fixed step through isolated transport without uploads', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const original = await context.newPage();
    const form = await createVintedListingFormFixture(
      { route: context.route.bind(context), goto: original.goto.bind(original) },
      { publishing: true },
    );
    const commands = new BrowserSessionCommands(vintedBrowserActions(browser));
    const actions = isolatedBrowserActions({ request: (input) => commands.request(input) });
    const submit = actions.submitListing;
    assert.ok(submit);
    let begins = 0;
    await assert.rejects(
      submit(
        '123',
        'publish',
        {
          ...listingClaimFixture.snapshot,
          content: { ...listingClaimFixture.snapshot.content, sizeId: 999 },
        },
        async () => {
          begins++;
        },
        async () => undefined,
        async () => {
          throw new Error('Private storage response');
        },
        [5],
      ),
      (error: unknown) => error instanceof VintedListingReadError && error.step === 'values',
    );
    assert.equal(begins, 0);
    assert.equal(form.uploads(), 0);
    assert.equal(form.saves(), 0);
    assert.deepEqual(context.pages(), [original]);
  } finally {
    await browser.close();
  }
});
