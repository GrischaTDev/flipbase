export const ARTICLE_VIEWS: readonly [] = [];

export function isArticleRoute(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  return ['/catalog', '/inventory'].some((entry) => path === entry || path.startsWith(entry + '/'));
}
