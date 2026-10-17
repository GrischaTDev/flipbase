import type { CategorySelectionRules } from '../../../core/models/category-selection-scope';
/** Freigegebene Ausschlüsse und Bekleidungsausnahme mit unveränderten Anbieterpfaden. */
export const KLEINANZEIGEN_CATEGORY_RULES: CategorySelectionRules = {
  excluded: [
    '210',
    '297',
    '130',
    '195',
    '102',
    '235',
    '400',
    '161/226',
    '17/236',
    '17/237',
    '80/84',
    '80/89',
    '80/239',
    '185/191',
    '185/233',
    '185/248',
  ],
  included: ['210/306/kleidung'],
};
