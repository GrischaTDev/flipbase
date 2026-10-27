import type {
  VintedListingCategoryFields,
  VintedListingContent,
} from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
const marker = 'flipbaseListingForm';
const packages = ['Klein', 'Mittel', 'Groß'];

/** Erst am Anbieter werden eigene Angaben eindeutig auf dessen aktuelle Auswahl abgebildet. */
export function resolveFlipbaseVintedListingContent(
  content: VintedListingContent,
  schema: VintedListingCategoryFields,
): VintedListingContent {
  if (content.attributes[marker] !== '1') return content;
  if (schema.categoryId !== content.categoryId)
    throw new Error('Die Kategorie der Inseratangaben hat sich geändert.');
  const labels: Readonly<Record<string, string>> = {
    size: 'Größe',
    condition: 'Zustand',
    color: 'Farbe',
    material: 'Material',
    package: 'Paketgröße',
  };
  const normalize = (label: string) => label.trim().normalize('NFC').toLocaleLowerCase('de');
  const sizeLabel = (label: string) =>
    normalize(label)
      .replace(/^eu\s*/, '')
      .replace('.', ',');
  const choose = (field: string, label: string) => {
    const choices = schema.fields
      .find((entry) => entry.field === field)
      ?.choices.filter(
        (choice) =>
          !choice.disabled &&
          (field === 'size'
            ? sizeLabel(choice.label) === sizeLabel(label) ||
              choice.label.split('/').some((part) => sizeLabel(part) === sizeLabel(label))
            : normalize(
                field === 'package'
                  ? choice.label
                      .replace(/^Empfohlen\s*/, '')
                      .split(/Für Artikel|Infos zu/)[0]!
                      .trim()
                  : choice.label,
              ) === normalize(label)),
      );
    if (!choices || choices.length !== 1 || choices[0]!.id === null)
      throw new Error(
        `${labels[field]} „${label}“ ist bei Vinted nicht eindeutig verfügbar. Prüfe die Angabe im Inserat.`,
      );
    return choices[0]!;
  };
  const size = content.sizeLabel ? choose('size', content.sizeLabel) : null;
  const condition = content.conditionLabel ? choose('condition', content.conditionLabel) : null;
  const color = content.colorLabels.map((label) => choose('color', label));
  const material = content.materialLabels.map((label) => choose('material', label));
  const packageLabel = content.packageSizeId === null ? null : packages[content.packageSizeId - 1];
  if (content.packageSizeId !== null && !packageLabel)
    throw new Error('Prüfe die Paketgröße im Inserat.');
  const parcel = packageLabel ? choose('package', packageLabel) : null;
  const attributes = Object.fromEntries(
    Object.entries(content.attributes).filter(([key]) => key !== marker),
  );
  return {
    ...content,
    sizeId: size?.id ?? null,
    sizeLabel: size?.label ?? '',
    conditionId: condition?.id ?? null,
    conditionLabel: condition?.label ?? '',
    colorIds: color.map((choice) => choice.id!),
    colorLabels: color.map((choice) => choice.label),
    materialIds: material.map((choice) => choice.id!),
    materialLabels: material.map((choice) => choice.label),
    packageSizeId: parcel?.id ?? null,
    attributes,
  };
}
