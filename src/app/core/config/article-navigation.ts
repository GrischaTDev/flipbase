export const ARTICLE_VIEWS = [
  { label: 'Alle Artikel', path: '/catalog' },
  { label: 'Bestand', path: '/inventory' },
] as const;

export function isArticleRoute(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  return ARTICLE_VIEWS.some((entry) => path === entry.path || path.startsWith(entry.path + '/'));
}
