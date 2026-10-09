import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadMarketplaceListingCategoryPath } from '../src/marketplace-listing-category.ts';
import { SupabaseMarketplaceListingStore } from '../src/supabase-marketplace-listing-store.ts';
import { listingClaimFixture } from './fixtures/marketplace-listing-claim.ts';

const refreshedAt = '2026-10-09T12:00:00+00:00';
const updatedAt = '2026-10-09T11:59:59+00:00';
const rows = [
  { id: 1223, parent_id: 6, is_leaf: true, updated_at: updatedAt },
  { id: 6, parent_id: 5, is_leaf: false, updated_at: updatedAt },
  { id: 5, parent_id: null, is_leaf: false, updated_at: updatedAt },
];
function fixture(
  options: {
    rows?: unknown[];
    changedSync?: boolean;
    deniedAt?: number;
    fail?: boolean;
  } = {},
) {
  const calls: URL[] = [];
  let checks = 0,
    syncs = 0;
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname.endsWith('_check'))
      return Response.json({
        active: true,
        sessionId: listingClaimFixture.scope.listingWrite!.sessionId,
        expiresAt: listingClaimFixture.scope.listingWrite!.expiresAt,
        absoluteExpiresAt: listingClaimFixture.scope.listingWrite!.absoluteExpiresAt,
      });
    assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer private-category-test');
    assert.equal(new Headers(init?.headers).get('Accept-Profile'), 'public');
    if (options.fail) throw new Error('private-category-test/private-path');
    if (url.pathname.endsWith('vinted_category_syncs')) {
      syncs++;
      return Response.json([
        {
          refreshed_at: options.changedSync && syncs > 1 ? '2026-10-09T13:00:00Z' : refreshedAt,
          category_count: 3,
        },
      ]);
    }
    const id = Number(url.searchParams.get('id')?.slice(3));
    return Response.json(
      (options.rows ?? rows).filter(
        (row) => typeof row === 'object' && row !== null && (row as { id: number }).id === id,
      ),
    );
  };
  return {
    calls,
    request,
    run: (categoryId = 1223) =>
      loadMarketplaceListingCategoryPath(
        { url: 'https://supabase.example.test', serviceRoleKey: 'private-category-test', request },
        categoryId,
        async () => {
          checks++;
          return checks !== options.deniedAt;
        },
      ),
  };
}

test('loads only the real parent IDs in root-to-leaf navigation order', async () => {
  const f = fixture();
  const path = await f.run();
  assert.deepEqual(path, [5, 6]);
  assert.ok(Object.isFrozen(path));
  assert.deepEqual(
    f.calls
      .filter((url) => url.pathname.endsWith('vinted_categories'))
      .map((url) => url.searchParams.get('id')),
    ['eq.1223', 'eq.6', 'eq.5'],
  );
});

test('rejects missing parents, cycles and non-leaf targets instead of inventing a category path', async () => {
  for (const invalidRows of [
    rows.slice(0, 2),
    [{ ...rows[0], parent_id: 1223 }],
    [{ ...rows[0], is_leaf: false }, ...rows.slice(1)],
    [rows[0], { ...rows[1], is_leaf: true }, rows[2]],
    [...rows, rows[0]],
  ])
    await assert.rejects(fixture({ rows: invalidRows }).run(), /Kategoriepfad/);
});

test('rejects malformed identifiers and inconsistent refresh metadata', async () => {
  for (const invalidRows of [
    [{ ...rows[0], parent_id: '6' }, ...rows.slice(1)],
    [{ ...rows[0], updated_at: 'invalid' }, ...rows.slice(1)],
    [rows[0], { ...rows[1], updated_at: '2026-10-09T11:30:00Z' }, rows[2]],
  ])
    await assert.rejects(fixture({ rows: invalidRows }).run(), /Kategoriepfad/);
  await assert.rejects(fixture({ changedSync: true }).run(), /Kategoriepfad/);
  for (const id of [0, -1, 1.5, 2147483648]) {
    const f = fixture();
    await assert.rejects(f.run(id), /Kategoriepfad/);
    assert.equal(f.calls.length, 0);
  }
});

test('bounds category depth and checks permission between requests and before returning', async () => {
  const deepRows = Array.from({ length: 32 }, (_, index) => ({
    id: index + 1,
    parent_id: index === 31 ? null : index + 2,
    is_leaf: index === 0,
    updated_at: updatedAt,
  }));
  const deep = fixture({ rows: deepRows });
  await assert.rejects(deep.run(1), /Kategoriepfad/);
  assert.ok(deep.calls.length <= 32);
  for (const deniedAt of [1, 3, 6]) {
    const f = fixture({ deniedAt });
    await assert.rejects(f.run(), /Kategoriepfad/);
    if (deniedAt === 1) assert.equal(f.calls.length, 0);
  }
});

test('does not expose server credentials or sensitive request details on failure', async () => {
  await assert.rejects(fixture({ fail: true }).run(), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Kategoriepfad/);
    assert.ok(!error.message.includes('private-category-test'));
    assert.equal(error.cause, undefined);
    return true;
  });
});

test('the store binds category lookup to an exclusive claimed attempt before using server credentials', async () => {
  const f = fixture();
  const store = new SupabaseMarketplaceListingStore({
    url: 'https://supabase.example.test',
    serviceRoleKey: 'private-category-test',
    fetch: f.request,
    now: () => Date.parse('2026-10-09T12:00:00Z'),
  });
  assert.deepEqual(await store.loadCategoryPath(listingClaimFixture), [5, 6]);
  f.calls.length = 0;
  await assert.rejects(
    store.loadCategoryPath({
      ...listingClaimFixture,
      scope: { ...listingClaimFixture.scope, userAccessToken: 'a-user-token' },
    }),
    /Kategoriepfad/,
  );
  assert.equal(f.calls.length, 0);
});
