import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { Json } from '../../../core/models/supabase.types';
import type { AccountScope } from '../models/marketplace.models';
import {
  parseNegotiationReceipt,
  parseNegotiationSettings,
  type NegotiationAction,
  type NegotiationSettings,
  type VintedNegotiationConfig,
} from '../models/vinted-negotiation';

export class NegotiationApiError extends Error {
  constructor(readonly code: string) {
    super(
      code === '40001'
        ? 'Die Daten wurden inzwischen geändert. Aktualisiere die Ansicht und prüfe Deine Einstellungen.'
        : code === '42501'
          ? 'Prüfe die Kontoverbindung und die bestehende Versandfreigabe in der Kontoverwaltung.'
          : code === '22023'
            ? 'Prüfe Deine Eingaben. Dieses Angebot ist möglicherweise nicht mehr verfügbar.'
            : 'Die Antwort konnte nicht bestätigt werden. Aktualisiere die Ansicht und versuche dieselbe Aktion erneut.',
    );
  }
}
@Injectable({ providedIn: 'root' })
export class VintedNegotiationApiService {
  private readonly client = inject(SupabaseService).client;
  async read(scope: AccountScope) {
    return parseNegotiationSettings(
      this.unwrap(
        await this.client.rpc('marketplace_read_negotiation', {
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
        }),
      ),
      scope,
    );
  }
  async save(settings: NegotiationSettings, enabled: boolean, config: VintedNegotiationConfig) {
    return parseNegotiationSettings(
      this.unwrap(
        await this.client.rpc('marketplace_save_negotiation', {
          p_workspace_id: settings.workspaceId,
          p_connection_id: settings.connectionId,
          p_expected_version: settings.version,
          p_enabled: enabled,
          p_config: JSON.parse(JSON.stringify(config)) as Json,
        }),
      ),
      settings,
    );
  }
  async enqueue(
    scope: AccountScope,
    conversationId: string,
    messageId: string,
    requestId: string,
    action: NegotiationAction,
    priceCents: number | null,
  ) {
    return parseNegotiationReceipt(
      this.unwrap(
        await this.client.rpc('marketplace_enqueue_negotiation', {
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
          p_conversation_id: conversationId,
          p_message_id: messageId,
          p_request_id: requestId,
          p_action: action,
          ...(priceCents === null ? {} : { p_price_cents: priceCents }),
        }),
      ),
    );
  }
  private unwrap(result: { data: unknown; error: { code?: string } | null }) {
    if (result.error) throw new NegotiationApiError(result.error.code ?? 'request_failed');
    return result.data;
  }
}
