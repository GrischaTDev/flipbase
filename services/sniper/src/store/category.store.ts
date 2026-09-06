import type { SupabaseClient } from '@supabase/supabase-js';

import type { CategorySyncState } from '../runtime/category-refresh.js';
import type { VintedCategory } from '../vinted/categories.js';

/**
 * Schreibt den Kategoriebaum und fuehrt den Auffrischungsstand.
 *
 * `replaceAll` ersetzt vollstaendig statt zusammenzufuehren: Eine Kategorie,
 * die Vinted entfernt hat, soll auch bei uns verschwinden. Ein Zusammenfuehren
 * liesse Karteileichen stehen, und die tauchten spaeter im Kategoriewaehler
 * auf, ohne je Funde zu liefern.
 *
 * Ein Fehlschlag loescht nichts. Der letzte gute Stand bleibt benutzbar, und
 * die Administration sieht am Fehlertext, dass er alt ist.
 */
export class CategoryStore {
  constructor(private readonly client: SupabaseClient) {}

  async readSyncState(): Promise<CategorySyncState> {
    const { data, error } = await this.client
      .from('vinted_category_syncs')
      .select('refreshed_at, requested_at')
      .eq('id', 1)
      .single();

    if (error) throw new Error(error.message);

    return {
      refreshedAt: (data?.['refreshed_at'] as string | null) ?? null,
      requestedAt: (data?.['requested_at'] as string | null) ?? null,
    };
  }

  async replaceAll(categories: VintedCategory[]): Promise<void> {
    // Erst leeren, dann schreiben. Die Eltern stehen im selben Schwung wie die
    // Kinder - deshalb muss der Fremdschluessel aufschiebbar sein oder die
    // Reihenfolge stimmen. Sortiert nach Tiefe des Pfades kommt jeder Elternteil
    // vor seinen Kindern.
    const { error: deleteError } = await this.client
      .from('vinted_categories')
      .delete()
      .gte('id', 0);
    if (deleteError) throw new Error(deleteError.message);

    const ordered = [...categories].sort(
      (left, right) => left.path.split(' > ').length - right.path.split(' > ').length,
    );

    const rows = ordered.map((category) => ({
      id: category.id,
      parent_id: category.parentId,
      title: category.title,
      slug: category.slug,
      path: category.path,
      is_leaf: category.isLeaf,
      updated_at: new Date().toISOString(),
    }));

    // In Blöcken schreiben: Rund 2900 Zeilen in einem Rutsch sprengen die
    // Anfragegroesse von PostgREST.
    for (let start = 0; start < rows.length; start += 500) {
      const { error } = await this.client
        .from('vinted_categories')
        .insert(rows.slice(start, start + 500));
      if (error) throw new Error(error.message);
    }
  }

  async markRefreshed(count: number, at: Date): Promise<void> {
    const { error } = await this.client
      .from('vinted_category_syncs')
      .update({
        refreshed_at: at.toISOString(),
        last_attempt_at: at.toISOString(),
        category_count: count,
        last_error: null,
      })
      .eq('id', 1);

    if (error) throw new Error(error.message);
  }

  async markFailed(reason: string, at: Date): Promise<void> {
    const { error } = await this.client
      .from('vinted_category_syncs')
      .update({ last_attempt_at: at.toISOString(), last_error: reason })
      .eq('id', 1);

    if (error) throw new Error(error.message);
  }
}
