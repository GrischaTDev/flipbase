import type {
  VintedListingContent,
  VintedListingCurrentContent,
} from './marketplace-listing-contracts.d.ts';
import {
  type VintedListingEditField,
  type VintedListingEditSnapshot,
  type VintedListingPhotoArrangement,
} from './vinted-listing-edit-form.mjs';
export type VintedListingIntentFields = Record<
  Exclude<VintedListingEditField, 'accessory_department'> | 'title' | 'description' | 'price',
  string
> & {
  accessory_department?: string;
};
export declare function resolveVintedListingBasicEditIntent(
  intent: VintedListingEditIntent,
  fresh: { readonly title: string; readonly description: string; readonly price: string },
): { readonly title: string; readonly description: string; readonly price: string };
/**
 * Ordnet eine gespeicherte Größe ohne Kennung einer Katalog-Größe zu. Ältere Inserate führen
 * kombinierte Angaben wie „M / 38 / 10“; eine enthaltene Buchstabengröße ist dann eindeutig.
 */
export declare function catalogSizeForLabel(
  choices: readonly {
    readonly id: number | null;
    readonly label: string;
  }[],
  label: string,
): number | null;
/** Übernimmt nur geänderte Felder und übersetzt eigene Auswahlen in die frisch gelesenen Anbieterwerte. */
export declare function applyStoredVintedListingEdit(
  stored: VintedListingEditSnapshot,
  live: VintedListingCurrentContent,
  fields: VintedListingIntentFields,
): VintedListingContent;
export interface VintedListingEditIntent {
  readonly base: VintedListingEditSnapshot | null;
  readonly fields: VintedListingIntentFields;
  readonly initialFields: VintedListingIntentFields | null;
  readonly categoryEdit: VintedListingEditSnapshot | null;
  readonly extras: {
    readonly categoryId: number;
    readonly values: Readonly<Record<string, string>>;
  } | null;
  readonly photos: VintedListingPhotoArrangement | null;
}
/** Liest und schreibt innerhalb derselben Kontoaktion; unberührte Anbieterwerte bleiben erhalten. */
export declare function resolveVintedListingEditIntent(
  intent: VintedListingEditIntent,
  live: VintedListingCurrentContent,
): {
  readonly base: VintedListingContent;
  readonly content: VintedListingContent;
  readonly photos: VintedListingPhotoArrangement | null;
};
