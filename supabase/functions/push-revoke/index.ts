// Repository-Regeln verlangen explizit versionierte npm-Imports.
// deno-lint-ignore no-import-prefix
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createPushRevokeHandler } from './handler.ts';
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
Deno.serve(
  createPushRevokeHandler({
    origins: (
      Deno.env.get('WEB_PUSH_ALLOWED_ORIGINS') ?? 'https://app.flipbase.de,http://localhost:4200'
    ).split(','),
    async revoke(generationId, tokenHash) {
      const { error } = await service.rpc('web_push_revoke_binding', {
        p_generation_id: generationId,
        p_token_hash: tokenHash,
      });
      if (error) throw new Error('database');
    },
  }),
);
