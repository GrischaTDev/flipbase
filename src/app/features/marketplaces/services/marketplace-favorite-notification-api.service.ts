import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  parseFavoriteNotificationFeed,
  parseFavoriteNotificationSettings,
} from '../models/marketplace-favorite-notifications';
import type {
  FavoriteNotificationFeed,
  FavoriteNotificationSettings,
} from '../models/marketplace-favorite-notifications';
import type { AccountScope } from '../models/marketplace.models';
import { MarketplaceResponseError } from '../models/marketplace-response';
export class FavoriteNotificationApiError extends Error {
  constructor(readonly code: 'forbidden' | 'unavailable' | 'conflict' | 'request_failed') {
    super(
      code === 'forbidden'
        ? 'Du hast keinen Zugriff auf diese Favoritenmeldungen.'
        : code === 'unavailable'
          ? 'Favoritenmeldungen sind auf diesem Server noch nicht verfügbar.'
          : code === 'conflict'
            ? 'Diese Einstellung wurde inzwischen geändert. Lade sie erneut.'
            : 'Favoritenmeldungen konnten nicht aktualisiert werden. Versuche es erneut.',
    );
  }
}
function response(result: { data: unknown; error: { code?: string } | null }): unknown {
  if (result.error)
    throw new FavoriteNotificationApiError(
      result.error.code === '42501' || result.error.code === 'PGRST301'
        ? 'forbidden'
        : result.error.code === '42883' || result.error.code === 'PGRST202'
          ? 'unavailable'
          : result.error.code === '40001'
            ? 'conflict'
            : 'request_failed',
    );
  return result.data;
}
@Injectable({ providedIn: 'root' })
export class MarketplaceFavoriteNotificationApiService {
  private readonly client = inject(SupabaseService).client;
  async read(workspaceId: string): Promise<FavoriteNotificationFeed> {
    return parseFavoriteNotificationFeed(
      response(
        await this.client.rpc('marketplace_read_favorite_notifications', {
          p_workspace_id: workspaceId,
        }),
      ),
      workspaceId,
    );
  }
  async mark(workspaceId: string, notificationId: string | null, clear: boolean): Promise<void> {
    const result = response(
      await this.client.rpc('marketplace_mark_favorite_notifications', {
        p_workspace_id: workspaceId,
        ...(notificationId === null ? {} : { p_notification_id: notificationId }),
        p_clear: clear,
      }),
    );
    if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true)
      throw new MarketplaceResponseError();
  }
  async readSettings(scope: AccountScope): Promise<FavoriteNotificationSettings> {
    return parseFavoriteNotificationSettings(
      response(
        await this.client.rpc('marketplace_read_favorite_notification_settings', {
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
        }),
      ),
      scope,
    );
  }
  async setSettings(
    settings: FavoriteNotificationSettings,
    enabled: boolean,
  ): Promise<FavoriteNotificationSettings> {
    return parseFavoriteNotificationSettings(
      response(
        await this.client.rpc('marketplace_set_favorite_notification_settings', {
          p_workspace_id: settings.workspaceId,
          p_connection_id: settings.connectionId,
          p_enabled: enabled,
          p_expected_version: settings.version,
        }),
      ),
      settings,
    );
  }
  listen(workspaceId: string, onChange: () => void, onReconnect: () => void): () => void {
    const channel = this.client
      .channel(`workspace:${workspaceId}:marketplace_notifications`, { config: { private: true } })
      .on('broadcast', { event: 'favorite_notifications_changed' }, onChange)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') onReconnect();
      });
    return () => {
      void this.client.removeChannel(channel).catch(() => undefined);
    };
  }
  authenticate(token: string): void {
    void this.client.realtime.setAuth(token).catch(() => undefined);
  }
}
