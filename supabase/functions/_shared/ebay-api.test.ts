import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  authorizationUrl,
  EBAY_SCOPES,
  parseListings,
  parseOrders,
  readOrders,
  readOrder,
  refreshTokens,
} from './ebay-api.ts';
import type { EbayConfig, EbayTokens } from './ebay-api.ts';
import { decryptTokens, encryptTokens, hashState } from './ebay-token-encryption.ts';
import { parseEbayXml } from './ebay-xml.ts';
import { deletionChallenge, verifyNotification } from './ebay-notifications.ts';
import { readEbayConfig } from './ebay-config.ts';

const config: EbayConfig = {
  clientId: 'app',
  clientSecret: 'secret',
  ruName: 'registered-name',
  environment: 'production',
  encryptionKey: btoa('12345678901234567890123456789012'),
  appUrl: 'https://app.example.test',
  allowedOrigins: ['https://app.example.test'],
};

test('single order reads encode the identifier and preserve import source details', async () => {
  const source = await readOrder(config, 'token', 'order/1', async (input) => {
    assert.equal(String(input), 'https://api.ebay.com/sell/fulfillment/v1/order/order%2F1');
    return Response.json({
      orderId: 'order/1',
      creationDate: '2026-10-01T00:00:00Z',
      orderPaymentStatus: 'PAID',
      cancelStatus: { cancelState: 'NONE_REQUESTED' },
      pricingSummary: {
        total: { value: '10', currency: 'EUR' },
        deliveryCost: { value: '0', currency: 'EUR' },
      },
      lineItems: [
        {
          lineItemId: 'line',
          legacyItemId: '123',
          quantity: 1,
          lineItemCost: { value: '10', currency: 'EUR' },
          refunds: [],
        },
      ],
    });
  });
  assert.equal(source.lines[0].lineItemId, 'line');
  assert.deepEqual(source.blockers, []);
  await assert.rejects(() =>
    readOrder(config, 'token', 'expected', async () => Response.json({ orderId: 'other' })),
  );
});

