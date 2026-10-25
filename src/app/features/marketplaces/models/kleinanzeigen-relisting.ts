import { KLEINANZEIGEN_CATEGORY_SNAPSHOT } from '../data/kleinanzeigen-category-snapshot';
import { kleinanzeigenCategories } from './kleinanzeigen-categories';

/** Dieselben Originalpfade wie im Kategoriepicker; keine zweite Kategoriequelle in der Erweiterung. */
export const kleinanzeigenRelistingPaths: Readonly<Record<string, string>> = Object.fromEntries(
  KLEINANZEIGEN_CATEGORY_SNAPSHOT.categories
    .filter((category) => !category.isParent)
    .map((category) => [
      kleinanzeigenCategories.getCategory(category.path)!.fullName,
      category.path,
    ]),
);
export interface KleinanzeigenRelistingResult {
  readonly externalId: string;
  readonly outcome: 'confirmed' | 'processing' | 'outcome_unknown' | 'needs_user_action';
  readonly newExternalId?: string;
  readonly url?: string;
  readonly errorCode?: string;
}
export interface KleinanzeigenRelistingAttempt {
  readonly externalId: string;
  readonly title: string;
  readonly phase: 'secured' | 'deleting' | 'deleted' | 'submitting' | 'outcome_unknown';
}
export function parseKleinanzeigenRelistingResult(
  value: unknown,
  externalId: string,
): KleinanzeigenRelistingResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  if (
    result['externalId'] !== externalId ||
    !['confirmed', 'processing', 'outcome_unknown', 'needs_user_action'].includes(
      String(result['outcome']),
    )
  )
    return null;
  if (result['outcome'] === 'confirmed') {
    if (
      typeof result['newExternalId'] !== 'string' ||
      !/^[1-9][0-9]{0,31}$/u.test(result['newExternalId']) ||
      result['newExternalId'] === externalId
    )
      return null;
    try {
      const url = new URL(String(result['url']));
      const match = /^\/s-anzeige\/[^/]+\/([1-9][0-9]*)-[0-9]+-[0-9]+$/u.exec(url.pathname);
      if (
        url.origin !== 'https://www.kleinanzeigen.de' ||
        url.search ||
        url.hash ||
        url.username ||
        url.password ||
        match?.[1] !== result['newExternalId']
      )
        return null;
    } catch {
      return null;
    }
  }
  return result as unknown as KleinanzeigenRelistingResult;
}
export function kleinanzeigenRelistingMessage(result: KleinanzeigenRelistingResult): string {
  if (result.outcome === 'confirmed') return 'Neu inseriert';
  if (result.outcome === 'processing')
    return 'Kleinanzeigen verarbeitet die neue Anzeige. Bitte Status prüfen.';
  if (result.outcome === 'outcome_unknown')
    return 'Ergebnis noch unklar. Es wird kein zweites Inserat erstellt; bitte Status prüfen.';
  switch (result.errorCode) {
    case 'category_missing':
      return 'Kategorie nicht gefunden. Die alte Anzeige bleibt erhalten.';
    case 'fees_or_quota':
      return 'Gebühren oder freies Kontingent nicht bestätigt. Bitte das geöffnete Formular prüfen.';
    case 'source_changed':
      return 'Die alte Anzeige wurde inzwischen geändert. Bitte aktualisieren.';
    case 'deletion_confirmed':
      return 'Die alte Anzeige ist entfernt. Du kannst die gesicherte Neufassung jetzt fortsetzen.';
    case 'deletion_unconfirmed':
    case 'deletion_not_confirmed':
      return 'Die Löschung konnte nicht eindeutig bestätigt werden. Die gesicherte Neufassung bleibt im Browser; bitte prüfen.';
    default:
      return 'Automatische Übernahme angehalten. Bitte die gesicherte Fassung im geöffneten Formular prüfen.';
  }
}
export function kleinanzeigenRelistingError(error: unknown): string {
  if (!(error instanceof Error))
    return 'Der Vorgang konnte nicht bestätigt werden. Prüfe seinen Status im ursprünglichen Browserprofil.';
  if (['account_changed', 'grant_changed', 'access_revoked'].includes(error.message))
    return 'Browserkonto oder Freigabe hat sich geändert. Prüfe Deine Kleinanzeigen-Verbindung.';
  if (error.message === 'images_incomplete')
    return 'Die Bilder konnten nicht vollständig gesichert werden. Die alte Anzeige bleibt erhalten.';
  if (error.name === 'QuotaExceededError')
    return 'Die lokale Sicherung konnte nicht geschrieben werden. Prüfe den freien Speicherplatz in diesem Browserprofil.';
  if (/^[a-z_]+$/u.test(error.message) || error.message.startsWith('No tab with id'))
    return 'Der Vorgang konnte nicht bestätigt werden. Prüfe seinen Status im ursprünglichen Browserprofil.';
  return error.message;
}
