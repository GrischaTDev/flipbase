import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrowserSessionCommands } from '../src/browser-session-commands.ts';
import { SupabaseVintedImportWriter } from '../src/supabase-vinted-import-writer.ts';
import {
  browserActionError,
  executeBrowserAction,
  isolatedBrowserActions,
  validateBrowserResult,
} from '../src/isolated-browser-actions.ts';
import {
  parseVintedAccountImport,
  readVintedAccountImport,
  type VintedAccountImport,
} from '../src/vinted-account-import.ts';
import { VintedInteractionRequiredError } from '../src/vinted-browser-reader.ts';
import { listingCurrentContentFixture } from './fixtures/vinted-listing-current-content.ts';
import {
  BrowserActionFailedError,
  unexpectedFailureDetail,
  VintedListingReadError,
  vintedListingReadSteps,
} from '../src/vinted-listing-read-error.ts';

const listingCategory = {
  categoryId: 1223,
  fields: [
    {
      field: 'condition',
      sizeGroupId: null,
      choices: [{ id: 2, label: 'Sehr gut', selected: false, disabled: false, sizeGroupId: null }],
    },
  ],
  unknownFields: [],
  acceptedPhotoMimeTypes: ['image/jpeg'],
  titleMaxLength: 100,
  descriptionMaxLength: 2000,
  aiPhoto: false,
  bump: false,
};
test('Profilfelder und echte Städte bleiben beim isolierten Transport gebunden und validiert', async () => {
  const profile = {
    about: 'Shop',
    city: 'Berlin',
    showCity: true,
    language: 'de-DE',
    country: 'Deutschland',
    imageUrl: null,
    languages: [{ id: 'de-DE', label: 'Deutsch' }],
    canUploadPhoto: true,
  };
  const changes = { about: 'Neu', city: 'Berlin', showCity: true, language: 'de-DE' };
  const browser = isolatedBrowserActions(
    new BrowserSessionCommands({
      version: () => 'fixture',
      readProfileDetails: async (accountId) => {
        assert.equal(accountId, '123');
        return profile;
      },
      searchProfileCities: async (accountId, query) => {
        assert.equal(accountId, '123');
        assert.equal(query, 'Hamburg');
        return [{ id: '796', label: 'Hamburg' }];
      },
      updateProfileDetails: async (accountId, desired, expected, authorize) => {
        assert.equal(accountId, '123');
        assert.deepEqual(desired, changes);
        assert.deepEqual(expected, profile);
        await authorize();
        return { status: 'confirmed', profile: { ...profile, about: 'Neu' } };
      },
    }),
  );
  assert.deepEqual(await browser.readProfileDetails?.('123'), profile);
  assert.deepEqual(await browser.searchProfileCities?.('123', 'Hamburg'), [
    { id: '796', label: 'Hamburg' },
  ]);
  assert.deepEqual(
    await browser.updateProfileDetails?.('123', changes, profile, async () => undefined),
    { status: 'confirmed', profile: { ...profile, about: 'Neu' } },
  );
  assert.throws(() =>
    validateBrowserResult('updateProfileDetails', { status: 'unconfirmed', profile }),
  );
  await assert.rejects(
    executeBrowserAction(
      { version: () => 'fixture' },
      { name: 'readProfileDetails', arguments: ['https://other.invalid'] },
      async () => undefined,
      async () => undefined,
    ),
  );
});

test('Preisaktion bleibt über den isolierten Transport typisiert und verwirft unbestätigte Felder', async () => {
  const commands = new BrowserSessionCommands({
    version: () => 'fixture',
    updateListingPrice: async (_item, _account, _expected, _price, authorize) => {
      await authorize();
      return {
        status: 'confirmed',
        fields: { title: 'Titel', description: 'Text', price: '10,00' },
      };
    },
  });
  const browser = isolatedBrowserActions(commands);
  assert.deepEqual(
    await browser.updateListingPrice!('98765', '123', 2050, 1000, async () => undefined),
    {
      status: 'confirmed',
      fields: { title: 'Titel', description: 'Text', price: '10,00' },
    },
  );
  assert.throws(() => validateBrowserResult('updateListingPrice', { status: 'confirmed' }));
  assert.deepEqual(
    validateBrowserResult('updateListingPrice', { status: 'conflict', priceCents: 1800 }),
    { status: 'conflict', priceCents: 1800 },
  );
  assert.throws(() =>
    validateBrowserResult('updateListingPrice', { status: 'conflict', priceCents: -1 }),
  );
  assert.throws(() =>
    validateBrowserResult('updateListingPrice', { status: 'unconfirmed', fields: {} }),
  );
  assert.throws(() =>
    validateBrowserResult('updateListingPrice', {
      status: 'confirmed',
      fields: { title: 'T', description: '', price: '10', token: 'secret' },
    }),
  );
  await assert.rejects(
    executeBrowserAction(
      { version: () => 'fixture' },
      { name: 'updateListingPrice', arguments: ['98765', '123', 2050, 0] },
      async () => undefined,
      async () => undefined,
    ),
  );
});
test('isolated category read uses a fixed action and rejects a response for another category', async () => {
  const calls: unknown[] = [];
  let category = listingCategory;
  const browser = isolatedBrowserActions({
    request: async (input) => {
      calls.push(input);
      if (input.action === 'start') return { id: '00000000-0000-0000-0000-000000000001' };
      if (input.action === 'poll') return { kind: 'result', value: category };
      return null;
    },
  });
  assert.deepEqual(
    await browser.readListingCategory!('123', 1223, [5], () => Promise.resolve()),
    category,
  );
  assert.ok(
    calls.some((input) =>
      JSON.stringify(input).includes('"name":"readListingCategory","arguments":["123",1223,[5]]'),
    ),
  );
  category = { ...listingCategory, categoryId: 2738 };
  await assert.rejects(browser.readListingCategory!('123', 1223, [5], () => Promise.resolve()));
});
test('category read action rejects malformed IDs and category paths before invoking the browser', async () => {
  let reads = 0;
  const browser = {
    version: () => 'fixture',
    readListingCategory: () => {
      reads++;
      return Promise.resolve(listingCategory);
    },
  } as unknown as import('../src/gologin-cloud-browser.ts').BrowserInfo;
  for (const argumentsList of [
    ['123', '1223', [5]],
    ['123', 1223, [5, 5]],
    ['123', 1223, [1223]],
    ['123', 1223, [0]],
    ['123', 1223, Array.from({ length: 31 }, (_, index) => index + 1)],
  ])
    await assert.rejects(
      executeBrowserAction(
        browser,
        { name: 'readListingCategory', arguments: argumentsList },
        () => Promise.resolve(),
        () => Promise.resolve(),
      ),
    );
  assert.equal(reads, 0);
  assert.deepEqual(
    await executeBrowserAction(
      browser,
      { name: 'readListingCategory', arguments: ['123', 1223, [5]] },
      () => Promise.resolve(),
      () => Promise.resolve(),
    ),
    listingCategory,
  );
  assert.equal(reads, 1);
});

