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

/** Liest den vollständig geladenen zentralen Vinted-Kategoriebaum. */
@Injectable({ providedIn: 'root' })
export class VintedCategoryService {
  private readonly supabase = inject(SupabaseService);

  async readSnapshot(): Promise<{ categories: VintedCategory[]; status: CategorySyncStatus }> {
    const categories: VintedCategory[] = [];
    const seen = new Set<number>();
    let latestObservedAt: string | null = null;
    for (;;) {
      const { data, error } = await this.supabase.client
        .from('vinted_listing_categories')
        .select('id, parent_id, title, path, tree_observed_at')
        .order('position', { ascending: true })
        .order('id', { ascending: true })
        .range(categories.length, categories.length + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      for (const row of data) {
        if (seen.has(row.id))
          throw new Error('Der Kategoriebaum enthält wiederholte Einträge. Bitte erneut laden.');
        seen.add(row.id);
        if (
          row.tree_observed_at &&
          (!latestObservedAt || row.tree_observed_at > latestObservedAt)
        ) {
          latestObservedAt = row.tree_observed_at;
        }
      }
      categories.push(
        ...data.map((row) => ({
          id: row.id,
          parentId: row.parent_id,
          title: row.title,
          path: row.path ? `${row.path} > ${row.title}` : row.title,
        })),
      );
      if (data.length < PAGE_SIZE) break;
    }
    if (!categories.length) {
      throw new Error(
        'Der Kategoriebaum ist noch nicht geladen. Bitte aktualisiere den Vinted-Katalog.',
      );
    }
    const tree = buildVintedCategoryTree(categories);
    // Pfade kommen aus dem geprüften Baum, nicht aus möglicherweise alten Einzelzeilen.
    return {
      categories: categories.map((category) => ({
        ...category,
        path: tree.get(category.id)!.path,
      })),
      status: { refreshedAt: latestObservedAt, categoryCount: categories.length },
    };
  }
}
