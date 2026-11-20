import type { MarketplaceListing } from '../domain/listing.js';
import type { SniperQuery } from '../domain/query.js';
import { searchFilterRequest } from '../domain/search-filter-request.js';
import { createTitleKeywordMatcher } from '../domain/title-keywords.js';
import { parseVintedCatalogPage } from './catalog-page.js';
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
import { sleep, type FetchLike, type SessionOptions, type Sleep } from './session.js';

const CATALOG_PATH = '/catalog';
const PER_PAGE = '96';
const RETRY_DELAYS_MS = [500, 1000] as const;

export class VintedCollector {
  private lastFreshnessKey = 0;

  constructor(
    private readonly options: SessionOptions,
    private readonly fetchFn: FetchLike,
    private readonly sleepFn: Sleep = sleep,
    private readonly connectionState?: VintedConnectionState,
    private readonly now: () => number = Date.now,
  ) {}

  /** Je Abruf eine neue Zahl: sekundengenau, bei mehreren Abrufen in einer Sekunde fortlaufend. */
  private nextFreshnessKey(): number {
    const seconds = Math.floor(this.now() / 1000);
    // Ein ungültiger Uhrwert darf den Zähler nicht dauerhaft unbrauchbar machen.
    this.lastFreshnessKey = Number.isSafeInteger(seconds)
      ? Math.max(seconds, this.lastFreshnessKey + 1)
      : this.lastFreshnessKey + 1;
    return this.lastFreshnessKey;
  }

  async collect(
    query: SniperQuery,
    options: { allowRetries?: boolean } = {},
  ): Promise<MarketplaceListing[]> {
    const titleMatches = createTitleKeywordMatcher(
      query.titleKeywords ?? [],
      query.keywordMode ?? 'all',
      query.excludedTitleKeywords ?? [],
    );
    return (await this.collectSource(query, options)).filter((listing) =>
      titleMatches(listing.title),
    );
  }

  /** Ungefilterte Quellantwort; jeder fachliche Empfänger prüft seine Titelregeln selbst. */
  async collectSource(
    query: SniperQuery,
    options: { allowRetries?: boolean; page?: number } = {},
  ): Promise<MarketplaceListing[]> {
    const catalogUrl = buildVintedCatalogUrl(query, this.options.baseUrl, options.page ?? 1);
    const url =
      this.options.freshCatalogRequests === false
        ? catalogUrl
        : freshVintedCatalogUrl(catalogUrl, this.nextFreshnessKey());

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

const FRESH_CEILING_BASE = 100_000;
const FRESH_CEILING_SPAN = 900_000;
const FRESH_FLOOR_SPAN = 9_999;
/** Teilerfremd zu 9.999: Aufeinanderfolgende Untergrenzen unterscheiden sich schon vorne. */
const FRESH_FLOOR_SPREAD = 1_237;
const SUB_CENT_STEPS = 99;

/**
 * Seit dem 19.11.2026 (gegen 12:12 Uhr) speichert Vinted die Katalogseite für nicht
 * angemeldete Besucher je Abfrage rund zwei Minuten zwischen; gleiche Abfragen liefern
 * so lange dieselbe Liste. Eine bisher ungenutzte Abfrage wird dagegen frisch gelesen
 * (am 20.11.2026 gemessen). Deshalb bekommt jeder Abruf eine wirkungslose, wechselnde
 * Preisgrenze. Vinted rundet Preisgrenzen im Speicherschlüssel auf vier Nachkommastellen,
 * vergleicht die Preise selbst aber exakt; Artikelpreise haben volle Cent.
 *
 * - ohne Obergrenze: Obergrenze ab 100.000 €
 * - mit Obergrenze, ohne Untergrenze: Untergrenze unter 1 € (0 € zählt als keine Untergrenze)
 *   (unter 1,5 Mio. gespeicherten Artikeln lag am 20.11.2026 keiner unter 1 € oder über 30.000 €)
 * - mit beiden Grenzen: beide um Bruchteile eines Cents geweitet, z. B. 9,9901–50,0001 statt
 *   10–50; dazwischen liegt kein zusätzlicher Centbetrag
 * - unsinnige Grenzen (Obergrenze unter 1 €, Untergrenze ab 100.000 € ohne Obergrenze,
 *   Grenzen mit Bruchteilen eines Cents): unverändert
 *
 * Die Planungsschlüssel aus `buildVintedCatalogUrl` bleiben dadurch unverändert.
 */
export function freshVintedCatalogUrl(catalogUrl: URL, freshnessKey: number): URL {
  if (!Number.isSafeInteger(freshnessKey) || freshnessKey < 0)
    throw new Error('Ungültiger Abrufschlüssel.');
  const url = new URL(catalogUrl);
  const ceiling = readPriceBound(url, 'price_to');
  const floor = readPriceBound(url, 'price_from');
  if (ceiling === undefined || floor === undefined) return url;
  if (floor === 0) url.searchParams.delete('price_from');

  if (ceiling === null) {
    if (floor === null || floor === 0 || floor < FRESH_CEILING_BASE)
      url.searchParams.set(
        'price_to',
        String(FRESH_CEILING_BASE + (freshnessKey % FRESH_CEILING_SPAN)),
      );
  } else if (floor === null || floor === 0) {
    if (ceiling >= 1) {
      const step = ((freshnessKey % FRESH_FLOOR_SPAN) * FRESH_FLOOR_SPREAD) % FRESH_FLOOR_SPAN;
      url.searchParams.set('price_from', formatTenThousandths(1 + step));
    }
  } else if (isWholeCents(floor) && isWholeCents(ceiling)) {
    const step = freshnessKey % (SUB_CENT_STEPS * SUB_CENT_STEPS);
    url.searchParams.set(
      'price_from',
      formatTenThousandths(Math.round(floor * 10_000) - 1 - (step % SUB_CENT_STEPS)),
    );
    url.searchParams.set(
      'price_to',
      formatTenThousandths(Math.round(ceiling * 10_000) + 1 + Math.floor(step / SUB_CENT_STEPS)),
    );
  }
  return url;
}

/** `null`: nicht gesetzt; `undefined`: nicht lesbar, die Adresse bleibt dann unverändert. */
function readPriceBound(url: URL, name: 'price_from' | 'price_to'): number | null | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null) return null;
  const value = Number(raw);
  return raw.trim() !== '' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function isWholeCents(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

function formatTenThousandths(value: number): string {
  return `${Math.floor(value / 10_000)}.${String(value % 10_000).padStart(4, '0')}`;
}
