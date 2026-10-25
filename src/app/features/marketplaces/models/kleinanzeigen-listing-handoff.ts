import type { KleinanzeigenDraftInput } from './kleinanzeigen-transfer-mapping';
import type { KleinanzeigenPublicationIssue } from './kleinanzeigen-provider-schema';

/** Nur Angaben prüfen, die Flipbase tatsächlich erfasst; weitere Felder bleiben beim Anbieter. */
export function validateKleinanzeigenHandoff(
  content: KleinanzeigenDraftInput,
  photoCount: number,
): KleinanzeigenPublicationIssue[] {
  const issues: KleinanzeigenPublicationIssue[] = [];
  if (!content.title.trim() || content.title.length > 65)
    issues.push({ field: 'title', message: 'Prüfe den Titel: 1 bis 65 Zeichen.' });
  if (!content.description.trim() || content.description.length > 4000)
    issues.push({ field: 'description', message: 'Prüfe die Beschreibung: 1 bis 4.000 Zeichen.' });
  if (
    content.priceCents === null ||
    !Number.isSafeInteger(content.priceCents) ||
    content.priceCents < 0 ||
    content.priceCents > 9999999900 ||
    content.priceCents % 100 !== 0
  )
    issues.push({
      field: 'priceCents',
      message: 'Kleinanzeigen erwartet einen Preis in ganzen Euro.',
    });
  if (content.postalCode && !/^\d{5}$/u.test(content.postalCode))
    issues.push({ field: 'postalCode', message: 'Trage eine fünfstellige Postleitzahl ein.' });
  if (!Number.isSafeInteger(photoCount) || photoCount < 0 || photoCount > 20)
    issues.push({
      field: 'images',
      message: 'Für Kleinanzeigen sind höchstens 20 Bilder möglich.',
    });
  return issues;
}
