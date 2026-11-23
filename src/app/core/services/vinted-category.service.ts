import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { VintedCategory } from '../models/vinted-category.model';
import { buildVintedCategoryTree } from '../models/vinted-category-tree';

/**
 * Zeilen je Anfrage. Hoeher als `max_rows` in supabase/config.toml zu gehen
 * bringt nichts - PostgREST kuerzt trotzdem auf diesen Wert.
 */
const PAGE_SIZE = 1000;

interface CategorySyncStatus {
  refreshedAt: string | null;
  categoryCount: number;
}

/** Liest den vollständig geladenen Vinted-Kategoriebaum. */
@Injectable({ providedIn: 'root' })
export class VintedCategoryService {
  private readonly supabase = inject(SupabaseService);

  async readSnapshot(): Promise<{ categories: VintedCategory[]; status: CategorySyncStatus }> {
    const before = await this.readStatus();
    const categories: VintedCategory[] = [];
    const seen = new Set<number>();
    for (;;) {
      const { data, error } = await this.supabase.client
        .from('vinted_categories')
        .select('id, parent_id, title, path')
        .order('path', { ascending: true })
        .order('id', { ascending: true })
        .range(categories.length, categories.length + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      for (const row of data) {
        if (seen.has(row.id))
          throw new Error('Der Kategoriebaum enthält wiederholte Einträge. Bitte erneut laden.');
        seen.add(row.id);
      }
      categories.push(
        ...data.map((row) => ({
          id: row.id,
          parentId: row.parent_id,
          title: row.title,
          path: row.path,
        })),
      );
    }
    const after = await this.readStatus();
    if (
      !categories.length ||
      before.refreshedAt !== after.refreshedAt ||
      categories.length !== after.categoryCount
    ) {
      throw new Error(
        'Der Kategoriebaum wird gerade aktualisiert oder ist unvollständig. Bitte erneut laden.',
      );
    }
    const tree = buildVintedCategoryTree(categories);
    // Pfade kommen aus dem geprüften Baum, nicht aus möglicherweise alten Einzelzeilen.
    return {
      categories: categories.map((category) => ({
        ...category,
        path: tree.get(category.id)!.path,
      })),
      status: after,
    };
  }

  private async readStatus(): Promise<CategorySyncStatus> {
    const { data, error } = await this.supabase.client
      .from('vinted_category_syncs')
      .select('refreshed_at, category_count')
      .eq('id', 1)
      .single();

    if (error) throw new Error(error.message);

    return {
      refreshedAt: data?.refreshed_at ?? null,
      categoryCount: data?.category_count ?? 0,
    };
  }
}
