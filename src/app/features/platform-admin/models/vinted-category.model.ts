/**
 * Eine Kategorie von Vinted. Die id ist deren Nummer und geht so in catalog_ids.
 *
 * Ohne `isLeaf`, obwohl die Tabelle die Spalte hat: `listLeaves()` filtert
 * bereits darauf, das Feld waere in jedem Objekt hier `true`. Ein Feld, das
 * immer denselben Wert hat, sieht im Code aus wie eine Zusicherung und ist
 * keine - `if (category.isLeaf)` liest sich wie eine Pruefung und prueft
 * nichts. Braucht ein spaeterer Aufruf auch Zwischenkategorien, gehoert das
 * Feld mit dieser Abfrage zusammen zurueck.
 */
export interface VintedCategory {
  id: number;
  parentId: number | null;
  title: string;
  /** Lesbarer Pfad wie "Damen > Schuhe > Stiefel". */
  path: string;
}

/** Stand des zuletzt eingelesenen Kategoriebaums. */
export interface CategorySyncStatus {
  refreshedAt: string | null;
  requestedAt: string | null;
  lastAttemptAt: string | null;
  categoryCount: number;
  lastError: string | null;
}