test('isolated content read uses a fixed action and rejects a response for another item or account', async () => {
  const calls: unknown[] = [];
  let listing: unknown = listingCurrentContentFixture();
  const browser = isolatedBrowserActions({
    request: async (input) => {
      calls.push(input);
      if (input.action === 'start') return { id: '00000000-0000-0000-0000-000000000001' };
      if (input.action === 'poll') return { kind: 'result', value: listing };
      return null;
    },
  });
  assert.deepEqual(
    await browser.readListingContent!('123', '98765', () => Promise.resolve()),
    listingCurrentContentFixture(),
  );
  assert.ok(
    calls.some((input) =>
      JSON.stringify(input).includes('"name":"readListingContent","arguments":["123","98765"]'),
    ),
  );
  listing = { ...listingCurrentContentFixture(), externalId: '98766' };
  await assert.rejects(browser.readListingContent!('123', '98765', () => Promise.resolve()));
  listing = { ...listingCurrentContentFixture(), externalAccountId: '124' };
  await assert.rejects(browser.readListingContent!('123', '98765', () => Promise.resolve()));
});
test('content read action rejects malformed IDs before invoking the browser', async () => {
  let reads = 0;
  const browser = {
    version: () => 'fixture',
    readListingContent: () => {
      reads++;
      return Promise.resolve(listingCurrentContentFixture());
    },
  } as unknown as import('../src/gologin-cloud-browser.ts').BrowserInfo;
  for (const argumentsList of [
    ['123', 98765],
    ['123', '98765/edit'],
    ['0123', '98765'],
    ['123', '98765', 'extra'],
  ])
    await assert.rejects(
      executeBrowserAction(
        browser,
        { name: 'readListingContent', arguments: argumentsList },
        () => Promise.resolve(),
        () => Promise.resolve(),
      ),
    );
  assert.equal(reads, 0);
  assert.deepEqual(
    await executeBrowserAction(
      browser,
      { name: 'readListingContent', arguments: ['123', '98765'] },
      () => Promise.resolve(),
      () => Promise.resolve(),
    ),
    listingCurrentContentFixture(),
  );
  assert.equal(reads, 1);
  assert.deepEqual(
    validateBrowserResult('readListingContent', listingCurrentContentFixture()),
    listingCurrentContentFixture(),
  );
  assert.throws(() =>
    validateBrowserResult('readListingContent', {
      ...listingCurrentContentFixture(),
      cookies: 'private',
    }),
  );
});

test('content update action passes only complete listing content and a fixed result', async () => {
  const base = listingCurrentContentFixture().content,
    desired = { ...base, priceCents: 1800 };
  const calls: unknown[] = [];
  const browser = {
    version: () => 'fixture',
    updateListingContent: (...input: unknown[]) => {
      calls.push(input.slice(0, 4));
      return Promise.resolve('confirmed');
    },
  } as unknown as import('../src/gologin-cloud-browser.ts').BrowserInfo;
  const run = (argumentsList: unknown[]) =>
    executeBrowserAction(
      browser,
      { name: 'updateListingContent', arguments: argumentsList },
      () => Promise.resolve(),
      () => Promise.resolve(),
    );
  for (const argumentsList of [
    ['123', '98765/edit', base, desired],
    ['123', '98765', base, { ...desired, script: 'private' }],
    ['123', '98765', base, { ...desired, priceCents: 0 }],
    ['123', '98765', base, { ...desired, colorIds: [1, 2, 3], colorLabels: ['a', 'b', 'c'] }],
    ['123', '98765', null, desired],
  ])
    await assert.rejects(run(argumentsList));
  assert.equal(calls.length, 0);
  assert.equal(await run(['123', '98765', base, desired]), 'confirmed');
  assert.deepEqual(calls, [['123', '98765', base, desired]]);
  assert.equal(validateBrowserResult('updateListingContent', 'conflict'), 'conflict');
  assert.throws(() => validateBrowserResult('updateListingContent', 'saved'));
});

