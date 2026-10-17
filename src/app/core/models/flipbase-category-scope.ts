import { categorySelectionAllowed, type CategorySelectionRules } from './category-selection-scope';
/** Kuratierte Flipbase-Auswahl. Die ursprünglichen Kennungen und Herkunftsdaten bleiben erhalten. */
export const FLIPBASE_CATEGORY_RULES: CategorySelectionRules = {
  excluded: [
    'ap',
    'bi',
    'ha',
    'hg-12',
    'vp',
    'fb',
    'bt-10-1',
    'ma-1-2',
    'hb-1-9-1',
    'hb-1-9-2',
    'hb-1-9-3',
    'hb-1-9-4',
    'hb-1-9-5',
    'sg-4-4-1',
    'sg-4-4-2',
    'sg-4-4-3',
    'sg-4-4-5',
    'sg-4-4-6',
    'sg-4-4-7',
    'sg-4-4-8',
    'sg-4-1-1-2',
    'sg-4-1-1-3',
    'sg-4-1-1-4',
    'sg-4-1-1-5',
    'sg-4-1-1-8',
    'sg-4-1-1-9',
    'sg-4-1-1-10',
    'sg-4-1-8',
    'sg-4-1-13',
    'sg-4-1-14',
    'sg-4-6-16',
  ],
  included: [
    'fb-3',
    'fb-4',
    'bi-9-2-1',
    'bi-9-2-2',
    'bi-9-2-4',
    'bi-19-2',
    'bi-25-4',
    'bi-25-5',
    'bi-25-8',
    'bi-25-13',
    'bi-25-14',
    'vp-1-6-1-3',
    'vp-1-6-1-8',
    'vp-1-6-5-2',
    'vp-1-6-5-6',
    'vp-1-6-7-4',
    'vp-1-6-7-6',
    'vp-1-6-7-7',
    'vp-1-6-7-8',
    'vp-1-6-7-13',
    'vp-1-6-7-14',
  ],
};
export function flipbaseCategoryPath(id: string): readonly string[] {
  const parts = id.split('-');
  return parts.map((_, index) => parts.slice(0, index + 1).join('-'));
}
export function flipbaseCategoryAllowed(id: string): boolean {
  return categorySelectionAllowed(flipbaseCategoryPath(id), FLIPBASE_CATEGORY_RULES);
}
export function flipbaseCategoryVisible(id: string): boolean {
  return (
    flipbaseCategoryAllowed(id) ||
    FLIPBASE_CATEGORY_RULES.included.some((value) => value.startsWith(id + '-'))
  );
}
/** PostgREST filtert vor dem Suchlimit. Keine Nutzertexte werden in diesen Ausdruck eingesetzt. */
function queryFilter(navigation: boolean): string {
  const notSubtree = (id: string) => [`id.neq.${id}`, `id.not.like.${id}-*`];
  const regions = [
    `and(${FLIPBASE_CATEGORY_RULES.excluded.flatMap(notSubtree).join(',')})`,
    ...FLIPBASE_CATEGORY_RULES.included.map((id) => {
      const range = `or(id.eq.${id},id.like.${id}-*)`;
      const exclusions = FLIPBASE_CATEGORY_RULES.excluded
        .filter((value) => value.startsWith(id + '-'))
        .flatMap(notSubtree);
      return exclusions.length ? `and(${range},${exclusions.join(',')})` : range;
    }),
  ];
  if (navigation) {
    const parents = new Set(
      FLIPBASE_CATEGORY_RULES.included.flatMap((id) => flipbaseCategoryPath(id).slice(0, -1)),
    );
    regions.push(
      ...[...parents].filter((id) => !flipbaseCategoryAllowed(id)).map((id) => `id.eq.${id}`),
    );
  }
  return regions.join(',');
}
export const FLIPBASE_CATEGORY_SELECTION_FILTER = queryFilter(false);
export const FLIPBASE_CATEGORY_NAVIGATION_FILTER = queryFilter(true);
