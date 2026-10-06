/** Eine Kategorie oder Zwischenkategorie mit originaler Vinted-ID und lesbarem Pfad. */
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
