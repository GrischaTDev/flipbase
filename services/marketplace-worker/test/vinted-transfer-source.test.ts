import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeVintedTransferSource } from '../src/vinted-transfer-source.ts';
import { listingCurrentContentFixture } from './fixtures/vinted-listing-current-content.ts';
import { SupabaseVintedListingCache } from '../src/supabase-vinted-listing-cache.ts';
test('Cloudquelle erhält vollständige Texte, Reihenfolge und beschriftete Hinweise ohne Vinted-Kategorie-ID als Ziel', () => {
  const current = listingCurrentContentFixture();
  const source = normalizeVintedTransferSource(current, '123', '98765');
  assert.equal(source.title, current.content.title);
  assert.equal(source.description, current.content.description);
  assert.deepEqual(source.photoReferences, current.photoUrls);
  assert.equal(source.attributeHints.brand, current.content.brandLabel);
  assert.equal('categoryId' in source, false);
  assert.throws(() => normalizeVintedTransferSource(current, '124', '98765'));
});
test('Cloudcache schreibt ausschließlich den geprüften Nutzer- und Kontobezug, ohne Nutzertoken', async () => {
  let request: Record<string, unknown> | undefined;
  const cache = new SupabaseVintedListingCache({
    url: 'https://db.example.test',
    serviceRoleKey: 'server-only',
    fetch: async (input, init) => {
      assert.equal(
        new URL(String(input)).pathname,
        '/rest/v1/rpc/kleinanzeigen_cache_transfer_source',
      );
      request = JSON.parse(String(init?.body));
      return Response.json({
        entryId: '46700000-0000-4000-8000-000000000005',
        fingerprint: 'a'.repeat(64),
      });
    },
  });
  await cache.saveTransferSource(
    {
      workspaceId: '46700000-0000-4000-8000-000000000001',
      connectionId: '46700000-0000-4000-8000-000000000002',
      userId: '46700000-0000-4000-8000-000000000003',
      userAccessToken: 'never-stored',
    },
    '46700000-0000-4000-8000-000000000005',
    listingCurrentContentFixture(),
  );
  assert.equal(request?.['p_user_id'], '46700000-0000-4000-8000-000000000003');
  assert.equal(JSON.stringify(request).includes('never-stored'), false);
  assert.equal((request?.['p_source'] as Record<string, unknown>)['externalAccountId'], '123');
});
