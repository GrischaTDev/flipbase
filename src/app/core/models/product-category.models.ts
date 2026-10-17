/** Trennzeichen im vollen Pfad der internen Flipbase-Kategorien. */
export const CATEGORY_PATH_SEPARATOR = ' > ';

export interface ProductCategory {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly fullName: string;
  readonly level: number;
  readonly isLeaf: boolean;
  readonly isDeprecated: boolean;
  /** false: bestehender Wert bleibt lesbar, ist aber keine neue Auswahl. */
  readonly isSelectable?: boolean;
}

export interface Brand {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
}

/** Felder, die der Datenbank-Trigger sync_category_brand_text() pflegt. */
export interface CategoryBrandRecord {
  workspace_id: string;
  category_id?: string | null;
  category?: string | null;
  brand_id?: string | null;
  brand?: string | null;
}

export function categoryPathParts(fullName: string): string[] {
  return fullName.split(CATEGORY_PATH_SEPARATOR);
}

/** Vergleichsform wie brands.name_key in der Datenbank. */
export function brandNameKey(name: string): string {
  return name.trim().toLowerCase();
}
