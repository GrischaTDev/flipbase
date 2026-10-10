import '../../../tools/flipbase-extension/vinted-listing-runtime.js';
import type {
  MarketplaceListingAction,
  MarketplaceListingResult,
  MarketplaceListingSnapshot,
  VintedListingChoiceField,
  VintedListingChoiceSnapshot,
  VintedListingContent,
  VintedListingCurrentContent,
  VintedListingCategoryFields,
  VintedListingPhotoMetadata,
  VintedListingValidationIssue,
} from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';

interface ListingRuntime {
  collectPhotoState(): VintedListingPhotoState;
  collectFormValues(): VintedListingFormValues | null;
  formMatches(
    content: VintedListingContent,
    photos: readonly VintedListingPhotoMetadata[],
    schema: VintedListingCategoryFields,
    values: VintedListingFormValues | null,
    aiPhoto: boolean,
  ): boolean;
  photosMatch(
    uploaded: readonly { sourceImageId: string; previewUrl: string }[],
    saved: VintedListingPhotoState,
    originalIds: readonly string[],
  ): boolean;
  hasActiveListingEvidence(expected: {
    accountId: string;
    externalId: string;
    title: string;
  }): boolean;
  parseSnapshot(
    input: unknown,
    workspaceId: string,
    connectionId: string,
  ): MarketplaceListingSnapshot;
  parseChoices(field: VintedListingChoiceField, input: unknown): VintedListingChoiceSnapshot;
  parseCategoryFields(input: unknown, expectedCategoryId: number): VintedListingCategoryFields;
  parseCurrentContent(
    input: unknown,
    accountId: string,
    externalId: string,
  ): VintedListingCurrentContent;
  parseEditContent(input: unknown): VintedListingContent;
  collectChoices(field: VintedListingChoiceField): unknown;
  collectFormMetadata(): Omit<VintedListingCategoryFields, 'categoryId' | 'fields'> & {
    presentFields: readonly VintedListingChoiceField[];
  };
  isResult(
    input: unknown,
    action: MarketplaceListingAction,
    accountId: string,
  ): input is MarketplaceListingResult;
  validateSubmission(
    content: VintedListingContent,
    photos: readonly VintedListingPhotoMetadata[],
    schema: VintedListingCategoryFields,
  ): readonly VintedListingValidationIssue[];
}
export interface VintedListingPhotoState {
  valid: boolean;
  items: { index: number; url: string | null; ready: boolean }[];
}
export interface VintedListingFormValues {
  title: string;
  description: string;
  price: string;
  ai_photo: boolean;
  bump: boolean;
}
const runtime = (globalThis as unknown as { FlipbaseVintedListingRuntime: ListingRuntime })
  .FlipbaseVintedListingRuntime;
export const parseVintedListingChoices = runtime.parseChoices;
export const parseVintedListingCategoryFields = runtime.parseCategoryFields;
export const parseVintedListingCurrentContent = runtime.parseCurrentContent;
export const parseVintedListingEditContent = runtime.parseEditContent;
export const collectVintedListingPhotoState = runtime.collectPhotoState;
export const collectVintedListingFormValues = runtime.collectFormValues;
export const vintedListingFormMatches = runtime.formMatches;
export const vintedListingPhotosMatch = runtime.photosMatch;
export const parseVintedListingSnapshot = runtime.parseSnapshot;
export const hasVintedActiveListingEvidence = runtime.hasActiveListingEvidence;
export const collectVintedListingChoices = runtime.collectChoices;
export const collectVintedListingFormMetadata = runtime.collectFormMetadata;
export const isVintedListingResult = runtime.isResult;
export const validateVintedListingSubmission = runtime.validateSubmission;
