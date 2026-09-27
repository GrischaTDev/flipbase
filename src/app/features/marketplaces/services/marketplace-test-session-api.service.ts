import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { AccountScope } from '../models/marketplace.models';
import {
  parseMarketplaceTestSession,
  type MarketplaceTestSession,
} from '../models/marketplace-test-session';

type TestAction = 'ping' | 'interrupt' | 'revoke';

export class MarketplaceTestSessionApiError extends Error {
  constructor(readonly code: 'busy' | 'forbidden' | 'unavailable' | 'request_failed') {
    super(
      code === 'busy'
        ? 'Dieses Konto wird bereits bedient.'
        : code === 'forbidden'
          ? 'Du hast keinen Zugriff auf diese Sitzung.'
          : code === 'unavailable'
            ? 'Der Sitzungstest ist für diese Verbindung nicht verfügbar.'
            : 'Die Sitzung konnte nicht bestätigt werden. Prüfe ihren Zustand, bevor du erneut startest.',
    );
  }
}

function dataOf(result: { data: unknown; error: { code?: string } | null }): unknown {
  if (result.error) {
    const code = result.error.code;
    throw new MarketplaceTestSessionApiError(
      code === '55P03'
        ? 'busy'
        : code === '42501' || code === 'PGRST301'
          ? 'forbidden'
          : code === '22023' || code === 'PGRST202' || code === '42883'
            ? 'unavailable'
            : 'request_failed',
    );
  }
  return result.data;
}

@Injectable({ providedIn: 'root' })
export class MarketplaceTestSessionApiService {
  private readonly client = inject(SupabaseService).client;

  async start(scope: AccountScope): Promise<MarketplaceTestSession> {
    return parseMarketplaceTestSession(
      dataOf(
        await this.client.rpc('marketplace_test_session_start', {
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
        }),
      ),
      scope,
    );
  }

  async status(scope: AccountScope, sessionId: string): Promise<MarketplaceTestSession> {
    return parseMarketplaceTestSession(
      dataOf(
        await this.client.rpc('marketplace_test_session_status', {
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
          p_session_id: sessionId,
        }),
      ),
      scope,
      sessionId,
    );
  }

  async action(
    scope: AccountScope,
    sessionId: string,
    action: TestAction,
  ): Promise<MarketplaceTestSession> {
    return parseMarketplaceTestSession(
      dataOf(
        await this.client.rpc('marketplace_test_session_action', {
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
          p_session_id: sessionId,
          p_action: action,
        }),
      ),
      scope,
      sessionId,
    );
  }
}
