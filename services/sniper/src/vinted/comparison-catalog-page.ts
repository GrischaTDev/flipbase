import type { SniperQuery } from '../domain/query.js';
import { searchFilterRequest } from '../domain/search-filter-request.js';
import { parseVintedCatalogState } from './catalog-page.js';

export interface VintedComparisonCatalogItem {
  externalId: string;
  url: string;
  title: string;
  price: number;
  currency: 'EUR';
  brand: string | null;
  size: string | null;
  condition: string | null;
}

export interface VintedComparisonPagination {
  currentPage: number;
  perPage: number;
  totalPages: number;
  totalEntries: number | null;
}

export interface VintedComparisonCatalogPage {
  items: VintedComparisonCatalogItem[];
  sourceItemCount: number;
  pagination: VintedComparisonPagination | null;
}

export function comparisonRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function comparisonText(value: unknown, maximum = 200): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && !text.startsWith('$') ? text.slice(0, maximum) : null;
}

export function comparisonEuroPrice(value: unknown): number | null {
  const money = comparisonRecord(value);
  const amount = money?.['amount'];
  if (
    (money?.['currency_code'] ?? money?.['currencyCode']) !== 'EUR' ||
    (typeof amount !== 'number' &&
      (typeof amount !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(amount)))
  )
    return null;
  const number = Number(amount);
  const cents = Math.round(number * 100);
  return Number.isFinite(number) &&
    number > 0 &&
    Number.isSafeInteger(cents) &&
    Math.abs(cents - number * 100) < 0.000001
    ? number
    : null;
}

/** Nur kanonische Artikel derselben Vinted-Herkunft; keine fremden Detailziele. */
export function comparisonItemUrl(value: unknown, baseUrl: string, itemId?: string): URL | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const base = new URL(baseUrl);
    const url = new URL(value, base);
    const id = /^\/items\/([1-9]\d{0,19})(?:-[^/]*)?$/.exec(url.pathname)?.[1];
    if (
      base.protocol !== 'https:' ||
      base.hostname !== 'www.vinted.de' ||
      base.port ||
      base.username ||
      base.password ||
      url.origin !== base.origin ||
      url.username ||
      url.password ||
      !id ||
      (itemId !== undefined && itemId !== id)
    )
      return null;
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function positiveInteger(value: unknown, maximum: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum
    ? value
    : null;
}

function parsePagination(value: unknown): VintedComparisonPagination | null {
  const entry = comparisonRecord(value);
  if (!entry) return null;
  const currentPage = positiveInteger(entry['current_page'] ?? entry['currentPage'], 10_000);
  const perPage = positiveInteger(entry['per_page'] ?? entry['perPage'], 200);
  const totalPages = positiveInteger(entry['total_pages'] ?? entry['totalPages'], 1_000_000);
  const totalEntries = positiveInteger(
    entry['total_entries'] ?? entry['totalEntries'],
    1_000_000_000,
  );
  if (
    !currentPage ||
    !perPage ||
    totalPages === null ||
    (totalPages > 0 && currentPage > totalPages)
  )
    return null;
  return { currentPage, perPage, totalPages, totalEntries };
}

export function parseVintedComparisonCatalogPage(
  html: string,
  baseUrl: string,
): VintedComparisonCatalogPage {
  const state = parseVintedCatalogState(html);
  const items = new Map<string, VintedComparisonCatalogItem>();
  const conflicts = new Set<string>();
  for (const entry of state.items) {
    const product = comparisonRecord(entry.productItem);
    const id = String(product?.['id']);
    const url = comparisonItemUrl(product?.['url'], baseUrl, id);
    const title = comparisonText(product?.['title'], 500);
    const price = comparisonEuroPrice(product?.['price']);
    if (!url || !title || price === null || conflicts.has(id)) continue;
    const box = comparisonRecord(product?.['itemBox']);
    const secondLine = comparisonText(box?.['secondLine'], 500);
    const separator = secondLine?.indexOf(' · ') ?? -1;
    const item: VintedComparisonCatalogItem = {
      externalId: id,
      url: url.href,
      title,
      price,
      currency: 'EUR',
      brand: comparisonText(box?.['firstLine']),
      size: separator >= 0 ? secondLine!.slice(0, separator) : secondLine,
      condition: separator >= 0 ? secondLine!.slice(separator + 3) || null : null,
    };
    const previous = items.get(id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(item)) {
      items.delete(id);
      conflicts.add(id);
    } else items.set(id, item);
  }
  return {
    items: [...items.values()],
    sourceItemCount: state.items.length,
    pagination: parsePagination(state.pagination),
  };
}

/** Preisgrenzen des Einkaufsfeeds gehören niemals in die Vergleichssuche. */
export function buildVintedComparisonCatalogUrl(
  query: SniperQuery,
  baseUrl: string,
  page = 1,
): URL {
  if (!Number.isInteger(page) || page < 1 || page > 10)
    throw new Error('Ungültige Vergleichsseite.');
  const request = searchFilterRequest(query);
  const url = new URL('/catalog', baseUrl);
  if (url.origin !== 'https://www.vinted.de' || url.username || url.password)
    throw new Error('Ungültige Vinted-Herkunft.');
  if (request.searchText) url.searchParams.set('search_text', request.searchText);
  url.searchParams.set('order', 'newest_first');
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', '96');
  if (request.catalogId !== null) url.searchParams.set('catalog_ids', String(request.catalogId));
  if (request.brandId !== null) url.searchParams.set('brand_ids', String(request.brandId));
  return url;
}
