/** Unvollständige Arbeitskopie; keine Freigabe für eine Anbieteraktion. */
export interface VintedListingContent {
  readonly title: string;
  readonly description: string;
  readonly priceCents: number | null;
  readonly currency: 'EUR';
  readonly categoryId: number | null;
  readonly categoryLabel: string;
  readonly brandId: number | null;
  readonly brandLabel: string;
  readonly sizeId: number | null;
  readonly sizeLabel: string;
  readonly conditionId: number | null;
  readonly conditionLabel: string;
  readonly colorIds: readonly number[];
  readonly colorLabels: readonly string[];
  readonly materialIds: readonly number[];
  readonly materialLabels: readonly string[];
  readonly packageSizeId: number | null;
  readonly attributes: Readonly<Record<string, string>>;
}

export type VintedListingChoiceField =
  'category' | 'brand' | 'size' | 'condition' | 'color' | 'material' | 'package';

export interface VintedListingChoice {
  /** null ist ausschließlich die ausdrückliche Auswahl „Keine Marke“. */
  readonly id: number | null;
  readonly label: string;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly sizeGroupId: number | null;
}

export interface VintedListingChoiceSnapshot {
  readonly field: VintedListingChoiceField;
  readonly choices: readonly VintedListingChoice[];
  readonly sizeGroupId: number | null;
}

export interface VintedListingCategoryFields {
  readonly categoryId: number;
  readonly fields: readonly VintedListingChoiceSnapshot[];
  readonly unknownFields: readonly string[];
  readonly acceptedPhotoMimeTypes: readonly string[];
  readonly titleMaxLength: number | null;
  readonly descriptionMaxLength: number | null;
  readonly aiPhoto: boolean | null;
  readonly bump: boolean | null;
}

export interface VintedListingPhotoMetadata {
  readonly mimeType: string;
  readonly byteSize: number;
}

export interface VintedListingValidationIssue {
  readonly field: string;
  readonly code: 'missing' | 'invalid' | 'unavailable' | 'disabled' | 'limit' | 'unsupported';
}

export type MarketplaceListingAction = 'publish' | 'vinted_draft' | 'update';

/** Ein Ergebnis gilt nur nach einem erneuten Anbieterabruf als bestätigt. */
export type MarketplaceListingResult =
  | {
      readonly outcome: 'confirmed';
      readonly action: MarketplaceListingAction;
      readonly externalId: string;
      readonly externalAccountId: string;
      readonly providerState: 'active' | 'draft' | 'processing';
      readonly verifiedAt: string;
    }
  | {
      readonly outcome: 'failed' | 'outcome_unknown';
      readonly errorCode: string;
    };
