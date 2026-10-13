import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseListings, refreshTokens } from './ebay-api.ts';
import type { EbayConfig } from './ebay-api.ts';
import {
  readEbayListingDetails,
  reviseEbayListing,
  validateEbayUpdate,
  uploadEbayImage,
  parseEbayTraffic,
  readEbayTraffic,
} from './ebay-listing-management.ts';

const config: EbayConfig = {
  clientId: 'app',
  clientSecret: 'secret',
  ruName: 'callback',
  environment: 'production',
  encryptionKey: btoa('12345678901234567890123456789012'),
  appUrl: 'https://app.example.test',
  allowedOrigins: [],
};
const itemXml =
  '<GetItemResponse><Ack>Success</Ack><Item><ItemID>123</ItemID><Title>My title</Title><Description><![CDATA[<p>My text & photos</p>]]></Description><Seller><UserID>seller</UserID></Seller><ListingType>FixedPriceItem</ListingType><Quantity>2</Quantity><SellingStatus><ListingStatus>Active</ListingStatus><CurrentPrice currencyID="EUR">10</CurrentPrice></SellingStatus><PictureDetails><PictureURL>https://i.ebayimg.com/photo.jpg</PictureURL></PictureDetails><WatchCount>0</WatchCount></Item></GetItemResponse>';
const details = () =>
  readEbayListingDetails(config, 'token', '123', 'seller', async () => new Response(itemXml));

