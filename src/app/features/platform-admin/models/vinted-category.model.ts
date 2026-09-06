/** Eine Kategorie von Vinted. Die id ist deren Nummer und geht so in catalog_ids. */
export interface VintedCategory {
  id: number;
  parentId: number | null;
  title: string;
  /** Lesbarer Pfad wie "Damen > Schuhe > Stiefel". */
  path: string;
  isLeaf: boolean;
}

/** Stand des zuletzt eingelesenen Kategoriebaums. */
export interface CategorySyncStatus {
  refreshedAt: string | null;
  requestedAt: string | null;
  lastAttemptAt: string | null;
  categoryCount: number;
  lastError: string | null;
}
