import '../../../tools/flipbase-extension/vinted-listing-runtime.js';
import type {
  MarketplaceListingAction,
  MarketplaceListingResult,
  MarketplaceListingSnapshot,
  VintedListingChoiceField,
  VintedListingChoiceSnapshot,
  VintedListingContent,
  VintedListingCategoryFields,
  VintedListingPhotoMetadata,
  VintedListingValidationIssue,
} from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';

interface ListingRuntime {
  parseSnapshot(
    input: unknown,
    workspaceId: string,
    connectionId: string,
  ): MarketplaceListingSnapshot;
  parseChoices(field: VintedListingChoiceField, input: unknown): VintedListingChoiceSnapshot;
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
const runtime = (globalThis as unknown as { FlipbaseVintedListingRuntime: ListingRuntime })
  .FlipbaseVintedListingRuntime;
export const parseVintedListingChoices = runtime.parseChoices;
export const parseVintedListingSnapshot = runtime.parseSnapshot;
export const collectVintedListingChoices = runtime.collectChoices;
export const collectVintedListingFormMetadata = runtime.collectFormMetadata;
export const isVintedListingResult = runtime.isResult;
export const validateVintedListingSubmission = runtime.validateSubmission;