test('Galeriebild und echte Null-Beobachter bleiben in der Angebotsliste erhalten', () => {
  const result = parseListings(
    '<GetMyeBaySellingResponse><Ack>Success</Ack><ActiveList><PaginationResult><TotalNumberOfEntries>1</TotalNumberOfEntries><TotalNumberOfPages>1</TotalNumberOfPages></PaginationResult><ItemArray><Item><ItemID>123</ItemID><PictureDetails><GalleryURL>https://i.ebayimg.com/photo.jpg</GalleryURL></PictureDetails><WatchCount>0</WatchCount></Item></ItemArray></ActiveList></GetMyeBaySellingResponse>',
  );
  assert.equal(result.items[0].imageUrl, 'https://i.ebayimg.com/photo.jpg');
  assert.equal(result.items[0].watchCount, 0);
});
test('Detailabruf erhält HTML und verweigert fremde Angebote', async () => {
  const listing = await details();
  assert.equal(listing.description, '<p>My text & photos</p>');
  assert.equal(listing.revision.length, 64);
  await assert.rejects(
    readEbayListingDetails(config, 'token', '123', 'other', async () => new Response(itemXml)),
    { code: 'listing_not_owned' },
  );
});
test('Veraltete Änderungen lösen keinen Schreibaufruf aus', async () => {
  const listing = await details();
  let calls = 0;
  await assert.rejects(
    reviseEbayListing(
      config,
      'token',
      listing,
      { expectedRevision: 'a'.repeat(64), title: 'New title' },
      async () => {
        calls++;
        return new Response();
      },
    ),
    { code: 'listing_changed' },
  );
  assert.equal(calls, 0);
});
test('Gezielte Änderung codiert XML und überträgt keine unbeabsichtigten Felder', async () => {
  const listing = await details();
  const update = validateEbayUpdate({ expectedRevision: listing.revision, title: 'New & <title>' });
  const result = await reviseEbayListing(config, 'token', listing, update, async (_url, init) => {
    assert.equal(new Headers(init?.headers).get('X-EBAY-API-CALL-NAME'), 'ReviseFixedPriceItem');
    assert.match(String(init?.body), /New &amp; &lt;title&gt;/);
    assert.doesNotMatch(String(init?.body), /StartPrice|Description|PictureDetails/);
    return new Response(
      '<ReviseFixedPriceItemResponse><Ack>Warning</Ack><ItemID>123</ItemID></ReviseFixedPriceItemResponse>',
    );
  });
  assert.equal(result.ok, true);
  assert.ok(result.warning);
});
test('Unklare Speicherantwort und bestätigte Ablehnung sind unterschiedliche Zustände', async () => {
  const listing = await details(),
    update = { expectedRevision: listing.revision, price: 12 };
  await assert.rejects(
    reviseEbayListing(config, 'token', listing, update, async () => {
      throw new Error('Timeout');
    }),
    { code: 'save_unconfirmed' },
  );
  await assert.rejects(
    reviseEbayListing(
      config,
      'token',
      listing,
      update,
      async () => new Response('<Response><Ack>Failure</Ack></Response>'),
    ),
    { code: 'revision_rejected' },
  );
});
test('Variantenpreise werden nicht als gemeinsamer Angebotspreis überschrieben', async () => {
  const listing = await details();
  await assert.rejects(
    reviseEbayListing(
      config,
      'token',
      { ...listing, hasVariations: true },
      { expectedRevision: listing.revision, price: 20 },
    ),
    { code: 'listing_not_editable' },
  );
});
test('Validierung blockiert fremde Felder, ungültige Preise und fehlende Bilder', () => {
  const revision = 'a'.repeat(64);
  for (const update of [
    { price: 1.234 },
    { price: 0 },
    { imageUrls: [] },
    { imageUrls: ['http://i.ebayimg.com/x'] },
    { quantity: 9 },
    { title: 'a'.repeat(81) },
  ])
    assert.throws(() => validateEbayUpdate({ expectedRevision: revision, ...update }), {
      code: 'invalid_request',
    });
});
test('Bilddateien verwenden die aktuelle Media API mit Multipart', async () => {
  const url = await uploadEbayImage(
    config,
    'token',
    new File(['picture'], 'photo.jpg', { type: 'image/jpeg' }),
    async (input, init) => {
      assert.equal(
        String(input),
        'https://apim.ebay.com/commerce/media/v1_beta/image/create_image_from_file',
      );
      assert.ok(init?.body instanceof FormData);
      assert.equal((init.body.get('image') as File).name, 'photo.jpg');
      assert.equal(new Headers(init.headers).has('Content-Type'), false);
      return Response.json({ imageUrl: 'https://i.ebayimg.com/upload.jpg' }, { status: 201 });
    },
  );
  assert.equal(url, 'https://i.ebayimg.com/upload.jpg');
});
test('Fremde Location-Hosts erhalten niemals das eBay-Nutzertoken', async () => {
  let calls = 0;
  await assert.rejects(
    uploadEbayImage(
      config,
      'token',
      new File(['picture'], 'photo.png', { type: 'image/png' }),
      async () => {
        calls++;
        return Response.json(
          {},
          { status: 201, headers: { location: 'https://attacker.test/image' } },
        );
      },
    ),
    { code: 'invalid_response' },
  );
  assert.equal(calls, 1);
});
const report = {
  header: {
    dimensionKeys: [{ key: 'LISTING' }],
    metrics: [
      { key: 'SALES_CONVERSION_RATE' },
      { key: 'TRANSACTION' },
      { key: 'LISTING_VIEWS_TOTAL' },
    ],
  },
  records: [
    {
      dimensionValues: [{ value: '123', applicable: true }],
      metricValues: [
        { value: 0.125, applicable: true },
        { value: 1, applicable: true },
        { value: 8, applicable: true },
      ],
    },
  ],
};
test('Statistiken folgen den Header-Schlüsseln und erfinden bei Lücken keine Nullwerte', () => {
  const result = parseEbayTraffic(report, ['123', '456']);
  assert.deepEqual(result[0], {
    listingId: '123',
    views: 8,
    transactions: 1,
    conversionRate: 0.125,
  });
  assert.deepEqual(result[1], {
    listingId: '456',
    views: null,
    transactions: null,
    conversionRate: null,
  });
  assert.throws(() => parseEbayTraffic(report, ['456']), { code: 'invalid_response' });
});
test('Der Angebotsbericht verwendet seine einzige Dimension ohne erfundenes Schlüssel-Enum', () => {
  const response = {
    ...report,
    header: { ...report.header, dimensionKeys: [{ key: 'listingId' }] },
  };
  assert.equal(parseEbayTraffic(response, ['123'])[0].views, 8);
  assert.throws(() => parseEbayTraffic(response, ['456']), { code: 'invalid_response' });
  assert.throws(
    () =>
      parseEbayTraffic({ ...response, header: { ...response.header, dimensionKeys: [] } }, ['123']),
    { code: 'invalid_response' },
  );
  assert.throws(
    () =>
      parseEbayTraffic(
        {
          ...response,
          records: [
            { ...report.records[0], dimensionValues: [{ value: '123' }, { value: '456' }] },
          ],
        },
        ['123'],
      ),
    { code: 'invalid_response' },
  );
});
test('Statistikabfrage bindet IDs, deutschen Marktplatz und ausdrücklich UTC', async () => {
  const result = await readEbayTraffic(config, 'token', ['123'], async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('dimension'), 'LISTING');
    assert.match(
      url.searchParams.get('filter') ?? '',
      /listing_ids:\{123\},marketplace_ids:\{EBAY_DE\},date_range:\[.*\+00:00/,
    );
    return Response.json(report);
  });
  assert.equal((Date.parse(result.endDate) - Date.parse(result.startDate)) / 86400000, 29);
});
test('Tokenrefresh fordert bei bestehenden Verbindungen keine nachträglich hinzugefügten Rechte an', async () => {
  await refreshTokens(
    config,
    {
      accessToken: 'old',
      refreshToken: 'refresh',
      expiresAt: 0,
      refreshExpiresAt: Date.now() + 100000,
    },
    async (_url, init) => {
      assert.equal(new URLSearchParams(String(init?.body)).has('scope'), false);
      return Response.json({ access_token: 'new', expires_in: 7200 });
    },
  );
});
