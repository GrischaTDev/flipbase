import type { MarketplaceEntry } from './marketplace-read.models';
import { emptyVintedListingContent, type VintedListingContent } from './vinted-listing-content';

export interface VintedListingEditorSource {
  readonly entry: MarketplaceEntry;
  readonly mode: 'relist' | 'template';
}

/** Öffnet mit dem letzten lokalen Stand; ein fehlender Text löst keinen Anbieterabruf aus. */
export function vintedListingSourceContent(
  entry: MarketplaceEntry,
  description: string | null = null,
): VintedListingContent {
  const content = entry.listingContent ?? emptyVintedListingContent();
  return {
    ...content,
    title: entry.title,
    description: description ?? entry.text ?? content.description,
    priceCents: entry.price === null ? content.priceCents : Math.round(entry.price * 100),
    brandLabel: content.brandLabel || entry.brand || '',
    sizeLabel: content.sizeLabel || entry.size || '',
    conditionLabel: content.conditionLabel || entry.status || '',
  };
}

/** Längste Kante; das ursprüngliche Seitenverhältnis und der gesamte Ausschnitt bleiben erhalten. */
export function vintedListingPhotoDimensions(
  width: number,
  height: number,
  longestEdge: number | null,
) {
  if (
    ![width, height].every((value) => Number.isSafeInteger(value) && value > 0) ||
    (longestEdge !== null && ![1200, 1600, 2400].includes(longestEdge))
  )
    throw new Error('Die Bildgröße ist ungültig.');
  const scale = longestEdge === null ? 1 : longestEdge / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
