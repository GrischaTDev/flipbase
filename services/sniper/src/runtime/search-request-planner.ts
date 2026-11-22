import type { SniperQuery } from '../domain/query.js';
import { searchFilterRequest } from '../domain/search-filter-request.js';
import { buildVintedCatalogUrl } from '../vinted/collector.js';

export interface SearchRequestPlan {
  key: string;
  sourceQuery: SniperQuery;
  consumers: SniperQuery[];
  validationError?: unknown;
}

/** Eine fällige Quelle kann einen engeren Preisfilter derselben Suche mit bedienen. */
export function coversPriceRange(source: SearchRequestPlan, target: SearchRequestPlan): boolean {
  const a = source.sourceQuery;
  const b = target.sourceQuery;
  if (
    a.filterFormatVersion !== 1 ||
    b.filterFormatVersion !== 1 ||
    source.validationError ||
    target.validationError ||
    source.key === target.key
  )
    return false;
  return (
    a.catalogId === b.catalogId &&
    a.brandId === b.brandId &&
    a.searchText === b.searchText &&
    (a.priceFrom === null || (b.priceFrom !== null && a.priceFrom <= b.priceFrom)) &&
    (a.priceTo === null || (b.priceTo !== null && a.priceTo >= b.priceTo))
  );
}

/** Nur wirklich identische Quellparameter teilen. Lokale Titelregeln bleiben je Filter erhalten. */
export function planSearchRequests(queries: readonly SniperQuery[]): SearchRequestPlan[] {
  const groups = new Map<string, SearchRequestPlan>();
  for (const query of queries) {
    if (!query.isActive || query.runState === 'invalid') continue;
    if (query.filterFormatVersion !== 1) {
      groups.set(`legacy:${query.id}`, {
        key: `legacy:${query.id}`,
        sourceQuery: query,
        consumers: [query],
      });
      continue;
    }
    let selected: ReturnType<typeof searchFilterRequest>;
    let key: string;
    try {
      selected = searchFilterRequest(query);
      key = buildVintedCatalogUrl(query, 'https://catalog.invalid').search;
    } catch (validationError) {
      const invalidKey = `invalid:${query.id}`;
      groups.set(invalidKey, {
        key: invalidKey,
        sourceQuery: query,
        consumers: [query],
        validationError,
      });
      continue;
    }
    const existing = groups.get(key);
    if (existing) {
      existing.consumers.push(query);
    } else {
      groups.set(key, {
        key,
        sourceQuery: {
          ...query,
          queryKey: key,
          searchText: selected.searchText,
          brandId: selected.brandId,
          brandIds: selected.brandId === null ? [] : [selected.brandId],
          titleKeywords: [],
          excludedTitleKeywords: [],
          keywordMode: 'all',
          requestCursor: 0,
        },
        consumers: [query],
      });
    }
  }
  return [...groups.values()];
}
