import type { VintedListingPhotoMetadata } from '../../../../../supabase/functions/_shared/marketplace-listing-contracts';
import type { MarketplaceConnection } from './marketplace.models';
import {
  validateVintedListingSubmission,
  type VintedListingCategoryFields,
} from './vinted-listing-category-fields';
import type { VintedListingContent } from './vinted-listing-content';
import { vintedListingValidationMessage } from './vinted-listing-publication-review';

/** Mindestangaben gelten für die Veröffentlichung, nicht für das Speichern eines Entwurfs. */
export function validateVintedListingEditor(
  content: VintedListingContent,
  photos: readonly VintedListingPhotoMetadata[],
  schema: VintedListingCategoryFields | null,
): Readonly<Record<string, string>> {
  if (schema) {
    return Object.fromEntries(
      validateVintedListingSubmission(content, photos, schema)
        .filter(
          (issue) =>
            // Die Kategorieauswahl enthält nur eine kurze Markenliste. Die Vorschau sucht
            // die gespeicherte Markenkennung unabhängig und bestätigt ihren Namen erneut.
            !(
              issue.field === 'brand' &&
              issue.code === 'unavailable' &&
              content.brandId !== null &&
              content.brandLabel.trim()
            ),
        )
        .map((issue) => [issue.field, vintedListingValidationMessage(issue, schema)]),
    );
  }
  const errors: Record<string, string> = {};
  for (const field of ['title', 'description'] as const) {
    if (!content[field].trim())
      errors[field] = vintedListingValidationMessage({ field, code: 'missing' });
    else if (/\{\s*[^{}]+?\s*\}/.test(content[field]))
      errors[field] = 'Ersetze die Platzhalter durch Deine Artikelangaben.';
  }
  if (content.priceCents === null) errors['price'] = 'Ergänze bitte: Verkaufspreis.';
  else if (content.priceCents <= 0) errors['price'] = 'Der Verkaufspreis muss größer als 0 € sein.';
  if (content.categoryId === null) errors['category'] = 'Wähle eine Vinted-Kategorie aus.';
  if (!photos.length) errors['photos'] = 'Füge mindestens ein Artikelfoto hinzu.';
  else if (photos.length > 20)
    errors['photos'] = vintedListingValidationMessage({ field: 'photos', code: 'limit' });
  return errors;
}

type EditorAccount = Pick<
  MarketplaceConnection,
  'marketplace' | 'workspaceId' | 'executionMode' | 'status' | 'externalAccountId'
>;

/** Keine Anbieterfreigabe ableiten: Diese wird weiterhin in der Veröffentlichungsvorschau geprüft. */
export function vintedListingAccountIssue(
  account: EditorAccount | undefined,
  workspaceId: string | null,
): string | null {
  if (!account) return 'Wähle ein Vinted-Zielkonto aus. Deinen Entwurf kannst Du schon speichern.';
  if (account.workspaceId !== workspaceId || account.marketplace !== 'vinted')
    return 'Wähle ein Vinted-Konto dieses Arbeitsbereichs aus.';
  if (account.executionMode !== 'cloud')
    return 'Für die Veröffentlichung brauchst Du ein verbundenes Vinted-Cloudkonto. Wähle es unter Zielkonto aus.';
  switch (account.status) {
    case 'paused':
      return 'Dieses Konto ist pausiert. Setze die Verbindung in der Vinted-Kontoverwaltung fort.';
    case 'needs_login':
    case 'disconnected':
      return 'Melde dieses Konto in der Vinted-Kontoverwaltung erneut an.';
    case 'blocked':
      return 'Die Verbindung dieses Kontos ist gesperrt. Prüfe den Hinweis in der Vinted-Kontoverwaltung.';
  }
  if (!/^[1-9][0-9]{0,31}$/.test(account.externalAccountId ?? ''))
    return 'Die Vinted-Kontoidentität ist noch nicht bestätigt. Verbinde das Konto in der Vinted-Kontoverwaltung erneut.';
  return null;
}
