import type { VintedListingCurrentContent } from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import { parseVintedTransferSource } from '../../../supabase/functions/_shared/kleinanzeigen-listing-validation.mts';
import type { VintedTransferSource } from '../../../supabase/functions/_shared/kleinanzeigen-listing-contracts.ts';
import { parseVintedListingCurrentContent } from './vinted-listing-contracts.ts';
export function normalizeVintedTransferSource(
  input: VintedListingCurrentContent,
  account: string,
  externalId: string,
): VintedTransferSource {
  const current = parseVintedListingCurrentContent(input, account, externalId);
  const content = current.content;
  const hints: Record<string, string> = {};
  for (const [key, value] of Object.entries({
    brand: content.brandLabel,
    size: content.sizeLabel,
    condition: content.conditionLabel,
    category: content.categoryLabel,
    color: content.colorLabels.join(', '),
    material: content.materialLabels.join(', '),
    ...content.attributes,
  }))
    if (value) hints[key] = value;
  const source = parseVintedTransferSource(
    {
      externalAccountId: account,
      externalId,
      title: content.title,
      description: content.description,
      priceCents: content.priceCents,
      currency: content.currency,
      photoReferences: [...current.photoUrls],
      attributeHints: hints,
    },
    account,
    externalId,
  );
  if (!source)
    throw new Error('Die vollständige Vinted-Quelle ist für die Übernahme nicht geeignet.');
  return source;
}
