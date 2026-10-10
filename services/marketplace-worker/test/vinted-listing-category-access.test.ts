import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VintedListingCategoryAccess } from '../src/vinted-listing-category-access.ts';
import type { BrowserSessionScope } from '../src/marketplace-browser-session-broker.ts';

const scope: BrowserSessionScope = {
  workspaceId: '46600000-0000-4000-8000-000000000001',
  connectionId: '46600000-0000-4000-8000-000000000002',
  userId: '46600000-0000-4000-8000-000000000003',
  userAccessToken: 'user-token',
};
function fixture() {
  const seen: { url: URL; headers: Headers; method: string }[] = [];
  let account = '123';
  const request: typeof fetch = (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    seen.push({ url, headers, method: init?.method ?? 'GET' });
    const stamp = '2026-10-10T00:00:00Z';
    if (url.pathname.endsWith('/marketplace_connections'))
      return Promise.resolve(
        Response.json(
          url.searchParams.get('workspace_id') === `eq.${scope.workspaceId}` &&
            url.searchParams.get('id') === `eq.${scope.connectionId}`
            ? [{ external_account_id: account, status: 'connected', execution_mode: 'cloud' }]
            : [],
        ),
      );
    if (url.pathname.endsWith('/marketplace_account_entries'))
      return Promise.resolve(Response.json([{ external_id: account }]));
    if (url.pathname.endsWith('/vinted_category_syncs'))
      return Promise.resolve(Response.json([{ refreshed_at: stamp, category_count: 2 }]));
    if (url.pathname.endsWith('/vinted_categories')) {
      const id = Number(url.searchParams.get('id')?.slice(3));
      return Promise.resolve(
        Response.json([
          { id, parent_id: id === 1223 ? 5 : null, is_leaf: id === 1223, updated_at: stamp },
        ]),
      );
    }
    return Promise.reject(new Error('Unexpected request'));
  };
  return {
    access: new VintedListingCategoryAccess({
      url: 'https://database.example',
      publishableKey: 'public-key',
      serviceRoleKey: 'private-key',
      request,
    }),
    seen,
    changeAccount: () => {
      account = '124';
    },
  };
}
test('loads only the scoped cloud account and consistent category path with separate user and cache credentials', async () => {
  const f = fixture();
  let authorizations = 0;
  const target = await f.access.read(scope, 1223, () => {
    authorizations++;
    return Promise.resolve();
  });
  assert.deepEqual(target, { accountId: '123', categoryPath: [5] });
  assert.ok(authorizations > 3);
  assert.ok(f.seen.every((entry) => entry.method === 'GET'));
  for (const entry of f.seen) {
    const cache = entry.url.pathname.includes('/vinted_');
    assert.equal(entry.headers.get('apikey'), cache ? 'private-key' : 'public-key');
    assert.equal(
      entry.headers.get('Authorization'),
      cache ? 'Bearer private-key' : 'Bearer user-token',
    );
  }
  assert.doesNotMatch(JSON.stringify(target), /token|key|https/);
});
test('foreign workspace access or revoked authorization stops before category cache reads', async () => {
  for (const foreign of [true, false]) {
    const f = fixture();
    await assert.rejects(
      f.access.read(
        {
          ...scope,
          workspaceId: foreign ? '46600000-0000-4000-8000-000000000009' : scope.workspaceId,
        },
        1223,
        () => (foreign ? Promise.resolve() : Promise.reject(new Error('revoked'))),
      ),
    );
    assert.equal(f.seen.filter((entry) => entry.url.pathname.includes('/vinted_')).length, 0);
  }
});
test('changed account identity invalidates both the category target and later authorization checks', async () => {
  const f = fixture();
  await assert.rejects(
    f.access.read(scope, 1223, () => {
      if (f.seen.some((entry) => entry.url.pathname.endsWith('/vinted_categories')))
        f.changeAccount();
      return Promise.resolve();
    }),
  );
  await assert.rejects(f.access.authorize(scope, '123'));
});