test('a failed listing read keeps only its fixed step across the isolated transport', async () => {
  const event = browserActionError(new VintedListingReadError('photos'));
  assert.deepEqual(event, { kind: 'error', code: 'listing_read', stage: 'photos' });
  for (const [stage, expected] of [
    ['photos', 'photos'],
    ['brand_open', 'brand_open'],
    ['brand_options', 'brand_options'],
    ['brand_parse', 'brand_parse'],
    ['brand_search', 'brand_search'],
    ['brand_match', 'brand_match'],
    ['brand_choice', 'brand_choice'],
    ['brand_selected', 'brand_selected'],
    ['package_options', 'package_options'],
    ['package_label', 'package_label'],
    ['package_parse', 'package_parse'],
    ['package_match', 'package_match'],
    ['package_choice', 'package_choice'],
    ...vintedListingReadSteps
      .filter((stage) => /^(?:size|condition|color|material)_|_close$/.test(stage))
      .map((stage) => [stage, stage] as const),
    ['private page text', null],
  ] as const) {
    const browser = isolatedBrowserActions({
      request: async (input) => {
        if (input.action === 'start') return { id: '00000000-0000-0000-0000-000000000001' };
        if (input.action === 'poll') return { kind: 'error', code: 'listing_read', stage };
        return null;
      },
    });
    await assert.rejects(
      browser.readListingContent!('123', '98765', () => Promise.resolve()),
      (error) =>
        expected
          ? error instanceof VintedListingReadError && error.step === expected
          : !(error instanceof VintedListingReadError) &&
            !String((error as Error).message).includes('private'),
    );
  }
});

test('an unexpected browser failure crosses the transport only as a short safe description', async () => {
  class TimeoutError extends Error {
    override name = 'TimeoutError';
  }
  assert.equal(
    unexpectedFailureDetail(new Error('Browserseite fehlt')),
    'Error: Browserseite fehlt',
  );
  // Meldungen mit Ziffern, Adressen oder Selektoren entfallen; die Fehlerart bleibt.
  for (const message of [
    'page.goto: Timeout 15000ms exceeded',
    'waiting for locator("#content input[name=title]")',
    'https://www.vinted.de/items/98765/edit',
    'token eyJhbGciOi',
  ])
    assert.equal(unexpectedFailureDetail(new TimeoutError(message)), 'TimeoutError');
  assert.equal(unexpectedFailureDetail('text'), 'Unknown');
  assert.deepEqual(browserActionError(new TimeoutError('page.goto: Timeout 15000ms exceeded')), {
    kind: 'error',
    code: 'failed',
    reason: 'TimeoutError',
  });
  for (const [reason, expected] of [
    ['Error: Browserseite fehlt', 'Error: Browserseite fehlt'],
    ['TimeoutError', 'TimeoutError'],
    ['Error: https://www.vinted.de/items/98765', null],
    ['Error: token eyJhbGciOi', null],
    ['x'.repeat(200), null],
  ] as const) {
    const browser = isolatedBrowserActions({
      request: async (input) => {
        if (input.action === 'start') return { id: '00000000-0000-0000-0000-000000000001' };
        if (input.action === 'poll') return { kind: 'error', code: 'failed', reason };
        return null;
      },
    });
    await assert.rejects(
      browser.readListingContent!('123', '98765', () => Promise.resolve()),
      (error) =>
        expected
          ? error instanceof BrowserActionFailedError && error.detail === expected
          : !(error instanceof BrowserActionFailedError),
    );
  }
});

test('isolated terminal write proof survives a subsequent revocation without granting another action', async () => {
  for (const name of ['sendMessage', 'sendFavoriteMessage', 'sendFavoriteOffer'] as const) {
    let authorizations = 0;
    let starts = 0;
    const proof =
      name === 'sendFavoriteOffer'
        ? { outcome: 'sent', externalOfferId: '22' }
        : {
            outcome: 'sent',
            externalMessageId: '11',
            ...(name === 'sendFavoriteMessage' ? { conversationId: '777' } : {}),
          };
    const browser = isolatedBrowserActions({
      request: async (input) => {
        if (input.action === 'start') {
          starts++;
          return { id: '00000000-0000-0000-0000-000000000001' };
        }
        if (input.action === 'poll') return { kind: 'result', value: proof };
        return null;
      },
    });
    const authorize = async () => {
      if (++authorizations > 1) throw new Error('revoked');
    };
    if (name === 'sendMessage')
      assert.deepEqual(
        await browser.sendMessage?.(
          '123',
          { externalConversationId: '777', text: 'Hallo', attachment: null },
          authorize,
        ),
        proof,
      );
    else if (name === 'sendFavoriteMessage')
      assert.deepEqual(
        await browser.sendFavoriteMessage?.(
          '123',
          { recipientId: '456', itemId: '99', text: 'Danke' },
          authorize,
        ),
        proof,
      );
    else
      assert.deepEqual(
        await browser.sendFavoriteOffer?.(
          '123',
          {
            recipientId: '456',
            itemId: '99',
            text: 'Danke',
            conversationId: '777',
            transactionId: '888',
            externalMessageId: '11',
            offer: { type: 'amount', value: 5 },
          },
          authorize,
          async () => true,
        ),
        proof,
      );
    await assert.rejects(
      browser.sendMessage?.(
        '123',
        { externalConversationId: '777', text: 'Noch einmal', attachment: null },
        authorize,
      ) ?? Promise.reject(),
      /revoked/,
    );
    assert.equal(starts, 1);
  }
});

test('isolated terminal reads still require current authorization', async () => {
  let authorizations = 0;
  const browser = isolatedBrowserActions({
    request: async (input) =>
      input.action === 'start'
        ? { id: '00000000-0000-0000-0000-000000000001' }
        : { kind: 'result', value: [] },
  });
  await assert.rejects(
    browser.readFavoriteEvents?.('123', async () => {
      if (++authorizations > 1) throw new Error('revoked');
    }) ?? Promise.reject(),
    /revoked/,
  );
});

