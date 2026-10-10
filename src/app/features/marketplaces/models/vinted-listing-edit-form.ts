import type {
  VintedListingCategoryFields,
  VintedListingChoice,
  VintedListingContent,
  VintedListingCurrentContent,
} from '../../../../../supabase/functions/_shared/marketplace-listing-contracts';

export type VintedListingEditField =
  'brand' | 'size' | 'condition' | 'package' | 'color' | 'material';

/** Auswahl im Bearbeitungsformular; leere Zeichenkette heißt „bei Vinted nichts gewählt“. */
export interface VintedListingEditSelection {
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

/** „Keine Marke“ hat bei Vinted keine Kennung und braucht einen eigenen Formularwert. */
const optionValue = (choice: VintedListingChoice) =>
  choice.id === null ? 'none' : String(choice.id);

function choices(
  schema: VintedListingCategoryFields,
  field: VintedListingEditField,
): readonly VintedListingChoice[] {
  return schema.fields.find((entry) => entry.field === field)?.choices ?? [];
}

/** Wählbare Werte eines Merkmals. Von Vinted gesperrte Werte fehlen, außer sie sind schon gewählt. */
export function vintedListingEditOptions(
  schema: VintedListingCategoryFields,
  field: VintedListingEditField,
): readonly VintedListingEditOption[] {
  return choices(schema, field)
    .filter((choice) => !choice.disabled || choice.selected)
    .map((choice) => ({ value: optionValue(choice), label: choice.label }));
}

export function vintedListingEditSelection(
  current: VintedListingCurrentContent,
): VintedListingEditSelection {
  const selected = (field: VintedListingEditField) =>
    choices(current.schema, field)
      .filter((choice) => choice.selected)
      .map(optionValue);
  return {
    brand: selected('brand')[0] ?? '',
    size: selected('size')[0] ?? '',
    condition: selected('condition')[0] ?? '',
    package: selected('package')[0] ?? '',
    color: selected('color'),
    material: selected('material'),
  };
}

export function vintedListingPriceCents(price: string): number | null {
  const match = /^(\d{1,6})(?:[,.](\d{1,2}))?$/.exec(price.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
  return cents > 0 ? cents : null;
}

export function vintedListingPriceText(cents: number): string {
  return Math.floor(cents / 100) + ',' + String(cents % 100).padStart(2, '0');
}

/**
 * Baut die gewünschten Inseratangaben aus Formular und aktueller Vinted-Auswahl. Kennung und
 * Name stammen immer aus derselben Auswahl; unbekannte oder gesperrte Werte werden abgewiesen.
 */
export function applyVintedListingEdit(
  current: VintedListingCurrentContent,
  text: { readonly title: string; readonly description: string; readonly price: string },
  selection: VintedListingEditSelection,
): VintedListingContent {
  const priceCents = vintedListingPriceCents(text.price);
  if (priceCents === null || !text.title.trim() || !text.description.trim())
    throw new Error('Prüfe Titel, Beschreibung und Preis.');
  const pick = (field: VintedListingEditField, values: readonly string[], max: number) => {
    const available = choices(current.schema, field).filter(
      (choice) => !choice.disabled || choice.selected,
    );
    if (values.length > max || new Set(values).size !== values.length)
      throw new Error('Die Auswahl ist nicht mehr gültig. Lade das Inserat erneut.');
    // Reihenfolge der Vinted-Auswahl beibehalten, nicht die Klickreihenfolge.
    const picked = available.filter((choice) => values.includes(optionValue(choice)));
    if (picked.length !== values.length)
      throw new Error('Die Auswahl ist nicht mehr gültig. Lade das Inserat erneut.');
    return picked;
  };
  const single = (field: VintedListingEditField, value: string) =>
    value ? pick(field, [value], 1)[0] : undefined;
  const brand = single('brand', selection.brand),
    size = single('size', selection.size),
    condition = single('condition', selection.condition),
    packageSize = single('package', selection.package),
    colors = pick('color', selection.color, 2),
    materials = pick('material', selection.material, 3);
  return {
    ...current.content,
    title: text.title.trim(),
    description: text.description,
    priceCents,
    brandId: brand?.id ?? null,
    brandLabel: brand?.label ?? '',
    sizeId: size?.id ?? null,
    sizeLabel: size?.label ?? '',
    conditionId: condition?.id ?? null,
    conditionLabel: condition?.label ?? '',
    colorIds: colors.map((choice) => choice.id as number),
    colorLabels: colors.map((choice) => choice.label),
    materialIds: materials.map((choice) => choice.id as number),
    materialLabels: materials.map((choice) => choice.label),
    packageSizeId: packageSize?.id ?? null,
    attributes: {},
  };
}
