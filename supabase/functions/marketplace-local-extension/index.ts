import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createLocalExtensionHandler, LocalExtensionStoreError } from './handler.ts';

const service = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
    },
  },
);
Deno.serve(
  createLocalExtensionHandler({
    async favorites(tokenHash, input) {
      const scope = {
        p_workspace_id: input.workspaceId,
        p_connection_id: input.connectionId,
        p_token_hash: tokenHash,
      };
      const result =
        input.action === 'favorites_state'
          ? await service.rpc('marketplace_local_favorites_state', scope)
          : input.action === 'favorites_import'
            ? await service.rpc('marketplace_import_local_favorites', {
                ...scope,
                p_events: input.events,
              })
            : input.action === 'favorite_claim'
              ? await service.rpc('marketplace_local_favorite_claim', {
                  ...scope,
                  p_offer_supported: input.offerSupported ?? false,
                })
              : input.action === 'favorite_start'
                ? await service.rpc('marketplace_local_favorite_start', {
                    ...scope,
                    p_event_id: input.id,
                    p_claim_token: input.claimToken,
                  })
                : input.action === 'favorite_finish'
                  ? await service.rpc('marketplace_local_favorite_finish', {
                      ...scope,
                      p_event_id: input.id,
                      p_claim_token: input.claimToken,
                      p_outcome: input.outcome,
                      p_external_message_id: input.externalMessageId ?? null,
                      p_error_code: input.errorCode ?? null,
                    })
                  : input.action === 'favorite_message_sent'
                    ? await service.rpc('marketplace_local_favorite_message_sent', {
                        ...scope,
                        p_event_id: input.id,
                        p_claim_token: input.claimToken,
                        p_external_message_id: input.externalMessageId,
                        p_conversation_id: input.conversationId,
                        p_transaction_id: input.transactionId ?? null,
                      })
                    : input.action === 'favorite_offer_start'
                      ? await service.rpc('marketplace_local_favorite_offer_start', {
                          ...scope,
                          p_event_id: input.id,
                          p_claim_token: input.claimToken,
                          p_original_price_cents: input.originalPriceCents,
                          p_offer_price_cents: input.offerPriceCents,
                        })
                      : input.action === 'favorite_offer_finish'
                        ? await service.rpc('marketplace_local_favorite_offer_finish', {
                            ...scope,
                            p_event_id: input.id,
                            p_claim_token: input.claimToken,
                            p_outcome: input.outcome,
                            p_external_offer_id: input.externalOfferId ?? null,
                            p_error_code: input.errorCode ?? null,
                          })
                        : null;
      if (!result) throw new LocalExtensionStoreError('invalid');
      if (result.error) throw mapStoreError(result.error.code);
      return result.data;
    },
    async inboxState(tokenHash, input) {
      if (input.action !== 'inbox_state') throw new LocalExtensionStoreError('invalid');
      const { data, error } = await service.rpc('marketplace_local_inbox_state', {
        p_workspace_id: input.workspaceId,
        p_connection_id: input.connectionId,
        p_token_hash: tokenHash,
      });
      if (error) throw mapStoreError(error.code);
      return data;
    },
    async inboxImport(tokenHash, input) {
      if (input.action !== 'inbox_import') throw new LocalExtensionStoreError('invalid');
      const { data, error } = await service.rpc('marketplace_import_local_inbox', {
        p_workspace_id: input.workspaceId,
        p_connection_id: input.connectionId,
        p_token_hash: tokenHash,
        p_batch: { ...input.batch, mode: input.mode ?? 'backfill' },
      });
      if (error) throw mapStoreError(error.code);
      return data;
    },
    async inboxDetailState(tokenHash, input) {
      if (input.action !== 'inbox_detail_state') throw new LocalExtensionStoreError('invalid');
      const { data, error } = await service.rpc('marketplace_local_inbox_detail_state', {
        p_workspace_id: input.workspaceId,
        p_connection_id: input.connectionId,
        p_token_hash: tokenHash,
        p_conversation_id: input.conversationId,
      });
      if (error) throw mapStoreError(error.code);
      return data;
    },
    async inboxDetailImport(tokenHash, input) {
      if (input.action !== 'inbox_detail_import') throw new LocalExtensionStoreError('invalid');
      const { data, error } = await service.rpc('marketplace_local_inbox_detail_import', {
        p_workspace_id: input.workspaceId,
        p_connection_id: input.connectionId,
        p_token_hash: tokenHash,
        p_conversation_id: input.conversationId,
        p_batch: input.batch,
      });
      if (error) throw mapStoreError(error.code);
      return data;
    },
    async messageClaim(tokenHash, input) {
      if (input.action !== 'message_claim') throw new LocalExtensionStoreError('invalid');
      const { data, error } = await service.rpc('marketplace_local_message_claim', {
        p_workspace_id: input.workspaceId,
        p_connection_id: input.connectionId,
        p_token_hash: tokenHash,
      });
      if (error) throw mapStoreError(error.code);
      return data;
    },
    async messageStart(tokenHash, input) {
      if (input.action !== 'message_start') throw new LocalExtensionStoreError('invalid');
      const { data, error } = await service.rpc('marketplace_local_message_start', {
        p_workspace_id: input.workspaceId,
        p_connection_id: input.connectionId,
        p_token_hash: tokenHash,
        p_message_id: input.id,
        p_claim_token: input.claimToken,
      });
      if (error) throw mapStoreError(error.code);
      return data;
    },
    async messageFinish(tokenHash, input) {
      if (input.action !== 'message_finish') throw new LocalExtensionStoreError('invalid');
      const { data, error } = await service.rpc('marketplace_local_message_finish', {
        p_workspace_id: input.workspaceId,
        p_connection_id: input.connectionId,
        p_token_hash: tokenHash,
        p_message_id: input.id,
        p_claim_token: input.claimToken,
        p_outcome: input.outcome,
        p_external_message_id: input.externalMessageId ?? null,
        p_error_code: input.errorCode ?? null,
      });
      if (error) throw mapStoreError(error.code);
      return data;
    },
    async ingest(tokenHash, input) {
      if (input.action !== 'heartbeat' && input.action !== 'import')
        throw new LocalExtensionStoreError('invalid');
      const { data, error } = await service.rpc('marketplace_ingest_local_extension', {
        p_workspace_id: input.workspaceId,
        p_connection_id: input.connectionId,
        p_token_hash: tokenHash,
        p_snapshot: input.action === 'import' ? input.snapshot : null,
      });
      if (error) throw mapStoreError(error.code);
      return data;
    },
  }),
);
function mapStoreError(code: string) {
  if (code === '42501') return new LocalExtensionStoreError('access');
  if (code === '22023') return new LocalExtensionStoreError('invalid');
  if (code === '23505' || code === '55P03') return new LocalExtensionStoreError('conflict');
  return new Error('Database unavailable');
}
