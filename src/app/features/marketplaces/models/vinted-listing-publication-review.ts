import type { VintedBrand } from '../../platform-admin/models/vinted-brand.model';
import { validVintedListingBrand } from './vinted-listing-brand-selection';
import {
  parseVintedListingCategoryFields,
  validateVintedListingSubmission,
  type VintedListingCategoryFields,
  type VintedListingValidationIssue,
} from './vinted-listing-category-fields';
import { parseVintedListingContent } from './vinted-listing-content';
import type { VintedListingDraft } from './vinted-listing-draft';

export interface VintedListingPublicationReview {
  readonly ready: boolean;
  readonly issues: readonly VintedListingValidationIssue[];
  readonly messages: readonly string[];
}
const fieldLabels: Readonly<Record<string, string>> = {
  title: 'Titel',
  description: 'Beschreibung',
  price: 'Verkaufspreis',
  currency: 'Währung',
  category: 'Kategorie',
  brand: 'Marke',
  size: 'Größe',
  condition: 'Zustand',
  color: 'Farben',
  material: 'Materialien',
  package: 'Paketgröße',
  photos: 'Fotos',
  ai_photo: 'Kennzeichnung für KI-Fotos',
  attributes: 'Weitere Artikelangaben',
  form: 'Vinted-Formular',
};
function message(issue: VintedListingValidationIssue): string {
  const label = fieldLabels[issue.field] ?? issue.field;
  if (issue.field === 'photos' && issue.code === 'limit')
    return 'Vinted erlaubt höchstens 20 Fotos pro Inserat.';
  switch (issue.code) {
    case 'missing':
      return `Ergänze bitte: ${label}.`;
    case 'invalid':
      return `Prüfe bitte: ${label}.`;
    case 'unavailable':
      return `Wähle erneut bei Vinted: ${label}.`;
    case 'disabled':
      return `Bei Vinted aktuell nicht wählbar: ${label}.`;
    case 'limit':
      return `Die Vinted-Grenze ist überschritten: ${label}.`;
    case 'unsupported':
      return `Noch nicht unterstützt: ${label}.`;
  }
}
/** Die Vorschau prüft frische Leseantworten; der Ausführer prüft unmittelbar vor dem Schreiben erneut. */
export function reviewVintedListingPublication(
  draft: VintedListingDraft,
  input: VintedListingCategoryFields,
  brands: readonly VintedBrand[],
  aiPhoto: boolean,
): VintedListingPublicationReview {
  const content = parseVintedListingContent(draft.content);
  if (content.categoryId === null) throw new Error('Wähle zuerst eine Vinted-Kategorie.');
  let schema = parseVintedListingCategoryFields(input, content.categoryId);
  const brandChoices = schema.fields.find((field) => field.field === 'brand');
  const confirmed = brands.filter(
    (brand) =>
      validVintedListingBrand({ brandId: brand.id, brandLabel: brand.name }) &&
      brand.id === content.brandId,
  );
  const brandConfirmed =
    content.brandId === null ||
    (confirmed.length > 0 && confirmed.every((brand) => brand.name === content.brandLabel));
  if (
    brandChoices &&
    content.brandId !== null &&
    brandConfirmed &&
    !brandChoices.choices.some((choice) => choice.id === content.brandId)
  ) {
    schema = parseVintedListingCategoryFields(
      {
        ...schema,
        fields: schema.fields.map((field) =>
          field.field === 'brand'
            ? {
                ...field,
                choices: [
                  ...field.choices,
                  {
                    id: content.brandId,
                    label: content.brandLabel,
                    selected: false,
                    disabled: false,
                    sizeGroupId: null,
                  },
                ],
              }
            : field,
        ),
      },
      content.categoryId,
    );
  }
  const issues = [
    ...validateVintedListingSubmission(
      content,
      draft.images.map((image) => ({ mimeType: image.mimeType, byteSize: image.byteSize })),
      schema,
    ),
  ];
  if (!brandConfirmed && !issues.some((issue) => issue.field === 'brand'))
    issues.push({ field: 'brand', code: 'unavailable' });
  if (aiPhoto && schema.aiPhoto === null) issues.push({ field: 'ai_photo', code: 'unavailable' });
  return { ready: issues.length === 0, issues, messages: issues.map(message) };
}
