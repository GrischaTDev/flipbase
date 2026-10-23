// deno-lint-ignore-file require-await
import assert from 'node:assert/strict';
import {
  createEbayOrderObserverHandler,
  observerRetrySeconds,
  readObserverPage,
} from './handler.ts';
import type { ObserverClaim, ObserverStore } from './handler.ts';
import type { EbayConfig } from '../_shared/ebay-api.ts';
import { encryptTokens, decryptTokens } from '../_shared/ebay-token-encryption.ts';
Deno.test('Observer lehnt Browser und fehlende Dienstfreigabe ab', async () => {
  const handler = createEbayOrderObserverHandler(
    {
      claim: async () => {
        throw new Error('not called');
      },
      page: async () => true,
      delay: async () => {},
      finish: async () => true,
    },
    null,
    'service-secret',
    () => false,
  );
  assert.equal(
    (
      await handler(
        new Request('https://internal/ebay-order-observer', { method: 'POST', body: '{}' }),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await handler(
        new Request('https://internal/ebay-order-observer', {
          method: 'POST',
          headers: { Authorization: 'Bearer service-secret' },
          body: '{}',
        }),
      )
    ).status,
    503,
  );
});
const config: EbayConfig = {
  clientId: 'client',
  clientSecret: 'secret',
  ruName: 'redirect',
  environment: 'production',
  encryptionKey: btoa('a'.repeat(32)),
  appUrl: 'https://app.flipbase.de',
  allowedOrigins: ['https://app.flipbase.de'],
};
async function fixture() {
  const connection = {
    id: '47200000-0000-4000-8000-000000000501',
    workspace_id: '47200000-0000-4000-8000-000000000301',
    user_id: '47200000-0000-4000-8000-000000000102',
    environment: 'production' as const,
    external_account_id: 'seller',
    authorization_version: 1,
    operation_id: crypto.randomUUID(),
  };
  const claim: ObserverClaim = {
    connection: {
      connection,
      encryptedTokens: await encryptTokens(
        {
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresAt: Date.now() + 3600000,
          refreshExpiresAt: Date.now() + 86400000,
        },
        config.encryptionKey,
        connection.id,
      ),
    },
    scan: {
      id: 1,
      kind: 'orders',
      initial: true,
      from: '2026-10-01T00:00:00Z',
      to: '2026-10-13T12:00:00Z',
      offset: 0,
    },
  };
  const pages: { offset: number; complete: boolean }[] = [],
    delays: number[] = [],
    finishes: { needsLogin: boolean; observed: boolean; encrypted: string | null }[] = [];
  const store: ObserverStore = {
    claim: async () => claim,
    page: async (_claim, offset, _orders, complete) => {
      pages.push({ offset, complete });
      return true;
    },
    delay: async (_claim, seconds) => {
      delays.push(seconds);
    },
    finish: async (_claim, encrypted, needsLogin, observed) => {
      finishes.push({ needsLogin, observed, encrypted });
      return true;
    },
  };
  const request = () =>
    new Request('https://internal/ebay-order-observer', {
      method: 'POST',
      headers: { Authorization: 'Bearer service-secret' },
      body: '{}',
    });
  return { claim, pages, delays, finishes, store, request };
}
Deno.test('Productionkonfiguration liest niemals ein altes Sandboxkonto', async () => {
  const { claim, pages, finishes, store, request } = await fixture();
  claim.connection.connection.environment = 'sandbox';
  let providerCalls = 0;
  const handler = createEbayOrderObserverHandler(
    store,
    config,
    'service-secret',
    () => true,
    async () => {
      providerCalls++;
      return Response.json({ total: 0, orders: [] });
    },
  );
  assert.equal((await handler(request())).status, 503);
  assert.equal(providerCalls, 0);
  assert.equal(pages.length, 0);
  assert.equal(finishes[0]?.encrypted, null);
  assert.equal(finishes[0]?.needsLogin, false);
});
Deno.test(
  'Fuenf Seiten behalten dasselbe Fenster und geben ausschliesslich Kennungen weiter',
  async () => {
    const { claim, pages, finishes, store, request } = await fixture();
    let requests = 0;
    const handler = createEbayOrderObserverHandler(
      store,
      config,
      'service-secret',
      () => true,
      async (input, init) => {
        const url = new URL(String(input));
        assert.equal(url.origin, 'https://api.ebay.com');
        assert.equal(
          url.searchParams.get('filter'),
          'creationdate:[2026-10-01T00:00:00.000Z..2026-10-13T12:00:00.000Z]',
        );
        assert.equal(Number(url.searchParams.get('offset')), requests * 50);
        assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer access');
        return Response.json({
          total: 300,
          orders: Array.from({ length: 50 }, (_, index) => ({
            orderId: `order-${requests}-${index}`,
            creationDate: '2026-10-12T12:00:00Z',
            buyer: { private: 'never persisted' },
          })),
        });
      },
    );
    // Der Fetchzaehler wird fuer jedes gespeicherte Fenster weitergeschaltet.
    const original = store.page;
    store.page = async (...args) => {
      assert.deepEqual(Object.keys(args[2][0]).sort(), ['source', 'sourceKey']);
      assert.equal(JSON.stringify(args[2][0]).includes('never persisted'), false);
      requests++;
      return original(...args);
    };
    assert.equal((await handler(request())).status, 200);
    assert.equal(requests, 5);
    assert.deepEqual(
      pages.map((page) => page.offset),
      [0, 50, 100, 150, 200],
    );
    assert.equal(
      pages.every((page) => !page.complete),
      true,
    );
    assert.equal(finishes[0].observed, true);
    assert.equal(
      (
        await decryptTokens(
          finishes[0].encrypted ?? '',
          config.encryptionKey,
          claim.connection.connection.id,
        )
      ).accessToken,
      'access',
    );
  },
);
Deno.test('Teilfehler beendet Scan nicht und respectiert429 Retry-After', async () => {
  const { pages, delays, finishes, store, request } = await fixture();
  let calls = 0;
  const handler = createEbayOrderObserverHandler(
    store,
    config,
    'service-secret',
    () => true,
    async () =>
      ++calls === 1
        ? Response.json({
            total: 100,
            orders: Array.from({ length: 50 }, (_, index) => ({
              orderId: String(index),
              creationDate: '2026-10-12T12:00:00Z',
            })),
          })
        : new Response(null, { status: 429, headers: { 'Retry-After': '900' } }),
  );
  assert.equal((await handler(request())).status, 429);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].complete, false);
  assert.deepEqual(delays, [900]);
  assert.equal(finishes[0].needsLogin, false);
});
Deno.test('Belegte401 beendet Konto, Netzwerkfehler loest keine Reauth aus', async () => {
  for (const status of [401, 503]) {
    const { finishes, store, request } = await fixture();
    const handler = createEbayOrderObserverHandler(
      store,
      config,
      'service-secret',
      () => true,
      async () => new Response(null, { status }),
    );
    assert.equal((await handler(request())).status, 503);
    assert.equal(finishes[0].needsLogin, status === 401);
  }
});
Deno.test('Erholung refresht Tokens ausschliesslich im Funktionsdienst', async () => {
  const { claim, store, request, finishes } = await fixture();
  claim.connection.encryptedTokens = await encryptTokens(
    {
      accessToken: 'old',
      refreshToken: 'refresh',
      expiresAt: 0,
      refreshExpiresAt: Date.now() + 86400000,
    },
    config.encryptionKey,
    claim.connection.connection.id,
  );
  let refreshes = 0;
  const handler = createEbayOrderObserverHandler(
    store,
    config,
    'service-secret',
    () => true,
    async (input, init) => {
      if (String(input).includes('oauth2')) {
        refreshes++;
        assert.match(String(init?.body), /grant_type=refresh_token/u);
        return Response.json({ access_token: 'fresh', expires_in: 3600 });
      }
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer fresh');
      return Response.json({ total: 0, orders: [] });
    },
  );
  assert.equal((await handler(request())).status, 200);
  assert.equal(refreshes, 1);
  assert.equal(
    (
      await decryptTokens(
        finishes[0].encrypted ?? '',
        config.encryptionKey,
        claim.connection.connection.id,
      )
    ).accessToken,
    'fresh',
  );
});
Deno.test(
  'Unvollstaendige Seite und Order ausserhalb Scanfenster bleiben ungespeichert',
  async () => {
    const { claim } = await fixture();
    for (const body of [
      { total: 51, orders: [{ orderId: 'a', creationDate: '2026-10-12T12:00:00Z' }] },
      { total: 1, orders: [{ orderId: 'a', creationDate: '2026-09-01T00:00:00Z' }] },
    ])
      await assert.rejects(() =>
        readObserverPage(config, 'token', claim.scan, 0, async () => Response.json(body)),
      );
  },
);
Deno.test('Anbieterwartezeiten sind begrenzt und HTTP-Datum ist erlaubt', () => {
  assert.equal(observerRetrySeconds('900'), 900);
  assert.equal(observerRetrySeconds('invalid'), 300);
  assert.equal(observerRetrySeconds('9999999'), 86400);
  assert.equal(observerRetrySeconds('Thu, 01 Jan 1970 00:10:00 GMT', 0), 600);
});

