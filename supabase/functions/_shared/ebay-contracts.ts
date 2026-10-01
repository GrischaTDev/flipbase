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
  readonly configured: boolean;
  readonly connection: EbayConnection | null;
}
export interface EbayListing {
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
