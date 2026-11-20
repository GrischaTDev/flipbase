import { describe, expect, it, vi } from 'vitest';
import {
  buildVintedCatalogUrl,
  freshVintedCatalogUrl,
  VintedCollector,
} from '../../src/vinted/collector.js';
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
  runState: 'ready',
  nextAttemptAt: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastErrorKind: null,
  lastErrorAt: null,
  lastErrorMessage: null,
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
  it('collects a leaf category with a single catalog request without fetching item pages', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(catalog());
    const fleece = { ...query, searchText: null, catalogId: 1858, brandId: 362, priceTo: null };

    const listings = await build(fetchFn).collect(fleece);

    expect(listings).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchFn.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/catalog');
    expect(url.searchParams.get('catalog_ids')).toBe('1858');
    expect(url.searchParams.get('brand_ids')).toBe('362');
  });

  it('returns the raw source before applying each filter’s exclusions', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => catalog());
    const filter = { ...query, titleKeywords: ['Nike'], excludedTitleKeywords: ['Air Max'] };
    expect(await build(fetchFn).collectSource(filter, { page: 2 })).toHaveLength(1);
    expect(new URL(String(fetchFn.mock.calls[0]?.[0])).searchParams.get('page')).toBe('2');
    expect(await build(fetchFn).collect(filter)).toEqual([]);
    await expect(build(fetchFn).collectSource(filter, { page: 4 })).rejects.toThrow('Katalogseite');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('reports a provider challenge and its retry delay without retrying or exposing the body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response('private provider content', {
        status: 403,
        headers: { 'cf-mitigated': 'challenge', 'retry-after': '1800' },
      }),
    );
    await expect(build(fetchFn).collect(query)).rejects.toMatchObject({
      kind: 'forbidden',
      status: 403,
      challengeDetected: true,
      retryAfterSeconds: 1800,
      responseSample: undefined,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
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
      for (const key of ['search_text', 'catalog_ids', 'price_from'])
        expect(url.searchParams.has(key)).toBe(false);
      // Nur die wirkungslose Abrufgrenze gegen Vinteds Zwischenspeicher.
      expect(Number(url.searchParams.get('price_to'))).toBeGreaterThanOrEqual(100_000);
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
    expect(Number(url.searchParams.get('price_from'))).toBeLessThan(1);
    const requestInit = fetchFn.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(requestInit?.headers).get('cookie')).toBeNull();
    expect(new Headers(requestInit?.headers).get('user-agent')).toBeNull();
  });

  it('sends every catalog request as a new query so Vinted cannot answer from its cache', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => catalog());
    const collector = new VintedCollector(
      { baseUrl: 'https://www.vinted.de', userAgent: 'test-agent' },
      fetchFn as unknown as typeof fetch,
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      async () => {},
      undefined,
      () => 1_763_640_000_000,
    );
    const broad = { ...query, searchText: null, catalogId: 4, priceTo: null };
    await collector.collectSource(broad);
    await collector.collectSource(broad);
    await collector.collectSource(broad, { page: 2 });
    const ceilings = fetchFn.mock.calls.map(
      (call) => new URL(String(call[0])).searchParams.get('price_to') ?? '',
    );
    expect(new Set(ceilings).size).toBe(3);
    for (const ceiling of ceilings) {
      expect(ceiling).toMatch(/^\d+$/);
      expect(Number(ceiling)).toBeGreaterThanOrEqual(100_000);
      expect(Number(ceiling)).toBeLessThan(1_000_000);
    }
  });

  it('keeps the filter’s own price ceiling and varies only a floor below one euro', () => {
    const limited = buildVintedCatalogUrl(query, 'https://www.vinted.de');
    const first = freshVintedCatalogUrl(limited, 1_763_640_000);
    const second = freshVintedCatalogUrl(limited, 1_763_640_001);
    expect(first.searchParams.get('price_to')).toBe('50');
    expect(first.searchParams.get('price_from')).toMatch(/^0\.\d{4}$/);
    expect(Number(first.searchParams.get('price_from'))).toBeGreaterThan(0);
    // Direkt aufeinanderfolgende Abrufe unterscheiden sich schon vor der vierten Nachkommastelle.
    expect(
      Math.abs(
        Number(first.searchParams.get('price_from')) -
          Number(second.searchParams.get('price_from')),
      ),
    ).toBeGreaterThanOrEqual(0.01);
    // Der Planungsschlüssel für gemeinsame Filter bleibt unberührt.
    expect(limited.searchParams.has('price_from')).toBe(false);
  });

  it('uses every floor and ceiling value of its range without leaving it', () => {
    const limited = buildVintedCatalogUrl(query, 'https://www.vinted.de');
    const floors = new Set<number>();
    for (let key = 0; key < 9_999; key++)
      floors.add(Number(freshVintedCatalogUrl(limited, key).searchParams.get('price_from')));
    expect(floors.size).toBe(9_999);
    expect(Math.min(...floors)).toBe(0.0001);
    expect(Math.max(...floors)).toBe(0.9999);

    const broad = buildVintedCatalogUrl(
      { ...query, searchText: null, catalogId: 4, priceTo: null },
      'https://www.vinted.de',
    );
    const ceiling = (key: number) => freshVintedCatalogUrl(broad, key).searchParams.get('price_to');
    expect(ceiling(0)).toBe('100000');
    expect(ceiling(899_999)).toBe('999999');
    expect(ceiling(900_000)).toBe('100000');
  });

  it('widens both price bounds by less than a cent so no further price matches', () => {
    const bounded = buildVintedCatalogUrl({ ...query, priceFrom: 10 }, 'https://www.vinted.de');
    const seen = new Set<string>();
    for (let key = 0; key < 99 * 99; key++) {
      const url = freshVintedCatalogUrl(bounded, key);
      const floor = url.searchParams.get('price_from') ?? '';
      const ceiling = url.searchParams.get('price_to') ?? '';
      expect(floor).toMatch(/^9\.99\d\d$/);
      expect(Number(floor)).toBeGreaterThan(9.99);
      expect(ceiling).toMatch(/^50\.00\d\d$/);
      expect(Number(ceiling)).toBeLessThan(50.01);
      seen.add(`${floor}|${ceiling}`);
    }
    expect(seen.size).toBe(99 * 99);
    expect(bounded.searchParams.get('price_from')).toBe('10');
  });

  it('treats a zero floor as no floor and leaves nonsensical bounds unchanged', () => {
    const base = 'https://www.vinted.de';
    const zeroFloor = freshVintedCatalogUrl(
      buildVintedCatalogUrl({ ...query, priceFrom: 0 }, base),
      5,
    );
    expect(zeroFloor.searchParams.get('price_to')).toBe('50');
    expect(zeroFloor.searchParams.getAll('price_from')).toHaveLength(1);
    expect(Number(zeroFloor.searchParams.get('price_from'))).toBeGreaterThan(0);

    const zeroFloorOnly = freshVintedCatalogUrl(
      buildVintedCatalogUrl({ ...query, priceFrom: 0, priceTo: null }, base),
      5,
    );
    expect(zeroFloorOnly.searchParams.has('price_from')).toBe(false);
    expect(Number(zeroFloorOnly.searchParams.get('price_to'))).toBeGreaterThanOrEqual(100_000);

    const floorOnly = freshVintedCatalogUrl(
      buildVintedCatalogUrl({ ...query, priceFrom: 20, priceTo: null }, base),
      5,
    );
    expect(floorOnly.searchParams.get('price_from')).toBe('20');
    expect(Number(floorOnly.searchParams.get('price_to'))).toBeGreaterThanOrEqual(100_000);

    for (const unchanged of [
      { ...query, priceTo: 0 },
      { ...query, priceTo: 0.5 },
      { ...query, priceFrom: 150_000, priceTo: null },
      { ...query, priceFrom: 10.005 },
    ]) {
      const url = buildVintedCatalogUrl(unchanged, base);
      expect(freshVintedCatalogUrl(url, 5).href).toBe(url.href);
    }
  });

  it('keeps every request unique when the clock jumps back or fails', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => catalog());
    const times = [1_763_640_000_000, 1_763_639_000_000, Number.NaN, 1_763_640_000_500];
    const collector = new VintedCollector(
      { baseUrl: 'https://www.vinted.de', userAgent: 'test-agent' },
      fetchFn as unknown as typeof fetch,
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      async () => {},
      undefined,
      () => times.shift() ?? Number.NaN,
    );
    const broad = { ...query, searchText: null, catalogId: 4, priceTo: null };
    for (let request = 0; request < 5; request++) await collector.collectSource(broad);
    const ceilings = fetchFn.mock.calls.map((call) =>
      new URL(String(call[0])).searchParams.get('price_to'),
    );
    expect(new Set(ceilings).size).toBe(5);
  });

  it('falls back to the fixed catalog address when switched off', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => catalog());
    const collector = new VintedCollector(
      { baseUrl: 'https://www.vinted.de', userAgent: 'test-agent', freshCatalogRequests: false },
      fetchFn as unknown as typeof fetch,
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      async () => {},
    );
    const broad = { ...query, searchText: null, catalogId: 4, priceTo: null };
    await collector.collectSource(broad);
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      buildVintedCatalogUrl(broad, 'https://www.vinted.de').href,
    );
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
  it('uses exactly one request when verifying a manually approved session', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
    await expect(build(fetchFn).collect(query, { allowRetries: false })).rejects.toThrow();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects a response that violates the schema', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(Response.json({ items: [{ nope: true }] }));

    await expect(build(fetchFn).collect(query)).rejects.toThrow();
  });

  it('retains the accepted HTTP status when the document contains no catalog', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('<html>empty catalog</html>', { status: 200 }));
    await expect(build(fetchFn).collect(query)).rejects.toMatchObject({
      kind: 'parser_error',
      status: 200,
      phase: 'parse',
      queryId: query.id,
    });
  });

  it('reicht die Preisuntergrenze an Vinted weiter', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(catalog());

    await build(fetchFn).collect({ ...query, priceFrom: 10 });

    const url = new URL(fetchFn.mock.calls[0]![0] as string);
    // Um Bruchteile eines Cents geweitet: weiterhin ab 10,00 € und bis 50,00 €.
    expect(Number(url.searchParams.get('price_from'))).toBeGreaterThan(9.99);
    expect(Number(url.searchParams.get('price_from'))).toBeLessThan(10);
    expect(Number(url.searchParams.get('price_to'))).toBeGreaterThan(50);
    expect(Number(url.searchParams.get('price_to'))).toBeLessThan(50.01);
  });

  it('leaves cookies and browser identity to the native browser transport', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(catalogPage(), { headers: { 'set-cookie': 'private=secret' } }),
      )
      .mockResolvedValueOnce(catalog());
    const collector = build(fetchFn);
    await collector.collect(query);
    await collector.collect(query);
    for (const call of fetchFn.mock.calls) {
      const headers = new Headers((call[1] as RequestInit | undefined)?.headers);
      expect(headers.get('cookie')).toBeNull();
      expect(headers.get('user-agent')).toBeNull();
      expect(headers.get('sec-ch-ua')).toBeNull();
    }
  });
  it('extracts retryAfterSeconds on 429 when Retry-After header is present', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      new Response('', {
        status: 429,
        headers: { 'retry-after': '120' },
      }),
    );

    try {
      await build(fetchFn).collect(query);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitedError);
      expect((error as RateLimitedError).retryAfterSeconds).toBe(120);
      expect((error as RateLimitedError).queryId).toBe(query.id);
    }
  });

  it('detects Cloudflare challenge page and throws ForbiddenError', async () => {
    const challengeHtml =
      '<html><head><title>Just a moment...</title></head><body>challenge-running</body></html>';
    const fetchFn = vi.fn().mockResolvedValueOnce(
      new Response(challengeHtml, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    try {
      await build(fetchFn).collect(query);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).phase).toBe('body');
    }
  });
});
