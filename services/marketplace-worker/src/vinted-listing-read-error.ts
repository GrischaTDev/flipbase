/** Feste Schritte beim Lesen der Vinted-Bearbeitungsmaske; keine Seiteninhalte oder Kennungen. */
export const vintedListingReadSteps = [
  'reserve',
  'authorize',
  'navigate',
  'form',
  'identity',
  'values',
  'photos',
  'category',
  'fields',
  'changed',
  'parse',
  'result',
] as const;
export type VintedListingReadStep = (typeof vintedListingReadSteps)[number];

/**
 * Kurze Einordnung eines unerwarteten Fehlers für das Protokoll: Fehlerart und, nur wenn sie
 * ausschließlich aus gewöhnlichen Wörtern besteht, die feste eigene Meldung. Meldungen mit
 * Ziffern, Adressen, Sonderzeichen oder zeichenkettenartigen Wörtern (Anbieterantworten,
 * Selektoren, Kennungen, Schlüssel) entfallen.
 */
export const plainFailureMessage = /^\p{Lu}?\p{Ll}{1,24}(?:[ -]\p{Lu}?\p{Ll}{1,24}){0,11}$/u;
export function unexpectedFailureDetail(error: unknown): string {
  const name =
    error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : 'Unknown';
  const message = error instanceof Error ? error.message : '';
  return plainFailureMessage.test(message) ? name + ': ' + message : name;
}

/** Unerwarteter Abbruch im getrennten Browser; trägt nur die geprüfte Kurzbeschreibung. */
export class BrowserActionFailedError extends Error {
  readonly detail: string;
  constructor(detail: string) {
    super('Browseraktion fehlgeschlagen');
    this.detail = detail;
  }
}

/** Das Ändern eines Inserats brach ab, bevor bei Vinted gespeichert wurde; dort ist nichts geändert. */
export class VintedListingNotSavedError extends Error {
  constructor() {
    super('Das Vinted-Inserat wurde nicht geändert.');
  }
}

/** Nennt nur, an welchem festen Schritt das Lesen der Maske scheiterte. */
export class VintedListingReadError extends Error {
  readonly step: VintedListingReadStep;
  constructor(step: VintedListingReadStep) {
    super('Das Vinted-Inserat konnte nicht gelesen werden.');
    this.step = step;
  }
}
