import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { parseMessageNotificationFeed } from '../models/marketplace-message-notifications';
import type { MessageNotificationFeed } from '../models/marketplace-message-notifications';
import { MarketplaceResponseError } from '../models/marketplace-response';
export class MessageNotificationApiError extends Error {
  constructor(readonly code: 'forbidden' | 'unavailable' | 'request_failed') {
    super(
      code === 'forbidden'
        ? 'Du hast keinen Zugriff auf diese Nachrichtenmeldungen.'
        : code === 'unavailable'
          ? 'Nachrichtenmeldungen sind auf diesem Server noch nicht verfügbar.'
          : 'Nachrichtenmeldungen konnten nicht aktualisiert werden. Versuche es erneut.',
    );
  }
}
function response(result: { data: unknown; error: { code?: string } | null }): unknown {
  if (result.error)
    throw new MessageNotificationApiError(
      result.error.code === '42501' || result.error.code === 'PGRST301'
        ? 'forbidden'
        : result.error.code === '42883' || result.error.code === 'PGRST202'
          ? 'unavailable'
          : 'request_failed',
    );
  return result.data;
}
@Injectable({ providedIn: 'root' })
export class MarketplaceMessageNotificationApiService {
  private readonly client = inject(SupabaseService).client;
  async read(workspaceId: string): Promise<MessageNotificationFeed> {
    return parseMessageNotificationFeed(
      response(
        await this.client.rpc('marketplace_read_message_notifications', {
          p_workspace_id: workspaceId,
        }),
      ),
      workspaceId,
    );
  }
  async mark(workspaceId: string, notificationId: string | null, clear: boolean): Promise<void> {
    const result = response(
      await this.client.rpc('marketplace_mark_message_notifications', {
        p_workspace_id: workspaceId,
        ...(notificationId === null ? {} : { p_notification_id: notificationId }),
        p_clear: clear,
      }),
    );
    if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true)
      throw new MarketplaceResponseError();
  }
  listen(workspaceId: string, onChange: () => void, onReconnect: () => void): () => void {
    const channel = this.client
      .channel(`workspace:${workspaceId}:marketplace_message_notifications`, {
        config: { private: true },
      })
      .on('broadcast', { event: 'message_notifications_changed' }, onChange)
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
