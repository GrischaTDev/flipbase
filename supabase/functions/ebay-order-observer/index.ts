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
});
const identifiers = (name: string) =>
  (Deno.env.get(name) ?? '')
    .split(',')
    .map((identifier) => identifier.trim())
    .filter(Boolean);
const store: ObserverStore = {
  claim: () =>
    rpc('ebay_order_observer_claim', {
      p_allow_all: Deno.env.get('WEB_PUSH_ALLOW_ALL') === 'true',
      p_pilot_users: identifiers('WEB_PUSH_PILOT_USER_IDS'),
      p_pilot_devices: identifiers('WEB_PUSH_PILOT_DEVICE_IDS'),
      p_environment: config?.environment ?? 'production',
    }),
  page: (claim, offset, orders, complete) =>
    rpc('ebay_order_observer_page', {
      ...identity(claim),
      p_from: claim.scan.from,
      p_to: claim.scan.to,
      p_offset: offset,
      p_orders: orders,
      p_complete: complete,
    }),
  delay: (claim, seconds) =>
    rpc('ebay_order_observer_delay', { ...identity(claim), p_delay_seconds: seconds }),
  finish: (claim, encryptedTokens, needsLogin, observed) =>
    rpc('ebay_finish_read', {
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
    () => Deno.env.get('WEB_PUSH_ENABLED') === 'true',
  ),
);