test('isolated inbox supports a manual reply and both favorite phases with central price approval', async () => {
  const message = { externalConversationId: '777', text: 'Hallo', attachment: null };
  const favorite = { recipientId: '456', itemId: '99', text: 'Danke!' };
  const offer = {
    ...favorite,
    conversationId: '777',
    transactionId: '888',
    externalMessageId: '11',
    offer: { type: 'amount' as const, value: 5 },
  };
  let priceChecks = 0;
  let offerWrites = 0;
  let authorizations = 0;
  const runtime = new BrowserSessionCommands({
    version: () => 'fixture',
    sendMessage: async (account, command, authorize) => {
      assert.equal(account, '123');
      assert.deepEqual(command, message);
      await authorize();
      return { outcome: 'sent', externalMessageId: '11' };
    },
    readFavoriteEvents: async (_account, authorize) => {
      await authorize();
      return [];
    },
    sendFavoriteMessage: async (account, command, authorize) => {
      assert.equal(account, '123');
      assert.deepEqual(command, favorite);
      await authorize();
      return {
        outcome: 'sent',
        externalMessageId: '11',
        conversationId: '777',
        transactionId: '888',
      };
    },
    sendFavoriteOffer: async (_account, command, authorize, confirmPrice) => {
      assert.deepEqual(command, offer);
      await authorize();
      if (!(await confirmPrice(4000, 3500)))
        return { outcome: 'skipped', errorCode: 'price_unconfirmed' };
      offerWrites++;
      return { outcome: 'sent', externalOfferId: '22' };
    },
  });
  const browser = isolatedBrowserActions({ request: (input) => runtime.request(input) });
  const authorize = async () => {
    authorizations++;
  };
  assert.deepEqual(await browser.sendMessage?.('123', message, authorize), {
    outcome: 'sent',
    externalMessageId: '11',
  });
  assert.deepEqual(await browser.readFavoriteEvents?.('123', authorize), []);
  assert.deepEqual(await browser.sendFavoriteMessage?.('123', favorite, authorize), {
    outcome: 'sent',
    externalMessageId: '11',
    conversationId: '777',
    transactionId: '888',
  });
  assert.deepEqual(
    await browser.sendFavoriteOffer?.('123', offer, authorize, async (original, offered) => {
      assert.equal(original, 4000);
      assert.equal(offered, 3500);
      priceChecks++;
      return true;
    }),
    { outcome: 'sent', externalOfferId: '22' },
  );
  assert.equal(priceChecks, 1);
  assert.equal(offerWrites, 1);
  assert.ok(authorizations >= 12);
  await assert.rejects(
    browser.sendFavoriteOffer?.('123', offer, authorize, async () => false) ?? Promise.reject(),
  );
  assert.equal(offerWrites, 1);
});

test('isolated results reject success without message/offer evidence and retain a versioned inbox batch', () => {
  for (const name of ['sendMessage', 'sendFavoriteMessage', 'sendFavoriteOffer'] as const) {
    assert.throws(() => validateBrowserResult(name, { outcome: 'sent' }));
    assert.throws(() =>
      validateBrowserResult(name, {
        outcome: 'sent',
        externalMessageId: '11',
        externalOfferId: '22',
        script: 'unexpected',
      }),
    );
  }
  assert.deepEqual(validateBrowserResult('readFavoriteEvents', []), []);
});

test('isolated import preserves central authorizations, article cache and inbox events without a nested RPC', async () => {
  let authorizations = 0;
  const stages: string[] = [];
  const snapshot: VintedAccountImport = {
    identity: { id: '12', username: 'fixture' },
    observedAt: '2026-10-08T00:00:00Z',
    entries: [],
    inboxEvents: {
      version: 1,
      observedAt: '2026-10-08T00:00:00.000Z',
      complete: true,
      coveredConversationIds: ['777'],
      events: [
        {
          externalId: 'message:10',
          externalConversationId: '777',
          occurredAt: '2026-10-07T23:59:00.000Z',
          direction: 'inbound',
          source: 'conversation_snapshot',
        },
        {
          externalId: `payment_message:event:${'ab'.repeat(32)}`,
          externalConversationId: '777',
          occurredAt: '2026-10-07T23:59:30.000Z',
          direction: 'inbound',
          source: 'conversation_snapshot',
        },
      ],
    },
    areas: {
      profile: { status: 'complete' },
      publications: { status: 'complete' },
      conversations: { status: 'complete' },
      messages: { status: 'complete' },
      sales: { status: 'complete' },
      feedback: { status: 'complete' },
    },
  };
  const runtime = new BrowserSessionCommands({
    version: () => '',
    importAccount: async (authorize, onStage, previous, _target, publications) => {
      assert.equal(publications?.length, 0);
      if (previous?.length) assert.equal(previous[0]?.itemTitle, 'Vintage Jacke');
      await authorize();
      await onStage?.('profile');
      await authorize();
      return snapshot;
    },
  });
  const browser = isolatedBrowserActions({ request: (input) => runtime.request(input) });
  assert.deepEqual(
    await browser.importAccount?.(
      async () => {
        authorizations++;
      },
      async (stage) => {
        stages.push(stage);
      },
      [
        {
          externalId: '777',
          sourceUpdatedAt: snapshot.observedAt,
          detailCheckedAt: snapshot.observedAt,
          saleTrackingVersion: 1,
          saleTransactionId: '71',
          saleSellerId: '123',
          text: null,
          occurredAt: null,
          itemId: '99',
          itemTitle: 'Vintage Jacke',
          itemImageUrl: null,
          itemPrice: 40,
          itemCurrency: 'EUR',
          transactionStatus: 'Offen',
        },
      ],
    ),
    snapshot,
  );
  assert.ok(authorizations >= 5);
  assert.deepEqual(stages, ['profile']);
  // Dieselbe Sitzung verarbeitet einen weiteren Auftrag ohne Browserstart.
  assert.deepEqual(await browser.importAccount?.(async () => undefined), snapshot);
});

