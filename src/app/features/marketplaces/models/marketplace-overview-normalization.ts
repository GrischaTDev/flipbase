import type { AccountScope } from './marketplace.models';
import type { MarketplaceEntry } from './marketplace-read.models';
import type { EbayListing } from '../../../../../supabase/functions/_shared/ebay-contracts';
import type {
  MarketplaceListingReference,
  MarketplaceOverviewAccount,
  MarketplaceOverviewListing,
} from './marketplace-overview.models';

export function overviewAccountKey(
  account: Pick<MarketplaceOverviewAccount, 'platform' | 'workspaceId' | 'connectionId'>,
): string {
  return JSON.stringify([account.platform, account.workspaceId, account.connectionId]);
}
export function overviewListingKey(reference: MarketplaceListingReference): string {
  return JSON.stringify([
    reference.platform,
    reference.workspaceId,
    reference.connectionId,
    reference.externalId,
  ]);
}
function cents(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  const result = Math.round(value * 100);
  return Number.isSafeInteger(result) ? result : null;
}
export function normalizeVintedPublication(
  entry: MarketplaceEntry & {
    readonly isClosed?: boolean | null;
    readonly isReserved?: boolean | null;
  },
): MarketplaceOverviewListing {
  if (!entry.externalId)
    throw new Error('Die externe Inseratkennung fehlt. Aktualisiere die Kontodaten.');
  return {
    reference: {
      platform: 'vinted',
      workspaceId: entry.workspaceId,
      connectionId: entry.connectionId,
      externalId: entry.externalId,
    },
    title: entry.title,
    priceCents: cents(entry.price),
    currency: entry.currency,
    imageUrl: entry.imageUrl,
    publishedAt: entry.publishedAt ?? null,
    state:
      entry.isClosed === true
        ? 'ended'
        : entry.isReserved === true
          ? 'reserved'
          : entry.isClosed === false && entry.isReserved === false
            ? 'active'
            : 'unknown',
    actions: ['view'],
    detailLink: ['/marketplaces/vinted/listings', entry.connectionId, entry.id],
    externalUrl: null,
    editLink: null,
  };
}
function ebayUrl(value: string | null): string | null {
  try {
    if (!value) return null;
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      ['ebay.de', 'www.ebay.de', 'ebay.com', 'www.ebay.com'].includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function normalizeEbayListing(
  scope: AccountScope,
  listing: EbayListing,
): MarketplaceOverviewListing {
  const externalUrl = ebayUrl(listing.url);
  return {
    reference: { platform: 'ebay', ...scope, externalId: listing.id },
    title: listing.title,
    priceCents: cents(listing.price),
    currency: listing.currency,
    imageUrl: listing.imageUrl ?? null,
    publishedAt: null,
    state: 'active',
    actions: externalUrl ? ['view'] : [],
    detailLink: null,
    externalUrl,
    editLink: null,
  };
}
