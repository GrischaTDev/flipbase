import { loadKleinanzeigenListingPhoto } from './listing-photo.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import {
  createKleinanzeigenExtensionHandler,
  KleinanzeigenExtensionStoreError,
} from './handler.ts';
const service = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  },
);
async function executionRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await service.rpc(name, args);
  if (error) {
    if (error.code === '42501') throw new KleinanzeigenExtensionStoreError('access');
    if (['40001', '55000', '55P03', '23505'].includes(error.code))
      throw new KleinanzeigenExtensionStoreError('conflict');
    if (['22023', '22007', '22008', '22P02'].includes(error.code))
      throw new KleinanzeigenExtensionStoreError('invalid');
    throw new Error('listing_unavailable');
  }
  return data;
}
Deno.serve(
  createKleinanzeigenExtensionHandler({
    async job(hash, input) {
      const args: Record<string, unknown> = {
        p_workspace_id: input.workspaceId,
        p_connection_id: input.connectionId,
        p_token_hash: hash,
        p_generation: input.generation,
      };
      if (input.action === 'quota_observation')
        return await executionRpc('kleinanzeigen_store_quota_observation', {
          ...args,
          p_quota: input.quota,
          p_excluded_job_id: input.jobId,
        });
      args['p_job_id'] = input.jobId;
      args['p_claim_token'] = input.claimToken;
      if (input.action === 'job_begin') {
        args['p_expected_version'] = input.expectedVersion;
        args['p_fee'] = input.fee;
      }
      if (input.action === 'job_finish') args['p_result'] = input.result;
      const name =
        input.action === 'job_claim'
          ? 'kleinanzeigen_claim_listing'
          : input.action === 'job_check'
            ? 'kleinanzeigen_check_listing'
            : input.action === 'job_begin'
              ? 'kleinanzeigen_begin_listing'
              : 'kleinanzeigen_finish_listing';
      return await executionRpc(name, args);
    },
    async photo(hash, input) {
      return await loadKleinanzeigenListingPhoto(input, {
        authorize: () =>
          executionRpc('kleinanzeigen_listing_job_photo', {
            p_workspace_id: input.workspaceId,
            p_connection_id: input.connectionId,
            p_token_hash: hash,
            p_generation: input.generation,
            p_job_id: input.jobId,
            p_claim_token: input.claimToken,
            p_image_id: input.imageId,
          }),
        async download(image) {
          const { data, error } = await service.storage
            .from('item-media')
            .download(image.storagePath);
          if (error || !data || data.size < 1 || data.size > 12582912)
            throw new Error('job_photo_unavailable');
          return {
            bytes: new Uint8Array(await data.arrayBuffer()),
            mimeType: data.type.split(';')[0].trim().toLowerCase(),
          };
        },
      });
    },
    async formSchema(hash, input) {
      const { data, error } = await service.rpc('kleinanzeigen_store_form_schema', {
        p_workspace_id: input.workspaceId,
        p_connection_id: input.connectionId,
        p_token_hash: hash,
        p_generation: input.generation,
        p_external_account_id: input.externalAccountId,
        p_schema: input.schema,
        p_observed_at: input.observedAt,
      });
      if (error)
        throw new KleinanzeigenExtensionStoreError(
          error.code === '42501' ? 'access' : error.code === '40001' ? 'conflict' : 'invalid',
        );
      return data;
    },
    async sync(hash, input) {
      const args: Record<string, unknown> = {
        p_workspace_id: input.workspaceId,
        p_connection_id: input.connectionId,
        p_token_hash: hash,
        p_generation: input.generation,
        p_run_id: input.runId,
      };
      let name: string;
      if (input.action === 'sync_claim') name = 'kleinanzeigen_claim_sync';
      else {
        args['p_claim_token'] = input.claimToken;
        args['p_external_account_id'] = input.externalAccountId;
        if (input.action === 'sync_page') {
          name = 'kleinanzeigen_store_sync_page';
          args['p_cursor'] = input.pageCursor;
          args['p_next_cursor'] = input.nextCursor;
          args['p_items'] = input.items;
        } else if (input.action === 'sync_finish') {
          name = 'kleinanzeigen_finish_sync';
          args['p_quota'] = input.quota;
        } else {
          name = 'kleinanzeigen_fail_sync';
          args['p_error_code'] = input.errorCode;
        }
      }
      const { data, error } = await service.rpc(name, args);
      if (error) {
        if (error.code === '42501') throw new KleinanzeigenExtensionStoreError('access');
        if (['40001', '55000', '55P03', '23505'].includes(error.code))
          throw new KleinanzeigenExtensionStoreError('conflict');
        if (['22023', '22007', '22008', '22P02'].includes(error.code))
          throw new KleinanzeigenExtensionStoreError('invalid');
        throw new Error('sync_unavailable');
      }
      return data;
    },
    async session(hash, input) {
      const { data, error } = await service.rpc('kleinanzeigen_extension_session', {
        p_workspace_id: input.workspaceId,
        p_connection_id: input.connectionId,
        p_token_hash: hash,
        p_generation: input.generation,
      });
      if (error)
        throw new KleinanzeigenExtensionStoreError(
          error.code === '42501' ? 'access' : error.code === '40001' ? 'conflict' : 'invalid',
        );
      return data;
    },
  }),
);
