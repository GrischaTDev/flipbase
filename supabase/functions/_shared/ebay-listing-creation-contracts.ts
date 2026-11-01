export interface EbayListingDraft {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly price: number;
  readonly quantity: number;
  readonly categoryId: string;
  readonly conditionId: string;
  readonly postalCode: string;
  readonly location: string;
  readonly paymentPolicyId: string;
  readonly fulfillmentPolicyId: string;
  readonly returnPolicyId: string;
  readonly imageUrls: readonly string[];
  readonly aspects: readonly { readonly name: string; readonly values: readonly string[] }[];
}
export interface EbayListingCheck {
  readonly valid: boolean;
  readonly listingId: string | null;
  readonly fees: readonly {
    readonly name: string;
    readonly amount: number;
    readonly currency: string;
  }[];
  readonly issues: readonly string[];
  readonly warnings: readonly string[];
}
export interface EbayListingSettings {
  readonly payment: readonly { readonly id: string; readonly name: string }[];
  readonly fulfillment: readonly { readonly id: string; readonly name: string }[];
  readonly returns: readonly { readonly id: string; readonly name: string }[];
}
export interface EbayCategoryDetails {
  readonly conditions: readonly { readonly id: string; readonly name: string }[];
  readonly aspects: readonly {
    readonly name: string;
    readonly required: boolean;
    readonly selectionOnly: boolean;
    readonly multiple: boolean;
    readonly values: readonly string[];
  }[];
}
