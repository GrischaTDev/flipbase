import { catalogSizeForLabel } from '../../../../../supabase/functions/_shared/vinted-listing-edit-intent.mjs';
import type { MarketplaceEntry } from './marketplace-read.models';
import { flipbaseVintedListingFields } from './flipbase-vinted-listing-form';
import type { VintedListingCategoryFields } from './vinted-listing-category-fields';
import { vintedListingSourceContent } from './vinted-listing-source';
import type { VintedListingEditField, VintedListingEditSnapshot } from './vinted-listing-edit-form';

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
  const combinedSize =
    real && content.sizeId === null
      ? catalogSizeForLabel(
          schema.fields.find((field) => field.field === 'size')?.choices ?? [],
          content.sizeLabel,
        )
      : null;
  const selectedIds: Partial<Record<VintedListingEditField, readonly number[]>> = real
    ? {
        size: content.sizeId !== null ? [content.sizeId] : combinedSize ? [combinedSize] : [],
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

export { applyStoredVintedListingEdit } from '../../../../../supabase/functions/_shared/vinted-listing-edit-intent.mjs';
