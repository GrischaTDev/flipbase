import { describe, expect, it, vi } from 'vitest';
import { VintedCollector } from '../../src/vinted/collector.js';
import { ForbiddenError, RateLimitedError } from '../../src/vinted/errors.js';
import type { SniperQuery } from '../../src/domain/query.js';
import { catalogPage } from './support/catalog-page.js';

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

function catalog(): Response {
  return new Response(catalogPage(), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function build(fetchFn: ReturnType<typeof vi.fn>) {
  const options = { baseUrl: 'https://www.vinted.de', userAgent: 'test-agent' };
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  return new VintedCollector(options, fetchFn as unknown as typeof fetch, async () => {});
}

describe('VintedCollector', () => {
  it.each([53, 14, 88])(
    'collects only brand %s without hidden text, category or price filters',
    async (brandId) => {
      const fetchFn = vi.fn().mockResolvedValueOnce(catalog());
      await build(fetchFn).collect({
        ...query,
        brandId,
        searchText: null,
        catalogId: null,
        priceFrom: null,
        priceTo: null,
      });
      const url = new URL(String(fetchFn.mock.calls[0]?.[0]));
      expect(url.searchParams.get('brand_ids')).toBe(String(brandId));
      for (const key of ['search_text', 'catalog_ids', 'price_from', 'price_to'])
        expect(url.searchParams.has(key)).toBe(false);
      expect(url.searchParams.get('order')).toBe('newest_first');
    },
  );
  it('collects a category without sending a null search term', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(catalog());
    await build(fetchFn).collect({ ...query, searchText: null, catalogId: 1049 });
    const url = new URL(String(fetchFn.mock.calls[0]?.[0]));
    expect(url.searchParams.has('search_text')).toBe(false);
    expect(url.searchParams.get('catalog_ids')).toBe('1049');
  });
  it('requests page one with 96 items and the price ceiling', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(catalog());

    await build(fetchFn).collect(query);

    const url = new URL(String(fetchFn.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/catalog');
    expect(url.searchParams.get('search_text')).toBe('nike air max');
    expect(url.searchParams.get('order')).toBe('newest_first');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('per_page')).toBe('96');
    expect(url.searchParams.get('price_to')).toBe('50');
    const requestInit = fetchFn.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(requestInit.headers).get('cookie')).toBeNull();
    expect(new Headers(requestInit.headers).get('accept')).toContain('text/html');
  });

  it('returns normalized listings', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(catalog());

    const listings = await build(fetchFn).collect(query);

    expect(listings).toHaveLength(1);
    expect(listings[0]?.marketplace).toBe('vinted');
    expect(listings[0]?.seller.name).toBeNull();
    // Der Riegel gilt weiter fuer alles, was darueber hinausgeht: Die
    // Profiladresse steht in der Antwort, darf den Sammler aber nicht verlassen.
    expect(JSON.stringify(listings)).not.toContain('profile_url');
    expect(JSON.stringify(listings)).not.toContain('/member/');
  });

  it('maps 429 to RateLimitedError without retrying', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('', { status: 429 }));

    await expect(build(fetchFn).collect(query)).rejects.toBeInstanceOf(RateLimitedError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('maps 403 to ForbiddenError without retrying', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('', { status: 403 }));

    await expect(build(fetchFn).collect(query)).rejects.toBeInstanceOf(ForbiddenError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries a 503 at most twice', async () => {
    const delays: number[] = [];
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(catalog());
    const options = { baseUrl: 'https://www.vinted.de', userAgent: 'test-agent' };
    const collector = new VintedCollector(
      options,
      fetchFn as unknown as typeof fetch,
      async (ms) => {
        delays.push(ms);
      },
    );

    await collector.collect(query);

    expect(delays).toEqual([500, 1000]);
  });

  it('rejects a response that violates the schema', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(Response.json({ items: [{ nope: true }] }));

    await expect(build(fetchFn).collect(query)).rejects.toThrow();
  });

  it('reicht die Preisuntergrenze an Vinted weiter', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(catalog());

    await build(fetchFn).collect({ ...query, priceFrom: 10 });

    const url = new URL(fetchFn.mock.calls[0]![0] as string);
    expect(url.searchParams.get('price_from')).toBe('10');
  });

  it('sends modern browser headers including sec-ch-ua', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(catalog());

    await build(fetchFn).collect(query);

    const headers = (fetchFn.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers['Sec-Ch-Ua']).toContain('Google Chrome');
    expect(headers['Sec-Fetch-Dest']).toBe('document');
    expect(headers['Sec-Fetch-Mode']).toBe('navigate');
  });

  it('persists cookies across requests and clears them on 403', async () => {
    const responseWithCookie = new Response(catalogPage(), {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'set-cookie': 'anon_id=abc123; Path=/',
      },
    });
    const secondResponse = catalog();
    const forbiddenResponse = new Response('', { status: 403 });
    const recoveryResponse = catalog();

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(responseWithCookie)
      .mockResolvedValueOnce(secondResponse)
      .mockResolvedValueOnce(forbiddenResponse)
      .mockResolvedValueOnce(recoveryResponse);

    const collector = build(fetchFn);

    // 1. First request has no cookies, receives anon_id cookie
    await collector.collect(query);
    const firstHeaders = (fetchFn.mock.calls[0]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(firstHeaders['Cookie']).toBeUndefined();

    // 2. Second request sends the stored cookie
    await collector.collect(query);
    const secondHeaders = (fetchFn.mock.calls[1]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(secondHeaders['Cookie']).toBe('anon_id=abc123');

    // 3. Third request fails with 403, which clears cookies
    await expect(collector.collect(query)).rejects.toBeInstanceOf(ForbiddenError);

    // 4. Fourth request has no cookies again
    await collector.collect(query);
    const fourthHeaders = (fetchFn.mock.calls[3]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(fourthHeaders['Cookie']).toBeUndefined();
  });
});
