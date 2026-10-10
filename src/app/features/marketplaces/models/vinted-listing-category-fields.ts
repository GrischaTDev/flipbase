import '../../../../../tools/flipbase-extension/vinted-listing-runtime.js';
import type {
  VintedListingCategoryFields,
  VintedListingContent,
  VintedListingPhotoMetadata,
  VintedListingValidationIssue,
} from '../../../../../supabase/functions/_shared/marketplace-listing-contracts';
export type {
  VintedListingCategoryFields,
  VintedListingChoice,
  VintedListingChoiceSnapshot,
  VintedListingValidationIssue,
} from '../../../../../supabase/functions/_shared/marketplace-listing-contracts';

interface ListingCategoryRuntime {
  parseCategoryFields(input: unknown, expectedCategoryId: number): VintedListingCategoryFields;
  validateSubmission(
    content: VintedListingContent,
    photos: readonly VintedListingPhotoMetadata[],
    schema: VintedListingCategoryFields,
  ): readonly VintedListingValidationIssue[];
}
/** Derselbe begrenzte Antwortprüfer wie im lokalen und Cloud-Browser. */
export const parseVintedListingCategoryFields = (
  globalThis as unknown as {
    FlipbaseVintedListingRuntime: ListingCategoryRuntime;
  }
).FlipbaseVintedListingRuntime.parseCategoryFields;
export const validateVintedListingSubmission = (
  globalThis as unknown as { FlipbaseVintedListingRuntime: ListingCategoryRuntime }
).FlipbaseVintedListingRuntime.validateSubmission;
