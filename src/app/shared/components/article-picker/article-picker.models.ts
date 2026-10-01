/** Eine auswählbare Variante oder ein konkretes Einzelstück, niemals eine Gruppe. */
export interface ArticlePickerEntry {
  readonly id: string;
  readonly groupId: string;
  readonly title: string;
  readonly brand?: string | null;
  readonly model?: string | null;
  readonly category?: string | null;
  readonly size?: string | null;
  readonly color?: string | null;
  readonly conditionLabel?: string | null;
  readonly ean?: string | null;
  readonly sku?: string | null;
  readonly imageKey: string;
  /** undefined: Einkauf ohne Bestandsgrenze; null: Bestand noch nicht verlässlich. */
  readonly availableQuantity?: number | null;
  readonly disabledReason?: string | null;
}

export interface ArticlePickerGroup {
  readonly id: string;
  readonly title: string;
  readonly brand?: string | null;
  readonly imageKey: string;
  readonly entries: readonly ArticlePickerEntry[];
}

export interface ArticlePickerFilters {
  readonly query: string;
  readonly category: string | null;
  readonly brand: string | null;
}
