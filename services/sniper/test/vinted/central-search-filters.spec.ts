import { describe, expect, it, vi } from 'vitest';
import { VintedCollector } from '../../src/vinted/collector.js';
import type { SniperQuery } from '../../src/domain/query.js';
import { catalogPage } from './support/catalog-page.js';

const query = {
  id: 'central-filter',
  queryKey: 'test',
  marketplace: 'vinted',
  searchText: null,
  catalogId: 79,
  brandId: 53,
  priceTo: null,
  priceFrom: null,
  pollIntervalMs: 20000,
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
  brandIds: [53],
  titleKeywords: ['vintage'],
  keywordMode: 'all' as const,
} satisfies SniperQuery;

function collector(title: string) {
  const fetchFn = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
    async () =>
      new Response(catalogPage().replaceAll('Nike Air Max', title), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
  );
  return {
    fetchFn,
    instance: new VintedCollector({ baseUrl: 'https://www.vinted.de', userAgent: 'test' }, fetchFn),
  };
}

describe('central search filters in the collector', () => {
  it('rejects a listing without the required title word before storage', async () => {
    expect(await collector('Nike Air Max').instance.collect(query)).toEqual([]);
  });
  it('keeps a title match independently of case', async () => {
    const result = await collector('VINTAGE Nike Jacke').instance.collect(query);
    expect(result.map((item) => item.title)).toEqual(['VINTAGE Nike Jacke']);
  });
  it('does not mistake a word fragment for a complete keyword', async () => {
    expect(await collector('Nike Vintagewear Jacke').instance.collect(query)).toEqual([]);
  });
  it('requires all configured title words in all mode', async () => {
    const result = await collector('Vintage Nike Jacke').instance.collect({
      ...query,
      titleKeywords: ['vintage', 'trackpants'],
    });
    expect(result).toEqual([]);
  });
  it('accepts any configured title word in any mode', async () => {
    const result = await collector('Nike Trackpants').instance.collect({
      ...query,
      titleKeywords: ['vintage', 'trackpants'],
      keywordMode: 'any',
    });
    expect(result).toHaveLength(1);
  });
  it('keeps category and brand restrictions in the actual upstream request', async () => {
    const { instance, fetchFn } = collector('Vintage Nike Jacke');
    await instance.collect(query);
    const url = new URL(String(fetchFn.mock.calls[0]?.[0]));
    expect(url.searchParams.get('catalog_ids')).toBe('79');
    expect(url.searchParams.get('brand_ids')).toBe('53');
  });
  it('allows a category-only filter without a hidden Nike restriction', async () => {
    const { instance, fetchFn } = collector('Vintage Jacke');
    await instance.collect({ ...query, brandId: null, brandIds: [] });
    const url = new URL(String(fetchFn.mock.calls[0]?.[0]));
    expect(url.searchParams.get('catalog_ids')).toBe('79');
    expect(url.searchParams.has('brand_ids')).toBe(false);
  });
});
