import type { ArticleRow } from './article-row';

export type ArticleView = 'active' | 'archive' | 'all' | 'stock' | 'empty' | 'review';

export const articleViews: readonly { readonly value: ArticleView; readonly label: string }[] = [
  { value: 'active', label: 'Aktiv' },
  { value: 'stock', label: 'Bestand' },
  { value: 'empty', label: 'Ohne Bestand' },
  { value: 'archive', label: 'Archiv' },
  { value: 'review', label: 'Zu prüfen' },
  { value: 'all', label: 'Alle' },
];

export function parseArticleView(value: string | null): ArticleView {
  return articleViews.find((view) => view.value === value)?.value ?? 'active';
}

export function matchesArticleView(row: ArticleRow, view: ArticleView): boolean {
  switch (view) {
    case 'active':
      return row.archivedAt === null;
    case 'archive':
      return row.archivedAt !== null;
    case 'stock':
      return row.onHand !== null && row.onHand > 0;
    case 'empty':
      return row.onHand === 0;
    case 'review':
      return row.quantityState === 'review_required';
    case 'all':
      return true;
  }
}
