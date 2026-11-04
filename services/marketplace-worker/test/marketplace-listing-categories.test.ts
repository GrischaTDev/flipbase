import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadMarketplaceListingCategoryPath } from '../src/marketplace-listing-category.ts';
import { SupabaseMarketplaceListingStore } from '../src/supabase-marketplace-listing-store.ts';
import { listingClaimFixture } from './fixtures/marketplace-listing-claim.ts';
const account = { ...listingClaimFixture.scope, accountId: listingClaimFixture.accountId };
const categories = [
  { id: 5, parentId: null, title: 'Herren', path: 'Herren', isLeaf: false },
  { id: 6, parentId: 5, title: 'Kleidung', path: 'Herren > Kleidung', isLeaf: false },
  { id: 1223, parentId: 6, title: 'Jacken', path: 'Herren > Kleidung > Jacken', isLeaf: true },
];
function fixture(
  options: {
    categories?: unknown[];
    deniedAt?: number;
    fail?: boolean;
    wrongAccount?: boolean;
  } = {},
) {
  const calls: URL[] = [];
  let checks = 0;
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname.endsWith('_check'))
      return Response.json({
        active: true,
        sessionId: listingClaimFixture.scope.listingWrite?.sessionId,
        expiresAt: listingClaimFixture.scope.listingWrite?.expiresAt,
        absoluteExpiresAt: listingClaimFixture.scope.listingWrite?.absoluteExpiresAt,
      });
    assert.equal(url.pathname, '/rest/v1/vinted_selling_category_snapshots');
    assert.equal(url.searchParams.get('workspace_id'), 'eq.' + account.workspaceId);
    assert.equal(url.searchParams.get('connection_id'), 'eq.' + account.connectionId);
    assert.equal(url.searchParams.get('external_account_id'), 'eq.123');
    assert.equal(init?.redirect, 'error');
    if (options.fail) throw new Error('private-category-test/private-path');
    return Response.json([
      {
        workspace_id: account.workspaceId,
        connection_id: account.connectionId,
        external_account_id: options.wrongAccount ? '124' : '123',
        categories: options.categories ?? categories,
      },
    ]);
  };
  return {
    calls,
    request,
    run: (id = 1223) =>
      loadMarketplaceListingCategoryPath(
        { url: 'https://database.example', serviceRoleKey: 'private-category-test', request },
        id,
        async () => ++checks !== options.deniedAt,
        account,
      ),
  };
}
test('loads account-bound ancestors from one atomic selling snapshot', async () => {
  const f = fixture();
  const path = await f.run();
  assert.deepEqual(path, [5, 6]);
  assert.ok(Object.isFrozen(path));
  assert.equal(f.calls.length, 1);
});
test('rejects missing parents, cycles, non-leaf targets, duplicates and another account', async () => {
  for (const rows of [
    categories.slice(1),
    [{ ...categories[0], parentId: 5 }],
    [{ ...categories[0], isLeaf: true }, ...categories.slice(1)],
    [...categories, categories[0]],
  ])
    await assert.rejects(fixture({ categories: rows }).run(), /Kategoriepfad/);
  await assert.rejects(fixture().run(5), /Kategoriepfad/);
  await assert.rejects(fixture({ wrongAccount: true }).run(), /Kategoriepfad/);
});
test('checks access before and after the snapshot and rejects invalid IDs', async () => {
  for (const deniedAt of [1, 2]) await assert.rejects(fixture({ deniedAt }).run(), /Kategoriepfad/);
  for (const id of [0, -1, 1.5, 2147483648]) {
    const f = fixture();
    await assert.rejects(f.run(id));
    assert.equal(f.calls.length, 0);
  }
});
test('never leaks credentials on request failure', async () => {
  await assert.rejects(fixture({ fail: true }).run(), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /private-category-test|private-path/);
    return true;
  });
});
test('cloud job uses its immutable account binding', async () => {
  const f = fixture();
  const store = new SupabaseMarketplaceListingStore({
    url: 'https://database.example',
    serviceRoleKey: 'private-category-test',
    fetch: f.request,
    now: () => Date.parse('2026-10-09T12:00:00Z'),
  });
  assert.deepEqual(await store.loadCategoryPath(listingClaimFixture), [5, 6]);
  f.calls.length = 0;
  await assert.rejects(
    store.loadCategoryPath({
      ...listingClaimFixture,
      scope: { ...listingClaimFixture.scope, userAccessToken: 'user-token' },
    }),
  );
  assert.equal(f.calls.length, 0);
});
