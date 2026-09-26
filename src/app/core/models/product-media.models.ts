import { CatalogProductMedia } from './flipbase.models';

/** Reihenfolge entspricht der Galerie; das erste Bild ist das Hauptbild. */
export interface ProductImageDraft {
  readonly key: string;
  readonly media: CatalogProductMedia | null;
  readonly file: File | null;
  readonly previewUrl: string;
  /** Sichtbarer Bildname; die gespeicherte Datei und ihr Pfad bleiben unverändert. */
  readonly fileName?: string;
  readonly altText?: string;
}

export interface ProductMediaDetails {
  readonly fileName: string;
  readonly altText: string;
}