Deno.test('Ältere Bestellung bleibt bei neuer Änderungszeit im Folgefenster', async () => {
  const { claim } = await fixture();
  claim.scan = { ...claim.scan, initial: false };
  const result = await readObserverPage(config, 'token', claim.scan, 0, async (input) => {
    assert.equal(
      new URL(String(input)).searchParams.get('filter'),
      'lastmodifieddate:[2026-10-01T00:00:00.000Z..2026-10-13T12:00:00.000Z]',
    );
    return Response.json({
      total: 1,
      orders: [
        {
          orderId: 'old-paid-now',
          creationDate: '2026-07-01T12:00:00Z',
          lastModifiedDate: '2026-10-12T12:00:00Z',
          totalMarketplaceFee: { value: '2.50', currency: 'EUR' },
          pricingSummary: { total: { value: '10', currency: 'EUR' } },
        },
      ],
    });
  });
  assert.equal(result.orders[0].platformFeeCents, 250);
  assert.equal(result.complete, true);
});

Deno.test('Inseratgrenze bestätigt niemals einen vollständigen Durchlauf', async () => {
  const { claim, pages, finishes, store, request } = await fixture();
  claim.scan = { ...claim.scan, kind: 'listings', offset: 24800 };
  const handler = createEbayOrderObserverHandler(
    store,
    config,
    'service-secret',
    () => true,
    async () =>
      new Response(
        '<GetMyeBaySellingResponse><Ack>Success</Ack><ActiveList><PaginationResult><TotalNumberOfEntries>25000</TotalNumberOfEntries><TotalNumberOfPages>125</TotalNumberOfPages></PaginationResult><ItemArray></ItemArray></ActiveList></GetMyeBaySellingResponse>',
      ),
  );
  assert.equal((await handler(request())).status, 503);
  assert.equal(pages.length, 0);
  assert.equal(finishes[0].observed, false);
});

