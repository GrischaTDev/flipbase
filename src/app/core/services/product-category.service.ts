import { Injectable, inject } from '@angular/core';
import { ProductCategory } from '../models/product-category.models';
import { SupabaseService } from './supabase.service';

export const CATEGORY_SEARCH_LIMIT = 50;

export interface CategorySearchResult {
  readonly categories: readonly ProductCategory[];
  readonly hasMore: boolean;
}

interface ProductCategoryRow {
  readonly id: string;
  readonly parent_id: string | null;
  readonly name: string;
  readonly full_name: string;
  readonly level: number;
  readonly is_leaf: boolean;
  readonly is_deprecated: boolean;
}

const CATEGORY_COLUMNS = 'id, parent_id, name, full_name, level, is_leaf, is_deprecated';

function mapRow(row: ProductCategoryRow): ProductCategory {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    fullName: row.full_name,
    level: row.level,
    isLeaf: row.is_leaf,
    isDeprecated: row.is_deprecated,
  };
}

/** Maskiert die Platzhalter von LIKE/ILIKE, damit „50%" wörtlich gesucht wird. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

/**
 * Liest den Shopify-Kategoriebaum. Kategorien ändern sich nur mit Migrationen,
 * deshalb bleiben geladene Ebenen für die Sitzung im Speicher.
 */
@Injectable({ providedIn: 'root' })
export class ProductCategoryService {
  private readonly supabase = inject(SupabaseService);
  private readonly childrenCache = new Map<string, Promise<readonly ProductCategory[]>>();
  private readonly categoriesById = new Map<string, ProductCategory>();

  loadChildren(parentId: string | null): Promise<readonly ProductCategory[]> {
    const key = `db:${parentId ?? ''}`;
    const cached = this.childrenCache.get(key);
    if (cached) return cached;

    const request = this.fetchChildren(parentId).then(
      (categories) => {
        for (const category of categories) this.categoriesById.set(category.id, category);
        return categories;
      },
      (error: unknown) => {
        // Ohne diesen Schritt bliebe der Fehler gespeichert und „Erneut versuchen"
        // liefe ins Leere.
        this.childrenCache.delete(key);
        throw error;
      },
    );
    this.childrenCache.set(key, request);
    return request;
  }

  async search(term: string): Promise<CategorySearchResult> {
    const words = term.trim().split(/\s+/u).filter(Boolean);
    if (words.join(' ').length < 2) return { categories: [], hasMore: false };

    let query = this.supabase.client
      .from('product_categories')
      .select(CATEGORY_COLUMNS)
      .eq('is_deprecated', false);
    for (const word of words) query = query.ilike('full_name', `%${escapeLikePattern(word)}%`);
    const { data, error } = await query
      .order('level')
      .order('full_name')
      .limit(CATEGORY_SEARCH_LIMIT + 1);
    if (error) throw new Error(error.message);
    const categories: ProductCategory[] = (data ?? []).map(mapRow);

    for (const category of categories) this.categoriesById.set(category.id, category);
    return {
      categories: categories.slice(0, CATEGORY_SEARCH_LIMIT),
      hasMore: categories.length > CATEGORY_SEARCH_LIMIT,
    };
  }

  async getById(id: string): Promise<ProductCategory | null> {
    const known = this.categoriesById.get(id);
    if (known) return known;

    const { data, error } = await this.supabase.client
      .from('product_categories')
      .select(CATEGORY_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const category = mapRow(data);
    this.categoriesById.set(category.id, category);
    return category;
  }

  private async fetchChildren(parentId: string | null): Promise<readonly ProductCategory[]> {
    const base = this.supabase.client
      .from('product_categories')
      .select(CATEGORY_COLUMNS)
      .eq('is_deprecated', false);
    const filtered =
      parentId === null ? base.is('parent_id', null) : base.eq('parent_id', parentId);
    const { data, error } = await filtered.order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  }
}
