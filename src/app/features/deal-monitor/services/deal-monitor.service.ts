import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { VintedBrandSearchService } from '../../../core/services/vinted-brand-search.service';
import { VintedCategoryService } from '../../../core/services/vinted-category.service';
import type { VintedFeedImport } from '../models/vinted-feed-link';
import {
  FEED_CLOTHING_SIZES,
  FEED_ITEM_LIMIT,
  FeedPage,
  FeedRequest,
  PersonalFeed,
  PersonalFeedDraft,
  feedSizeFromVintedTitle,
} from '../models/deal-monitor.model';
import type { VintedBrand } from '../../../core/models/vinted-brand.model';

export interface FeedImportFields {
  /** Erkannte Marke oder null, wenn der Link keine oder eine unbekannte Marke enthält. */
  brand: VintedBrand | null;
  brandNotRecognized: boolean;
  condition: string;
  sizes: string[];
}

/** Diese Fehlercodes tragen eine für Nutzer formulierte Servermeldung. */
function userFacingServerMessage(error: { code?: string; message?: string } | null): string | null {
  if (error?.code !== '22023' && error?.code !== '54000') return null;
  return error.message?.trim() || null;
}

@Injectable({ providedIn: 'root' })
export class DealMonitorService {
  private readonly client = inject(SupabaseService).client;
  private readonly vintedBrands = inject(VintedBrandSearchService);
  private readonly vintedCategories = inject(VintedCategoryService);

  async resolveFeedImport(
    workspace: string,
    imported: VintedFeedImport,
  ): Promise<FeedImportFields> {
    const brandId = imported.brandId;
    const [brand, condition, sizes] = await Promise.all([
      brandId === null ? null : this.vintedBrands.resolveBrand(brandId, workspace),
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
    if (condition?.error || sizes?.error)
      throw new Error('Die Vinted-Filter konnten nicht aufgelöst werden.');
    if (condition && !condition.data)
      throw new Error('Der Zustand aus dem Link ist für den Feed nicht hinterlegt.');
    // Nicht abbildbare Größen wie reine Zahlengrößen werden ausgelassen.
    const sizeValues = new Set(
      (sizes?.data ?? []).flatMap(({ title }) => feedSizeFromVintedTitle(title) ?? []),
    );
    return {
      brand,
      brandNotRecognized: brandId !== null && brand === null,
      condition: condition?.data?.title.replace(',', '').trim() ?? '',
      sizes: FEED_CLOTHING_SIZES.flatMap(({ value }) => (sizeValues.has(value) ? value : [])),
    };
  }

  async personalFeeds(workspace: string): Promise<PersonalFeed[]> {
    const { data, error } = await this.client
      .from('sniper_watchlists')
      .select(
        'id,workspace_id,title,catalog_id,brand,brand_id,search_text,price_from,price_to,condition,audience,sizes,is_active,started_at',
      )
      .eq('workspace_id', workspace)
      .order('created_at')
      .order('id');
    if (error) throw new Error('Deine Feeds konnten nicht geladen werden.');
    return data ?? [];
  }

  async categories() {
    return (await this.vintedCategories.readSnapshot()).categories;
  }

  async searchBrands(workspace: string, term: string) {
    return this.vintedBrands.searchForFeed(term, workspace);
  }

  async feed(request: FeedRequest): Promise<FeedPage> {
    const { data, error } = await this.client.rpc('sniper_feed_search', {
      p_workspace_id: request.workspace,
      p_watchlist_id: request.watchlist,
      p_brand: null!,
      p_size: null!,
      p_min_price: null!,
      p_max_price: null!,
      p_before_time: null!,
      p_before_id: null!,
      p_limit: FEED_ITEM_LIMIT,
      p_title_query: '',
      p_catalog_id: null!,
      p_audience: null!,
      p_sizes: [],
      p_query_id: null!,
      p_after_time: (request.afterTime ?? null)!,
    });
    if (error) throw new Error('Artikel konnten nicht geladen werden.');
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data['items']))
      throw new Error('Der Feed hat eine ungültige Antwort geliefert.');
    return data as unknown as FeedPage;
  }

  async save(workspace: string, draft: PersonalFeedDraft): Promise<string> {
    const { data, error } = await this.client.rpc('save_sniper_watchlist', {
      p_workspace_id: workspace,
      p_id: draft.id!,
      p_title: draft.title,
      p_catalog_id: draft.catalog_id!,
      p_brand: draft.brand!,
      p_brand_id: draft.brand_id!,
      p_search_text: draft.search_text!,
      p_price_from: draft.price_from!,
      p_price_to: draft.price_to!,
      p_condition: draft.condition!,
      p_audience: draft.audience!,
      p_sizes: draft.sizes,
    });
    if (error || !data) {
      throw new Error(
        userFacingServerMessage(error) ??
          'Feed konnte nicht gespeichert werden. Bitte prüfe deine Angaben.',
      );
    }
    return data;
  }

  async setActive(workspace: string, id: string, active: boolean): Promise<void> {
    const { error } = await this.client.rpc('set_sniper_watchlist_active', {
      p_workspace_id: workspace,
      p_id: id,
      p_active: active,
    });
    if (error) {
      throw new Error(
        userFacingServerMessage(error) ??
          (active ? 'Feed konnte nicht gestartet werden.' : 'Feed konnte nicht gestoppt werden.'),
      );
    }
  }

  async delete(workspace: string, id: string): Promise<void> {
    const { error } = await this.client.rpc('delete_sniper_watchlist', {
      p_workspace_id: workspace,
      p_id: id,
    });
    if (error) throw new Error('Feed konnte nicht gelöscht werden.');
  }
}
