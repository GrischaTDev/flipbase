import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { ListingStore } from '../../src/store/listing.store.js';
import type { SniperQuery } from '../../src/domain/query.js';
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

  it('calls sniper_evaluate_pending_watchlist_hits with batchSize and parses response', async () => {
    const { store, requests } = storeWithResponses([{ body: { processed: 42, hits: 3 } }]);
    const result = await store.evaluatePending(50);
    expect(result).toEqual({ processed: 42, hits: 3 });
    expect(requests[0]).toEqual({
      path: '/rest/v1/rpc/sniper_evaluate_pending_watchlist_hits',
      body: { p_batch_size: 50 },
    });
  });

  it('rejects evaluatePending if rpc returns an error', async () => {
    const { store } = storeWithResponses([{ body: { message: 'db lock timeout' }, status: 500 }]);
    await expect(store.evaluatePending(100)).rejects.toThrow(
      'evaluating pending watchlists failed: db lock timeout',
    );
  });
});

const guardedQuery = {
  id: 'query-id',
  marketplace: 'vinted',
  searchText: null,
  catalogId: 79,
  brandId: 53,
  brandIds: [53],
  titleKeywords: ['vintage'],
  keywordMode: 'all',
  filterFormatVersion: 1,
  filterRevision: 7,
  requestCursor: 3,
} as SniperQuery;

describe('atomic search filter ingestion HTTP contract', () => {
  it('sends only matching titles with the exact revision and monotonic cursor to one RPC', async () => {
    const { store, requests } = storeWithResponses([
      { body: { accepted: true, created: 1, hits: 0, seeded: false } },
    ]);
    const good = { ...listing('matching'), title: 'VINTAGE Nike Jacke' };
    const wrong = { ...listing('description-only'), description: 'Vintage', title: 'Nike Jacke' };
    expect(await store.completeRun([good, wrong], guardedQuery)).toEqual({
      accepted: true,
      created: 1,
      hits: 0,
      seeded: false,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.path).toBe('/rest/v1/rpc/complete_sniper_search_filter_run');
    expect(requests[0]?.body).toMatchObject({
      p_query_id: 'query-id',
      p_revision: 7,
      p_cursor: 3,
      p_listings: [{ external_id: 'matching', title: 'VINTAGE Nike Jacke' }],
    });
    expect((requests[0]?.body as { p_listings: unknown[] }).p_listings).toHaveLength(1);
  });
  it('preserves a stale result rejection instead of reporting it as new listings', async () => {
    const { store } = storeWithResponses([
      { body: { accepted: false, created: 0, hits: 0, seeded: false } },
    ]);
    expect((await store.completeRun([], guardedQuery)).accepted).toBe(false);
  });
  it('still submits an empty response so its request lane can be seeded atomically', async () => {
    const { store, requests } = storeWithResponses([
      { body: { accepted: true, created: 0, hits: 0, seeded: true } },
    ]);
    expect((await store.completeRun([], guardedQuery)).seeded).toBe(true);
    expect(requests[0]?.body).toMatchObject({ p_listings: [] });
  });
  it.each([
    null,
    {},
    { accepted: true, created: -1, hits: 0, seeded: false },
    { accepted: true, created: 0, hits: 0.5, seeded: false },
  ])('rejects an invalid server result: %j', async (body) => {
    const { store } = storeWithResponses([{ body }]);
    await expect(store.completeRun([], guardedQuery)).rejects.toThrow(
      'Invalid search filter completion response',
    );
  });
});
