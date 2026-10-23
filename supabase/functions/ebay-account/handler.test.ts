import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEbayAccountHandler } from './handler.ts';
import type { EbayAccountStore, StoredEbayConnection } from './handler.ts';
import type { EbayConfig } from '../_shared/ebay-api.ts';
import { encryptTokens, hashState } from '../_shared/ebay-token-encryption.ts';
import { readEbayListingDetails } from '../_shared/ebay-listing-management.ts';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const connectionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const config: EbayConfig = {
  clientId: 'app',
  clientSecret: 'server-secret',
  ruName: 'runame',
  environment: 'production',
  encryptionKey: btoa('12345678901234567890123456789012'),
  appUrl: 'https://app.example.test',
  allowedOrigins: ['https://app.example.test'],
};
const connection: StoredEbayConnection = {
  id: connectionId,
  workspace_id: workspaceId,
  user_id: userId,
  environment: 'production',
  status: 'connected',
  username: 'seller',
  external_account_id: 'private-account',
  last_read_at: null,
  authorization_version: 1,
};
function store(overrides: Partial<EbayAccountStore> = {}): EbayAccountStore {
  return {
    authenticate: async (bearer) => (bearer === 'Bearer valid' ? userId : null),
    canConnect: async (_bearer, id) => id === workspaceId,
    status: async () => connection,
    begin: async () => connection,
    consume: async () => null,
    complete: async () => true,
    claim: async () => null,
    finish: async () => true,
    disconnect: async () => {},
    ...overrides,
  };
}
function request(action: string, extras: Record<string, unknown> = {}, bearer = 'Bearer valid') {
  return new Request('https://db.example.test/functions/v1/ebay-account', {
    method: 'POST',
    headers: { authorization: bearer, origin: config.appUrl },
    body: JSON.stringify({ action, workspaceId, ...extras }),
  });
}

test('Listen lesen gespeicherte Daten ohne Anbieterabruf oder Kontolease', async () => {
  const cached = {
    items: [
      {
        id: 'cached',
        title: 'Gespeichert',
        price: 10,
        currency: 'EUR',
        quantity: 1,
        listingType: null,
        url: null,
      },
    ],
    total: 1,
    nextPage: null,
    sync: { status: 'syncing' as const, lastCompletedAt: null, lastError: null },
  };
  const cacheStore = store({
    cacheRead: async (_bearer, scope, kind, page) => {
      assert.equal(scope.connectionId, connectionId);
      assert.equal(kind, 'orders');
      assert.equal(page, 1);
      return cached;
    },
    claim: async () => {
      throw new Error('Keine Lease beim Cachelesen');
    },
  });
  const handler = createEbayAccountHandler(cacheStore, config, config.allowedOrigins, async () => {
    throw new Error('Kein Anbieter beim Cachelesen');
  });
  const response = await handler(request('orders', { connectionId }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).items, cached.items);
});

test('Aktualisieren fordert nur einen gespeicherten Hintergrundabgleich an', async () => {
  let requested = false;
  const handler = createEbayAccountHandler(
    store({
      cacheRefresh: async (_bearer, scope, kind) => {
        requested = scope.connectionId === connectionId && kind === 'orders';
      },
    }),
    config,
    config.allowedOrigins,
    async () => {
      throw new Error('Keine direkte Anbieteranfrage');
    },
  );
  const response = await handler(request('refresh', { connectionId, kind: 'orders' }));
  assert.equal(response.status, 200);
  assert.equal(requested, true);
  assert.deepEqual(await response.json(), { requested: true, workspaceId, connectionId });
});

