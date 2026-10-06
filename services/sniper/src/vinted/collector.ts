import type { MarketplaceListing } from '../domain/listing.js';
import type { SniperQuery } from '../domain/query.js';
import { searchFilterRequest } from '../domain/search-filter-request.js';
import { createTitleKeywordMatcher } from '../domain/title-keywords.js';
import { parseVintedCatalogPage } from './catalog-page.js';
import {
  ForbiddenError,
  parseRetryAfter,
  RateLimitedError,
  UnauthorizedError,
  VintedCollectorError,
  VintedHttpError,
  VintedParserError,
  VintedServerError,
} from './errors.js';
import { normalizeVintedItem } from './normalizer.js';
import type { VintedConnectionState } from '../runtime/vinted-connection-state.js';
import { sleep, type FetchLike, type SessionOptions, type Sleep } from './session.js';

const CATALOG_PATH = '/catalog';
const PER_PAGE = '96';
const RETRY_DELAYS_MS = [500, 1000] as const;

export class VintedCollector {
  private readonly cookies = new Map<string, string>();

  constructor(
    private readonly options: SessionOptions,
    private readonly fetchFn: FetchLike = fetch,
    private readonly sleepFn: Sleep = sleep,
    private readonly connectionState?: VintedConnectionState,
  ) {}

  async collect(query: SniperQuery): Promise<MarketplaceListing[]> {
    const request = searchFilterRequest(query);
    const titleMatches = createTitleKeywordMatcher(
      query.titleKeywords ?? [],
      query.keywordMode ?? 'all',
    );
    const url = new URL(CATALOG_PATH, this.options.baseUrl);
    if (request.searchText) url.searchParams.set('search_text', request.searchText);
    url.searchParams.set('order', 'newest_first');
    url.searchParams.set('page', '1');
    url.searchParams.set('per_page', PER_PAGE);
    if (query.catalogId !== null) url.searchParams.set('catalog_ids', String(query.catalogId));
    if (request.brandId !== null) url.searchParams.set('brand_ids', String(request.brandId));
    if (query.priceTo !== null) url.searchParams.set('price_to', String(query.priceTo));
    if (query.priceFrom !== null) url.searchParams.set('price_from', String(query.priceFrom));

    try {
      const response = await this.request(url, query.id);
      const body = await response.text();

      // Challenge-Erkennung: Cloudflare oder Datadome kann bei HTTP 200 eine Challenge-Seite ausliefern
      if (
        response.headers.get('cf-mitigated') === 'challenge' ||
        body.includes('challenge-running') ||
        body.includes('<title>Just a moment...</title>')
      ) {
        this.cookies.clear();
        throw new ForbiddenError('Vinted access challenge detected', {
          status: response.status,
          phase: 'body',
          queryId: query.id,
          challengeDetected: true,
          retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
        });
      }

      let listings: MarketplaceListing[];
      try {
        listings = parseVintedCatalogPage(body, this.options.baseUrl).map(normalizeVintedItem);
      } catch (error) {
        // Eine zuvor akzeptierte Sitzung kann spaeter eine Katalogseite ohne
        // Artikeldaten liefern. Beim naechsten Takt neu und ohne Cookies starten.
        this.cookies.clear();
        if (error instanceof VintedCollectorError) throw error;
        throw new VintedParserError(error instanceof Error ? error.message : String(error), {
          phase: 'parse',
          queryId: query.id,
          responseSample: body.slice(0, 300),
        });
      }

      this.connectionState?.recordSuccess();
      return listings.filter((listing) => titleMatches(listing.title));
    } catch (error) {
      this.connectionState?.recordFailure();
      throw error;
    }
  }

  private async request(url: URL, queryId?: string): Promise<Response> {
    let retryIndex = 0;

    for (;;) {
      const headers: Record<string, string> = {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="133", "Google Chrome";v="133"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': this.options.userAgent,
      };

      if (this.cookies.size > 0) {
        headers['Cookie'] = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
      }

      const response = await this.fetchFn(url, { headers });
      this.recordCookies(response.headers);

      if (response.status === 429) {
        const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
        throw new RateLimitedError('Vinted rate limit reached', {
          status: 429,
          phase: 'request',
          queryId,
          retryAfterSeconds: retryAfter,
        });
      }

      if (response.status === 403) {
        this.cookies.clear();
        throw new ForbiddenError('Vinted refused the request', {
          status: 403,
          phase: 'request',
          queryId,
          challengeDetected: response.headers.get('cf-mitigated') === 'challenge',
          retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
        });
      }

      if (response.status === 401) {
        this.cookies.clear();
        throw new UnauthorizedError('Vinted session rejected', {
          status: 401,
          phase: 'request',
          queryId,
        });
      }

      if (response.status >= 500 && retryIndex < RETRY_DELAYS_MS.length) {
        await this.sleepFn(RETRY_DELAYS_MS[retryIndex]!);
        retryIndex += 1;
        continue;
      }

      if (response.status >= 500) {
        throw new VintedServerError(response.status, undefined, {
          status: response.status,
          phase: 'request',
          queryId,
        });
      }

      if (!response.ok) {
        throw new VintedHttpError(response.status, undefined, {
          status: response.status,
          phase: 'request',
          queryId,
        });
      }

      return response;
    }
  }

  private recordCookies(headers: Headers): void {
    const rawCookies: string[] =
      typeof headers.getSetCookie === 'function'
        ? headers.getSetCookie()
        : headers.get('set-cookie')
          ? [headers.get('set-cookie')!]
          : [];

    for (const raw of rawCookies) {
      const pair = raw.split(';', 1)[0]?.trim();
      if (!pair) continue;

      const separator = pair.indexOf('=');
      if (separator <= 0) continue;

      this.cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    }
  }
}