test('revoked central authorization prevents the write and cancels the pending action', async () => {
  let writes = 0;
  let checks = 0;
  const runtime = new BrowserSessionCommands({
    version: () => '',
    updateProfileAbout: async (_id, _about, authorize) => {
      await authorize();
      writes++;
      return 'confirmed';
    },
  });
  const browser = isolatedBrowserActions({ request: (input) => runtime.request(input) });
  await assert.rejects(
    browser.updateProfileAbout?.('12', 'fixture', async () => {
      if (++checks === 3) throw new Error('revoked');
    }) ?? Promise.reject(),
    /revoked/,
  );
  assert.equal(writes, 0);
});

test('fixed browser actions reject scripts, URLs, extra arguments and unknown fields', async () => {
  for (const input of [
    { name: 'evaluate', arguments: ['process.env'] },
    { name: 'identify', arguments: [], script: 'process.env' },
    { name: 'readProfileAbout', arguments: ['https://other.invalid'] },
    { name: 'type', arguments: ['fixture', 'extra'] },
  ])
    await assert.rejects(
      executeBrowserAction(
        { version: () => '' },
        input,
        async () => undefined,
        async () => undefined,
      ),
    );
});

test('foreign write targets and malformed import entries never cross the result boundary', () => {
  assert.throws(() =>
    validateBrowserResult('identify', { id: '12', username: 'fixture', workspaceId: 'other' }),
  );
  assert.throws(() =>
    validateBrowserResult('importAccount', {
      identity: { id: '12', username: 'fixture' },
      entries: [],
      workspaceId: 'other',
    }),
  );
  assert.throws(() => validateBrowserResult('updateListing', 'anything'));
  assert.throws(() => validateBrowserResult('updateListing', ['confirmed']));
  assert.throws(() => validateBrowserResult('capture', '*'.repeat(1024)));
});

test('malformed diagnostics from a compromised interpreter are rejected before persistence or logging', () => {
  const snapshot = {
    identity: { id: '12', username: 'fixture' },
    observedAt: new Date().toISOString(),
    entries: [],
    areas: Object.fromEntries(
      ['profile', 'publications', 'conversations', 'messages', 'sales', 'feedback'].map((area) => [
        area,
        { status: 'complete' },
      ]),
    ),
  };
  assert.deepEqual(
    validateBrowserResult('importAccount', {
      ...snapshot,
      browserReadFailures: ['navigation'],
      rejectedSaleIds: ['13'],
      sourceRequestCount: 2,
    }),
    {
      ...snapshot,
      browserReadFailures: ['navigation'],
      rejectedSaleIds: ['13'],
      sourceRequestCount: 2,
    },
  );
  for (const diagnostics of [
    { browserReadFailures: {} },
    { browserReadFailures: ['private-text'] },
    { rejectedSaleIds: ['other/workspace'] },
    { sourceRequestCount: -1 },
    { areas: { ...snapshot.areas, messages: { status: ['complete'] } } },
    { areas: { ...snapshot.areas, messages: { status: 'partial', retryAfter: {} } } },
  ])
    assert.throws(() => validateBrowserResult('importAccount', { ...snapshot, ...diagnostics }));
});

test('public challenge errors survive the isolated transport without private messages', async () => {
  const runtime = new BrowserSessionCommands({
    version: () => '',
    identify: async () => {
      throw new VintedInteractionRequiredError();
    },
  });
  const browser = isolatedBrowserActions({ request: (input) => runtime.request(input) });
  await assert.rejects(browser.identify?.() ?? Promise.reject(), VintedInteractionRequiredError);
});

test('stolen or stale task IDs and out-of-order acknowledgments are rejected', async () => {
  const runtime = new BrowserSessionCommands({ version: () => '', identify: async () => null });
  const started = (await runtime.request({
    action: 'start',
    operation: { name: 'identify', arguments: [] },
  })) as { id: string };
  await assert.rejects(runtime.request({ action: 'poll', id: 'other-task', sequence: 0 }));
  await assert.rejects(runtime.request({ action: 'poll', id: started.id, sequence: 99 }));
  await runtime.request({ action: 'cancel', id: started.id });
});

test('isolated import passes validated publication ages through the real command channel', async () => {
  const publications = [
    {
      externalId: '41',
      publicationState: 'draft' as const,
      createdAt: '2026-10-01T08:00:00.000Z',
      occurredAt: null,
      publicationAge: { value: 2, unit: 'day' as const, observedAt: '2026-10-15T10:00:00Z' },
      checkedAt: '2026-10-15T10:00:00Z',
    },
  ];
  let received: unknown;
  const snapshot = {
    identity: { id: '123', username: 'test' },
    observedAt: '2026-10-16T10:00:00Z',
    entries: [],
    areas: Object.fromEntries(
      ['profile', 'publications', 'conversations', 'messages', 'sales', 'feedback'].map((area) => [
        area,
        { status: 'complete' },
      ]),
    ),
  } as unknown as VintedAccountImport;
  const runtime = new BrowserSessionCommands({
    version: () => '',
    importAccount: async (_authorize, _stage, _previous, _requested, cached) => {
      received = cached;
      return snapshot;
    },
  });
  const browser = isolatedBrowserActions({ request: (input) => runtime.request(input) });
  await browser.importAccount?.(async () => undefined, undefined, [], undefined, publications);
  assert.deepEqual(received, publications);
  await assert.rejects(
    executeBrowserAction(
      { version: () => '' },
      {
        name: 'importAccount',
        arguments: [
          [],
          null,
          [
            {
              ...publications[0],
              publicationAge: { ...publications[0]!.publicationAge, value: -1 },
            },
          ],
        ],
      },
      async () => undefined,
      async () => undefined,
    ),
    /Inseratcache/,
  );
  for (const values of [
    { publicationState: 'published' },
    { publicationState: null },
    { publicationState: true },
    { createdAt: false },
    { createdAt: 'not-a-date' },
  ]) {
    await assert.rejects(
      executeBrowserAction(
        {
          version: () => '',
          importAccount: async () => assert.fail('invalid cache reached browser'),
        },
        { name: 'importAccount', arguments: [[], null, [{ ...publications[0], ...values }]] },
        async () => undefined,
        async () => undefined,
      ),
    );
  }
});

