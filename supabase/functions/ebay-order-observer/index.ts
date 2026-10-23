// deno-lint-ignore no-import-prefix
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { readEbayConfig } from '../_shared/ebay-config.ts';
import { createEbayOrderObserverHandler } from './handler.ts';
import type { ObserverClaim, ObserverStore } from './handler.ts';
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const config = readEbayConfig((name) => Deno.env.get(name));
const client = createClient(Deno.env.get('SUPABASE_URL') ?? '', secret, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }) },
});
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error('Observer database unavailable');
  return data as T;
}
const identity = (claim: ObserverClaim) => ({
  p_connection_id: claim.connection.connection.id,
  p_operation_id: claim.connection.connection.operation_id,
  p_version: claim.connection.connection.authorization_version,
  p_scan_id: claim.scan.id,
});
const store: ObserverStore = {
  claim: () =>
    rpc('ebay_cache_claim', {
      p_environment: config?.environment ?? 'production',
    }),
  page: (claim, offset, rows, complete, total) =>
    rpc('ebay_cache_page', {
      ...identity(claim),
      p_offset: offset,
      p_rows: rows,
      p_complete: complete,
      p_total: total,
    }),
  delay: (claim, seconds) =>
    rpc('ebay_cache_delay', { ...identity(claim), p_delay_seconds: seconds }),
  finish: (claim, encryptedTokens, needsLogin, observed) =>
    rpc('ebay_cache_finish', {
      ...identity(claim),
      p_encrypted_tokens: encryptedTokens,
      p_needs_login: needsLogin,
      p_observed: observed,
    }),
};
Deno.serve(
  createEbayOrderObserverHandler(
    store,
    config,
    secret,
    () => Deno.env.get('EBAY_CACHE_ENABLED') !== 'false',
  ),
);
