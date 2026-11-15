import type {
  VintedListingCategoryFields,
  VintedListingContent,
  VintedListingCurrentContent,
} from './marketplace-listing-contracts.d.ts';
export type VintedListingEditField =
  'accessory_department' | 'brand' | 'size' | 'condition' | 'package' | 'color' | 'material';
export type VintedListingEditSnapshot = Pick<
  VintedListingCurrentContent,
  'content' | 'schema' | 'photoUrls'
>;
/** Auswahl im Bearbeitungsformular; leere Zeichenkette heißt „bei Vinted nichts gewählt“. */
export interface VintedListingEditSelection {
  readonly accessory_department?: string;
  readonly brand: string;
  readonly size: string;
  readonly condition: string;
  readonly package: string;
  readonly color: readonly string[];
  readonly material: readonly string[];
}
export interface VintedListingEditOption {
  readonly value: string;
  readonly label: string;
}
/** Wählbare Werte eines Merkmals. Von Vinted gesperrte Werte fehlen, außer sie sind schon gewählt. */
/** Vorhandene Fotos eines Inserats: Stand beim Lesen und gewünschte Auswahl in neuer Reihenfolge. */
export interface VintedListingPhotoArrangement {
  readonly base: readonly string[];
  readonly desired: readonly string[];
}
export declare function vintedListingEditOptions(
  schema: VintedListingCategoryFields,
  field: VintedListingEditField,
): readonly VintedListingEditOption[];
/** Formularwert einer Marke, wie ihn die Auswahl verwendet. */
export declare function vintedListingBrandValue(
  brand: Pick<VintedListingContent, 'brandId'>,
): string;
/**
 * Nimmt eine über die Markensuche gewählte Marke in die Auswahl auf. Vinted zeigt im Formular
 * nur die bisherige und vorgeschlagene Marken; die übrigen findet erst die Suche beim Speichern.
 */
export declare function withVintedListingBrand<T extends VintedListingEditSnapshot>(
  snapshot: T,
  brand: Pick<VintedListingContent, 'brandId' | 'brandLabel'>,
): T;
/**
 * Vinteds Kachel der Paketgröße liefert Hinweis, Name und Beschreibung ohne Trennung, etwa
 * „EmpfohlenMittelFür Artikel, die in einen Schuhkarton passen“. Gezeigt wird nur der Name.
 */
export declare function packageSizeLabel(label: string): string;
export declare function vintedListingEditSelection(
  current: VintedListingEditSnapshot,
): VintedListingEditSelection;
export declare function vintedListingPriceCents(price: string): number | null;
export declare function vintedListingPriceText(cents: number): string;
/** Preis aus Vinteds bestehendem Formular, einschließlich Eurozeichen und Tausenderpunkten. */
export declare function parseVintedListingReadPriceCents(value: string): number | null;
/**
 * Baut die gewünschten Inseratangaben aus Formular und aktueller Vinted-Auswahl. Kennung und
 * Name stammen immer aus derselben Auswahl; unbekannte oder gesperrte Werte werden abgewiesen.
 */
export declare function applyVintedListingEdit(
  current: VintedListingCurrentContent,
  text: {
    readonly title: string;
    readonly description: string;
    readonly price: string;
  },
  selection: VintedListingEditSelection,
): VintedListingContent;