test('Dauerhafte Bestellungen bleiben auch jenseits des früheren Anbieter-Seitenlimits lesbar', async () => {
  const handler = createEbayAccountHandler(
    store({
      cacheRead: async (_bearer, _scope, _kind, page) => {
        assert.equal(page, 201);
        return { items: [], total: 10001, nextPage: null };
      },
    }),
    config,
    config.allowedOrigins,
  );
  assert.equal((await handler(request('orders', { connectionId, page: 201 }))).status, 200);
});
test('Neue eBay-Aktionen prüfen Berechtigung und Eingaben vor dem Anbieteraufruf', async () => {
  let calls = 0;
  const handler = createEbayAccountHandler(store(), config, config.allowedOrigins, async () => {
    calls++;
    return new Response();
  });
  assert.equal(
    (await handler(request('listing_detail', { connectionId, listingId: '123' }, 'Bearer forged')))
      .status,
    401,
  );
  assert.equal(
    (
      await handler(
        request('listing_update', {
          workspaceId: connectionId,
          connectionId,
          listingId: '123',
          update: { expectedRevision: 'a'.repeat(64), title: 'New' },
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handler(
        request('listing_update', {
          connectionId,
          listingId: '123',
          update: { expectedRevision: 'a'.repeat(64), quantity: 9 },
        }),
      )
    ).status,
    400,
  );
  assert.equal(calls, 0);
});

test('Konto-Traffic lehnt fremde Workspaces, Sitzungen und überlange Zeiträume vor dem Anbieter ab', async () => {
  let claims = 0;
  const handler = createEbayAccountHandler(
    store({
      claim: async () => {
        claims++;
        return null;
      },
    }),
    config,
    config.allowedOrigins,
  );
  for (const action of ['traffic_overview', 'listing_performance', 'advertising_report']) {
    assert.equal(
      (await handler(request(action, { connectionId, days: 30 }, 'Bearer forged'))).status,
      401,
    );
    assert.equal(
      (await handler(request(action, { connectionId, workspaceId: connectionId, days: 30 })))
        .status,
      403,
    );
    assert.equal((await handler(request(action, { connectionId, days: 365 }))).status, 400);
  }
  assert.equal(claims, 0);
});

test('Konto-Traffic nutzt die gesperrte persönliche Verbindung und verwirft überholte Antworten', async () => {
  const encryptedTokens = await encryptTokens(
    {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 100000,
      refreshExpiresAt: Date.now() + 1000000,
    },
    config.encryptionKey,
    connectionId,
  );
  let finished = 0;
  const fetcher: typeof fetch = async () =>
    Response.json({
      header: {
        dimensionKeys: [{ key: 'DAY' }],
        metrics: [
          'TOTAL_IMPRESSION_TOTAL',
          'LISTING_VIEWS_TOTAL',
          'LISTING_VIEWS_SOURCE_OFF_EBAY',
          'TRANSACTION',
          'LISTING_IMPRESSION_SEARCH_RESULTS_PAGE',
          'LISTING_VIEWS_SOURCE_SEARCH_RESULTS_PAGE',
          'CLICK_THROUGH_RATE',
          'SALES_CONVERSION_RATE',
        ].map((key) => ({ key })),
      },
      records: [],
    });
  const handler = createEbayAccountHandler(
    store({
      claim: async (user, workspace, id) => {
        assert.equal(user, userId);
        assert.equal(workspace, workspaceId);
        assert.equal(id, connectionId);
        return { connection, encryptedTokens };
      },
      finish: async () => {
        finished++;
        return true;
      },
    }),
    config,
    config.allowedOrigins,
    fetcher,
  );
  const response = await handler(request('traffic_overview', { connectionId, days: 7 }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.workspaceId, workspaceId);
  assert.equal(body.connectionId, connectionId);
  assert.equal(body.days.length, 7);
  assert.equal(finished, 1);
  const changed = createEbayAccountHandler(
    store({ claim: async () => ({ connection, encryptedTokens }), finish: async () => false }),
    config,
    config.allowedOrigins,
    fetcher,
  );
  assert.equal((await changed(request('traffic_overview', { connectionId, days: 7 }))).status, 409);
});
test('Artikel- und Werbeberichte behalten Kontobindung und verwerfen Antworten nach Verbindungswechsel', async () => {
  const encryptedTokens = await encryptTokens(
    {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 100000,
      refreshExpiresAt: Date.now() + 1000000,
    },
    config.encryptionKey,
    connectionId,
  );
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('api.dll'))
      return new Response(
        '<GetMyeBaySellingResponse><Ack>Success</Ack><ActiveList><PaginationResult><TotalNumberOfEntries>0</TotalNumberOfEntries><TotalNumberOfPages>0</TotalNumberOfPages></PaginationResult></ActiveList></GetMyeBaySellingResponse>',
      );
    if (url.pathname.endsWith('ad_report_task')) {
      if (init?.method === 'POST')
        return new Response(null, { status: 202, headers: { location: `${url.href}/123` } });
      return Response.json({ reportTasks: [] });
    }
    return Response.json({
      header: {
        dimensionKeys: [{ key: 'listing' }],
        metrics: [
          'TOTAL_IMPRESSION_TOTAL',
          'LISTING_VIEWS_TOTAL',
          'LISTING_VIEWS_SOURCE_OFF_EBAY',
          'TRANSACTION',
          'LISTING_IMPRESSION_SEARCH_RESULTS_PAGE',
          'LISTING_VIEWS_SOURCE_SEARCH_RESULTS_PAGE',
          'CLICK_THROUGH_RATE',
          'SALES_CONVERSION_RATE',
        ].map((key) => ({ key })),
      },
      records: [],
    });
  };
  for (const action of ['listing_performance', 'advertising_report']) {
    for (const canFinish of [true, false]) {
      const handler = createEbayAccountHandler(
        store({
          claim: async (user, workspace, id) => {
            assert.equal(user, userId);
            assert.equal(workspace, workspaceId);
            assert.equal(id, connectionId);
            return { connection, encryptedTokens };
          },
          finish: async () => canFinish,
        }),
        config,
        config.allowedOrigins,
        fetcher,
      );
      const response = await handler(request(action, { connectionId, days: 7 }));
      assert.equal(response.status, canFinish ? 200 : 409);
      if (canFinish) {
        const body = await response.json();
        assert.equal(body.connectionId, connectionId);
        assert.equal(body.workspaceId, workspaceId);
        assert.deepEqual(body.items, []);
      }
    }
  }
});
test('Eine zwischenzeitlich erneuerte Freigabe stoppt die Änderung vor dem Schreiben', async () => {
  const item =
    '<GetItemResponse><Ack>Success</Ack><Item><ItemID>123</ItemID><Seller><UserID>seller</UserID></Seller><Title>Original</Title><Description>Text</Description><ListingType>FixedPriceItem</ListingType><SellingStatus><ListingStatus>Active</ListingStatus><CurrentPrice currencyID="EUR">10</CurrentPrice></SellingStatus><PictureDetails><PictureURL>https://i.ebayimg.com/photo.jpg</PictureURL></PictureDetails></Item></GetItemResponse>';
  const listing = await readEbayListingDetails(
    config,
    'token',
    '123',
    'seller',
    async () => new Response(item),
  );
  const encryptedTokens = await encryptTokens(
    {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 100000,
      refreshExpiresAt: Date.now() + 1000000,
    },
    config.encryptionKey,
    connectionId,
  );
  const calls: string[] = [];
  const handler = createEbayAccountHandler(
    store({
      claim: async () => ({ connection, encryptedTokens }),
      status: async () => ({ ...connection, authorization_version: 2 }),
    }),
    config,
    config.allowedOrigins,
    async (_url, init) => {
      calls.push(new Headers(init?.headers).get('X-EBAY-API-CALL-NAME') ?? '');
      return new Response(item);
    },
  );
  const result = await handler(
    request('listing_update', {
      connectionId,
      listingId: '123',
      update: { expectedRevision: listing.revision, title: 'New' },
    }),
  );
  assert.equal(result.status, 409);
  assert.deepEqual(calls, ['GetItem']);
});
test('Überlange Bildanfragen werden vor dem Multipart-Parser abgewiesen', async () => {
  const handler = createEbayAccountHandler(store(), config, config.allowedOrigins);
  const oversized = new Request('https://db.example.test/functions/v1/ebay-account', {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid',
      'content-type': 'multipart/form-data; boundary=x',
      'content-length': String(14 * 1024 * 1024),
    },
    body: '--x--',
  });
  assert.equal((await handler(oversized)).status, 400);
});
test('Ein Multipart-Bild wird dem bestätigten eigenen Konto zugeordnet und erst dann hochgeladen', async () => {
  const encryptedTokens = await encryptTokens(
    {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 100000,
      refreshExpiresAt: Date.now() + 1000000,
    },
    config.encryptionKey,
    connectionId,
  );
  const form = new FormData();
  form.set('workspaceId', workspaceId);
  form.set('connectionId', connectionId);
  form.set('listingId', '123');
  form.set('image', new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }));
  const calls: string[] = [];
  const handler = createEbayAccountHandler(
    store({ claim: async () => ({ connection, encryptedTokens }) }),
    config,
    config.allowedOrigins,
    async (url) => {
      calls.push(String(url));
      if (String(url).endsWith('/ws/api.dll'))
        return new Response(
          '<GetItemResponse><Ack>Success</Ack><Item><ItemID>123</ItemID><Seller><UserID>seller</UserID></Seller><Title>Original</Title><Description>Text</Description><ListingType>FixedPriceItem</ListingType><SellingStatus><ListingStatus>Active</ListingStatus></SellingStatus></Item></GetItemResponse>',
        );
      return Response.json({ imageUrl: 'https://i.ebayimg.com/upload.jpg' }, { status: 201 });
    },
  );
  const response = await handler(
    new Request('https://db.example.test/functions/v1/ebay-account', {
      method: 'POST',
      headers: { authorization: 'Bearer valid' },
      body: form,
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    imageUrl: 'https://i.ebayimg.com/upload.jpg',
    workspaceId,
    connectionId,
  });
  assert.equal(calls.length, 2);
  assert.match(calls[1], /create_image_from_file$/);
});
test('Gefälschte Sitzungen und fremde Workspaces erreichen keinen Dienstzugriff', async () => {
  let begins = 0;
  const handler = createEbayAccountHandler(
    store({
      begin: async () => {
        begins++;
        return connection;
      },
    }),
    config,
    config.allowedOrigins,
  );
  assert.equal((await handler(request('connect', {}, 'Bearer forged'))).status, 401);
  assert.equal((await handler(request('connect', { workspaceId: connectionId }))).status, 403);
  assert.equal(begins, 0);
  const result = await handler(request('status'));
  const text = await result.text();
  assert.equal(text.includes('authorization_version'), false);
  assert.equal(text.includes('server-secret'), false);
  assert.equal(text.includes(userId), false);
});
test('Consent bindet den bestätigten Nutzer und speichert nur den Hash', async () => {
  let storedHash = '';
  const handler = createEbayAccountHandler(
    store({
      begin: async (user, workspace, environment, hash) => {
        assert.equal(user, userId);
        assert.equal(workspace, workspaceId);
        assert.equal(environment, 'production');
        storedHash = hash;
        return connection;
      },
    }),
    config,
    config.allowedOrigins,
  );
  const response = await handler(request('connect', { userId: 'forged' }));
  const body = await response.json();
  const state = new URL(body.authorizationUrl).searchParams.get('state');
  assert.equal(typeof state, 'string');
  assert.ok(state);
  assert.notEqual(state, storedHash);
  assert.equal(await hashState(state), storedHash);
});
test('Einmaliger Callback funktioniert ohne Flipbase-Bearer und lehnt Wiederholung ab', async () => {
  let consumed = false;
  let completed = 0;
  const handler = createEbayAccountHandler(
    store({
      consume: async () => {
        if (consumed) return null;
        consumed = true;
        return { ...connection, status: 'needs_login' };
      },
      complete: async (_connection, id, _username, encrypted) => {
        assert.equal(id, 'external-id');
        assert.equal(encrypted.includes('private'), false);
        completed++;
        return true;
      },
    }),
    config,
    config.allowedOrigins,
    async (input) =>
      String(input).includes('/oauth2/token')
        ? Response.json({
            access_token: 'private-access',
            refresh_token: 'private-refresh',
            expires_in: 7200,
            refresh_token_expires_in: 100000,
          })
        : Response.json({ userId: 'external-id', username: 'seller' }),
  );
  const callback = () =>
    new Request(
      `https://db.example.test/functions/v1/ebay-account/callback?state=${'a'.repeat(64)}&code=private-code`,
    );
  const response = await handler(callback());
  assert.equal(response.status, 303);
  assert.equal(
    new URL(response.headers.get('location') ?? '').searchParams.get('ebay_result'),
    'connected',
  );
  assert.equal(response.headers.get('location')?.includes('private'), false);
  assert.equal(
    new URL((await handler(callback())).headers.get('location') ?? '').searchParams.get(
      'ebay_result',
    ),
    'failed',
  );
  assert.equal(completed, 1);
});
test('Trennen während eines Detailabrufs verwirft auch eine erfolgreiche eBay-Antwort', async () => {
  const encryptedTokens = await encryptTokens(
    {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 100000,
      refreshExpiresAt: Date.now() + 1000000,
    },
    config.encryptionKey,
    connectionId,
  );
  const handler = createEbayAccountHandler(
    store({
      claim: async (user, workspace, id) => {
        assert.equal(user, userId);
        assert.equal(workspace, workspaceId);
        assert.equal(id, connectionId);
        return { connection, encryptedTokens };
      },
      finish: async () => false,
    }),
    config,
    config.allowedOrigins,
    async () =>
      new Response(
        '<GetItemResponse><Ack>Success</Ack><Item><ItemID>123</ItemID><Seller><UserID>seller</UserID></Seller><Title>Privater Artikel</Title><ListingType>FixedPriceItem</ListingType><SellingStatus><ListingStatus>Active</ListingStatus><CurrentPrice currencyID="EUR">10</CurrentPrice></SellingStatus></Item></GetItemResponse>',
      ),
  );
  const response = await handler(request('listing_detail', { connectionId, listingId: '123' }));
  assert.equal(response.status, 409);
  assert.equal((await response.text()).includes('Privater Artikel'), false);
});
test('Widerruf löscht Tokenzugriff und liefert einen erneuten Anmeldestatus', async () => {
  const encryptedTokens = await encryptTokens(
    {
      accessToken: 'expired',
      refreshToken: 'revoked',
      expiresAt: 0,
      refreshExpiresAt: Date.now() + 1000000,
    },
    config.encryptionKey,
    connectionId,
  );
  let lockedOut = false;
  const handler = createEbayAccountHandler(
    store({
      claim: async () => ({ connection, encryptedTokens }),
      finish: async (_connection, _id, _tokens, needsLogin, observed) => {
        lockedOut = needsLogin;
        assert.equal(observed, false);
        return true;
      },
    }),
    config,
    config.allowedOrigins,
    async () => Response.json({ error: 'invalid_grant' }, { status: 400 }),
  );
  const response = await handler(request('listing_detail', { connectionId, listingId: '123' }));
  assert.equal(lockedOut, true);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'needs_login' });
});
test('Unkonfigurierte App bleibt sichtbar ausgeschaltet und Seitenparameter sind begrenzt', async () => {
  const handler = createEbayAccountHandler(store(), null, config.allowedOrigins);
  assert.equal((await (await handler(request('status'))).json()).configured, false);
  assert.equal((await handler(request('connect'))).status, 503);
  const enabled = createEbayAccountHandler(store(), config, config.allowedOrigins);
  assert.equal((await enabled(request('orders', { connectionId, page: 100001 }))).status, 400);
  assert.equal((await enabled(request('listings', { connectionId, page: 0 }))).status, 400);
});
