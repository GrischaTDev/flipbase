import assert from 'node:assert/strict';
import {
  BRAND_CACHE_TTL_MS,
  BRAND_SEARCH_LIMIT_PER_MINUTE,
  createBrandSearchHandler,
  type BrandSearchDependencies,
} from './handler.ts';

function request(keyword: unknown, token = 'operator-token', workspaceId?: unknown): Request {
  return new Request('https://api.flipbase.de/functions/v1/vinted-brand-search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword, ...(workspaceId === undefined ? {} : { workspaceId }) }),
  });
}

function dependencies(overrides: Partial<BrandSearchDependencies> = {}): BrandSearchDependencies {
  return {
    authenticate: () => Promise.resolve({ id: 'operator' }),
    isOperator: () => Promise.resolve(true),
    canManageWorkspace: () => Promise.resolve(false),
    canUseFeed: () => Promise.resolve(false),
    isFeedEnabled: () => Promise.resolve(true),
    search: () => Promise.resolve([{ id: 53, name: 'Nike' }]),
    ...overrides,
  };
}

Deno.test('passes the search term to Vinted and returns selectable brands', async () => {
  let received = '';
  const handler = createBrandSearchHandler(
    dependencies({
      search: (keyword) => ((received = keyword), Promise.resolve([{ id: 53, name: 'Nike' }])),
    }),
  );
  const response = await handler(request(' Nike '));
  assert.equal(response.status, 200);
  assert.equal(received, 'Nike');
  assert.deepEqual(await response.json(), { brands: [{ id: 53, name: 'Nike' }] });
});

const workspaceId = '46600000-0000-4000-8000-000000000001';

Deno.test(
  'personal feed search uses member access and checks it again after provider lookup',
  async () => {
    const feedRequest = () =>
      new Request('https://api.flipbase.de/functions/v1/vinted-brand-search', {
        method: 'POST',
        headers: { Authorization: 'Bearer session' },
        body: JSON.stringify({ keyword: 'Ralph Lauren', workspaceId, purpose: 'feed' }),
      });
    const allowed = [true, true, true, false];
    const handler = createBrandSearchHandler(
      dependencies({
        isOperator: () => Promise.resolve(false),
        canManageWorkspace: () => Promise.resolve(false),
        canUseFeed: (_user, _token, scope) =>
          Promise.resolve(scope === workspaceId && allowed.shift() === true),
      }),
    );
    assert.equal((await handler(feedRequest())).status, 200);
    assert.equal((await handler(feedRequest())).status, 403);
  },
);
Deno.test(
  'listing search uses the exact workspace rights rather than operator fallback',
  async () => {
    const scopes: string[] = [];
    const handler = createBrandSearchHandler({
      ...dependencies({ isOperator: () => Promise.resolve(false) }),
      canManageWorkspace: (_user: string, _token: string, scope: string) => {
        scopes.push(scope);
        return Promise.resolve(true);
      },
    });
    assert.equal((await handler(request('Jako', 'token', workspaceId))).status, 200);
    assert.deepEqual(scopes, [workspaceId, workspaceId]);
  },
);

Deno.test(
  'listing search denies foreign or revoked workspace access even for an operator',
  async () => {
    for (const allowed of [[false], [true, false]]) {
      const expectedSearches = allowed[0] ? 1 : 0;
      let searches = 0;
      const handler = createBrandSearchHandler({
        ...dependencies({ search: () => (searches++, Promise.resolve([])) }),
        canManageWorkspace: () => Promise.resolve(allowed.shift() === true),
      });
      const response = await handler(request('Jako', 'token', workspaceId));
      assert.equal(response.status, 403);
      assert.equal(searches, expectedSearches);
      assert.deepEqual(await response.json(), { error: 'forbidden' });
    }
  },
);

Deno.test('invalid listing workspace cannot fall back to operator search', async () => {
  let searches = 0;
  const handler = createBrandSearchHandler({
    ...dependencies({ search: () => (searches++, Promise.resolve([])) }),
    canManageWorkspace: () => Promise.resolve(true),
  });
  for (const scope of [null, '', 'wrong', [workspaceId]])
    assert.equal((await handler(request('Jako', 'token', scope))).status, 400);
  assert.equal(searches, 0);
});

