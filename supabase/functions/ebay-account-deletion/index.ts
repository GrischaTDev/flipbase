import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createDeletionEndpoint } from './endpoint.ts';

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
  createDeletionEndpoint(
    (name) => Deno.env.get(name),
    async (userId) => {
      const { error } = await service.rpc('ebay_delete_account', {
        p_environment: Deno.env.get('EBAY_ENVIRONMENT') ?? 'production',
        p_external_account_id: userId,
      });
      if (error) throw new Error('Account deletion failed');
    },
  ),
);
