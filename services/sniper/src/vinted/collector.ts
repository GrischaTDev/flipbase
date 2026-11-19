import type { MarketplaceListing } from '../domain/listing.js';
import type { SniperQuery } from '../domain/query.js';
import { searchFilterRequest } from '../domain/search-filter-request.js';
import { createTitleKeywordMatcher } from '../domain/title-keywords.js';
import { parseVintedCatalogPage } from './catalog-page.js';
import { comparisonItemUrl } from './comparison-catalog-page.js';
import { parseVintedComparisonItemPage } from './comparison-item-page.js';
import { readVintedPage } from './response-body.js';
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
import { RequestBudgetUnavailableError } from '../runtime/budget.js';
import { sleep, type FetchLike, type SessionOptions, type Sleep } from './session.js';

const CATALOG_PATH = '/catalog';
const PER_PAGE = '96';
const RETRY_DELAYS_MS = [500, 1000] as const;
const MAX_DETAIL_CHECKS_PER_RUN = 2;
const MAX_CATEGORY_OBSERVATIONS = 2_000;
const CATEGORY_OBSERVATION_MS = 60 * 60_000;
const MISSING_CATEGORY_OBSERVATION_MS = 60_000;

interface CategoryVerification {
  isLeaf(catalogId: number): Promise<boolean>;
  hasCapacity(): boolean;
}

export interface CategoryVerificationResult {
  listings: MarketplaceListing[];
  hasPendingChecks: boolean;
}

export class VintedCollector {
  private readonly categoryObservations = new Map<
    string,
    { catalogId: string | null; expiresAt: number }
  >();

  constructor(
    private readonly options: SessionOptions,
    private readonly fetchFn: FetchLike,
    private readonly sleepFn: Sleep = sleep,
    private readonly connectionState?: VintedConnectionState,
    private readonly categoryVerification?: CategoryVerification,
  ) {}

  async collect(
    query: SniperQuery,
    options: { allowRetries?: boolean } = {},
  ): Promise<MarketplaceListing[]> {
    const titleMatches = createTitleKeywordMatcher(
      query.titleKeywords ?? [],
      query.keywordMode ?? 'all',
      query.excludedTitleKeywords ?? [],
    );
    const titleMatchesListings = (await this.collectSource(query, options)).filter((listing) =>
      titleMatches(listing.title),
    );
    const verified = await this.verifyCategory(query, titleMatchesListings);
    if (verified.hasPendingChecks && !query.isSeeded) throw new RequestBudgetUnavailableError();
    return verified.listings;
  }

  async verifyCategory(
    query: SniperQuery,
    listings: MarketplaceListing[],
  ): Promise<CategoryVerificationResult> {
    const verification = this.categoryVerification;
    if (
      !verification ||
      query.catalogId === null ||
      listings.length === 0 ||
      !(await verification.isLeaf(query.catalogId))
    ) {
      return { listings, hasPendingChecks: false };
    }

    const verifiedListings: MarketplaceListing[] = [];
    let checks = 0;
    let hasPendingChecks = false;
    const expectedCategory = String(query.catalogId);
    for (const listing of listings) {
      const id = listing.externalId;
      // The canonical catalog URL avoids the browser's blocked ID-only redirect.
      const url = comparisonItemUrl(listing.url, this.options.baseUrl, id);
      if (!url) continue;

      let observation = this.categoryObservations.get(id);
      if (!observation || observation.expiresAt <= Date.now()) {
        if (checks >= MAX_DETAIL_CHECKS_PER_RUN || !verification.hasCapacity()) {
          hasPendingChecks = true;
          continue;
        }
        checks += 1;
        const catalogId = await this.readItemCategory(url, id, query.id);
        observation = {
          catalogId,
          expiresAt:
            Date.now() +
            (catalogId === null ? MISSING_CATEGORY_OBSERVATION_MS : CATEGORY_OBSERVATION_MS),
        };
        this.categoryObservations.delete(id);
        this.categoryObservations.set(id, observation);
        if (this.categoryObservations.size > MAX_CATEGORY_OBSERVATIONS) {
          const oldestId = this.categoryObservations.keys().next().value;
          if (oldestId !== undefined) this.categoryObservations.delete(oldestId);
        }
      }
      if (observation.catalogId === expectedCategory) verifiedListings.push(listing);
    }
    return { listings: verifiedListings, hasPendingChecks };
  }

