import type { MarketplaceEntry } from './marketplace-read.models';
import { flipbaseVintedListingFields } from './flipbase-vinted-listing-form';
import type {
  VintedListingCategoryFields,
  VintedListingCurrentContent,
} from './vinted-listing-category-fields';
import { vintedListingSourceContent } from './vinted-listing-source';
import {
  applyVintedListingEdit,
  packageSizeLabel,
  vintedListingBrandValue,
  vintedListingEditSelection,
  vintedListingPriceCents,
  vintedListingPriceText,
  type VintedListingEditField,
  type VintedListingEditSnapshot,
  withVintedListingBrand,
} from './vinted-listing-edit-form';

/** Eigene Auswahlwerte für die gespeicherte Anzeige; Anbieterkennungen erst beim Speichern lesen. */
export function storedVintedListingEdit(
  entry: MarketplaceEntry,
  description: string | null,
  stored?: VintedListingCategoryFields | null,
): VintedListingEditSnapshot | null {
  const content = vintedListingSourceContent(entry, description);
  if (content.categoryId === null) return null;
  const schema = flipbaseVintedListingFields(
    content.categoryId,
    content.categoryLabel,
    content,
    stored,
  );
  const selected: Record<VintedListingEditField, readonly string[]> = {
    accessory_department: content.attributes['accessory_department_label']
      ? [content.attributes['accessory_department_label']]
      : [],
    brand: [content.brandLabel || 'Keine Marke'],
    size: content.sizeLabel ? [content.sizeLabel] : [],
    condition: content.conditionLabel ? [content.conditionLabel] : [],
    color: content.colorLabels,
    material: content.materialLabels,
    package: content.packageSizeId ? [String(content.packageSizeId)] : [],
  };
  // Bei Vinted gelesene Inserate tragen Vinteds Kennungen; nur Entwürfe der eigenen Liste sind
  // markiert. Mit echten Katalogwerten zählt deshalb zuerst die Kennung, nicht die Bezeichnung.
  const real =
    stored?.categoryId === content.categoryId && !content.attributes['flipbaseListingForm'];
  const selectedIds: Partial<Record<VintedListingEditField, readonly number[]>> = real
    ? {
        size: content.sizeId === null ? [] : [content.sizeId],
        condition: content.conditionId === null ? [] : [content.conditionId],
        color: content.colorIds,
        material: content.materialIds,
      }
    : {};
  const fields = [...schema.fields];
  if (content.sizeLabel && !fields.some((field) => field.field === 'size'))
    fields.push({ field: 'size', sizeGroupId: null, choices: [] });
  return {
    content,
    photoUrls:
      entry.providerImageUrls ??
      (entry.imageUrls?.length ? entry.imageUrls : entry.imageUrl ? [entry.imageUrl] : []),
    schema: {
      ...schema,
      fields: fields.map((field) => {
        if (field.field === 'category') return field;
        const labels = selected[field.field];
        const ids = selectedIds[field.field] ?? [];
        const byId = ids.length > 0 && field.choices.some((choice) => ids.includes(choice.id ?? 0));
        const choices = field.choices.map((choice) => ({
          ...choice,
          selected: byId
            ? ids.includes(choice.id ?? 0)
            : labels.includes(field.field === 'package' ? String(choice.id) : choice.label),
        }));
        // Ungewöhnliche gespeicherte Größen und Materialien bleiben sichtbar und ausgewählt.
        for (const label of byId ? [] : labels) {
          if (field.field !== 'package' && !choices.some((choice) => choice.label === label))
            choices.push({
              // Eine freie Kennung, die mit keinem echten Vinted-Wert dieses Felds zusammenfällt.
              id: Math.max(0, ...choices.map((choice) => choice.id ?? 0)) + 1,
              label,
              selected: true,
              disabled: false,
              sizeGroupId: field.sizeGroupId,
            });
        }
        return { ...field, choices };
      }),
    },
  };
}

type EditFields = Record<
  Exclude<VintedListingEditField, 'accessory_department'> | 'title' | 'description' | 'price',
  string
> & { accessory_department?: string };
/** Vergleichsform einer Größenbezeichnung, etwa „EU 38“ wie „38“. */
const normalizeSize = (text: string) =>
  text
    .trim()
    .normalize('NFC')
    .toLocaleLowerCase('de')
    .replace(/^eu\s*/, '')
    .replace('.', ',');

/**
 * Ob zwei Größenangaben dieselbe Größe meinen. Ältere Inserate führen kombinierte Angaben wie
 * „M / 38 / 10“, das Vinted-Formular zeigt dafür eine Größe wie „M“.
 */
function sameSize(left: string, right: string): boolean {
  const parts = (label: string) => label.split('/').map(normalizeSize).filter(Boolean);
  const a = normalizeSize(left);
  const b = normalizeSize(right);
  return a === b || parts(left).includes(b) || parts(right).includes(a);
}

function sameSizes(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((label, index) => sameSize(label, right[index]!))
  );
}

