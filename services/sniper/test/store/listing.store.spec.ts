import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { ListingStore } from '../../src/store/listing.store.js';
import type { MarketplaceListing } from '../../src/domain/listing.js';

function listing(externalId: string): MarketplaceListing {
  return {
    marketplace: 'vinted',
    externalId,
    title: 'Sneaker',
    url: 'https://www.vinted.de/items/1',
    description: null,
    imageUrls: [],
    itemPrice: { amount: 10, currency: 'EUR' },
    totalPrice: { amount: 12, currency: 'EUR' },
    brand: 'Nike',
    size: null,
    condition: 'Gut',
    countryCode: null,
    seller: { name: null, avatarUrl: null, rating: null, reviewCount: null },
    isHidden: false,
    itemUpdatedAt: null,
    photoUploadedAt: null,
  };
}

function storeWithResponses(responses: { body: unknown; status?: number }[]) {
  const requests: { path: string; body: unknown }[] = [];
  const client = createClient('https://unit.example.test', 'unit-service-role', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        requests.push({
          path: new URL(String(input)).pathname,
          body: JSON.parse(String(init?.body ?? 'null')) as unknown,
        });
        const response = responses.shift();
        if (!response) throw new Error('Unexpected HTTP request');
        return new Response(JSON.stringify(response.body), {
          status: response.status ?? 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  });
  return { store: new ListingStore(client), requests };
}

describe('ListingStore HTTP contract', () => {
  it('enriches all observed IDs, including duplicates, but only reports newly inserted listings', async () => {
    const { store, requests } = storeWithResponses([
      { body: [{ external_id: 'new' }] },
      { body: null },
    ]);
    const created = await store.saveNew([listing('known'), listing('new')], 'query-id');
    expect(created.map((row) => row.externalId)).toEqual(['new']);
    expect(requests[1]).toEqual({
      path: '/rest/v1/rpc/record_sniper_listing_category',
      body: { p_query_id: 'query-id', p_external_ids: ['known', 'new'] },
    });
  });
  it('does not silently lose a failed category enrichment', async () => {
    const { store } = storeWithResponses([
      { body: [] },
      { body: { message: 'offline' }, status: 400 },
    ]);
    await expect(store.saveNew([listing('known')], 'query-id')).rejects.toThrow(
      'recording listing category failed',
    );
  });
  it('passes the silent seed flag to the independent evaluator', async () => {
    const { store, requests } = storeWithResponses([{ body: 0 }]);
    expect(await store.evaluateHits('query-id', false)).toBe(0);
    expect(requests.map((request) => request.body)).toEqual([
      { p_query_id: 'query-id', p_report_hits: false },
    ]);
    expect(requests[0]?.path).toBe('/rest/v1/rpc/sniper_evaluate_watchlist_hits');
  });
  it('keeps a failed watchlist evaluation retryable instead of reporting success', async () => {
    const { store } = storeWithResponses([{ body: { message: 'offline' }, status: 400 }]);
    await expect(store.evaluateHits('query-id')).rejects.toThrow('evaluating watchlists failed');
  });
});
