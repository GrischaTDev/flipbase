import '../../../../../tools/flipbase-extension/vinted-listing-runtime.js';
import type { VintedListingCategoryFields } from '../../../../../supabase/functions/_shared/marketplace-listing-contracts';
export type {
  VintedListingCategoryFields,
  VintedListingChoice,
  VintedListingChoiceSnapshot,
} from '../../../../../supabase/functions/_shared/marketplace-listing-contracts';

interface ListingCategoryRuntime {
  parseCategoryFields(input: unknown, expectedCategoryId: number): VintedListingCategoryFields;
}
/** Derselbe begrenzte Antwortprüfer wie im lokalen und Cloud-Browser. */
export const parseVintedListingCategoryFields = (
  globalThis as unknown as {
    FlipbaseVintedListingRuntime: ListingCategoryRuntime;
  }
).FlipbaseVintedListingRuntime.parseCategoryFields;
