import '../../../../../tools/flipbase-extension/vinted-listing-runtime.js';
import type {
  VintedListingCategoryFields,
  VintedListingContent,
  VintedListingCurrentContent,
  VintedListingPhotoMetadata,
  VintedListingValidationIssue,
} from '../../../../../supabase/functions/_shared/marketplace-listing-contracts';
export type {
  VintedListingCategoryFields,
  VintedListingChoice,
  VintedListingChoiceSnapshot,
  VintedListingCurrentContent,
  VintedListingValidationIssue,
} from '../../../../../supabase/functions/_shared/marketplace-listing-contracts';

interface ListingCategoryRuntime {
  parseCategoryFields(input: unknown, expectedCategoryId: number): VintedListingCategoryFields;
  parseCurrentContent(
    input: unknown,
    accountId: string,
    externalId: string,
  ): VintedListingCurrentContent;
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
/** Iststand eines bestehenden Inserats; Inhalt und Auswahl müssen zusammenpassen. */
export const parseVintedListingCurrentContent = (
  globalThis as unknown as { FlipbaseVintedListingRuntime: ListingCategoryRuntime }
).FlipbaseVintedListingRuntime.parseCurrentContent;
export const validateVintedListingSubmission = (
  globalThis as unknown as { FlipbaseVintedListingRuntime: ListingCategoryRuntime }
).FlipbaseVintedListingRuntime.validateSubmission;
