import type { VintedListingCategoryFields } from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';

/**
 * Bereitet die bei Vinted gelesenen Auswahlwerte einer Kategorie zum Speichern vor.
 * Entfernt inseratbezogene Angaben: Auswahlmarkierungen und die Marke des gelesenen Inserats.
 */
export function vintedCategoryFieldsForStorage(
  fields: VintedListingCategoryFields,
): VintedListingCategoryFields {
  return {
    ...fields,
    fields: fields.fields
      .filter((field) => field.field !== 'brand' && field.field !== 'category')
      .map((field) => ({
        ...field,
        choices: field.choices.map((choice) => ({ ...choice, selected: false })),
      })),
  };
}
