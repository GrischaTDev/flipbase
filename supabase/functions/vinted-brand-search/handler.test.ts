import assert from 'node:assert/strict';
import { createBrandSearchHandler, type BrandSearchDependencies } from './handler.ts';

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
