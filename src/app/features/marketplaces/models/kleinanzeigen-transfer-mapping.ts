import type { MarketplaceListingReference } from './marketplace-overview.models';
export interface VintedTransferSource {
  readonly reference: MarketplaceListingReference;
  readonly title: string;
  readonly description: string;
  readonly priceCents: number | null;
  readonly currency: string;
  readonly photoReferences: readonly string[];
  readonly attributeHints: Readonly<Record<string, string>>;
}
export interface KleinanzeigenAccountDefaults {
  readonly postalCode: string | null;
  readonly shippingType: 'pickup' | 'shipping' | 'both';
  readonly priceType: 'FIXED' | 'NEGOTIABLE';
}
export interface KleinanzeigenDraftInput {
  readonly title: string;
  readonly description: string;
  readonly priceCents: number | null;
  readonly currency: 'EUR';
  readonly categoryId: string | null;
  readonly categoryFields: Readonly<Record<string, string>>;
  readonly schemaRevision: string | null;
  readonly postalCode: string | null;
  readonly shippingType: KleinanzeigenAccountDefaults['shippingType'];
  readonly priceType: KleinanzeigenAccountDefaults['priceType'];
  readonly shippingPriceCents: number | null;
}
export interface KleinanzeigenTransferPreview {
  readonly source: MarketplaceListingReference;
  readonly content: KleinanzeigenDraftInput;
  readonly originalPhotoReferences: readonly string[];
  readonly attributeHints: Readonly<Record<string, string>>;
  readonly warnings: readonly {
    readonly field: string;
    readonly code: string;
    readonly message: string;
  }[];
}
export function mapVintedToKleinanzeigen(
  source: VintedTransferSource,
  defaults: KleinanzeigenAccountDefaults,
): KleinanzeigenTransferPreview {
  const warnings: { field: string; code: string; message: string }[] = [];
  if (source.title.length > 65)
    warnings.push({
      field: 'title',
      code: 'title_too_long',
      message:
        'Bitte kürze den Titel auf höchstens 65 Zeichen. Dein vollständiger Vinted-Titel bleibt bis dahin erhalten.',
    });
  if (source.description.length > 4000)
    warnings.push({
      field: 'description',
      code: 'description_too_long',
      message: 'Bitte kürze die Beschreibung auf höchstens 4000 Zeichen.',
    });
  const priceCents =
    source.currency === 'EUR' &&
    Number.isSafeInteger(source.priceCents) &&
    source.priceCents !== null &&
    source.priceCents >= 0
      ? source.priceCents
      : null;
  if (priceCents === null)
    warnings.push({
      field: 'priceCents',
      code: 'price_required',
      message: 'Bitte trage einen Verkaufspreis in Euro ein.',
    });
  if (!source.description.trim())
    warnings.push({
      field: 'description',
      code: 'description_required',
      message: 'Ergänze die Beschreibung. Sie ist noch nicht in Flipbase gespeichert.',
    });
  if (!source.photoReferences.length)
    warnings.push({
      field: 'photos',
      code: 'photos_required',
      message:
        'Für dieses Inserat sind noch keine Bilder in Flipbase gespeichert. Ergänze Bilder vor dem Veröffentlichen.',
    });
  warnings.push({
    field: 'categoryId',
    code: 'category_required',
    message: 'Bitte wähle die passende Kleinanzeigen-Kategorie und prüfe ihre Eigenschaften.',
  });
  return {
    source: { ...source.reference },
    content: {
      title: source.title,
      description: source.description,
      priceCents,
      currency: 'EUR',
      categoryId: null,
      categoryFields: {},
      schemaRevision: null,
      ...defaults,
      shippingPriceCents: null,
    },
    originalPhotoReferences: [...source.photoReferences],
    attributeHints: { ...source.attributeHints },
    warnings,
  };
}
