import type { SniperQuery } from '../../src/domain/query.js';
import type { MarketplaceListing } from '../../src/domain/listing.js';

export function searchFilter(overrides: Partial<SniperQuery> = {}): SniperQuery {
  return {
    id: 'filter-1',
    queryKey: 'filter-1',
    marketplace: 'vinted',
    searchText: null,
    catalogId: 1206,
    brandId: 53,
    brandIds: [53],
    titleKeywords: ['puffer'],
    keywordMode: 'all',
    priceFrom: null,
    priceTo: null,
    pollIntervalMs: 5000,
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
    filterFormatVersion: 1,
    filterRevision: 1,
    requestCursor: 0,
    seededRequests: [],
    ...overrides,
  };
}

export function catalogListing(id: string, title = 'Puffer Jacke'): MarketplaceListing {
  return {
    marketplace: 'vinted',
    externalId: id,
    title,
    url: `https://www.vinted.de/items/${id}`,
    description: null,
    imageUrls: [],
    itemPrice: { amount: 20, currency: 'EUR' },
    totalPrice: { amount: 22, currency: 'EUR' },
    brand: 'Nike',
    size: 'M',
    condition: 'Gut',
    countryCode: null,
    seller: { name: null, avatarUrl: null, rating: null, reviewCount: null },
    isHidden: false,
    itemUpdatedAt: null,
    photoUploadedAt: null,
  };
}
