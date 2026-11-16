/**
 * Vorschaubild einer Aktion. Ungültige oder fremde Werte blenden nur das Bild aus und lassen den
 * Aktionsstatus selbst gültig.
 */
export function actionPreviewImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/** Speicherpfad des ersten Entwurfsfotos; wird erst beim Anzeigen signiert. */
export function actionPreviewStoragePath(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length <= 1024 &&
    /^[0-9a-f-]{36}\/[^\s]+$/i.test(value) &&
    !value.includes('..')
    ? value
    : null;
}
