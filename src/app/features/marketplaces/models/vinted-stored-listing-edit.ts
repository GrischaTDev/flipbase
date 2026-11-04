import type { MarketplaceEntry } from './marketplace-read.models';
import { flipbaseVintedListingFields } from './flipbase-vinted-listing-form';
import type { VintedListingCurrentContent } from './vinted-listing-category-fields';
import { vintedListingSourceContent } from './vinted-listing-source';
import {
  applyVintedListingEdit,
  packageSizeLabel,
  vintedListingEditSelection,
  vintedListingPriceCents,
  vintedListingPriceText,
  type VintedListingEditField,
  type VintedListingEditSnapshot,
} from './vinted-listing-edit-form';

/** Eigene Auswahlwerte für die gespeicherte Anzeige; Anbieterkennungen erst beim Speichern lesen. */
export function storedVintedListingEdit(
  entry: MarketplaceEntry,
  description: string | null,
): VintedListingEditSnapshot | null {
  const content = vintedListingSourceContent(entry, description);
  if (content.categoryId === null) return null;
  const schema = flipbaseVintedListingFields(content.categoryId, content.categoryLabel, content);
  const selected: Record<VintedListingEditField, readonly string[]> = {
    brand: [content.brandLabel || 'Keine Marke'],
    size: content.sizeLabel ? [content.sizeLabel] : [],
    condition: content.conditionLabel ? [content.conditionLabel] : [],
    color: content.colorLabels,
    material: content.materialLabels,
    package: content.packageSizeId ? [String(content.packageSizeId)] : [],
  };
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
        if (field.field === 'category' || field.field === 'accessory_department') return field;
        const labels = selected[field.field];
        const choices = field.choices.map((choice) => ({
          ...choice,
          selected: labels.includes(field.field === 'package' ? String(choice.id) : choice.label),
        }));
        // Ungewöhnliche gespeicherte Größen und Materialien bleiben sichtbar und ausgewählt.
        for (const label of labels) {
          if (field.field !== 'package' && !choices.some((choice) => choice.label === label))
            choices.push({
              id: choices.length + 1,
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

type EditFields = Record<VintedListingEditField | 'title' | 'description' | 'price', string>;
const conflict = () =>
  new Error(
    'Das Inserat wurde inzwischen bei Vinted geändert. Aktualisiere die Daten vor dem erneuten Speichern.',
  );

/** Übernimmt nur geänderte Felder und übersetzt eigene Auswahlen in die frisch gelesenen Anbieterwerte. */
export function applyStoredVintedListingEdit(
  stored: VintedListingEditSnapshot,
  current: VintedListingCurrentContent,
  fields: EditFields,
) {
  if (stored.content.categoryId !== current.content.categoryId) throw conflict();
  const before = vintedListingEditSelection(stored);
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
  for (const field of ['brand', 'size', 'condition', 'package', 'color', 'material'] as const) {
    const multiple = field === 'color' || field === 'material';
    const previous = before[field];
    const previousLabels = labels(
      stored,
      field,
      typeof previous === 'string' ? (previous ? [previous] : []) : previous,
    );
    const desiredLabels = multiple
      ? fields[field].split(' · ').filter(Boolean)
      : labels(stored, field, fields[field] ? [fields[field]] : []);
    if (equal(previousLabels, desiredLabels)) continue;
    const fresh = selection[field];
    if (
      !equal(
        previousLabels,
        labels(current, field, typeof fresh === 'string' ? (fresh ? [fresh] : []) : fresh),
      )
    )
      throw conflict();
    const identifiers = desiredLabels.map((label) => {
      const normalize = (text: string) =>
        text
          .trim()
          .normalize('NFC')
          .toLocaleLowerCase('de')
          .replace(/^eu\s*/, '')
          .replace('.', ',');
      const choices = current.schema.fields
        .find((group) => group.field === field)
        ?.choices.filter(
          (option) =>
            (field === 'size'
              ? normalize(option.label) === normalize(label) ||
                option.label.split('/').some((part) => normalize(part) === normalize(label))
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
