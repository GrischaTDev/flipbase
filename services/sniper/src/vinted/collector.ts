import type { MarketplaceListing } from '../domain/listing.js';
import type { SniperQuery } from '../domain/query.js';
import { parseVintedCatalogPage } from './catalog-page.js';
import { ForbiddenError, RateLimitedError, VintedHttpError } from './errors.js';
import { normalizeVintedItem } from './normalizer.js';
import { sleep, type FetchLike, type SessionOptions, type Sleep } from './session.js';

const CATALOG_PATH = '/catalog';
const PER_PAGE = '96';
const RETRY_DELAYS_MS = [500, 1000] as const;

export class VintedCollector {
  constructor(
    private readonly options: SessionOptions,
    private readonly fetchFn: FetchLike = fetch,
    private readonly sleepFn: Sleep = sleep,
  ) {}

  async collect(query: SniperQuery): Promise<MarketplaceListing[]> {
    const url = new URL(CATALOG_PATH, this.options.baseUrl);
    if (query.searchText) url.searchParams.set('search_text', query.searchText);
    url.searchParams.set('order', 'newest_first');
    url.searchParams.set('page', '1');
    url.searchParams.set('per_page', PER_PAGE);
    if (query.catalogId !== null) url.searchParams.set('catalog_ids', String(query.catalogId));
    if (query.brandId !== null) url.searchParams.set('brand_ids', String(query.brandId));
    if (query.priceTo !== null) url.searchParams.set('price_to', String(query.priceTo));
    if (query.priceFrom !== null) url.searchParams.set('price_from', String(query.priceFrom));

    const response = await this.request(url);
    const body = await response.text();

    return parseVintedCatalogPage(body, this.options.baseUrl).map(normalizeVintedItem);
  }

  private async request(url: URL): Promise<Response> {
    let retryIndex = 0;

    for (;;) {
      const response = await this.fetchFn(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
          'User-Agent': this.options.userAgent,
        },
      });

      if (response.status === 429) throw new RateLimitedError();
      if (response.status === 403) throw new ForbiddenError();

      if (response.status >= 500 && retryIndex < RETRY_DELAYS_MS.length) {
        await this.sleepFn(RETRY_DELAYS_MS[retryIndex]!);
        retryIndex += 1;
        continue;
      }

      if (!response.ok) throw new VintedHttpError(response.status);

      return response;
    }
  }
}
