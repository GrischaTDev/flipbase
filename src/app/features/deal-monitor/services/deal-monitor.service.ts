import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { VintedCategoryService } from '../../platform-admin/services/vinted-category.service';
import type { VintedFeedImport } from '../models/vinted-feed-link';
import {
  FEED_CLOTHING_SIZES,
  FeedBot,
  FeedPage,
  FeedRequest,
  Watchlist,
  WatchlistDraft,
} from '../models/deal-monitor.model';

@Injectable({ providedIn: 'root' })
export class DealMonitorService {
  private readonly client = inject(SupabaseService).client;
  private readonly vintedCategories = inject(VintedCategoryService);

  async resolveFeedImport(workspace: string, imported: VintedFeedImport) {
    const [brand, condition, sizes] = await Promise.all([
      imported.brandId === null
        ? null
        : this.client.rpc('sniper_feed_import_brand', {
            p_workspace_id: workspace,
            p_brand_id: imported.brandId,
          }),
      imported.conditionId === null
        ? null
        : this.client
            .from('vinted_listing_options')
            .select('title')
            .eq('field_code', 'condition')
            .eq('id', imported.conditionId)
            .maybeSingle(),
      imported.sizeIds.length === 0
        ? null
        : this.client.from('vinted_listing_sizes').select('id,title').in('id', imported.sizeIds),
    ]);
    if (brand?.error || condition?.error || sizes?.error)
      throw new Error('Die Vinted-Filter konnten nicht aufgelöst werden.');
    if (brand && !brand.data)
      throw new Error('Die Marke aus dem Link ist für den Flipbase-Feed nicht hinterlegt.');
    if (condition && !condition.data)
      throw new Error('Der Zustand aus dem Link ist für den Feed nicht hinterlegt.');
    const sizeLabels = (sizes?.data ?? []).map(({ title }) => title.trim().toUpperCase());
    if (
      sizeLabels.length !== imported.sizeIds.length ||
      sizeLabels.some((label) => !FEED_CLOTHING_SIZES.some((size) => size.label === label))
    )
      throw new Error('Die Größen aus dem Link lassen sich im Feed nicht eindeutig übernehmen.');
    return {
      brand: brand?.data ?? '',
      condition: condition?.data?.title.replace(',', '').trim() ?? '',
      sizeLabels,
    };
  }

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

  async categories() {
    return (await this.vintedCategories.readSnapshot()).categories;
  }

  /** Kategorien, die ein aktiver Kategorie-Bot vollständig sammelt. */
  async collectedCategoryIds(workspace: string): Promise<number[]> {
    const { data, error } = await this.client.rpc('sniper_feed_categories', {
      p_workspace_id: workspace,
    });
    if (error || !data) throw new Error('Kategorien konnten nicht geladen werden.');
    return data.map(({ catalog_id }) => catalog_id);
  }

  /** Aktive Vinted-Bots aus der Administration für die direkte Feed-Filterung. */
  async feedBots(workspace: string): Promise<FeedBot[]> {
    const { data, error } = await this.client.rpc('sniper_feed_bots', {
      p_workspace_id: workspace,
    });
    if (error || !data) throw new Error('Vinted-Bots konnten nicht geladen werden.');
    return data.map(({ id, title }) => ({ id, title }));
  }

  async searchBrands(workspace: string, term: string): Promise<string[]> {
    const { data, error } = await this.client.rpc('sniper_search_feed_brands', {
      p_workspace_id: workspace,
      p_term: term,
    });
    if (error || !data) throw new Error('Marken konnten nicht geladen werden.');
    return data.map(({ brand }) => brand);
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
    const { data, error } = await this.client.rpc('sniper_feed_search', {
      p_workspace_id: request.workspace,
      p_watchlist_id: request.watchlist!,
      p_brand: request.brand!,
      p_size: request.size!,
      p_min_price: request.minPrice!,
      p_max_price: request.maxPrice!,
      p_before_time: (request.cursor?.time ?? null)!,
      p_before_id: (request.cursor?.id ?? null)!,
      p_limit: request.afterTime ? 61 : 60,
      p_title_query: request.titleQuery ?? '',
      p_catalog_id: (request.categoryId ?? null)!,
      p_audience: (request.audience ?? null)!,
      p_sizes: request.sizes ?? [],
      p_query_id: (request.botId ?? null)!,
      ...(request.afterTime ? { p_after_time: request.afterTime } : {}),
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
      p_audience: draft.audience!,
      p_sizes: draft.sizes,
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