test('cached descriptions from the import writer reach the next isolated import unchanged', async () => {
  const sessionId = '44444444-4444-4444-8444-444444444444';
  const scope = {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    connectionId: '22222222-2222-4222-8222-222222222222',
    userId: '33333333-3333-4333-8333-333333333333',
    userAccessToken: '',
    syncRead: {
      operationId: '55555555-5555-4555-8555-555555555555',
      runnerId: '66666666-6666-4666-8666-666666666666',
      workerEpoch: 1,
      sessionId,
      expiresAt: '2099-11-03T08:06:30.000Z',
      absoluteExpiresAt: '2099-11-03T08:20:00.000Z',
    },
  };
  const cached = [
    {
      text: '  Originaltext\r\nmit\tZeilen und Leerzeichen  ',
      descriptionReadAt: '2026-11-03T08:00:00.000Z',
      descriptionSourceUpdatedAt: '2026-11-02T10:00:00.000Z',
      listingContent: listingCurrentContentFixture().content,
      listingDetailsReadAt: '2026-11-03T08:00:00.000Z',
      listingDetailsSourceUpdatedAt: '2026-11-02T10:00:00.000Z',
    },
    { text: '', descriptionReadAt: null, descriptionSourceUpdatedAt: null },
    { text: 'a'.repeat(2000), descriptionReadAt: null, descriptionSourceUpdatedAt: null },
  ];
  let requests = 0;
  const writer = new SupabaseVintedImportWriter({
    url: 'https://database.test',
    publishableKey: 'fixture-publishable-key',
    serviceRoleKey: 'fixture-service-role-key',
    fetch: async (input) => {
      requests++;
      const path = new URL(String(input)).pathname;
      if (path === '/rest/v1/rpc/marketplace_sync_check')
        return Response.json({ active: true, sessionId });
      assert.equal(path, '/rest/v1/rpc/marketplace_publication_versions');
      return Response.json(
        cached.map((entry, index) => ({
          external_id: String(41 + index),
          flipbase_published_at: null,
          body: { textState: 'loaded', ...entry },
        })),
      );
    },
  });
  const publications = await writer.publicationVersions(scope, sessionId);
  assert.equal(requests, 2);
  assert.deepEqual(
    publications.map((entry) => ({
      text: entry.description,
      descriptionReadAt: entry.descriptionReadAt,
      descriptionSourceUpdatedAt: entry.descriptionSourceUpdatedAt,
      ...('listingContent' in entry
        ? {
            listingContent: entry.listingContent,
            listingDetailsReadAt: entry.listingDetailsReadAt,
            listingDetailsSourceUpdatedAt: entry.listingDetailsSourceUpdatedAt,
          }
        : {}),
    })),
    cached,
  );
  const snapshot = {
    identity: { id: '123', username: 'fixture' },
    observedAt: '2026-11-03T08:05:00.000Z',
    entries: [],
    areas: Object.fromEntries(
      ['profile', 'publications', 'conversations', 'messages', 'sales', 'feedback'].map((area) => [
        area,
        { status: 'complete' },
      ]),
    ),
  } as unknown as VintedAccountImport;
  let imports = 0;
  const commands = new BrowserSessionCommands({
    version: () => 'fixture',
    importAccount: async (_authorize, _onStage, _previous, _requested, received) => {
      imports++;
      assert.deepEqual(received, publications);
      return snapshot;
    },
  });
  const browser = isolatedBrowserActions({ request: (input) => commands.request(input) });
  assert.deepEqual(
    await browser.importAccount?.(async () => undefined, undefined, [], undefined, publications),
    snapshot,
  );
  assert.equal(imports, 1);
});

test('isolated import rejects malformed cached descriptions and metadata before any provider read', async () => {
  const publication = {
    externalId: '41',
    occurredAt: null,
    publicationAge: null,
    checkedAt: null,
    description: 'Bestätigter Text',
    descriptionReadAt: null,
    descriptionSourceUpdatedAt: null,
  };
  for (const changes of [
    { description: null },
    { listingContent: { categoryId: '2738' } },
    { listingDetailsReadAt: 'not-a-date' },
    { listingDetailsSourceUpdatedAt: false },
    { listingDetailsAttemptedAt: {} },
    { description: 123 },
    { description: {} },
    { description: 'a'.repeat(2001) },
    { description: '\u0000' },
    { description: '\u001b' },
    { description: '\u007f' },
    { descriptionReadAt: false },
    { descriptionReadAt: 'not-a-date' },
    { descriptionReadAt: '2026-11-03T08:00:00Z'.padEnd(65, ' ') },
    { descriptionSourceUpdatedAt: false },
    { descriptionSourceUpdatedAt: 'not-a-date' },
    { descriptionSourceUpdatedAt: {} },
    { descriptionSourceUpdatedAt: '2026-11-03T08:00:00Z'.padEnd(65, ' ') },
    { unexpectedDescriptionField: 'not part of the contract' },
  ]) {
    await assert.rejects(
      executeBrowserAction(
        {
          version: () => 'fixture',
          importAccount: async () => assert.fail('invalid cached fields reached the provider'),
        },
        { name: 'importAccount', arguments: [[], null, [{ ...publication, ...changes }]] },
        async () => undefined,
        async () => undefined,
      ),
    );
  }
});

