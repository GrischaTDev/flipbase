/** Feste Schritte beim Lesen der Vinted-Bearbeitungsmaske; keine Seiteninhalte oder Kennungen. */
export const vintedListingReadSteps = [
  'navigate',
  'form',
  'identity',
  'values',
  'photos',
  'category',
  'fields',
  'changed',
  'parse',
] as const;
export type VintedListingReadStep = (typeof vintedListingReadSteps)[number];

/** Nennt nur, an welchem festen Schritt das Lesen der Maske scheiterte. */
export class VintedListingReadError extends Error {
  readonly step: VintedListingReadStep;
  constructor(step: VintedListingReadStep) {
    super('Das Vinted-Inserat konnte nicht gelesen werden.');
    this.step = step;
  }
}
