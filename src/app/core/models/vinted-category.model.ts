/** Eine Kategorie oder Zwischenkategorie mit originaler Vinted-ID und lesbarem Pfad. */
export interface VintedCategory {
  id: number;
  parentId: number | null;
  title: string;
  /** Lesbarer Pfad wie "Damen > Schuhe > Stiefel". */
  path: string;
}
