import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadMarketplaceListingCategoryPath } from '../src/marketplace-listing-category.ts';

test('permits native category discovery only for an absent leaf in a consistent authorized cache', async () => {
  let checks = 0;
  const request: typeof fetch = async (input) =>
    Response.json(
      String(input).includes('/vinted_category_syncs')
        ? [{ refreshed_at: '2026-11-04T14:18:52Z', category_count: 2952 }]
        : [],
    );
  assert.deepEqual(
    await loadMarketplaceListingCategoryPath(
      {
        url: 'https://database.example',
        serviceRoleKey: 'fixture',
        request,
      },
      5555,
      async () => {
        checks++;
        return true;
      },
    ),
    [],
  );
  assert.ok(checks >= 4);
  await assert.rejects(
    loadMarketplaceListingCategoryPath(
      {
        url: 'https://database.example',
        serviceRoleKey: 'fixture',
        request,
      },
      5555,
      async () => false,
    ),
  );
});

test('does not turn failed requests or missing ancestors into native category discovery', async () => {
  for (const failure of ['http', 'ancestor']) {
    const request: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/vinted_category_syncs'))
        return Response.json([{ refreshed_at: '2026-11-04T14:18:52Z', category_count: 2952 }]);
      if (failure === 'http') return new Response('', { status: 503 });
      return Response.json(
        url.searchParams.get('id') === 'eq.5555'
          ? [{ id: 5555, parent_id: 5496, is_leaf: true, updated_at: '2026-11-04T14:18:52Z' }]
          : [],
      );
    };
    await assert.rejects(
      loadMarketplaceListingCategoryPath(
        {
          url: 'https://database.example',
          serviceRoleKey: 'fixture',
          request,
        },
        5555,
        async () => true,
      ),
    );
  }
});
