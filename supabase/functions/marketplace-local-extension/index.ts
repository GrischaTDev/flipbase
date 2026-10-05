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
