import type { VintedPublicationAge } from './vinted-listing-age';
import type { MarketplaceId } from '../../../core/services/marketplace-settings.service';
export interface MarketplaceListingReference {
  readonly platform: MarketplaceId;
  readonly workspaceId: string;
  readonly connectionId: string;
  readonly externalId: string;
}
export type MarketplaceListingAction = 'view' | 'edit' | 'publish_elsewhere' | 'delete' | 'relist';
export type MarketplaceListingState = 'active' | 'reserved' | 'ended' | 'processing' | 'unknown';
export interface MarketplaceOverviewAccount {
  readonly platform: MarketplaceId;
  readonly workspaceId: string;
  readonly connectionId: string;
  readonly displayName: string;
  readonly status: string;
  readonly activeCount: number | null;
  readonly listingCount: number | null;
  readonly observedAt: string | null;
  readonly completeness: 'complete' | 'partial' | 'unknown';
  readonly supportsSearch: boolean;
  readonly supportsStatus: boolean;
  readonly canEdit: boolean;
  readonly error: string | null;
}
export interface MarketplaceOverviewListing {
  readonly reference: MarketplaceListingReference;
  readonly title: string;
  readonly priceCents: number | null;
  readonly currency: string | null;
  readonly imageUrl: string | null;
  readonly publishedAt: string | null;
  readonly publicationAge?: VintedPublicationAge | null;
  readonly state: MarketplaceListingState;
  readonly actions: readonly MarketplaceListingAction[];
  readonly detailLink: readonly string[] | null;
  readonly externalUrl: string | null;
  readonly editLink: readonly string[] | null;
}
export interface MarketplaceListingQuery {
  readonly state: 'all' | 'active' | 'reserved' | 'ended';
  readonly search: string;
  readonly cursor?: string;
  readonly limit: number;
}
export interface MarketplaceOverviewPage {
  readonly items: readonly MarketplaceOverviewListing[];
  readonly total: number | null;
  readonly nextCursor: string | null;
  readonly completeness: 'complete' | 'partial' | 'unknown';
}
export const DEFAULT_LISTING_QUERY: MarketplaceListingQuery = {
  state: 'all',
  search: '',
  limit: 25,
};
