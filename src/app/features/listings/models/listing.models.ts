import type { InventoryItem, ItemMedia, ItemStatus } from '../../../core/models/flipbase.models';

export type ListingPlatform = 'kleinanzeigen';
export type ListingStatus = 'prepared' | 'online' | 'ended';
export type ListingEndReason = 'sold' | 'manual' | null;
export type ListingPriceType = 'FIXED' | 'NEGOTIABLE';
export type ListingShippingType = 'pickup' | 'shipping' | 'both';
export type ListingFilter = 'open' | 'online' | 'ended' | 'all';
export type ListingStyleTone = 'dealer' | 'bargain' | 'collector';

export interface KleinanzeigenGenerationOptions {
  readonly includeDisclaimer: boolean;
  readonly includeNonSmoking: boolean;
  readonly styleTone: ListingStyleTone;
}

export interface GeneratedListingText {
  readonly title: string;
  readonly description: string;
}

export interface ListingImageItem {
  readonly url: string;
  readonly name: string;
}

export interface KleinanzeigenListingPayload {
  readonly itemId: string;
  readonly title: string;
  readonly description: string;
  readonly price: number;
  readonly priceType: ListingPriceType;
  readonly postalCode?: string;
  readonly shippingType: ListingShippingType;
  readonly shippingPrice?: number;
  readonly images: readonly ListingImageItem[];
}

export interface ListingContent {
  readonly title: string;
  readonly description: string;
  readonly price: number;
  readonly priceType: ListingPriceType;
  readonly shippingType: ListingShippingType;
  readonly shippingPrice: number | null;
  readonly postalCode: string | null;
}

export type ListingTargetKind = 'inventory_item' | 'catalog_product';

export interface Listing {
  readonly id: string;
  readonly workspaceId: string;
  readonly inventoryItemId?: string | null;
  readonly catalogProductId?: string | null;
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
  readonly targetKind?: ListingTargetKind;
  readonly availableQuantity?: number;
  readonly title: string;
  readonly brand: string | null;
  readonly category: string | null;
  readonly condition: InventoryItem['condition'] | null;
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

export interface ListingActionResult {
  readonly data: Listing | null;
  readonly error: Error | null;
}

export interface ListingPayloadResult {
  readonly payload: KleinanzeigenListingPayload;
  readonly missingImages: readonly string[];
}

export interface ListingValidationError {
  readonly field: keyof ListingContent;
  readonly message: string;
}
