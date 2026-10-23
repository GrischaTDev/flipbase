import {
  emptyVintedListingContent,
  parseVintedListingContent,
  type VintedListingContent,
} from './vinted-listing-content';

export const vintedListingCopyFields = [
  { key: 'title', label: 'Titel', fields: ['title'] },
  { key: 'description', label: 'Beschreibung', fields: ['description'] },
  { key: 'price', label: 'Verkaufspreis', fields: ['priceCents', 'currency'] },
  { key: 'category', label: 'Kategorie', fields: ['categoryId', 'categoryLabel'] },
  { key: 'brand', label: 'Marke', fields: ['brandId', 'brandLabel'] },
  { key: 'size', label: 'Größe', fields: ['sizeId', 'sizeLabel'] },
  { key: 'condition', label: 'Zustand', fields: ['conditionId', 'conditionLabel'] },
  { key: 'colors', label: 'Farben', fields: ['colorIds', 'colorLabels'] },
  { key: 'materials', label: 'Materialien', fields: ['materialIds', 'materialLabels'] },
  { key: 'package', label: 'Paketgröße', fields: ['packageSizeId'] },
] as const;
export type VintedListingCopyField = (typeof vintedListingCopyFields)[number]['key'];
export const categoryCopyFields: readonly VintedListingCopyField[] = [
  'brand',
  'size',
  'condition',
  'colors',
  'materials',
  'package',
];

/** Eine Kategorieänderung darf keine alten Merkmalskennungen in die neue Kategorie mitnehmen. */
export function copyVintedListingFields(
  target: VintedListingContent,
  source: VintedListingContent,
  fields: readonly VintedListingCopyField[],
): VintedListingContent {
  const changesCategory = fields.includes('category') && target.categoryId !== source.categoryId;
  if (
    target.categoryId !== source.categoryId &&
    !changesCategory &&
    fields.some((field) => categoryCopyFields.includes(field))
  )
    throw new Error(
      'Übernimm zuerst die passende Kategorie oder wähle nur Titel, Beschreibung und Preis.',
    );
  const result = structuredClone(target);
  if (changesCategory) {
    const empty = emptyVintedListingContent();
    Object.assign(
      result,
      ...vintedListingCopyFields
        .filter((group) => categoryCopyFields.includes(group.key))
        .flatMap((group) => group.fields.map((field) => ({ [field]: empty[field] }))),
    );
    Object.assign(result, { attributes: {} });
  }
  for (const group of vintedListingCopyFields) {
    if (!fields.includes(group.key)) continue;
    Object.assign(
      result,
      ...group.fields.map((field) => ({ [field]: structuredClone(source[field]) })),
    );
  }
  return parseVintedListingContent(result);
}

export function vintedListingCopyValue(
  content: VintedListingContent,
  field: VintedListingCopyField,
): string {
  switch (field) {
    case 'title':
      return content.title;
    case 'description':
      return content.description;
    case 'price':
      return content.priceCents === null
        ? 'Nicht angegeben'
        : new Intl.NumberFormat('de-DE', { style: 'currency', currency: content.currency }).format(
            content.priceCents / 100,
          );
    case 'category':
      return content.categoryLabel || 'Nicht angegeben';
    case 'brand':
      return content.brandLabel || 'Nicht angegeben';
    case 'size':
      return content.sizeLabel || 'Nicht angegeben';
    case 'condition':
      return content.conditionLabel || 'Nicht angegeben';
    case 'colors':
      return content.colorLabels.join(', ') || 'Nicht angegeben';
    case 'materials':
      return content.materialLabels.join(', ') || 'Nicht angegeben';
    case 'package':
      return content.packageSizeId === null ? 'Nicht angegeben' : 'Bereits festgelegt';
  }
}
