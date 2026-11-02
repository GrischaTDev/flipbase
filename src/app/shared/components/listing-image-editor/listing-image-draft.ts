import type { ImageCrop } from '../../../core/models/image-crop';
/** Darstellende Bildauswahl ohne Datenbank- oder Marktplatzbezug. */
export interface ListingImageDraft {
  readonly originalFile?: File | null;
  readonly originalPreviewUrl?: string;
  readonly crop?: ImageCrop | null;
  readonly key: string;
  readonly storagePath: string | null;
  readonly file: File | null;
  readonly fileName: string;
  readonly previewUrl: string;
}
