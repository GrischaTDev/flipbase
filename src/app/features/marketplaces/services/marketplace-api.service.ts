import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { AccountScope, MarketplaceConnection } from '../models/marketplace.models';
import type {
  MarketplaceConnectionList,
  MarketplaceEntryKind,
  MarketplacePage,
  MarketplaceEntry,
  MarketplaceSnapshot,
} from '../models/marketplace-read.models';
import {
  MarketplaceResponseError,
  parseMarketplaceConnections,
  parseMarketplacePage,
  parseMarketplaceSnapshot,
} from '../models/marketplace-response';

interface RpcResult {
  data: unknown;
  error: { code?: string } | null;
}
export class MarketplaceApiError extends Error {
  constructor(readonly code: 'forbidden' | 'unavailable' | 'request_failed') {
    super(
      code === 'forbidden'
        ? 'Du hast keinen Verwaltungszugriff auf diese Marktplatzkonten.'
        : code === 'unavailable'
          ? 'Die Marktplatzverwaltung ist auf diesem Server noch nicht verfügbar.'
          : 'Die Anfrage konnte nicht bestätigt werden. Lade die Ansicht erneut, bevor du die Aktion wiederholst.',
    );
  }
}
function dataOf(result: RpcResult): unknown {
  if (result.error) {
    const code = result.error.code;
    throw new MarketplaceApiError(
      code === '42501' || code === 'PGRST301'
        ? 'forbidden'
        : code === 'PGRST202' || code === '42883'
          ? 'unavailable'
          : 'request_failed',
    );
  }
  return result.data;
}
function confirmWrite(result: RpcResult): void {
  const data = dataOf(result);
  if (!data || typeof data !== 'object' || !('ok' in data) || data.ok !== true)
    throw new MarketplaceResponseError();
}

/** Ausschließlich die vorhandenen, serverseitig autorisierten Metadaten-RPCs. */
@Injectable({ providedIn: 'root' })
export class MarketplaceApiService {
  private readonly client = inject(SupabaseService).client;

  async canManage(workspaceId: string): Promise<boolean> {
    return (
      dataOf(await this.client.rpc('marketplace_can_manage', { p_workspace_id: workspaceId })) ===
      true
    );
  }
  async listConnections(workspaceId: string): Promise<MarketplaceConnectionList> {
    return parseMarketplaceConnections(
      dataOf(
        await this.client.rpc('marketplace_list_connections', { p_workspace_id: workspaceId }),
      ),
      workspaceId,
    );
  }
  async createConnection(workspaceId: string, displayName: string): Promise<MarketplaceConnection> {
    const data = dataOf(
      await this.client.rpc('marketplace_create_connection', {
        p_workspace_id: workspaceId,
        p_display_name: displayName,
      }),
    );
    return parseMarketplaceConnections({ canManage: true, connections: [data] }, workspaceId)
      .connections[0];
  }
  async renameConnection(scope: AccountScope, displayName: string): Promise<void> {
    confirmWrite(
      await this.client.rpc('marketplace_rename_connection', {
        p_workspace_id: scope.workspaceId,
        p_connection_id: scope.connectionId,
        p_display_name: displayName,
      }),
    );
  }
  async setPaused(scope: AccountScope, paused: boolean): Promise<void> {
    confirmWrite(
      await this.client.rpc('marketplace_set_paused', {
        p_workspace_id: scope.workspaceId,
        p_connection_id: scope.connectionId,
        p_paused: paused,
      }),
    );
  }
  async readSnapshot(scope: AccountScope): Promise<MarketplaceSnapshot> {
    return parseMarketplaceSnapshot(
      dataOf(
        await this.client.rpc('marketplace_read_snapshot', {
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
        }),
      ),
      scope,
    );
  }
  async readPage(
    scope: AccountScope,
    kind: MarketplaceEntryKind,
    cursor: string | null = null,
    conversationId: string | null = null,
  ): Promise<MarketplacePage<MarketplaceEntry>> {
    return parseMarketplacePage(
      dataOf(
        await this.client.rpc('marketplace_read_page', {
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
          p_kind: kind,
          p_cursor: cursor ?? undefined,
          p_parent_id: conversationId ?? undefined,
        }),
      ),
      scope,
      kind === 'message' ? (conversationId ?? undefined) : undefined,
    );
  }
}
