import { describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/vinted-catalog.json' with { type: 'json' };
import { VintedCollector } from '../../src/vinted/collector.js';
import { VintedSession } from '../../src/vinted/session.js';
import { ForbiddenError, RateLimitedError, UnauthorizedError } from '../../src/vinted/errors.js';
import type { SniperQuery } from '../../src/domain/query.js';

const query: SniperQuery = {
  id: 'q1',
  queryKey: 'vinted|search=nike air max|catalog=-|brand=-|price_from=-|price_to=50',
  marketplace: 'vinted',
  searchText: 'nike air max',
  catalogId: null,
  brandId: null,
  priceTo: 50,
  priceFrom: null,
  pollIntervalMs: 60000,
  isSeeded: true,
  isActive: true,
  lastPolledAt: null,
  lastStatus: 'never_polled',
  consecutiveFailures: 0,
};

function homepage(): Response {
  return new Response('<html></html>', {
    status: 200,
    headers: { 'set-cookie': 'access_token_web=token; Path=/' },
  });
}

function catalog(): Response {
  return Response.json(fixture);
}

function build(fetchFn: ReturnType<typeof vi.fn>) {
  const options = { baseUrl: 'https://www.vinted.de', userAgent: 'test-agent' };
  const session = new VintedSession(options, fetchFn as unknown as typeof fetch);
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  return new VintedCollector(options, session, fetchFn as unknown as typeof fetch, async () => {});
}

describe('VintedCollector', () => {
  it.each([53, 14, 88])(
    'collects only brand %s without hidden text, category or price filters',
    async (brandId) => {
      const fetchFn = vi.fn().mockResolvedValueOnce(homepage()).mockResolvedValueOnce(catalog());
      await build(fetchFn).collect({
        ...query,
        brandId,
        searchText: null,
        catalogId: null,
        priceFrom: null,
        priceTo: null,
      });
      const url = new URL(String(fetchFn.mock.calls[1]?.[0]));
      expect(url.searchParams.get('brand_ids')).toBe(String(brandId));
      for (const key of ['search_text', 'catalog_ids', 'price_from', 'price_to'])
        expect(url.searchParams.has(key)).toBe(false);
      expect(url.searchParams.get('order')).toBe('newest_first');
    },
  );
  it('collects a category without sending a null search term', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(homepage()).mockResolvedValueOnce(catalog());
    await build(fetchFn).collect({ ...query, searchText: null, catalogId: 1049 });
    const url = new URL(String(fetchFn.mock.calls[1]?.[0]));
    expect(url.searchParams.has('search_text')).toBe(false);
    expect(url.searchParams.get('catalog_ids')).toBe('1049');
  });
  it('requests page one with 96 items and the price ceiling', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(homepage()).mockResolvedValueOnce(catalog());

    await build(fetchFn).collect(query);

    const url = new URL(String(fetchFn.mock.calls[1]?.[0]));
    expect(url.pathname).toBe('/api/v2/catalog/items');
    expect(url.searchParams.get('search_text')).toBe('nike air max');
    expect(url.searchParams.get('order')).toBe('newest_first');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('per_page')).toBe('96');
    expect(url.searchParams.get('price_to')).toBe('50');
  });

  it('returns normalized listings', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(homepage()).mockResolvedValueOnce(catalog());

    const listings = await build(fetchFn).collect(query);

    expect(listings).toHaveLength(fixture.items.length);
    expect(listings[0]?.marketplace).toBe('vinted');
    expect(listings[0]?.seller.name).toBe('seller_0');
    // Der Riegel gilt weiter fuer alles, was darueber hinausgeht: Die
    // Profiladresse steht in der Antwort, darf den Sammler aber nicht verlassen.
    expect(JSON.stringify(listings)).not.toContain('profile_url');
    expect(JSON.stringify(listings)).not.toContain('/member/');
  });

  it('re-warms the session once on 401 and then succeeds', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(homepage())
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(homepage())
      .mockResolvedValueOnce(catalog());

    const listings = await build(fetchFn).collect(query);

    expect(listings).toHaveLength(fixture.items.length);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('gives up with UnauthorizedError after a second 401', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(homepage())
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(homepage())
      .mockResolvedValueOnce(new Response('', { status: 401 }));

    await expect(build(fetchFn).collect(query)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('maps 429 to RateLimitedError without retrying', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(homepage())
      .mockResolvedValueOnce(new Response('', { status: 429 }));

    await expect(build(fetchFn).collect(query)).rejects.toBeInstanceOf(RateLimitedError);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('maps 403 to ForbiddenError without retrying', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(homepage())
      .mockResolvedValueOnce(new Response('', { status: 403 }));

    await expect(build(fetchFn).collect(query)).rejects.toBeInstanceOf(ForbiddenError);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('retries a 503 at most twice', async () => {
    const delays: number[] = [];
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(homepage())
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(catalog());
    const options = { baseUrl: 'https://www.vinted.de', userAgent: 'test-agent' };
    const session = new VintedSession(options, fetchFn as unknown as typeof fetch);
    const collector = new VintedCollector(
      options,
      session,
      fetchFn as unknown as typeof fetch,
      async (ms) => {
        delays.push(ms);
      },
    );

    await collector.collect(query);

    expect(delays).toEqual([500, 1000]);
  });

  it('rejects a response that violates the schema', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(homepage())
      .mockResolvedValueOnce(Response.json({ items: [{ nope: true }] }));

    await expect(build(fetchFn).collect(query)).rejects.toThrow();
  });

  it('reicht die Preisuntergrenze an Vinted weiter', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(homepage()).mockResolvedValueOnce(catalog());

    await build(fetchFn).collect({ ...query, priceFrom: 10 });

    const url = new URL(fetchFn.mock.calls[1]![0] as string);
    expect(url.searchParams.get('price_from')).toBe('10');
  });
});
