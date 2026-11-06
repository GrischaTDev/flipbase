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
  readonly title?: string | null;
  readonly required?: boolean | null;
  readonly selection_type?: string | null;
  readonly selection_limit?: number | null;
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
    // Ob die Kategorie eine Marke hat; ausgewählt wird sie über die Markensuche.
    if (row.field_code === 'brand') {
      choices.push({
        field: 'brand',
        sizeGroupId: null,
        choices: [
          { id: null, label: 'Keine Marke', selected: false, disabled: false, sizeGroupId: null },
        ],
      });
      continue;
    }
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

/** Zusatzfeld einer Kategorie, das die Masken neben den Standardfeldern anbieten. */
export type VintedListingExtraField =
  | {
      readonly kind: 'choice';
      /** Schlüssel in `attributes`, zugleich Vinteds Feldkennung (z. B. `skirt_length`). */
      readonly key: string;
      readonly label: string;
      readonly required: boolean;
      readonly multiple: boolean;
      readonly limit: number;
      readonly options: readonly { readonly id: number; readonly label: string }[];
    }
  | {
      readonly kind: 'text';
      /** Schlüssel in `attributes` (`text_<name>`). */
      readonly key: string;
      readonly label: string;
      readonly unit: string;
    };

/** Felder, die die Masken bereits eigens führen. */
const standardFields = new Set([
  'brand',
  'size',
  'condition',
  'color',
  'material',
  'accessory_department',
]);

/**
 * Freie Felder ohne Werteliste. Ihre Eingaben stehen nicht in Vinteds Merkmalsabfrage, sondern nur
 * im Formular (am 06.11.2026 beobachtet): Maße bei Oberteilen, ISBN bei Büchern.
 */
const textFields: Readonly<
  Record<string, readonly { name: string; label: string; unit: string }[]>
> = {
  measurements: [
    { name: 'shoulder_width', label: 'Schulterweite', unit: 'cm' },
    { name: 'height', label: 'Länge', unit: 'cm' },
  ],
  isbn: [{ name: 'isbn', label: 'ISBN', unit: '' }],
};

/** Zusatzfelder einer Kategorie in Vinteds Reihenfolge; Pflicht nur, wo Vinted sie verlangt. */
export function vintedListingCatalogExtraFields(
  rows: VintedListingCatalogRows,
): readonly VintedListingExtraField[] {
  const extras: VintedListingExtraField[] = [];
  for (const row of [...rows.fields].sort((left, right) => left.position - right.position)) {
    if (standardFields.has(row.field_code)) continue;
    const texts = textFields[row.field_code];
    if (texts) {
      for (const text of texts)
        extras.push({ kind: 'text', key: 'text_' + text.name, label: text.label, unit: text.unit });
      continue;
    }
    const available = rows.options
      .filter((option) => option.field_code === row.field_code)
      .sort((left, right) => left.position - right.position);
    const options = (
      row.option_ids
        ? row.option_ids.flatMap((id) => available.filter((option) => option.id === id))
        : available
    ).map((option) => ({ id: option.id, label: option.title }));
    if (!options.length) continue;
    extras.push({
      kind: 'choice',
      key: row.field_code,
      label: row.title?.trim() || row.field_code,
      required: row.required === true,
      multiple: row.selection_type === 'multi',
      limit: row.selection_type === 'multi' ? (row.selection_limit ?? options.length) : 1,
      options,
    });
  }
  return extras;
}

/** Fehlende Pflicht-Zusatzfelder, als Fehlermeldung je Schlüssel. */
export function vintedListingExtraFieldErrors(
  extras: readonly VintedListingExtraField[],
  attributes: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    extras
      .filter((field) => field.kind === 'choice' && field.required && !attributes[field.key])
      .map((field) => [
        field.key,
        'Ergänze bitte: ' + field.label.replace(/\s*\(empfohlen\)$/, '') + '.',
      ]),
  );
}

/** Übernimmt Zusatzangaben in `attributes`; leere Werte entfernen die Angabe. */
export function withVintedListingExtraValues(
  attributes: Readonly<Record<string, string>>,
  values: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const next: Record<string, string> = { ...attributes };
  for (const [key, value] of Object.entries(values)) {
    if (value) next[key] = value;
    else delete next[key];
  }
  return next;
}
