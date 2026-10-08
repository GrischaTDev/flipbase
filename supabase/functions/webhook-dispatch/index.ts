import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { handleWebhook } from './handler.ts';
import type { WebhookRow } from './webhook-settings.ts';
import { saleNotification, type StoredWebhookSale } from './sale-notification.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const server = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
  },
});
const headers = {
  'Access-Control-Allow-Origin': 'https://app.flipbase.de',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return new Response('{}', { status: 405, headers });
  try {
    const bearer = request.headers.get('Authorization') ?? '';
    if (!/^Bearer \S+$/.test(bearer)) throw new Error('Anmeldung fehlt');
    const user = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: bearer },
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
      },
    });
    const { data: identity, error: authError } = await user.auth.getUser(bearer.slice(7));
    if (authError || !identity.user) throw new Error('Anmeldung fehlt');
    const body = await request.text();
    if (body.length > 12_000) throw new Error('Anfrage zu groß');
    const result = await handleWebhook(JSON.parse(body), {
      authorize: async (workspaceId) => {
        const { data, error } = await user.rpc('can_access_workspace', { ws_id: workspaceId });
        return !error && data === true;
      },
      administer: async (workspaceId) => {
        const { data, error } = await user.rpc('can_administer_workspace', { ws_id: workspaceId });
        return !error && data === true;
      },
      read: async (workspaceId) => {
        const { data, error } = await server
          .from('webhook_configs')
          .select('*')
          .eq('workspace_id', workspaceId)
          .maybeSingle();
        if (error) throw new Error('Konfiguration nicht verfügbar');
        return data as WebhookRow | null;
      },
      save: async (workspaceId, patch) => {
        const { data, error } = await server.rpc('save_server_webhook_config', {
          p_workspace_id: workspaceId,
          p_patch: patch,
        });
        if (error || !data) throw new Error('Speichern fehlgeschlagen');
        return data as WebhookRow;
      },
      claim: async (workspaceId, event, channel) => {
        const { data, error } = await server.rpc('claim_server_webhook_dispatch', {
          p_workspace_id: workspaceId,
          p_event: event,
          p_channel: channel,
        });
        if (error) throw new Error('Versandfreigabe fehlgeschlagen');
        return data === true;
      },
      sale: async (workspaceId, saleId) => {
        // Verkaufsbeziehungen bleiben zusätzlich unter den RLS-Rechten des angemeldeten Nutzers.
        const { data, error } = await user
          .from('sales')
          .select(
            `*, inventory_item:inventory_items(*, purchase:purchases(*), costs:item_costs(*)),
            sale_lines:sale_lines!sale_lines_sale_id_fkey(*,
              inventory_item:inventory_items!sale_lines_inventory_item_id_fkey(*, purchase:purchases(*), costs:item_costs(*)),
              lot_allocations:sale_line_lot_allocations!sale_line_lot_allocations_sale_line_id_fkey(*,
                stock_lot:stock_lots!sale_line_lot_allocations_stock_lot_id_fkey(*, purchase:purchases!stock_lots_purchase_id_fkey(*)))),
            cost_entries:sale_cost_entries!sale_cost_entries_sale_id_fkey(*)`,
          )
          .eq('workspace_id', workspaceId)
          .eq('id', saleId)
          .maybeSingle();
        if (error) throw new Error('Verkauf nicht verfügbar');
        return data ? saleNotification(data as StoredWebhookSale) : null;
      },
      complete: async (workspaceId, event, channel) => {
        const { error } = await server
          .from('webhook_dispatch_claims')
          .update({ delivered_at: new Date().toISOString() })
          .eq('workspace_id', workspaceId)
          .eq('event', event)
          .eq('channel', channel);
        if (error) throw new Error('Versandbestätigung fehlgeschlagen');
      },
    });
    return new Response(JSON.stringify(result), { headers });
  } catch {
    // Anbieterfehler enthalten teilweise die aufgerufene URL einschließlich Token.
    return new Response(
      JSON.stringify({
        error:
          'Webhook-Anfrage konnte nicht abgeschlossen werden. Prüfe Anmeldung, Einstellungen und Versandlimit.',
      }),
      { status: 400, headers },
    );
  }
});
