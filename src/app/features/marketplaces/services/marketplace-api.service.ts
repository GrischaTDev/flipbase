import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { AccountScope, MarketplaceConnection } from '../models/marketplace.models';
import {
  parseVintedListingStatistics,
  type VintedListingStatistics,
  type VintedStatisticsPeriod,
} from '../models/vinted-listing-statistics';
import type {
  MarketplaceConnectionList,
  MarketplaceEntryKind,
  MarketplacePage,
  MarketplaceEntry,
  MarketplaceSnapshot,
  MarketplaceAccountPreview,
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
  constructor(readonly code: 'forbidden' | 'unavailable' | 'request_failed' | 'account_limit') {
    super(
      code === 'account_limit'
        ? 'Du kannst höchstens zehn Vinted-Konten pro Workspace hinzufügen.'
        : code === 'forbidden'
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
      code === '54000'
        ? 'account_limit'
        : code === '42501' || code === 'PGRST301'
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

/** Kontodaten und private Aktualisierungsmeldungen mit serverseitig geprüftem Zugriff. */
@Injectable({ providedIn: 'root' })
export class MarketplaceApiService {
  private readonly client = inject(SupabaseService).client;

  listenAccountImports(
    scope: AccountScope,
    onImport: (lastSyncedAt: string) => void,
    onReconnect: () => void,
  ): () => void {
    const channel = this.client
      .channel(`workspace:${scope.workspaceId}:marketplace_account:${scope.connectionId}`, {
        config: { private: true },
      })
      .on('broadcast', { event: 'account_imported' }, ({ payload }: { payload: unknown }) => {
        if (!payload || typeof payload !== 'object') return;
        const data = payload as Record<string, unknown>;
        if (
          data['workspaceId'] === scope.workspaceId &&
          data['connectionId'] === scope.connectionId &&
          typeof data['lastSyncedAt'] === 'string' &&
          Number.isFinite(Date.parse(data['lastSyncedAt']))
        )
          onImport(data['lastSyncedAt']);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') onReconnect();
      });
    return () => {
      void this.client.removeChannel(channel).catch(() => undefined);
    };
  }

  authenticateImports(token: string): void {
    void this.client.realtime.setAuth(token).catch(() => undefined);
  }

  async readListingStatistics(
    scope: AccountScope,
    period: VintedStatisticsPeriod,
  ): Promise<VintedListingStatistics> {
    return parseVintedListingStatistics(
      dataOf(
        await this.client.rpc('marketplace_read_listing_metric_changes', {
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
          p_period_minutes: period,
        }),
      ),
      scope,
      period,
    );
  }

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
  async reorderConnections(workspaceId: string, connectionIds: readonly string[]): Promise<void> {
    confirmWrite(
      await this.client.rpc('marketplace_reorder_connections', {
        p_workspace_id: workspaceId,
        p_connection_ids: [...connectionIds],
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
  async markConversationRead(
    scope: AccountScope,
    conversationId: string,
    readVersion: string,
    observedAt: string,
  ): Promise<boolean> {
    const result = dataOf(
      await this.client.rpc('marketplace_mark_conversation_read', {
        p_workspace_id: scope.workspaceId,
        p_connection_id: scope.connectionId,
        p_conversation_id: conversationId,
        p_read_version: readVersion,
        p_observed_at: observedAt,
      }),
    );
    if (
      !result ||
      typeof result !== 'object' ||
      !('ok' in result) ||
      result.ok !== true ||
      !('marked' in result) ||
      typeof result.marked !== 'boolean'
    )
      throw new MarketplaceResponseError();
    return result.marked;
  }
  async readAccountPreview(scope: AccountScope): Promise<MarketplaceAccountPreview> {
    // Nur Profil und Anzahlen lesen, keine Nachrichten oder vollständigen Inseratlisten.
    const query = () =>
      this.client
        .from('marketplace_account_entries')
        .select('body', { count: 'exact', head: true })
        .eq('workspace_id', scope.workspaceId)
        .eq('connection_id', scope.connectionId);
    const [profile, publications, sales] = await Promise.all([
      this.client
        .from('marketplace_account_entries')
        .select('body')
        .eq('workspace_id', scope.workspaceId)
        .eq('connection_id', scope.connectionId)
        .eq('kind', 'profile')
        .maybeSingle(),
      query().eq('kind', 'publication'),
      query().eq('kind', 'sale'),
    ]);
    if (
      profile.error ||
      publications.error ||
      sales.error ||
      publications.count === null ||
      sales.count === null
    )
      throw new MarketplaceApiError('request_failed');
    const body = profile.data?.body;
    if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body)))
      throw new MarketplaceResponseError();
    const emptyPage = { items: [], total: 0, nextCursor: null };
    const parsed = parseMarketplaceSnapshot(
      {
        ...scope,
        profile: body ? { ...body, ...scope } : null,
        publications: emptyPage,
        conversations: emptyPage,
        sales: emptyPage,
        activity: emptyPage,
      },
      scope,
    );
    return {
      ...scope,
      profile: parsed.profile,
      publicationCount: publications.count,
      saleCount: sales.count,
    };
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
  async readPublication(scope: AccountScope, entryId: string): Promise<MarketplaceEntry | null> {
    const { data, error } = await this.client
      .from('marketplace_account_entries')
      .select('id,body')
      .eq('workspace_id', scope.workspaceId)
      .eq('connection_id', scope.connectionId)
      .eq('kind', 'publication')
      .eq('id', entryId)
      .maybeSingle();
    if (error) throw new MarketplaceApiError('request_failed');
    if (!data) return null;
    if (!data.body || typeof data.body !== 'object' || Array.isArray(data.body))
      throw new MarketplaceResponseError();
    return parseMarketplacePage(
      { items: [{ ...data.body, id: data.id, ...scope }], total: 1, nextCursor: null },
      scope,
    ).items[0];
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
