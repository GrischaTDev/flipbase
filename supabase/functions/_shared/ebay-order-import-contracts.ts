import type { AccountScope } from './marketplace-contracts.ts';

export interface EbayMoney {
  readonly currency: string;
  readonly cents: number;
}
export interface EbayOrderSourceLine {
  readonly lineItemId: string | null;
  readonly listingId: string | null;
  readonly variationId: string | null;
  readonly sku: string | null;
  readonly title: string;
  readonly quantity: number | null;
  readonly goodsCents: number | null;
  readonly hasRefund: boolean;
  readonly variationAspects: readonly { readonly name: string; readonly value: string }[];
}
export interface EbayOrderSource {
  readonly orderId: string;
  readonly createdAt: string;
  readonly lastModifiedAt: string | null;
  readonly observedAt: string;
  readonly paymentStatus: string;
  readonly cancelStatus: string | null;
  readonly fulfillmentStatus: string;
  readonly currency: string | null;
  readonly totalCents: number | null;
  readonly shippingRevenueCents: number | null;
  readonly lines: readonly EbayOrderSourceLine[];
  readonly blockers: readonly string[];
}
export type EbaySaleTarget =
  { readonly inventoryItemId: string } | { readonly catalogProductId: string };
export interface EbayOrderAssignment {
  readonly lineItemId: string;
  readonly target: EbaySaleTarget;
}
export interface EbayArticleMapping {
  readonly id: string;
  readonly listingId: string;
  readonly variationId: string | null;
  readonly target: EbaySaleTarget;
}
export type EbayOrderBooking =
  | { readonly status: 'unrecorded'; readonly saleId: null }
  | { readonly status: 'imported'; readonly saleId: string; readonly alreadyRecorded: boolean }
  | { readonly status: 'recorded_elsewhere'; readonly saleId: string | null };
export interface EbayOrderReview extends AccountScope {
  readonly snapshotId: string;
  readonly reviewHash: string;
  readonly expiresAt: string;
  readonly source: EbayOrderSource;
  readonly assignments: readonly EbayOrderAssignment[];
  readonly booking: EbayOrderBooking;
}
export interface EbayOrderCosts {
  readonly platformFeeCents: number;
  readonly shippingCostCents: number;
  readonly shippingMode: 'seller_arranged' | 'platform_prepaid' | 'pickup' | null;
  readonly additionalCosts: readonly {
    readonly category: 'packaging' | 'payment_fee' | 'promotion' | 'other';
    readonly description: string | null;
    readonly amountCents: number;
  }[];
}
export interface EbayOrderBookRequest extends AccountScope {
  readonly orderId: string;
  readonly snapshotId: string;
  readonly reviewHash: string;
  readonly assignments: readonly EbayOrderAssignment[];
  readonly costs: EbayOrderCosts;
}
export type EbayOrderBookResponse =
  | Extract<EbayOrderBooking, { status: 'imported' }>
  | { readonly status: 'review_changed'; readonly review: EbayOrderReview };
