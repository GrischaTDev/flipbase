import { CatalogProductMedia } from './flipbase.models';

/** Reihenfolge entspricht der Galerie; das erste Bild ist das Hauptbild. */
export interface ProductImageDraft {
  readonly key: string;
  readonly media: CatalogProductMedia | null;
  readonly file: File | null;
  readonly previewUrl: string;
}
