import type { MarketplaceEntry } from './marketplace-read.models';

export interface VintedListingEditorSource {
  readonly entry: MarketplaceEntry;
  readonly mode: 'relist' | 'template';
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
