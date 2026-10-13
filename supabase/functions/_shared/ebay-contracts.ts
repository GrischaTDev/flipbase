import type { AccountScope } from './marketplace-contracts.ts';
import type { EbayOrderSource } from './ebay-order-import-contracts.ts';

export type EbayEnvironment = 'production' | 'sandbox';
export interface EbayConnection extends AccountScope {
  readonly status: 'connected' | 'needs_login' | 'disconnected';
  readonly environment: EbayEnvironment;
  readonly username: string | null;
  readonly lastReadAt: string | null;
}
export interface EbayConnectionStatus {
  readonly listingManagementAvailable?: boolean;
  readonly importAvailable?: boolean;
  readonly configured: boolean;
  readonly connection: EbayConnection | null;
}
export interface EbayListing {
  readonly imageUrl?: string | null;
  readonly watchCount?: number | null;
  readonly id: string;
  readonly title: string;
  readonly price: number | null;
  readonly currency: string | null;
  readonly quantity: number | null;
  readonly listingType: string | null;
  readonly url: string | null;
  readonly hasVariations?: boolean;
  readonly variants?: readonly {
    readonly id: string | null;
    readonly sku: string | null;
    readonly quantity: number | null;
    readonly aspects: readonly { readonly name: string; readonly value: string }[];
  }[];
}
export interface EbayListingDetails extends EbayListing {
  readonly description: string;
  readonly imageUrls: readonly string[];
  readonly revision: string;
}
export interface EbayListingUpdate {
  readonly expectedRevision: string;
  readonly title?: string;
  readonly price?: number;
  readonly description?: string;
  readonly imageUrls?: readonly string[];
}
export interface EbayListingTraffic {
  readonly listingId: string;
  readonly views: number | null;
  readonly transactions: number | null;
  readonly conversionRate: number | null;
}
export interface EbayTrafficReport extends AccountScope {
  readonly startDate: string;
  readonly endDate: string;
  readonly lastUpdatedDate: string | null;
  readonly items: readonly EbayListingTraffic[];
}
export interface EbayOrder {
  readonly id: string;
  readonly createdAt: string;
  readonly paymentStatus: string;
  readonly fulfillmentStatus: string;
  readonly cancelStatus: string | null;
  readonly total: number | null;
  readonly currency: string | null;
  readonly items: readonly { readonly title: string; readonly quantity: number | null }[];
  readonly importSource?: EbayOrderSource | null;
}
export interface EbayPage<T> extends AccountScope {
  readonly items: readonly T[];
  readonly total: number;
  readonly nextPage: number | null;
}
