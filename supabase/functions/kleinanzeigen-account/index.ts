import { executeKleinanzeigenListingJob } from './listing-jobs.ts';
import { executeKleinanzeigenTransfer } from './transfer-api.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createKleinanzeigenAccountHandler, KleinanzeigenAccountError } from './handler.ts';
const url = Deno.env.get('SUPABASE_URL') ?? '';
const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const userClient = (bearer: string) =>
  createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: bearer },
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  });
const imageClient = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
});
function rpcFailure(error: { code?: string }): never {
  if (error.code === '42501') throw new KleinanzeigenAccountError('forbidden');
  if (['40001', '55P03', '55000'].includes(error.code ?? ''))
    throw new KleinanzeigenAccountError('conflict');
  if (['22023', '22007', '22P02'].includes(error.code ?? ''))
    throw new KleinanzeigenAccountError('invalid_request');
  throw new Error('transfer_unavailable');
}
Deno.serve(
  createKleinanzeigenAccountHandler({
    async executeJobs(bearer, input) {
      const user = userClient(bearer);
      const { data: identity, error: identityError } = await user.auth.getUser(bearer.slice(7));
      if (identityError || !identity.user || identity.user.is_anonymous)
        throw new KleinanzeigenAccountError('forbidden');
      const userId = identity.user.id;
      const rpc = async (name: string, args: Record<string, unknown>) => {
        const { data, error } = await imageClient.rpc(name, args);
        if (error) rpcFailure(error);
        return data;
      };
      if (input.action === 'listing_latest')
        return await rpc('kleinanzeigen_read_draft_job', {
          p_workspace_id: input.workspaceId,
          p_connection_id: input.connectionId,
          p_draft_id: input.draftId,
          p_user_id: userId,
        });
      return await executeKleinanzeigenListingJob(input, {
        uuid: () => crypto.randomUUID(),
        find: (request) =>
          rpc('kleinanzeigen_find_listing_job', {
            p_workspace_id: request.workspaceId,
            p_connection_id: request.connectionId,
            p_request_id: request.requestId,
            p_user_id: userId,
            p_draft_id: request.draftId,
            p_expected_revision: request.expectedRevision,
          }),
        prepare: (request) =>
          rpc('kleinanzeigen_prepare_listing_job', {
            p_workspace_id: request.workspaceId,
            p_connection_id: request.connectionId,
            p_draft_id: request.draftId,
            p_expected_revision: request.expectedRevision,
            p_user_id: userId,
          }),
        async download(image) {
          const { data, error } = await imageClient.storage
            .from('item-media')
            .download(image.storagePath);
          if (error || !data || data.size < 1 || data.size > 12582912)
            throw new Error('job_photo_unavailable');
          return {
            bytes: new Uint8Array(await data.arrayBuffer()),
            mimeType: data.type.split(';')[0].trim().toLowerCase(),
          };
        },
        async upload(path, bytes, mimeType) {
          const { error } = await imageClient.storage
            .from('item-media')
            .upload(path, bytes, { contentType: mimeType, upsert: false });
          if (error) throw new Error('job_photo_copy_failed');
        },
        enqueue: (request, photos) =>
          rpc('kleinanzeigen_enqueue_listing', {
            p_workspace_id: request.workspaceId,
            p_connection_id: request.connectionId,
            p_draft_id: request.draftId,
            p_expected_revision: request.expectedRevision,
            p_request_id: request.requestId,
            p_user_id: userId,
            p_photos: photos,
          }),
        load: (request) =>
          rpc('kleinanzeigen_read_listing_job', {
            p_workspace_id: request.workspaceId,
            p_connection_id: request.connectionId,
            p_job_id: request.jobId,
            p_user_id: userId,
          }),
        async remove(paths) {
          if (
            input.action !== 'listing_enqueue' ||
            paths.some(
              (path) =>
                !path.startsWith(
                  'kleinanzeigen-jobs/' + input.workspaceId + '/' + input.requestId + '/',
                ),
            )
          )
            throw new Error('invalid_job_cleanup');
          const { error } = await imageClient.storage.from('item-media').remove([...paths]);
          if (error) throw new Error('job_cleanup_failed');
        },
      });
    },
    async executeTransfer(bearer, input) {
      const user = userClient(bearer);
      const { data: identity, error: identityError } = await user.auth.getUser(bearer.slice(7));
      if (identityError || !identity.user || identity.user.is_anonymous)
        throw new KleinanzeigenAccountError('forbidden');
      const userId = identity.user.id;
      return await executeKleinanzeigenTransfer(input, {
        async read() {
          const { data, error } = await user.rpc('kleinanzeigen_read_transfer_source', {
            p_workspace_id: input.workspaceId,
            p_target_connection_id: input.targetConnectionId,
            p_source_connection_id: input.source.connectionId,
            p_external_id: input.source.externalId,
          });
          if (error) rpcFailure(error);
          return data;
        },
        async save(request) {
          const { data, error } =
            request.draftId === null
              ? await user.rpc('kleinanzeigen_create_transfer_draft', {
                  p_workspace_id: request.workspaceId,
                  p_target_connection_id: request.targetConnectionId,
                  p_source_reference: request.source,
                  p_content: request.content,
                  p_request_id: request.requestId,
                })
              : await user.rpc('kleinanzeigen_update_draft', {
                  p_id: request.draftId,
                  p_expected_revision: request.expectedRevision,
                  p_content: request.content,
                });
          if (error) rpcFailure(error);
          return data;
        },
        async upload(path, bytes, mimeType) {
          const { error } = await imageClient.storage
            .from('item-media')
            .upload(path, bytes, { contentType: mimeType, upsert: false });
          if (error) throw new Error('photo_upload_failed');
        },
        async finalize(draft, photos) {
          const { data, error } = await imageClient.rpc('kleinanzeigen_complete_transfer_images', {
            p_workspace_id: input.workspaceId,
            p_listing_id: draft.id,
            p_expected_revision: draft.revision,
            p_user_id: userId,
            p_photos: photos,
          });
          if (error) rpcFailure(error);
          return data;
        },
        async remove(paths) {
          if (paths.some((path) => !path.startsWith('listings/' + input.workspaceId + '/')))
            throw new Error('invalid_cleanup');
          const { error } = await imageClient.storage.from('item-media').remove([...paths]);
          if (error) throw new Error('cleanup_failed');
        },
      });
    },
    async authenticate(bearer) {
      const { data, error } = await userClient(bearer).auth.getUser(bearer.slice(7));
      return !error && !!data.user && !data.user.is_anonymous;
    },
    async execute(bearer, input) {
      // Die Datenbank erhält unverändert die Nutzeridentität; keine pauschalen Service-Role-Schreibrechte.
      let name: string;
      const args: Record<string, unknown> = { p_workspace_id: input.workspaceId };
      switch (input.action) {
        case 'read_accounts':
          name = 'kleinanzeigen_read_accounts';
          break;
        case 'read_publications':
          name = 'kleinanzeigen_read_publications';
          Object.assign(args, {
            p_connection_id: input.connectionId,
            p_limit: input.limit,
            p_state: input.state,
            p_search: input.search,
            p_after_id: input.afterId,
            p_snapshot_at: input.snapshotAt,
          });
          break;
        case 'connect':
          name = 'kleinanzeigen_connect_account';
          Object.assign(args, {
            p_external_account_id: input.externalAccountId,
            p_display_name: input.displayName,
            p_account_type: input.accountType,
            p_installation_id: input.installationId,
            p_token_hash: input.tokenHash,
            p_can_publish: input.canPublish,
          });
          break;
        case 'request_sync':
          name = 'kleinanzeigen_request_sync';
          args['p_connection_id'] = input.connectionId;
          break;
        case 'disconnect':
          name = 'kleinanzeigen_disconnect_account';
          args['p_connection_id'] = input.connectionId;
          break;
      }
      const { data, error } = await userClient(bearer).rpc(name, args);
      if (error) {
        if (error.code === '42501') throw new KleinanzeigenAccountError('forbidden');
        if (['40001', '55P03', '55000'].includes(error.code))
          throw new KleinanzeigenAccountError('conflict');
        if (['22023', '22007', '22P02'].includes(error.code))
          throw new KleinanzeigenAccountError('invalid_request');
        throw new Error('account_unavailable');
      }
      return data;
    },
  }),
);
