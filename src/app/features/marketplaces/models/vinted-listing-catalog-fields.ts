import {
  parseVintedListingCategoryFields,
  type VintedListingCategoryFields,
  type VintedListingChoiceSnapshot,
} from './vinted-listing-category-fields';

/** Zeilen aus vinted_listing_category_fields. */
export interface VintedListingCatalogFieldRow {
  readonly field_code: string;
  readonly position: number;
  readonly option_ids: readonly number[] | null;
}

/** Zeilen aus vinted_listing_category_size_groups mit ihren Größen. */
export interface VintedListingCatalogSizeGroupRow {
  readonly size_group_id: number;
  readonly position: number;
}

export interface VintedListingCatalogSizeRow {
  readonly id: number;
  readonly size_group_id: number;
  readonly title: string;
  readonly position: number;
}

export interface VintedListingCatalogOptionRow {
  readonly field_code: string;
  readonly id: number;
  readonly title: string;
  readonly position: number;
}

export interface VintedListingCatalogRows {
  readonly fields: readonly VintedListingCatalogFieldRow[];
  readonly sizeGroups: readonly VintedListingCatalogSizeGroupRow[];
  readonly sizes: readonly VintedListingCatalogSizeRow[];
  readonly options: readonly VintedListingCatalogOptionRow[];
}

/** Felder, die die Masken aus dem Katalog übernehmen; Marke und Paketgröße bleiben getrennt. */
const catalogFields = ['size', 'condition', 'color', 'material', 'accessory_department'] as const;
type CatalogField = (typeof catalogFields)[number];

/**
 * Baut aus dem lokalen Vinted-Katalog die Auswahlwerte einer Kategorie mit Vinteds
 * Originalkennungen. `null`, solange die Kategorie im Katalog noch nicht gelesen wurde.
 */
export function vintedListingCatalogCategoryFields(
  categoryId: number,
  rows: VintedListingCatalogRows,
): VintedListingCategoryFields | null {
  const fields = [...rows.fields].sort((left, right) => left.position - right.position);
  if (!fields.length) return null;
  const choices: VintedListingChoiceSnapshot[] = [];
  for (const row of fields) {
    const field = row.field_code as CatalogField;
    if (!catalogFields.includes(field)) continue;
    if (field === 'size') {
      const groupOrder = new Map(
        rows.sizeGroups.map((group) => [group.size_group_id, group.position] as const),
      );
      const seen = new Set<string>();
      const sizes = rows.sizes
        .filter((size) => groupOrder.has(size.size_group_id))
        .sort(
          (left, right) =>
            (groupOrder.get(left.size_group_id) ?? 0) -
              (groupOrder.get(right.size_group_id) ?? 0) || left.position - right.position,
        )
        // Gleiche Bezeichnungen mehrerer Gruppen („Sonstige“, „Einheitsgröße“) nur einmal zeigen.
        .filter((size) => !seen.has(size.title) && !!seen.add(size.title));
      if (!sizes.length) continue;
      choices.push({
        field,
        sizeGroupId: sizes[0]!.size_group_id,
        choices: sizes.map((size) => ({
          id: size.id,
          label: size.title,
          selected: false,
          disabled: false,
          sizeGroupId: size.size_group_id,
        })),
      });
      continue;
    }
    const available = rows.options
      .filter((option) => option.field_code === field)
      .sort((left, right) => left.position - right.position);
    const allowed = row.option_ids
      ? row.option_ids.flatMap((id) => available.filter((option) => option.id === id))
      : available;
    if (!allowed.length) continue;
    choices.push({
      field,
      sizeGroupId: null,
      choices: allowed.map((option) => ({
        id: option.id,
        label: option.title,
        selected: false,
        disabled: false,
        sizeGroupId: null,
      })),
    });
  }
  return parseVintedListingCategoryFields(
    {
      categoryId,
      fields: choices,
      unknownFields: [],
      acceptedPhotoMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      titleMaxLength: 100,
      descriptionMaxLength: 2000,
      aiPhoto: false,
      bump: false,
    },
    categoryId,
  );
}
