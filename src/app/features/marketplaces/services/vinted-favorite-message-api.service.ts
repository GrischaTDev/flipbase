import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { Json } from '../../../core/models/supabase.types';
import type { AccountScope } from '../models/marketplace.models';
import { FavoriteNotificationApiError } from './marketplace-favorite-notification-api.service';
import {
  parseFavoriteMessageSettings,
  type FavoriteMessageConfig,
  type FavoriteMessageSettings,
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
  private parse(
    result: { data: unknown; error: { code?: string } | null },
    scope: AccountScope,
  ): FavoriteMessageSettings {
    if (result.error)
      throw new FavoriteNotificationApiError(
        result.error.code === '42501'
          ? 'forbidden'
          : result.error.code === '40001'
            ? 'conflict'
            : result.error.code === 'PGRST202'
              ? 'unavailable'
              : 'request_failed',
      );
    return parseFavoriteMessageSettings(result.data, scope);
  }
}
