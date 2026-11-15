import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { AccountScope } from '../models/marketplace.models';
import {
  parseVintedAccountAction,
  type VintedAccountAction,
} from '../models/vinted-account-action';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Ungültige Aktionsantwort.');
  return value as Record<string, unknown>;
}
@Injectable({ providedIn: 'root' })
export class VintedAccountActionApiService {
  private readonly client = inject(SupabaseService).client;
  async list(scope: AccountScope): Promise<readonly VintedAccountAction[]> {
    const { data, error } = await this.client.rpc('marketplace_account_actions_read', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
    });
    if (error) throw error;
    const actions = record(data)['actions'];
    if (!Array.isArray(actions)) throw new Error('Ungültige Aktionsübersicht.');
    return actions.map((action: unknown) => parseVintedAccountAction(action, scope));
  }
  async cancel(action: VintedAccountAction): Promise<VintedAccountAction> {
    const { data, error } = await this.client.rpc('marketplace_account_action_cancel', {
      p_workspace_id: action.workspaceId,
      p_connection_id: action.connectionId,
      p_action_id: action.id,
    });
    if (error) throw error;
    return parseVintedAccountAction(record(data)['action'], action);
  }
  async reconcile(action: VintedAccountAction, requestId: string): Promise<VintedAccountAction> {
    const { data, error } = await this.client.rpc('marketplace_account_action_reconcile', {
      p_workspace_id: action.workspaceId,
      p_connection_id: action.connectionId,
      p_action_id: action.id,
      p_request_id: requestId,
    });
    if (error) throw error;
    return parseVintedAccountAction(record(data)['action'], action);
  }
  authenticate(token: string): void {
    void this.client.realtime.setAuth(token).catch(() => undefined);
  }
  listen(scope: AccountScope, changed: () => void): () => void {
    let active = true;
    const channel = this.client
      .channel(`workspace:${scope.workspaceId}:marketplace_account:${scope.connectionId}`, {
        config: { private: true },
      })
      .on('broadcast', { event: 'account_actions_changed' }, (event: { payload: unknown }) => {
        if (
          !active ||
          !event.payload ||
          typeof event.payload !== 'object' ||
          Array.isArray(event.payload)
        )
          return;
        const hint = record(event.payload);
        if (
          hint['workspaceId'] === scope.workspaceId &&
          hint['connectionId'] === scope.connectionId
        )
          changed();
      })
      .subscribe((status) => {
        if (active && status === 'SUBSCRIBED') changed();
      });
    return () => {
      active = false;
      void this.client.removeChannel(channel).catch(() => undefined);
    };
  }
}