Deno.test(
  'Vollständiger Inseratdurchlauf speichert normalisierte Bilder ohne Einzelabrufe',
  async () => {
    const { claim, pages, store, request } = await fixture();
    claim.scan = { ...claim.scan, kind: 'listings' };
    let calls = 0;
    const save = store.page;
    store.page = async (...args) => {
      const listing = args[2][0];
      assert.ok('imageUrl' in listing);
      assert.equal(listing.imageUrl, 'https://i.ebayimg.com/a.jpg');
      assert.equal(args[4], 1);
      return save(...args);
    };
    const handler = createEbayOrderObserverHandler(
      store,
      config,
      'service-secret',
      () => true,
      async (_input, init) => {
        calls++;
        assert.equal(new Headers(init?.headers).get('X-EBAY-API-CALL-NAME'), 'GetMyeBaySelling');
        return new Response(
          '<GetMyeBaySellingResponse><Ack>Success</Ack><ActiveList><PaginationResult><TotalNumberOfEntries>1</TotalNumberOfEntries><TotalNumberOfPages>1</TotalNumberOfPages></PaginationResult><ItemArray><Item><ItemID>123</ItemID><Title>Artikel</Title><PictureDetails><GalleryURL>https://i.ebayimg.com/a.jpg</GalleryURL></PictureDetails></Item></ItemArray></ActiveList></GetMyeBaySellingResponse>',
        );
      },
    );
    assert.equal((await handler(request())).status, 200);
    assert.equal(calls, 1);
    assert.equal(pages[0].complete, true);
  },
);
