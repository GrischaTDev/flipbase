import { KLEINANZEIGEN_CATEGORY_SNAPSHOT } from '../data/kleinanzeigen-category-snapshot';
import { createKleinanzeigenCategorySource } from './kleinanzeigen-category-source';
/** Vollständiger lokaler Kategoriebaum; die Auswahl benötigt keine Kontoverbindung. */
export const kleinanzeigenCategories = createKleinanzeigenCategorySource(
  KLEINANZEIGEN_CATEGORY_SNAPSHOT.categories,
);
