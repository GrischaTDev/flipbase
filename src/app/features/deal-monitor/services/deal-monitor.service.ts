import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  FeedCategory,
  FeedPage,
  FeedRequest,
  Watchlist,
  WatchlistDraft,
} from '../models/deal-monitor.model';

@Injectable({ providedIn: 'root' })
export class DealMonitorService {
  private readonly client = inject(SupabaseService).client;

  async watchlists(workspace: string): Promise<Watchlist[]> {
    const rows: Watchlist[] = [];
    for (;;) {
      const { data, error } = await this.client
        .from('sniper_watchlists')
        .select('*')
        .eq('workspace_id', workspace)
        .order('created_at')
        .order('id')
        .range(rows.length, rows.length + 999);
      if (error) throw new Error('Suchfilter konnten nicht geladen werden.');
      if (!data?.length) return rows;
      rows.push(...data);
    }
  }

  async categories(): Promise<FeedCategory[]> {
    const rows: FeedCategory[] = [];
    for (;;) {
      const { data, error } = await this.client
        .from('vinted_categories')
        .select('id,path')
        .eq('is_leaf', true)
        .order('path')
        .order('id')
        .range(rows.length, rows.length + 999);
      if (error) throw new Error('Kategorien konnten nicht geladen werden.');
      if (!data?.length) return rows;
      rows.push(...data);
    }
  }

  async supportedBrands(workspace: string): Promise<string[]> {
    const { data, error } = await this.client.rpc('sniper_supported_brands', {
      p_workspace_id: workspace,
    });
    if (error || !data) throw new Error('Marken konnten nicht geladen werden.');
    const uniqueBrands = new Map<string, string>();
    for (const row of data) {
      const brand = row.brand.trim();
      const key = brand.toLocaleLowerCase('de');
      if (brand && !uniqueBrands.has(key)) uniqueBrands.set(key, brand);
    }
    return [...uniqueBrands.values()].sort((left, right) => left.localeCompare(right, 'de'));
  }

  async feed(request: FeedRequest): Promise<FeedPage> {
    const { data, error } = await this.client.rpc('sniper_feed_filtered', {
      p_workspace_id: request.workspace,
      p_watchlist_id: request.watchlist!,
      p_brand: request.brand!,
      p_size: request.size!,
      p_min_price: request.minPrice!,
      p_max_price: request.maxPrice!,
      p_before_time: (request.cursor?.time ?? null)!,
      p_before_id: (request.cursor?.id ?? null)!,
      p_limit: 60,
    });
    if (error) throw new Error('Artikel konnten nicht geladen werden. Bitte erneut versuchen.');
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data['items']))
      throw new Error('Der Monitor hat eine ungültige Antwort geliefert.');
    return data as unknown as FeedPage;
  }

  async save(workspace: string, draft: WatchlistDraft): Promise<void> {
    const { error } = await this.client.rpc('save_sniper_watchlist', {
      p_workspace_id: workspace,
      p_id: draft.id!,
      p_title: draft.title,
      p_catalog_id: draft.catalog_id!,
      p_brand: draft.brand!,
      p_search_text: draft.search_text!,
      p_price_from: draft.price_from!,
      p_price_to: draft.price_to!,
      p_condition: draft.condition!,
      p_discount_threshold_percent: draft.discount_threshold_percent,
      p_is_active: draft.is_active,
    });
    if (error)
      throw new Error(
        'Suchfilter konnte nicht gespeichert werden. Bitte Angaben prüfen und erneut versuchen.',
      );
  }

  async delete(workspace: string, id: string): Promise<void> {
    const { error } = await this.client.rpc('delete_sniper_watchlist', {
      p_workspace_id: workspace,
      p_id: id,
    });
    if (error) throw new Error('Suchfilter konnte nicht gelöscht werden.');
  }
}
