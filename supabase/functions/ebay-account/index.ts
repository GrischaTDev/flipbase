import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { readEbayConfig } from '../_shared/ebay-config.ts';
import { createEbayAccountHandler } from './handler.ts';
import type { StoredEbayConnection } from './handler.ts';
import type { EbayOrderImportStore } from './order-import.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
  },
});
const userClient = (bearer: string) =>
  createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: bearer },
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
    },
  });
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await service.rpc(name, args);
  if (error) throw new Error('Database operation failed');
  return data as T;
}
const store: EbayOrderImportStore = {
  async importAvailable() {
    const results = await Promise.all([
      service
        .from('ebay_order_snapshots')
        .select('id,booking_ready,authorization_version')
        .limit(0),
      service.from('ebay_order_bookings').select('id,source_key,status').limit(0),
      service.from('ebay_article_mappings').select('id,variation_id').limit(0),
    ]);
    return results.every((result) => !result.error);
  },
  async snapshot(userId, scope, snapshotId) {
    const { data, error } = await service
      .from('ebay_order_snapshots')
      .select(
        'id,workspace_id,connection_id,user_id,authorization_version,environment,external_account_id,source_key,review_hash,source,expires_at,booking_ready',
      )
      .eq('id', snapshotId)
      .eq('user_id', userId)
      .eq('workspace_id', scope.workspaceId)
      .eq('connection_id', scope.connectionId)
      .maybeSingle();
    if (error) throw new Error('Database operation failed');
    return data;
  },
  getBooking: (userId, connectionId, sourceKey) =>
    rpc('ebay_get_order_booking', {
      p_user_id: userId,
      p_connection_id: connectionId,
      p_source_key: sourceKey,
    }),
  storeSnapshot: (connection, operationId, sourceKey, reviewHash, source, bookingReady) =>
    rpc('ebay_store_order_snapshot', {
      p_user_id: connection.user_id,
      p_connection_id: connection.id,
      p_version: connection.authorization_version,
      p_operation_id: operationId,
      p_source_key: sourceKey,
      p_review_hash: reviewHash,
      p_source: source,
      p_booking_ready: bookingReady,
    }),
  async book(bearer, input) {
    // Die Nutzer-Sitzung bleibt erhalten: record_sale prüft dieselben Verkaufsrechte wie bisher.
    const { data, error } = await userClient(bearer).rpc('ebay_record_order_sale', {
      p_workspace_id: input.workspaceId,
      p_connection_id: input.connectionId,
      p_snapshot_id: input.snapshotId,
      p_assignments: input.assignments,
      p_costs: input.costs,
    });
    if (error) throw new Error('Database operation failed');
    return data;
  },
  markRecordedElsewhere: (userId, connectionId, snapshotId, reason, saleId) =>
    rpc('ebay_mark_order_recorded_elsewhere', {
      p_user_id: userId,
      p_connection_id: connectionId,
      p_snapshot_id: snapshotId,
      p_reason: reason,
      p_sale_id: saleId,
    }),
  clearRecordedElsewhere: (userId, connectionId, sourceKey) =>
    rpc('ebay_clear_order_recorded_elsewhere', {
      p_user_id: userId,
      p_connection_id: connectionId,
      p_source_key: sourceKey,
    }),
  async authenticate(bearer) {
    const { data, error } = await userClient(bearer).auth.getUser(bearer.slice(7));
    return error ? null : (data.user?.id ?? null);
  },
  async canConnect(bearer, workspaceId) {
    const { data, error } = await userClient(bearer).rpc('ebay_can_connect', {
      p_workspace_id: workspaceId,
    });
    return !error && data === true;
  },
  async status(userId, workspaceId, environment) {
    const { data, error } = await service
      .from('ebay_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .eq('environment', environment)
      .maybeSingle();
    if (error) throw new Error('Database operation failed');
    return data as StoredEbayConnection | null;
  },
  begin: (userId, workspaceId, environment, stateHash) =>
    rpc('ebay_begin_authorization', {
      p_user_id: userId,
      p_workspace_id: workspaceId,
      p_environment: environment,
      p_state_hash: stateHash,
    }),
  consume: (stateHash) => rpc('ebay_consume_authorization', { p_state_hash: stateHash }),
  complete: (connection, accountId, username, encryptedTokens) =>
    rpc('ebay_complete_authorization', {
      p_connection_id: connection.id,
      p_version: connection.authorization_version,
      p_external_account_id: accountId,
      p_username: username,
      p_encrypted_tokens: encryptedTokens,
    }),
  claim: (userId, workspaceId, connectionId, operationId) =>
    rpc('ebay_claim_connection', {
      p_user_id: userId,
      p_workspace_id: workspaceId,
      p_connection_id: connectionId,
      p_operation_id: operationId,
    }),
  finish: (connection, operationId, encryptedTokens, needsLogin, observed) =>
    rpc('ebay_finish_read', {
      p_connection_id: connection.id,
      p_operation_id: operationId,
      p_version: connection.authorization_version,
      p_encrypted_tokens: encryptedTokens,
      p_needs_login: needsLogin,
      p_observed: observed,
    }),
  async disconnect(bearer, workspaceId, connectionId) {
    const { data, error } = await userClient(bearer).rpc('ebay_disconnect', {
      p_workspace_id: workspaceId,
      p_connection_id: connectionId,
    });
    if (error || data !== true) throw new Error('Database operation failed');
  },
};
const config = readEbayConfig((name) => Deno.env.get(name));
Deno.serve(
  createEbayAccountHandler(
    store,
    config,
    config?.allowedOrigins ??
      (Deno.env.get('EBAY_ALLOWED_ORIGINS') ?? 'https://app.flipbase.de')
        .split(',')
        .map((value) => value.trim()),
  ),
);