test('isolated import keeps pending chat activity with a null detail check through the browser action boundary', async () => {
  const previous = {
    externalId: '51',
    sourceUpdatedAt: '2026-10-04T09:45:00.000Z',
    detailCheckedAt: null,
    text: 'Passt, danke!',
    occurredAt: '2026-10-03T08:00:00.000Z',
  };
  const snapshot = (await executeBrowserAction(
    {
      version: () => '',
      importAccount: async (_authorize, _onStage, versions) =>
        parseVintedAccountImport(
          { id: '123', username: 'testkonto' },
          { user: { id: 123 } },
          [],
          [
            {
              id: 51,
              updated_at: '2026-10-04T09:45:00.000Z',
              description: 'Dieser Artikel ist nicht mehr verfügbar.',
            },
          ],
          [],
          '2026-10-04T10:00:00.000Z',
          versions,
        ),
    },
    { name: 'importAccount', arguments: [[previous], null, []] },
    async () => undefined,
    async () => undefined,
  )) as VintedAccountImport;
  const conversation = snapshot.entries.find((entry) => entry.kind === 'conversation');
  assert.equal(conversation?.body['text'], 'Passt, danke!');
  assert.equal(conversation?.body['occurredAt'], '2026-10-03T08:00:00.000Z');
  assert.equal(conversation?.body['detailCheckedAt'], null);
});

test('attempted conversation versions survive the real writer and isolated command channel without becoming checked', async () => {
  const scope = {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    connectionId: '22222222-2222-4222-8222-222222222222',
    userId: '33333333-3333-4333-8333-333333333333',
    userAccessToken: '',
    syncRead: {
      operationId: '55555555-5555-4555-8555-555555555555',
      runnerId: '66666666-6666-4666-8666-666666666666',
      workerEpoch: 1,
      sessionId: '44444444-4444-4444-8444-444444444444',
      expiresAt: '2099-11-03T08:06:30.000Z',
      absoluteExpiresAt: '2099-11-03T08:20:00.000Z',
    },
  };
  const sourceUpdatedAt = '2026-11-03T08:00:00.000Z';
  const attemptedAt = '2026-11-03T08:01:00.000Z';
  const writer = new SupabaseVintedImportWriter({
    url: 'https://database.test',
    publishableKey: 'fixture-publishable-key',
    serviceRoleKey: 'fixture-service-role-key',
    fetch: async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('marketplace_sync_check'))
        return Response.json({ active: true, sessionId: scope.syncRead.sessionId });
      assert.equal(path, '/rest/v1/marketplace_account_entries');
      return Response.json(
        [attemptedAt, null].map((detailAttemptedAt, index) => ({
          external_id: String(51 + index),
          body: { sourceUpdatedAt, detailCheckedAt: null, detailAttemptedAt },
        })),
      );
    },
  });
  const previous = await writer.conversationVersions(scope, scope.syncRead.sessionId);
  assert.deepEqual(
    previous.map((version) => version.detailAttemptedAt),
    [attemptedAt, null],
  );
  const commands = new BrowserSessionCommands({
    version: () => 'fixture',
    importAccount: async (_authorize, _onStage, received) => {
      assert.deepEqual(received, previous);
      return parseVintedAccountImport(
        { id: '123', username: 'fixture' },
        { user: { id: 123 } },
        [],
        [
          { id: 51, updated_at: sourceUpdatedAt },
          { id: 52, updated_at: sourceUpdatedAt },
        ],
        [],
        '2026-11-03T08:02:00.000Z',
        received,
      );
    },
  });
  const browser = isolatedBrowserActions({ request: (input) => commands.request(input) });
  const snapshot = await browser.importAccount?.(async () => undefined, undefined, previous);
  const conversation = snapshot?.entries.find((entry) => entry.externalId === '51');
  assert.equal(conversation?.body['detailAttemptedAt'], attemptedAt);
  assert.equal(conversation?.body['detailCheckedAt'], null);
});

test('ten bounded conversation details and two thousand events pass the actual isolated inbox result boundary', async () => {
  const ids = Array.from(
    { length: 10 },
    (_, index) => '9'.repeat(30) + String(index).padStart(2, '0'),
  );
  const page = {
    url: () => 'https://www.vinted.de/',
    evaluate: async (_script: unknown, path: string) => {
      if (path.includes('/users/current')) return { user: { id: 123, login: 'fixture' } };
      if (path.startsWith('/api/v2/inbox'))
        return {
          conversations: ids.map((id) => ({ id, unread: false, opposite_user: { id: 91 } })),
          pagination: { total_pages: 1 },
        };
      if (path.startsWith('/api/v2/conversations/'))
        return {
          conversation: {
            id: path.split('/').at(-1),
            opposite_user: { id: 91 },
            messages: Array.from({ length: 200 }, (_, index) => ({
              entity_type: 'offer_request_message',
              id:
                '8'.repeat(28) +
                String(ids.indexOf(path.split('/').at(-1) ?? '') * 200 + index).padStart(4, '0'),
              entity: { user_id: 91, body: 'Hallo' },
              created_at_ts: '2026-10-08T08:01:00.000Z',
            })),
          },
        };
      return { items: [], user_feedbacks: [], pagination: { total_pages: 1 } };
    },
  } as unknown as Parameters<typeof readVintedAccountImport>[0];
  const commands = new BrowserSessionCommands({
    version: () => 'fixture',
    importAccount: (authorize, onStage) => readVintedAccountImport(page, authorize, onStage),
  });
  const browser = isolatedBrowserActions({ request: (input) => commands.request(input) });
  const snapshot = await browser.importAccount?.(async () => undefined);
  assert.deepEqual(snapshot?.inboxEvents?.coveredConversationIds, ids.map(String));
  assert.equal(snapshot?.inboxEvents?.events.length, 2000);
  assert.ok(
    snapshot?.inboxEvents?.events.every(
      (event) =>
        event.externalConversationId.length === 32 &&
        /^offer_request_message:[0-9]{32}$/.test(event.externalId),
    ),
  );
  assert.ok(
    snapshot?.inboxEvents?.events.every((event) => event.notificationKind === 'offer_received'),
  );
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot?.inboxEvents)) < 768 * 1024);
});