test('listing variations preserve stable IDs and never invent missing variation identifiers', () => {
  const result = parseListings(
    '<Response><Ack>Success</Ack><ActiveList><ItemArray><Item><ItemID>123</ItemID><Variations><Variation><VariationViewItemURL>https://www.ebay.de/itm/123?var=456</VariationViewItemURL><SKU>SIZE-38</SKU><Quantity>2</Quantity><SellingStatus><QuantitySold>1</QuantitySold></SellingStatus><VariationSpecifics><NameValueList><Name>Größe</Name><Value>38</Value></NameValueList></VariationSpecifics></Variation><Variation><SKU>SIZE-39</SKU></Variation></Variations></Item></ItemArray><PaginationResult><TotalNumberOfEntries>1</TotalNumberOfEntries><TotalNumberOfPages>1</TotalNumberOfPages></PaginationResult></ActiveList></Response>',
  );
  assert.equal(result.items[0].hasVariations, true);
  assert.equal(result.items[0].variants?.[0].id, '456');
  assert.equal(result.items[0].variants?.[0].quantity, 1);
  assert.deepEqual(result.items[0].variants?.[0].aspects, [{ name: 'Größe', value: '38' }]);
  assert.equal(result.items[0].variants?.[1].id, null);
});
test('Production-Consent verwendet RuName und genau die benötigten Scopes', () => {
  const url = new URL(authorizationUrl(config, 'state'));
  assert.equal(url.origin, 'https://auth.ebay.com');
  assert.equal(url.searchParams.get('redirect_uri'), 'registered-name');
  assert.equal(url.searchParams.get('scope'), EBAY_SCOPES.join(' '));
  assert.equal(url.searchParams.get('state'), 'state');
  assert.equal(
    new URL(authorizationUrl({ ...config, environment: 'sandbox' }, 'state')).hostname,
    'auth.sandbox.ebay.com',
  );
});
test('Tokens sind verschlüsselt und kryptografisch an ihre Verbindung gebunden', async () => {
  const tokens: EbayTokens = {
    accessToken: 'private-access',
    refreshToken: 'private-refresh',
    expiresAt: Date.now(),
    refreshExpiresAt: Date.now() + 100_000,
  };
  const encrypted = await encryptTokens(tokens, config.encryptionKey, 'connection-a');
  assert.equal(encrypted.includes('private'), false);
  assert.deepEqual(await decryptTokens(encrypted, config.encryptionKey, 'connection-a'), tokens);
  await assert.rejects(() => decryptTokens(encrypted, config.encryptionKey, 'connection-b'));
  await assert.rejects(() =>
    decryptTokens(encrypted.slice(0, -5), config.encryptionKey, 'connection-a'),
  );
  assert.equal((await hashState('state')).length, 64);
});
test('Refresh erhält den bestehenden Refresh Token und liest keine Browserwerte', async () => {
  const tokens: EbayTokens = {
    accessToken: 'old',
    refreshToken: 'refresh',
    expiresAt: 0,
    refreshExpiresAt: Date.now() + 100_000,
  };
  const refreshed = await refreshTokens(config, tokens, async (input, init) => {
    assert.equal(String(input), 'https://api.ebay.com/identity/v1/oauth2/token');
    const body = init && 'body' in init ? init.body : undefined;
    assert.equal(new URLSearchParams(String(body)).get('refresh_token'), 'refresh');
    return Response.json({ access_token: 'new', expires_in: 7200 });
  });
  assert.equal(refreshed.accessToken, 'new');
  assert.equal(refreshed.refreshToken, 'refresh');
  await assert.rejects(
    () =>
      refreshTokens(config, tokens, async () =>
        Response.json({ error: 'invalid_grant' }, { status: 400 }),
      ),
    { message: 'needs_login' },
  );
});
test('Trading liest aktive Auktionen und Festpreise ohne fremde XML-Entitäten', () => {
  const result = parseListings(
    `<GetMyeBaySellingResponse><Ack>Success</Ack><ActiveList><ItemArray><Item><ItemID>123</ItemID><Title>A &amp; B &#x1f600;</Title><ListingType>Chinese</ListingType><SellingStatus><CurrentPrice currencyID="EUR">0</CurrentPrice></SellingStatus><QuantityAvailable>2</QuantityAvailable></Item></ItemArray><PaginationResult><TotalNumberOfEntries>51</TotalNumberOfEntries><TotalNumberOfPages>2</TotalNumberOfPages></PaginationResult></ActiveList></GetMyeBaySellingResponse>`,
  );
  assert.equal(result.items[0].title, 'A & B 😀');
  assert.equal(result.items[0].price, 0);
  assert.equal(result.items[0].listingType, 'Chinese');
  assert.equal(result.pages, 2);
  assert.throws(() => parseEbayXml('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///secret">]><x>&y;</x>'));
  assert.throws(() => parseEbayXml('<x><y></x>'));
  assert.throws(
    () =>
      parseListings(
        '<Response><Ack>Failure</Ack><Errors><ErrorCode>931</ErrorCode></Errors></Response>',
      ),
    { message: 'needs_login' },
  );
  assert.throws(() => parseListings('<Response><Ack>Success</Ack></Response>'), {
    message: 'invalid_response',
  });
});
test('Bestellungen zeigen echte Nullwerte und Storno, ohne Käuferdaten weiterzureichen', async () => {
  const body = {
    total: 51,
    orders: [
      {
        orderId: 'order-a',
        creationDate: '2026-10-01T00:00:00Z',
        orderPaymentStatus: 'FULLY_REFUNDED',
        orderFulfillmentStatus: 'NOT_STARTED',
        buyer: { username: 'private-buyer' },
        cancelStatus: { cancelState: 'CANCELED' },
        pricingSummary: { total: { value: '0.00', currency: 'EUR' } },
        lineItems: [{ title: 'Artikel', quantity: 1 }],
      },
    ],
  };
  const result = await readOrders(config, 'token', 1, async (input) => {
    assert.match(String(input), /limit=50&offset=0$/);
    return Response.json(body);
  });
  assert.equal(result.items[0].total, 0);
  assert.equal(result.items[0].cancelStatus, 'CANCELED');
  assert.equal(JSON.stringify(result).includes('private-buyer'), false);
  assert.equal(result.nextPage, 2);
  const lastPage = await readOrders(config, 'token', 200, async () =>
    Response.json({ ...body, total: 10_001 }),
  );
  assert.equal(lastPage.nextPage, null);
  assert.throws(() => parseOrders({ total: 2 }), { message: 'invalid_response' });
});
test('Löschmeldungen prüfen echte ECC-Signaturen und den unveränderten JSON-Inhalt', () => {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const payload = JSON.stringify({
    metadata: { topic: 'MARKETPLACE_ACCOUNT_DELETION' },
    notification: { data: { userId: 'seller' } },
  });
  const signature = sign('sha1', Buffer.from(payload), keys.privateKey).toString('base64');
  const header = Buffer.from(JSON.stringify({ kid: 'key-a', signature })).toString('base64');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  assert.equal(verifyNotification(payload, header, publicKey), true);
  assert.equal(
    verifyNotification(payload, header, publicKey.replace(/\s/g, ' ').replace(/ +/g, ' ')),
    true,
  );
  assert.equal(verifyNotification(payload, header, publicKey.replace(/\r?\n/g, '')), true);
  assert.equal(verifyNotification(payload.replace('seller', 'other'), header, publicKey), false);
  assert.equal(verifyNotification(payload, 'invalid', publicKey), false);
  assert.equal(
    deletionChallenge('challenge', 'verification', 'https://endpoint.test'),
    '37c3e33fd1db05b7ca62c03aaa765d37d71a82ff23df3337c2be8638fc63643f',
  );
});
test('Unvollständige Konfiguration oder externe Rücksprungadressen bleiben ausgeschaltet', () => {
  const env: Record<string, string> = {
    EBAY_CLIENT_ID: 'app',
    EBAY_CLIENT_SECRET: 'secret',
    EBAY_REDIRECT_URI_NAME: 'runame',
    EBAY_TOKEN_ENCRYPTION_KEY: config.encryptionKey,
    EBAY_APP_URL: 'https://app.example.test',
    EBAY_DELETION_VERIFICATION_TOKEN: 'a'.repeat(32),
    EBAY_DELETION_ENDPOINT: 'https://db.example.test/functions/v1/ebay-account-deletion',
  };
  assert.equal(readEbayConfig((name) => env[name])?.environment, 'production');
  assert.equal(
    readEbayConfig((name) => (name === 'EBAY_TOKEN_ENCRYPTION_KEY' ? undefined : env[name])),
    null,
  );
  assert.equal(
    readEbayConfig((name) =>
      name === 'EBAY_APP_URL' ? 'https://user:pass@app.example.test' : env[name],
    ),
    null,
  );
});
