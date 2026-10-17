import type { CategorySelectionRules } from '../../../core/models/category-selection-scope';
/** Originalkennungen; Regeln betreffen nur die angebotene Auswahl, nicht den gespeicherten Baum. */
export const VINTED_CATEGORY_RULES: CategorySelectionRules = {
  excluded: ['3811', '3812', '5106', '4347', '4349', '4351', '4352', '4353', '4758', '4759'],
  included: ['3887', '3963', '4019', '4026', '4027', '4284', '4286', '4386'],
};
