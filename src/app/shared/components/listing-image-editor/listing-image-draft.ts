/** Darstellende Bildauswahl ohne Datenbank- oder Marktplatzbezug. */
export interface ListingImageDraft {
  readonly key: string;
  readonly storagePath: string | null;
  readonly file: File | null;
  readonly fileName: string;
  readonly previewUrl: string;
}
