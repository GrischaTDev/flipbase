import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { Json } from '../../../core/models/supabase.types';
import type { AccountScope } from '../models/marketplace.models';
import type { LocalMessageAttachment } from '../models/marketplace-read.models';
import {
  parseLocalMessageEnqueue,
  parseLocalMessageList,
} from '../models/vinted-messaging-response';
import { MarketplaceApiError } from './marketplace-api.service';

function resultOf(response: { data: unknown; error: { code?: string } | null }) {
  if (response.error)
    throw new MarketplaceApiError(
      response.error.code === '42501'
        ? 'forbidden'
        : response.error.code === 'PGRST202'
          ? 'unavailable'
          : 'request_failed',
    );
  return response.data;
}
@Injectable({ providedIn: 'root' })
export class VintedMessagingApiService {
  private readonly client = inject(SupabaseService).client;
  async read(scope: AccountScope, conversationId: string) {
    return parseLocalMessageList(
      resultOf(
        await this.client.rpc('marketplace_read_local_messages', {
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
          p_conversation_id: conversationId,
        }),
      ),
      scope,
      conversationId,
    );
  }
  async enqueue(
    scope: AccountScope,
    conversationId: string,
    requestId: string,
    text: string,
    attachment: LocalMessageAttachment | null,
  ) {
    return parseLocalMessageEnqueue(
      resultOf(
        await this.client.rpc('marketplace_enqueue_local_message', {
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
          p_conversation_id: conversationId,
          p_request_id: requestId,
          p_text: text,
          p_attachment: attachment ? ({ ...attachment } as Json) : null,
        }),
      ),
      scope,
      conversationId,
      requestId,
    );
  }
  async retry(
    scope: AccountScope,
    conversationId: string,
    messageId: string,
    confirmedUnknown: boolean,
  ) {
    return parseLocalMessageEnqueue(
      resultOf(
        await this.client.rpc('marketplace_retry_local_message', {
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
          p_conversation_id: conversationId,
          p_message_id: messageId,
          p_confirmed_unknown: confirmedUnknown,
        }),
      ),
      scope,
      conversationId,
      messageId,
    );
  }
}
