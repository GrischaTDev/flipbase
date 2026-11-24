import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { Json } from '../../../core/models/supabase.types';
import type { AccountScope } from '../models/marketplace.models';
import { FavoriteNotificationApiError } from './marketplace-favorite-notification-api.service';
import {
  parseFavoriteMessageSettings,
  parseListingFavoriteDiscount,
  type FavoriteMessageConfig,
  type FavoriteMessageSettings,
  type ListingFavoriteDiscount,
} from '../models/vinted-favorite-messages';

@Injectable({ providedIn: 'root' })
export class VintedFavoriteMessageApiService {
  private readonly client = inject(SupabaseService).client;
  async read(scope: AccountScope): Promise<FavoriteMessageSettings> {
    return this.parse(
      await this.client.rpc('marketplace_read_favorite_messages', {
        p_workspace_id: scope.workspaceId,
        p_connection_id: scope.connectionId,
      }),
      scope,
    );
  }
  async save(
    settings: FavoriteMessageSettings,
    enabled: boolean,
    config: FavoriteMessageConfig,
  ): Promise<FavoriteMessageSettings> {
    return this.parse(
      await this.client.rpc('marketplace_save_favorite_messages', {
        p_workspace_id: settings.workspaceId,
        p_connection_id: settings.connectionId,
        p_enabled: enabled,
        p_config: JSON.parse(JSON.stringify(config)) as Json,
        p_expected_version: settings.version,
      }),
      settings,
    );
  }
  async readListingDiscount(
    scope: AccountScope,
    itemId?: string,
  ): Promise<ListingFavoriteDiscount> {
    const result = await this.client.rpc('marketplace_read_listing_favorite_discount', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
      p_item_id: itemId,
    });
    this.checkError(result.error);
    return parseListingFavoriteDiscount(result.data);
  }

  async saveListingDiscount(
    scope: AccountScope,
    itemId: string,
    discountPercent: number | null,
  ): Promise<void> {
    const result = await this.client.rpc('marketplace_save_listing_favorite_discount', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
      p_item_id: itemId,
      p_discount_percent: discountPercent ?? undefined,
    });
    this.checkError(result.error);
  }

  private parse(
    result: { data: unknown; error: { code?: string } | null },
    scope: AccountScope,
  ): FavoriteMessageSettings {
    this.checkError(result.error);
    return parseFavoriteMessageSettings(result.data, scope);
  }

  private checkError(error: { code?: string } | null): void {
    if (error)
      throw new FavoriteNotificationApiError(
        error.code === '42501'
          ? 'forbidden'
          : error.code === '40001'
            ? 'conflict'
            : error.code === 'PGRST202'
              ? 'unavailable'
              : 'request_failed',
      );
  }
}
