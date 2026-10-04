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
        p_batch: input.batch,
      });
      if (error) throw mapStoreError(error.code);
      return data;
    },
    async ingest(tokenHash, input) {
      const { data, error } = await service.rpc('marketplace_ingest_local_extension', {
        p_workspace_id: input.workspaceId,
        p_connection_id: input.connectionId,
        p_token_hash: tokenHash,
        p_snapshot: input.action === 'import' ? input.snapshot : null,
      });
      if (error && !['42501', '22023', '23505'].includes(error.code))
        throw new Error('Database unavailable');
      if (error)
        throw new LocalExtensionStoreError(
          error.code === '42501'
            ? 'access'
            : error.code === '22023'
              ? 'invalid'
              : error.code === '23505'
                ? 'conflict'
                : 'invalid',
        );
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