const conflict = () =>
  new Error(
    'Das Inserat wurde inzwischen bei Vinted geändert. Aktualisiere die Daten vor dem erneuten Speichern.',
  );

/** Übernimmt nur geänderte Felder und übersetzt eigene Auswahlen in die frisch gelesenen Anbieterwerte. */
export function applyStoredVintedListingEdit(
  stored: VintedListingEditSnapshot,
  live: VintedListingCurrentContent,
  fields: EditFields,
) {
  if (stored.content.categoryId !== live.content.categoryId) throw conflict();
  const before = vintedListingEditSelection(stored);
  // Eine per Suche gewählte Marke fehlt in Vinteds Formularauswahl; der Worker sucht sie beim Speichern.
  const searchedBrand =
    fields.brand && fields.brand !== before.brand
      ? stored.schema.fields
          .find((group) => group.field === 'brand')
          ?.choices.find(
            (choice) => vintedListingBrandValue({ brandId: choice.id }) === fields.brand,
          )
      : undefined;
  const current = searchedBrand
    ? withVintedListingBrand(live, {
        brandId: searchedBrand.id,
        brandLabel: searchedBrand.label,
      })
    : live;
  const selection = { ...vintedListingEditSelection(current) };
  const labels = (
    snapshot: VintedListingEditSnapshot,
    field: VintedListingEditField,
    identifiers: readonly string[],
  ) =>
    identifiers.map((identifier) => {
      const choice = snapshot.schema.fields
        .find((group) => group.field === field)
        ?.choices.find(
          (option) => (option.id === null ? 'none' : String(option.id)) === identifier,
        );
      if (!choice) throw new Error('Die Auswahl ist nicht mehr verfügbar.');
      return field === 'package' ? packageSizeLabel(choice.label) : choice.label;
    });
  const equal = (left: readonly string[], right: readonly string[]) =>
    left.length === right.length && left.every((label) => right.includes(label));
  for (const field of [
    'accessory_department',
    'brand',
    'size',
    'condition',
    'package',
    'color',
    'material',
  ] as const) {
    const multiple = field === 'color' || field === 'material';
    if (field === 'accessory_department' && fields[field] === undefined) continue;
    const previous = before[field] ?? '';
    const desiredField = fields[field] ?? '';
    const previousLabels = labels(
      stored,
      field,
      typeof previous === 'string' ? (previous ? [previous] : []) : previous,
    );
    const desiredLabels = multiple
      ? desiredField.split(' · ').filter(Boolean)
      : labels(stored, field, desiredField ? [desiredField] : []);
    if (equal(previousLabels, desiredLabels)) continue;
    const fresh = selection[field] ?? '';
    const freshLabels = labels(
      current,
      field,
      typeof fresh === 'string' ? (fresh ? [fresh] : []) : fresh,
    );
    if (
      !(field === 'accessory_department' && previousLabels.length === 0) &&
      !(field === 'size'
        ? sameSizes(previousLabels, freshLabels)
        : equal(previousLabels, freshLabels))
    )
      throw conflict();
    const identifiers = desiredLabels.map((label, index) => {
      const options = current.schema.fields.find((group) => group.field === field)?.choices;
      // Katalogwerte tragen Vinteds Kennung; bei gleicher Kennung und Bezeichnung ist die Wahl eindeutig,
      // auch wenn mehrere Größengruppen dieselbe Bezeichnung führen.
      const sameId = multiple
        ? undefined
        : options?.find(
            (option) =>
              (option.id === null ? 'none' : String(option.id)) === desiredField &&
              normalizeSize(option.label) === normalizeSize(label) &&
              index === 0 &&
              (!option.disabled || option.selected),
          );
      if (sameId) return sameId.id === null ? 'none' : String(sameId.id);
      const choices = options?.filter(
        (option) =>
          (field === 'size'
            ? normalizeSize(option.label) === normalizeSize(label) ||
              option.label.split('/').some((part) => normalizeSize(part) === normalizeSize(label))
            : field === 'brand' && searchedBrand
              ? option.id === searchedBrand.id
              : (field === 'package' ? packageSizeLabel(option.label) : option.label) === label) &&
          (!option.disabled || option.selected),
      );
      const choice = choices?.length === 1 ? choices[0] : undefined;
      if (!choice) throw new Error('Diese Auswahl ist bei Vinted nicht eindeutig verfügbar.');
      return choice.id === null ? 'none' : String(choice.id);
    });
    if (multiple) selection[field] = identifiers;
    else selection[field] = identifiers[0] ?? '';
  }
  const text = {
    title: current.content.title,
    description: current.content.description,
    price: vintedListingPriceText(current.content.priceCents ?? 0),
  };
  for (const field of ['title', 'description'] as const) {
    if (fields[field] === stored.content[field]) continue;
    if (current.content[field] !== stored.content[field]) throw conflict();
    text[field] = fields[field];
  }
  if (vintedListingPriceCents(fields.price) !== stored.content.priceCents) {
    if (current.content.priceCents !== stored.content.priceCents) throw conflict();
    text.price = fields.price;
  }
  return applyVintedListingEdit(current, text, selection);
}
