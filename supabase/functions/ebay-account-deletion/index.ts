import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { readEbayConfig } from '../_shared/ebay-config.ts';
import { createNotificationKeyReader } from '../_shared/ebay-notifications.ts';
import { createDeletionHandler } from './handler.ts';

const config = readEbayConfig((name) => Deno.env.get(name));
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
  config
    ? createDeletionHandler(
        Deno.env.get('EBAY_DELETION_VERIFICATION_TOKEN') ?? '',
        Deno.env.get('EBAY_DELETION_ENDPOINT') ?? '',
        createNotificationKeyReader(config),
        async (userId) => {
          const { error } = await service.rpc('ebay_delete_account', {
            p_environment: config.environment,
            p_external_account_id: userId,
          });
          if (error) throw new Error('Account deletion failed');
        },
      )
    : () =>
        new Response(JSON.stringify({ error: 'not_configured' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
);
