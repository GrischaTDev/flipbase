export type ArticleKind = 'catalog' | 'item';

export type ArticleQuantityState = 'known' | 'review_required';

export interface ArticleRow {
  readonly key: string;
  readonly id: string;
  readonly kind: ArticleKind;
  readonly title: string;
  readonly detailLink: string;
  readonly onHand: number | null;
  readonly available: number | null;
  readonly reserved: number | null;
  readonly quantityState: ArticleQuantityState;
  readonly inventoryValue: number | null;
  readonly archivedAt: string | null;
  readonly canOfferDelete: boolean;
}
