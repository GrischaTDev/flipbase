import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadMarketplaceListingCategoryPath } from '../src/marketplace-listing-category.ts';
const account = {
  workspaceId: '46600000-0000-4000-8000-000000000001',
  connectionId: '46600000-0000-4000-8000-000000000002',
  accountId: '123',
};
test('an absent category never falls back to the global search tree or another account', async () => {
  for (const categories of [
    [],
    [
      { id: 1, parentId: null, title: 'Damen', path: 'Damen', isLeaf: false },
      { id: 89, parentId: 1, title: 'Schals', path: 'Damen > Schals', isLeaf: true },
    ],
  ]) {
    const request: typeof fetch = async () =>
      Response.json([
        {
          workspace_id: account.workspaceId,
          connection_id: account.connectionId,
          external_account_id: '123',
          categories,
        },
      ]);
    await assert.rejects(
      loadMarketplaceListingCategoryPath(
        { url: 'https://database.example', serviceRoleKey: 'fixture', request },
        5555,
        async () => true,
        account,
      ),
      /Kategoriepfad/,
    );
  }
});