test('the inbox result boundary rejects eleven conversations, excess events and oversized batches', () => {
  const snapshot = parseVintedAccountImport(
    { id: '123', username: 'fixture' },
    { user: { id: 123 } },
    [],
    [],
    [],
    '2026-11-03T08:00:00.000Z',
  );
  const event = {
    externalId: 'message:1',
    externalConversationId: '700',
    occurredAt: snapshot.observedAt,
    direction: 'inbound',
    source: 'conversation_snapshot',
  };
  const batch = {
    version: 1,
    observedAt: snapshot.observedAt,
    events: [],
    complete: true,
    coveredConversationIds: ['700'],
  };
  const longTimestamp = '2026-11-03T08:00:00.' + '0'.repeat(43) + 'Z';
  assert.equal(longTimestamp.length, 64);
  assert.ok(Number.isFinite(Date.parse(longTimestamp)));
  for (const changes of [
    { coveredConversationIds: Array.from({ length: 11 }, (_, index) => String(700 + index)) },
    { events: Array.from({ length: 2001 }, () => event) },
    {
      events: Array.from({ length: 2000 }, () => ({
        ...event,
        externalId: 'offer_request_message:' + '9'.repeat(768),
        externalConversationId: '9'.repeat(32),
        occurredAt: longTimestamp,
      })),
    },
  ])
    assert.throws(
      () =>
        validateBrowserResult('importAccount', {
          ...snapshot,
          inboxEvents: { ...batch, ...changes },
        }),
      /Ungültige Postfachereignisse/,
    );
});

test('the isolated inbox boundary preserves legacy events and enforces optional notification kind source bindings', () => {
  const snapshot = parseVintedAccountImport(
    { id: '123', username: 'fixture' },
    { user: { id: 123 } },
    [],
    [],
    [],
    '2026-11-03T08:00:00.000Z',
  );
  const event = {
    externalId: 'message:1',
    externalConversationId: '700',
    occurredAt: snapshot.observedAt,
    direction: 'inbound',
    source: 'conversation_snapshot',
  };
  const check = (events: unknown[]) =>
    validateBrowserResult('importAccount', {
      ...snapshot,
      inboxEvents: {
        version: 1,
        observedAt: snapshot.observedAt,
        events,
        complete: true,
        coveredConversationIds: ['700'],
      },
    });
  assert.doesNotThrow(() => check([event]));
  assert.doesNotThrow(() => check([{ ...event, notificationKind: 'message' }]));
  assert.doesNotThrow(() =>
    check([
      { ...event, externalId: 'offer_request_message:1', notificationKind: 'offer_received' },
    ]),
  );
  assert.doesNotThrow(() =>
    check(
      Array.from({ length: 2000 }, (_, index) => ({
        ...event,
        externalConversationId: '9'.repeat(32),
        externalId: `payment_message:event:${index.toString(16).padStart(64, '0')}`,
        notificationKind: 'transaction_cancelled',
      })),
    ),
  );
  for (const changes of [
    { notificationKind: 'refund_completed' },
    { notificationKind: 'unknown' },
    { notificationKind: 'constructor' },
    { notificationKind: 'x'.repeat(10000) },
    { notificationKind: null },
    { notificationKind: undefined },
    { notificationKind: 'message', privateText: 'forbidden' },
    { externalId: 'offer_request_message:1', notificationKind: 'message' },
    { externalId: 'status_message:1', notificationKind: 'message' },
    { externalId: 'action_message:1', notificationKind: 'offer_received' },
  ])
    assert.throws(() => check([{ ...event, ...changes }]), /Ungültiges Postfachereignis/);
});

test('the conversation attempt transport rejects malformed timestamps and unknown fields before a provider call', async () => {
  const previous = {
    externalId: '51',
    sourceUpdatedAt: '2026-11-03T08:00:00.000Z',
    detailCheckedAt: null,
    text: null,
    occurredAt: null,
  };
  for (const changes of [
    { detailAttemptedAt: 123 },
    { detailAttemptedAt: false },
    { detailAttemptedAt: {} },
    { detailAttemptedAt: 'not-a-date' },
    { detailAttemptedAt: '2026-11-03T08:00:00Z'.padEnd(65, ' ') },
    { unknownAttemptField: 'not part of the contract' },
  ]) {
    await assert.rejects(
      executeBrowserAction(
        {
          version: () => 'fixture',
          importAccount: async () => assert.fail('invalid attempt reached provider'),
        },
        { name: 'importAccount', arguments: [[{ ...previous, ...changes }], null, []] },
        async () => undefined,
        async () => undefined,
      ),
    );
  }
});

test('Löschbefehle transportieren nur zwei gebundene IDs und akzeptieren keine erfundene Bestätigung', async () => {
  assert.deepEqual(
    validateBrowserResult('deleteListing', { status: 'confirmed', step: 'verify' }),
    { status: 'confirmed', step: 'verify' },
  );
  for (const value of [
    { status: 'confirmed', step: 'open' },
    { status: 'confirmed', step: 'verify', extra: true },
    { status: 'yes', step: 'verify' },
  ])
    assert.throws(() => validateBrowserResult('deleteListing', value));
  const calls: unknown[] = [];
  const result = await executeBrowserAction(
    {
      version: () => 'fixture',
      deleteListing: async (account, externalId, authorize) => {
        await authorize();
        calls.push([account, externalId]);
        return { status: 'confirmed', step: 'verify' };
      },
    },
    { name: 'deleteListing', arguments: ['123', '98765'] },
    async () => {
      calls.push('authorize');
    },
    async () => undefined,
  );
  assert.deepEqual(result, { status: 'confirmed', step: 'verify' });
  assert.deepEqual(calls, ['authorize', 'authorize', ['123', '98765']]);
});