  /** Ungefilterte Quellantwort; jeder fachliche Empfänger prüft seine Titelregeln selbst. */
  async collectSource(
    query: SniperQuery,
    options: { allowRetries?: boolean; page?: number } = {},
  ): Promise<MarketplaceListing[]> {
    const url = buildVintedCatalogUrl(query, this.options.baseUrl, options.page ?? 1);

    try {
      const response = await this.request(url, query.id, options.allowRetries ?? true);
      const body = await readVintedPage(response);

      assertNoVintedChallenge(response, body, query.id);

      let listings: MarketplaceListing[];
      try {
        listings = parseVintedCatalogPage(body, this.options.baseUrl).map(normalizeVintedItem);
      } catch (error) {
        // Eine akzeptierte HTTP-Antwort belegt noch keinen lesbaren Katalog.
        if (error instanceof VintedCollectorError) throw error;
        throw new VintedParserError(error instanceof Error ? error.message : String(error), {
          phase: 'parse',
          status: response.status,
          queryId: query.id,
          responseSample: body.slice(0, 300),
        });
      }

      this.connectionState?.recordSuccess();
      return listings;
    } catch (error) {
      this.connectionState?.recordFailure();
      throw error;
    }
  }

  private async readItemCategory(
    url: URL,
    externalId: string,
    queryId: string,
  ): Promise<string | null> {
    try {
      const response = await this.request(url, queryId, false);
      const body = await readVintedPage(response);
      assertNoVintedChallenge(response, body, queryId);
      return parseVintedComparisonItemPage(body, externalId, new Date()).categoryId;
    } catch (error) {
      // A removed item can still appear in the catalog briefly.
      if (error instanceof VintedHttpError && (error.status === 404 || error.status === 410)) {
        return null;
      }
      throw error;
    }
  }

  private async request(url: URL, queryId?: string, allowRetries = true): Promise<Response> {
    let retryIndex = 0;

    for (;;) {
      const response = await this.fetchFn(url);

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
        throw new ForbiddenError('Vinted refused the request', {
          status: 403,
          phase: 'request',
          queryId,
          challengeDetected: response.headers.get('cf-mitigated') === 'challenge',
          retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
        });
      }

      if (response.status === 401) {
        throw new UnauthorizedError('Vinted session rejected', {
          status: 401,
          phase: 'request',
          queryId,
        });
      }

      if (response.status >= 500 && allowRetries && retryIndex < RETRY_DELAYS_MS.length) {
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
}

function assertNoVintedChallenge(response: Response, body: string, queryId: string): void {
  if (
    response.headers.get('cf-mitigated') === 'challenge' ||
    body.includes('challenge-running') ||
    body.includes('<title>Just a moment...</title>')
  ) {
    throw new ForbiddenError('Vinted access challenge detected', {
      status: response.status,
      phase: 'body',
      queryId,
      challengeDetected: true,
      retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
    });
  }
}

export function buildVintedCatalogUrl(query: SniperQuery, baseUrl: string, page = 1): URL {
  if (!Number.isInteger(page) || page < 1 || page > 3) throw new Error('Ungültige Katalogseite.');
  const request = searchFilterRequest(query);
  const url = new URL(CATALOG_PATH, baseUrl);
  if (request.searchText) url.searchParams.set('search_text', request.searchText);
  url.searchParams.set('order', 'newest_first');
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', PER_PAGE);
  if (query.catalogId !== null) url.searchParams.set('catalog_ids', String(query.catalogId));
  if (request.brandId !== null) url.searchParams.set('brand_ids', String(request.brandId));
  if (query.priceTo !== null) url.searchParams.set('price_to', String(query.priceTo));
  if (query.priceFrom !== null) url.searchParams.set('price_from', String(query.priceFrom));

  return url;
}
