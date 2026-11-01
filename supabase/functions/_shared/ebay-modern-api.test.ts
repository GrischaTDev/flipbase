import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EbayConfig } from './ebay-api.ts';
import { EbayError } from './ebay-api.ts';
import {
  ebayListingGraphql,
  readModernEbayListing,
  reviseModernEbayListing,
} from './ebay-listing-api.ts';
import {
  createEbayListing,
  findCreatedEbayListing,
  validateEbayDraft,
} from './ebay-listing-creation.ts';
import {
  readEbayConversation,
  readEbayInbox,
  sendEbayReply,
  requireConversationType,
  requireConversationId,
} from './ebay-messages.ts';
import type { EbayListingDraft } from './ebay-listing-creation-contracts.ts';
import {
  readEbayListingSettings,
  searchEbayCategories,
  readEbayCategoryDetails,
} from './ebay-listing-metadata.ts';

const config: EbayConfig = {
  clientId: 'app',
  clientSecret: 'secret',
  ruName: 'callback',
  environment: 'production',
  encryptionKey: '',
  appUrl: 'https://app.test',
  allowedOrigins: [],
};
const draft: EbayListingDraft = {
  key: 'a'.repeat(32),
  title: 'Wollschal',
  description: 'Sehr guter Zustand',
  price: 29,
  quantity: 1,
  categoryId: '12',
  conditionId: '3000',
  postalCode: '12345',
  location: 'Testort',
  paymentPolicyId: '1',
  fulfillmentPolicyId: '2',
  returnPolicyId: '3',
  imageUrls: ['https://i.ebayimg.com/test.jpg'],
  aspects: [{ name: 'Marke', values: ['Testmarke'] }],
};
const providerMessage = {
  messageId: 'm1',
  createdDate: '2026-11-01T10:00:00Z',
  messageBody: 'Ist der Schal noch da?',
  senderUsername: 'buyer',
  recipientUsername: 'seller',
};
test('Kontorichtlinien lesen alle drei Arten vom richtigen Sandbox-Konto', async () => {
  const paths: string[] = [];
  const result = await readEbayListingSettings(
    { ...config, environment: 'sandbox' },
    'token',
    async (url, init) => {
      const target = new URL(String(url));
      assert.equal(target.origin, 'https://api.sandbox.ebay.com');
      assert.equal(target.searchParams.get('marketplace_id'), 'EBAY_DE');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer token');
      const kind = /\/(payment|fulfillment|return)_policy$/.exec(target.pathname)![1]!;
      paths.push(kind);
      return json({ [`${kind}Policies`]: [{ [`${kind}PolicyId`]: '1', name: kind }] });
    },
  );
  assert.deepEqual(paths.sort(), ['fulfillment', 'payment', 'return']);
  assert.deepEqual(result.fulfillment, [{ id: '1', name: 'fulfillment' }]);
});
test('Kategoriesuche, Pflichtmerkmale und Zustände verwenden denselben deutschen Kategoriebaum', async () => {
  const fetcher: typeof fetch = async (url) => {
    const target = new URL(String(url));
    if (target.pathname.endsWith('get_default_category_tree_id')) {
      assert.equal(target.searchParams.get('marketplace_id'), 'EBAY_DE');
      return json({ categoryTreeId: '77' });
    }
    if (target.pathname.endsWith('get_category_suggestions')) {
      assert.match(target.pathname, /category_tree\/77\//);
      assert.equal(target.searchParams.get('q'), 'Schal & Wolle');
      return json({
        categorySuggestions: [
          {
            category: { categoryId: '12', categoryName: 'Schals' },
            categoryTreeNodeAncestors: [{ categoryName: 'Accessoires', categoryTreeNodeLevel: 1 }],
          },
        ],
      });
    }
    if (target.pathname.endsWith('get_item_aspects_for_category')) {
      assert.equal(target.searchParams.get('category_id'), '12');
      return json({
        aspects: [
          {
            localizedAspectName: 'Marke',
            aspectConstraint: {
              aspectRequired: true,
              aspectMode: 'SELECTION_ONLY',
              itemToAspectCardinality: 'SINGLE',
            },
            aspectValues: [{ localizedValue: 'Testmarke' }],
          },
        ],
      });
    }
    assert.equal(target.searchParams.get('filter'), 'categoryIds:{12}');
    return json({
      itemConditionPolicies: [
        {
          categoryId: '12',
          itemConditions: [{ conditionId: '3000', conditionDescription: 'Gebraucht' }],
        },
      ],
    });
  };
  assert.deepEqual((await searchEbayCategories(config, 't', 'Schal & Wolle', fetcher)).categories, [
    { id: '12', name: 'Accessoires › Schals' },
  ]);
  const details = await readEbayCategoryDetails(config, 't', '12', fetcher);
  assert.deepEqual(details.conditions, [{ id: '3000', name: 'Gebraucht' }]);
  assert.deepEqual(details.aspects, [
    { name: 'Marke', required: true, selectionOnly: true, multiple: false, values: ['Testmarke'] },
  ]);
});
const listingData = () => ({
  sellerListings: {
    __typename: 'ListingsSuccess',
    listings: [
      {
        __typename: 'ListingSuccess',
        listingId: '123',
        listing: {
          listingId: '123',
          marketplace: 'EBAY_DE',
          listingTerms: {
            listingFormat: 'FIXED_PRICE',
            lifecycleTerms: { listingStatus: 'ACTIVE' },
          },
          sellerProduct: {
            title: 'Schal',
            description: 'Wolle',
            images: [{ ebayImageUrl: 'https://i.ebayimg.com/test.jpg', order: 0 }],
          },
          items: [
            {
              itemId: '123',
              sku: 'sku',
              itemTerms: {
                availability: { quantityAvailable: 1 },
                pricingTerms: { fixedPrice: { original: { value: '29.00', currency: 'EUR' } } },
              },
            },
          ],
        },
      },
    ],
  },
});
const json = (body: unknown, status = 200) => Response.json(body, { status });
const code = (expected: string) => (error: unknown) =>
  error instanceof EbayError && error.code === expected;

test('GraphQL nutzt eigenen Produktions-/Sandboxhost und Variablen statt Texteinschüben', async () => {
  await ebayListingGraphql(
    { ...config, environment: 'sandbox' },
    'token',
    'query Test { ok }',
    { input: '" } mutation' },
    (input, init) => {
      assert.equal(input, 'https://graphqlapi.sandbox.ebay.com/graphql');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer token');
      assert.equal(init?.redirect, 'error');
      assert.equal(JSON.parse(String(init?.body)).variables.input, '" } mutation');
      return Promise.resolve(json({ data: { ok: true } }));
    },
  );
});
test('GraphQL-Teilfehler werden trotz HTTP 200 und Daten nicht als Erfolg angenommen', async () => {
  await assert.rejects(
    ebayListingGraphql(
      config,
      't',
      'mutation X { ok }',
      {},
      async () => json({ data: { ok: true }, errors: [{ message: 'privat' }] }),
      true,
    ),
    code('save_unconfirmed'),
  );
  for (const errorCode of ['UNAUTHENTICATED', 'FORBIDDEN']) {
    await assert.rejects(
      ebayListingGraphql(
        config,
        't',
        'mutation X { ok }',
        {},
        async () => json({ data: { ok: true }, errors: [{ extensions: { code: errorCode } }] }),
        true,
      ),
      code('save_unconfirmed'),
    );
  }
});
test('GraphQL trennt fehlende Freigaben von nicht bestätigten Änderungen', async () => {
  await assert.rejects(
    ebayListingGraphql(
      config,
      't',
      'query X { ok }',
      {},
      async () => new Response(null, { status: 403 }),
    ),
    code('scope_missing'),
  );
  let calls = 0;
  await assert.rejects(
    ebayListingGraphql(
      config,
      't',
      'mutation X { ok }',
      {},
      async () => {
        calls++;
        throw new Error('lost');
      },
      true,
    ),
    code('save_unconfirmed'),
  );
  assert.equal(calls, 1);
});
test('Eigene GraphQL-Inserate behalten Beschreibung, Centbetrag, Bilder und Revision', async () => {
  const listing = await readModernEbayListing(config, 't', '123', async () =>
    json({ data: listingData() }),
  );
  assert.equal(listing.price, 29);
  assert.equal(listing.description, 'Wolle');
  assert.equal(listing.currency, 'EUR');
  assert.match(listing.revision, /^[a-f0-9]{64}$/);
  assert.equal(listing.marketplace, 'EBAY_DE');
});
test('Bereits vorhandene externe HTTPS-Bilder bleiben lesbar; neue fremde Bildadressen bleiben gesperrt', async () => {
  const data = listingData();
  data.sellerListings.listings[0]!.listing.sellerProduct.images[0]!.ebayImageUrl =
    'https://seller.example.test/photo.jpg';
  const listing = await readModernEbayListing(config, 't', '123', async () => json({ data }));
  assert.deepEqual(listing.imageUrls, ['https://seller.example.test/photo.jpg']);
  let calls = 0;
  await assert.rejects(
    reviseModernEbayListing(
      config,
      't',
      listing,
      {
        expectedRevision: listing.revision,
        imageUrls: ['https://other.example.test/photo.jpg'],
      },
      async () => {
        calls++;
        return json({});
      },
    ),
    code('invalid_request'),
  );
  assert.equal(calls, 0);
});
test('Ein fremdes oder nur teilweise lesbares Inserat ist nicht bearbeitbar', async () => {
  const data = listingData();
  data.sellerListings.listings[0]!.listingId = '456';
  await assert.rejects(
    readModernEbayListing(config, 't', '123', async () => json({ data })),
    code('listing_not_owned'),
  );
});
test('Veraltete Revision und Variantenpreis verhindern jeden Schreibaufruf', async () => {
  const listing = await readModernEbayListing(config, 't', '123', async () =>
    json({ data: listingData() }),
  );
  const noWrite: typeof fetch = () => {
    throw new Error('darf nicht aufgerufen werden');
  };
  await assert.rejects(
    reviseModernEbayListing(
      config,
      't',
      listing,
      { expectedRevision: 'b'.repeat(64), title: 'Neu' },
      noWrite,
    ),
    code('listing_changed'),
  );
  await assert.rejects(
    reviseModernEbayListing(
      config,
      't',
      { ...listing, hasVariations: true },
      { expectedRevision: listing.revision, price: 30 },
      noWrite,
    ),
    code('listing_not_editable'),
  );
});
test('Inseratprüfung ist VALIDATE, Veröffentlichung EXECUTE mit derselben festen Kennung', async () => {
  const modes: string[] = [],
    keys: string[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    const input = JSON.parse(String(init?.body)).variables.input;
    modes.push(input.options.operationMode);
    keys.push(input.idempotencyKey);
    assert.equal(input.listingItems.items[0].itemTerms.pricingTerms.fixedPrice, '29.00');
    assert.equal(
      input.listingTerms.fulfillmentTerms.shippingTerms.businessPolicy.businessPolicyId,
      '2',
    );
    return json({
      data: {
        createListing: {
          __typename:
            modes.length === 1 ? 'CreateListingValidationSuccess' : 'CreateListingSuccess',
          listing: { listingId: '123' },
          listingFees: [],
          warnings: [],
        },
      },
    });
  };
  assert.equal(
    (await createEbayListing(config, 't', validateEbayDraft(draft), false, fetcher)).listingId,
    null,
  );
  assert.equal((await createEbayListing(config, 't', draft, true, fetcher)).listingId, '123');
  assert.deepEqual(modes, ['VALIDATE', 'EXECUTE']);
  assert.deepEqual(keys, [draft.key, draft.key]);
});
test('Ungültige Mengen, Beträge, Kennungen und fremde Bildhosts werden vor eBay abgewiesen', () => {
  for (const change of [
    { quantity: 0 },
    { quantity: 1.5 },
    { price: 2.001 },
    { key: crypto.randomUUID() },
    { imageUrls: ['https://evil.test/a.jpg'] },
    { postalCode: 'abc' },
    { categoryId: '12 }' },
  ])
    assert.throws(() => validateEbayDraft({ ...draft, ...change }), code('invalid_request'));
});
test('Ergebnisabgleich sucht nur die feste SKU und veröffentlicht niemals', async () => {
  const result = await findCreatedEbayListing(config, 't', draft.key, async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    assert.ok(request.query.startsWith('query'));
    assert.deepEqual(request.variables.input.filters, { skus: [`flipbase-${draft.key}`] });
    return json({
      data: {
        sellerListingSearch: {
          activeListings: {
            __typename: 'SellerListings',
            listings: [{ listingId: '123' }],
            pagination: { totalElements: 1 },
          },
        },
      },
    });
  });
  assert.equal(result.listingId, '123');
});
test('Postfach trennt eBay/Mitglieder und baut Pagination aus Zahlen statt fremden URLs', async () => {
  const page = await readEbayInbox(config, 't', 'FROM_MEMBERS', 0, true, async (url) => {
    const target = new URL(String(url));
    assert.equal(target.searchParams.get('conversation_type'), 'FROM_MEMBERS');
    assert.equal(target.searchParams.get('conversation_status'), 'UNREAD');
    return json({
      conversations: [
        {
          conversationId: 'c1',
          conversationType: 'FROM_MEMBERS',
          conversationTitle: 'Schal',
          unreadCount: 1,
          latestMessage: providerMessage,
        },
      ],
      total: 2,
      next: 'https://evil.test/token',
    });
  });
  assert.equal(page.nextOffset, 1);
  assert.equal(page.conversations[0]?.latestMessage?.text, providerMessage.messageBody);
  assert.throws(() => requireConversationType('SYSTEM'), code('invalid_request'));
});
test('Mitgliederpostfach akzeptiert Gespräche ohne optionalen Anbietertitel', async () => {
  const page = await readEbayInbox(config, 't', 'FROM_MEMBERS', 0, false, async () =>
    json({
      conversations: [
        {
          conversationId: 'c1',
          conversationType: 'FROM_MEMBERS',
          unreadCount: 1,
          latestMessage: providerMessage,
        },
        {
          conversationId: 'c2',
          conversationType: 'FROM_MEMBERS',
          conversationTitle: 'Wollschal',
          unreadCount: 0,
          latestMessage: providerMessage,
        },
      ],
      total: 3,
    }),
  );
  assert.equal(page.conversations[0]?.title, 'Unterhaltung');
  assert.equal(page.conversations[1]?.title, 'Wollschal');
  assert.equal(page.conversations[0]?.latestMessage?.text, providerMessage.messageBody);
  assert.equal(page.nextOffset, 2);
  assert.equal(page.total, 3);
});
test('Vorhandene Postfachtitel mit falschem Datentyp bleiben ungültig', async () => {
  for (const conversationTitle of [null, 42, {}, []]) {
    await assert.rejects(
      readEbayInbox(config, 't', 'FROM_MEMBERS', 0, false, async () =>
        json({
          conversations: [
            {
              conversationId: 'c1',
              conversationType: 'FROM_MEMBERS',
              conversationTitle,
              unreadCount: 0,
              latestMessage: providerMessage,
            },
          ],
          total: 1,
        }),
      ),
      code('invalid_response'),
    );
  }
});
test('Leere Zwischenseiten und falscher Gesprächstyp sind keine erfolgreiche Abnahme', async () => {
  await assert.rejects(
    readEbayConversation(config, 't', 'c1', 'FROM_MEMBERS', 0, async () =>
      json({
        conversationType: 'FROM_MEMBERS',
        conversationTitle: 'Schal',
        messages: [],
        total: 1,
      }),
    ),
    code('invalid_response'),
  );
});
test('Leeres Postfach und opaque Gesprächskennungen folgen dem Anbieterformat', async () => {
  assert.equal(requireConversationId('v1|123:abc=='), 'v1|123:abc==');
  assert.throws(() => requireConversationId('c1\nheader'), code('invalid_request'));
  const page = await readEbayInbox(config, 't', 'FROM_MEMBERS', 0, false, async () =>
    json({ total: 0 }),
  );
  assert.deepEqual(page, { conversations: [], total: 0, nextOffset: null });
  await readEbayConversation(config, 't', 'v1|123:abc==', 'FROM_MEMBERS', 0, async (url) => {
    assert.equal(
      new URL(String(url)).pathname,
      '/commerce/message/v1/conversation/v1%7C123%3Aabc%3D%3D',
    );
    return json({
      conversationType: 'FROM_MEMBERS',
      conversationTitle: 'Schal',
      messages: [],
      total: 0,
    });
  });
});
test('Antwort adressiert nur das Gespräch und akzeptiert die dokumentierte Schreibweise der Sendebestätigung', async () => {
  const result = await sendEbayReply(config, 't', 'c1', 'Ja, ist noch da.', async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), {
      conversationId: 'c1',
      messageText: 'Ja, ist noch da.',
      emailCopyToSender: false,
    });
    return json(
      {
        ...providerMessage,
        senderUsername: undefined,
        recipientUsername: undefined,
        senderUserName: 'seller',
        recipientUserName: 'buyer',
        messageBody: 'Ja, ist noch da.',
      },
      201,
    );
  });
  assert.equal(result.message.sender, 'seller');
});
test('Unklarer Versand wird einmal versucht; überlange und leere Antworten gar nicht', async () => {
  let calls = 0;
  const lost: typeof fetch = async () => {
    calls++;
    throw new Error('lost');
  };
  await assert.rejects(
    sendEbayReply(config, 't', 'c1', 'Hallo', lost),
    code('message_send_unconfirmed'),
  );
  await assert.rejects(
    sendEbayReply(config, 't', 'c1', ' '.repeat(5), lost),
    code('invalid_request'),
  );
  await assert.rejects(
    sendEbayReply(config, 't', 'c1', 'x'.repeat(2001), lost),
    code('invalid_request'),
  );
  assert.equal(calls, 1);
});