Deno.test('rejects non-operators without calling Vinted', async () => {
  let called = false;
  const handler = createBrandSearchHandler(
    dependencies({
      isOperator: () => Promise.resolve(false),
      search: () => {
        called = true;
        return Promise.resolve([]);
      },
    }),
  );
  const response = await handler(request('Nike'));
  assert.equal(response.status, 403);
  assert.equal(called, false);
});

Deno.test('rejects requests without an authenticated operator', async () => {
  let called = false;
  const handler = createBrandSearchHandler(
    dependencies({
      authenticate: () => Promise.resolve(null),
      search: () => {
        called = true;
        return Promise.resolve([]);
      },
    }),
  );
  const response = await handler(request('Nike'));
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

Deno.test('rejects browser requests from an unknown origin', async () => {
  const browserRequest = request('Nike');
  browserRequest.headers.set('Origin', 'https://untrusted.example');
  const response = await createBrandSearchHandler(dependencies())(browserRequest);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

Deno.test('rejects an overlong search term', async () => {
  const response = await createBrandSearchHandler(dependencies())(request('x'.repeat(101)));
  assert.equal(response.status, 400);
});

Deno.test('reports Vinted failures without exposing internal details', async () => {
  const response = await createBrandSearchHandler(
    dependencies({ search: () => Promise.reject(new Error('private provider detail')) }),
  )(request('Nike'));
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private provider detail/);
});

function feedRequest(keyword: string, withWorkspace = true): Request {
  return new Request('https://api.flipbase.de/functions/v1/vinted-brand-search', {
    method: 'POST',
    headers: { Authorization: 'Bearer session' },
    body: JSON.stringify({ keyword, purpose: 'feed', ...(withWorkspace ? { workspaceId } : {}) }),
  });
}

function feedDependencies(overrides: Partial<BrandSearchDependencies> = {}) {
  return dependencies({
    isOperator: () => Promise.resolve(false),
    canUseFeed: () => Promise.resolve(true),
    ...overrides,
  });
}

Deno.test('feed search answers 503 while the vinted_feed switch is off', async () => {
  let searches = 0;
  const handler = createBrandSearchHandler(
    feedDependencies({
      isFeedEnabled: () => Promise.resolve(false),
      search: () => (searches++, Promise.resolve([])),
    }),
  );
  const response = await handler(feedRequest('Nike'));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'feature_disabled' });
  assert.equal(searches, 0);
});

Deno.test('feed search without workspace is rejected before any lookup', async () => {
  let searches = 0;
  const handler = createBrandSearchHandler(
    feedDependencies({ search: () => (searches++, Promise.resolve([])) }),
  );
  const response = await handler(feedRequest('Nike', false));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'invalid_workspace' });
  assert.equal(searches, 0);
});

Deno.test('feed search with fewer than two characters does not call Vinted', async () => {
  let searches = 0;
  const handler = createBrandSearchHandler(
    feedDependencies({ search: () => (searches++, Promise.resolve([])) }),
  );
  const response = await handler(feedRequest(' N '));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { brands: [] });
  assert.equal(searches, 0);
});

Deno.test('limits searches per user and minute', async () => {
  let time = 1_000_000;
  const handler = createBrandSearchHandler(
    feedDependencies({ now: () => time, search: () => Promise.resolve([]) }),
  );
  for (let index = 0; index < BRAND_SEARCH_LIMIT_PER_MINUTE; index++)
    assert.equal((await handler(feedRequest(`Marke ${index}`))).status, 200);
  const limited = await handler(feedRequest('Noch eine'));
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: 'rate_limited' });
  time += 60_000;
  assert.equal((await handler(feedRequest('Wieder frei'))).status, 200);
});

Deno.test('caches results per normalized search term for a limited time', async () => {
  let time = 1_000_000;
  const received: string[] = [];
  const handler = createBrandSearchHandler(
    feedDependencies({
      now: () => time,
      search: (keyword) => (received.push(keyword), Promise.resolve([{ id: 88, name: 'Ralph' }])),
    }),
  );
  assert.equal((await handler(feedRequest('Ralph  Lauren'))).status, 200);
  const cached = await handler(feedRequest(' ralph lauren '));
  assert.deepEqual(await cached.json(), { brands: [{ id: 88, name: 'Ralph' }] });
  assert.deepEqual(received, ['Ralph  Lauren']);
  time += BRAND_CACHE_TTL_MS;
  await handler(feedRequest('Ralph Lauren'));
  assert.equal(received.length, 2);
});
