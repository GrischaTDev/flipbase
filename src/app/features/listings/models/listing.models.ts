import type { InventoryItem, ItemMedia, ItemStatus } from '../../../core/models/flipbase.models';

export type ListingPlatform = 'kleinanzeigen';
export type ListingStatus = 'prepared' | 'online' | 'ended';
export type ListingEndReason = 'sold' | 'manual' | null;
export type ListingPriceType = 'FIXED' | 'NEGOTIABLE';
export type ListingShippingType = 'pickup' | 'shipping' | 'both';
export type ListingFilter = 'open' | 'online' | 'ended' | 'all';

export interface ListingContent {
  readonly title: string;
  readonly description: string;
  readonly price: number;
  readonly priceType: ListingPriceType;
  readonly shippingType: ListingShippingType;
  readonly shippingPrice: number | null;
  readonly postalCode: string | null;
}

export interface Listing {
  readonly id: string;
  readonly workspaceId: string;
  readonly inventoryItemId: string;
  readonly platform: ListingPlatform;
  readonly status: ListingStatus;
  readonly endReason: ListingEndReason;
  readonly content: ListingContent;
  readonly listedCount: number;
  readonly lastListedAt: string | null;
  readonly onlineSince: string | null;
  readonly endedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListingEditorItem {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly condition: InventoryItem['condition'];
  readonly conditionNotes: string | null;
  readonly description: string | null;
  readonly status: ItemStatus;
  readonly archivedAt: string | null;
  readonly expectedValue: number | null;
  readonly allocatedPurchaseCost: number | null;
  readonly media: readonly ItemMedia[];
}

export interface ListingRow {
  readonly listing: Listing;
  readonly item: ListingEditorItem;
  readonly primaryImagePath: string | null;
}

export interface ListingValidationError {
  readonly field: keyof ListingContent;
  readonly message: string;
}
