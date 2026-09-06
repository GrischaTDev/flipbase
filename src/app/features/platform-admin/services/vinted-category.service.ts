import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { CategorySyncStatus, VintedCategory } from '../models/vinted-category.model';

/**
 * Liest den Kategoriebaum und seinen Auffrischungsstand.
 *
 * Geschrieben wird hier nur ein einziges Feld: `requested_at`. Alles andere
 * setzt der Sniper-Dienst mit Dienstschluessel. Die Datenbank laesst es auch
 * gar nicht anders zu - angemeldete Konten haben nur auf diese eine Spalte ein
 * Schreibrecht.
 */
@Injectable({ providedIn: 'root' })
export class VintedCategoryService {
  private readonly supabase = inject(SupabaseService);

  /**
   * Nur Blaetter: Eine Zwischenkategorie als Sammelauftrag waere zu breit, und
   * der Waehler soll gar nicht erst dazu einladen.
   */
  async listLeaves(): Promise<VintedCategory[]> {
    const { data, error } = await this.supabase.client
      .from('vinted_categories')
      .select('id, parent_id, title, path, is_leaf')
      .eq('is_leaf', true)
      .order('path', { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      id: row.id as number,
      parentId: (row.parent_id as number | null) ?? null,
      title: row.title as string,
      path: row.path as string,
      isLeaf: row.is_leaf as boolean,
    }));
  }

  async readStatus(): Promise<CategorySyncStatus> {
    const { data, error } = await this.supabase.client
      .from('vinted_category_syncs')
      .select('refreshed_at, requested_at, last_attempt_at, category_count, last_error')
      .eq('id', 1)
      .single();

    if (error) throw new Error(error.message);

    return {
      refreshedAt: (data?.['refreshed_at'] as string | null) ?? null,
      requestedAt: (data?.['requested_at'] as string | null) ?? null,
      lastAttemptAt: (data?.['last_attempt_at'] as string | null) ?? null,
      categoryCount: (data?.['category_count'] as number | null) ?? 0,
      lastError: (data?.['last_error'] as string | null) ?? null,
    };
  }

  async requestRefresh(): Promise<void> {
    const { error } = await this.supabase.client
      .from('vinted_category_syncs')
      .update({ requested_at: new Date().toISOString() })
      .eq('id', 1);

    if (error) throw new Error(error.message);
  }
}
