import assert from 'node:assert/strict';
import { createBrandSearchHandler, type BrandSearchDependencies } from './handler.ts';

function request(keyword: unknown, token = 'operator-token'): Request {
  return new Request('https://api.flipbase.de/functions/v1/vinted-brand-search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword }),
  });
}

function dependencies(overrides: Partial<BrandSearchDependencies> = {}): BrandSearchDependencies {
  return {
    authenticate: async () => ({ id: 'operator' }),
    isOperator: async () => true,
    search: async () => [{ id: 53, name: 'Nike' }],
    ...overrides,
  };
}

Deno.test('passes the search term to Vinted and returns selectable brands', async () => {
  let received = '';
  const handler = createBrandSearchHandler(
    dependencies({ search: async (keyword) => ((received = keyword), [{ id: 53, name: 'Nike' }]) }),
  );
  const response = await handler(request(' Nike '));
  assert.equal(response.status, 200);
  assert.equal(received, 'Nike');
  assert.deepEqual(await response.json(), { brands: [{ id: 53, name: 'Nike' }] });
});

Deno.test('rejects non-operators without calling Vinted', async () => {
  let called = false;
  const handler = createBrandSearchHandler(
    dependencies({
      isOperator: async () => false,
      search: async () => {
        called = true;
        return [];
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
      authenticate: async () => null,
      search: async () => {
        called = true;
        return [];
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
    dependencies({ search: async () => Promise.reject(new Error('private provider detail')) }),
  )(request('Nike'));
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private provider detail/);
});
