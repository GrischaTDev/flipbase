import type { MarketplaceListing } from '../domain/listing.js';
import type { SniperQuery } from '../domain/query.js';
import { ForbiddenError, RateLimitedError, UnauthorizedError, VintedHttpError } from './errors.js';
import { normalizeVintedItem } from './normalizer.js';
import { VintedCatalogSchema } from './schema.js';
import {
  sleep,
  type FetchLike,
  type SessionOptions,
  type Sleep,
  type VintedSession,
} from './session.js';

const CATALOG_PATH = '/api/v2/catalog/items';
const PER_PAGE = '96';
const RETRY_DELAYS_MS = [500, 1000] as const;

export class VintedCollector {
  constructor(
    private readonly options: SessionOptions,
    private readonly session: VintedSession,
    private readonly fetchFn: FetchLike = fetch,
    private readonly sleepFn: Sleep = sleep,
  ) {}

  async collect(query: SniperQuery): Promise<MarketplaceListing[]> {
    try {
      return await this.collectOnce(query);
    } catch (error) {
      // Die Hauptursache fuer 401 ist im Cookie-Zusammenbau behoben. Falls
      // doch einer durchkommt: genau ein Neuaufwaermen, danach
      // uebernimmt der Taktgeber - endloses Wiederholen wuerde nur Anfragen
      // verbrennen und das Sperrrisiko erhoehen.
      if (!(error instanceof UnauthorizedError)) throw error;
      this.session.invalidate();
      return this.collectOnce(query);
    }
  }

  private async collectOnce(query: SniperQuery): Promise<MarketplaceListing[]> {
    const url = new URL(CATALOG_PATH, this.options.baseUrl);
    if (query.searchText) url.searchParams.set('search_text', query.searchText);
    url.searchParams.set('order', 'newest_first');
    url.searchParams.set('page', '1');
    url.searchParams.set('per_page', PER_PAGE);
    if (query.catalogId !== null) url.searchParams.set('catalog_ids', String(query.catalogId));
    if (query.brandId !== null) url.searchParams.set('brand_ids', String(query.brandId));
    if (query.priceTo !== null) url.searchParams.set('price_to', String(query.priceTo));
    if (query.priceFrom !== null) url.searchParams.set('price_from', String(query.priceFrom));

    const response = await this.request(url, await this.session.cookieHeader());
    const body: unknown = await response.json();

    return VintedCatalogSchema.parse(body).items.map(normalizeVintedItem);
  }

  private async request(url: URL, cookie: string): Promise<Response> {
    let retryIndex = 0;

    for (;;) {
      const response = await this.fetchFn(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': this.options.userAgent,
          Cookie: cookie,
        },
      });

      if (response.status === 401) throw new UnauthorizedError();
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
