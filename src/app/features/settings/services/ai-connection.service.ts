import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { environment } from '../../../../environments/environment';

export interface AiConnection {
  readonly id: string;
  readonly client_id: string;
  readonly client_name: string;
  readonly access_mode: 'read' | 'edit';
  readonly connected: boolean;
  readonly revoked_at: string | null;
  readonly accounts: readonly AiConnectionAccount[];
}
export interface AiConnectionAccount {
  readonly id: string;
  readonly display_name: string;
}

@Injectable({ providedIn: 'root' })
export class AiConnectionService {
  private readonly supabase = inject(SupabaseService);
  readonly endpoint = `${environment.supabaseUrl.replace(/\/$/, '')}/functions/v1/ai-connection`;

  async list(workspaceId: string): Promise<readonly AiConnection[]> {
    const { data, error } = await this.supabase.client.rpc('ai_connection_settings', {
      p_workspace_id: workspaceId,
    });
    if (error) throw error;
    return data as unknown as readonly AiConnection[];
  }

  async accounts(workspaceId: string): Promise<readonly AiConnectionAccount[]> {
    const { data, error } = await this.supabase.client
      .from('marketplace_connections')
      .select('id, display_name')
      .eq('workspace_id', workspaceId)
      .eq('marketplace', 'vinted')
      .order('display_name');
    if (error) throw error;
    return data;
  }

  async approve(
    authorizationId: string,
    workspaceId: string,
    mode: 'read' | 'edit',
    accounts: readonly string[],
  ): Promise<void> {
    const { error } = await this.supabase.client.rpc('ai_connection_grant', {
      p_authorization_id: authorizationId,
      p_workspace_id: workspaceId,
      p_access_mode: mode,
      p_connection_ids: [...accounts],
    });
    if (error) throw error;
    const approved = await this.supabase.client.auth.oauth.approveAuthorization(authorizationId, {
      skipBrowserRedirect: true,
    });
    if (approved.error) throw approved.error;
    window.location.assign(approved.data.redirect_url);
  }

  async revoke(connection: AiConnection): Promise<void> {
    const { error } = await this.supabase.client.rpc('ai_connection_revoke', {
      p_id: connection.id,
    });
    if (error) throw error;
    const revoked = await this.supabase.client.auth.oauth.revokeGrant({
      clientId: connection.client_id,
    });
    if (revoked.error) throw revoked.error;
  }

  async update(
    connection: AiConnection,
    workspaceId: string,
    mode: 'read' | 'edit',
    accounts: readonly string[],
  ): Promise<void> {
    const { error } = await this.supabase.client.rpc('ai_connection_update', {
      p_id: connection.id,
      p_workspace_id: workspaceId,
      p_access_mode: mode,
      p_connection_ids: [...accounts],
      p_expected_access_mode: connection.access_mode,
      p_expected_connection_ids: connection.accounts.map((account) => account.id),
    });
    if (error) throw error;
  }

  authorizationDetails(authorizationId: string) {
    return this.supabase.client.auth.oauth.getAuthorizationDetails(authorizationId);
  }

  async deny(authorizationId: string): Promise<void> {
    const denied = await this.supabase.client.auth.oauth.denyAuthorization(authorizationId, {
      skipBrowserRedirect: true,
    });
    if (denied.error) throw denied.error;
    window.location.assign(denied.data.redirect_url);
  }
}
