// Repository-Regeln verlangen explizit versionierte npm-Imports.
// deno-lint-ignore no-import-prefix
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createPushSettingsHandler, PushSettingsError } from './handler.ts';
import { uuidPattern } from './contracts.ts';
const url = Deno.env.get('SUPABASE_URL') ?? '';
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
});
Deno.serve(
  createPushSettingsHandler({
    publicKey: Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY') ?? '',
    keyId: Deno.env.get('WEB_PUSH_VAPID_KEY_ID') ?? '',
    enabled: Deno.env.get('WEB_PUSH_ENABLED') === 'true',
    origins: (
      Deno.env.get('WEB_PUSH_ALLOWED_ORIGINS') ?? 'https://app.flipbase.de,http://localhost:4200'
    ).split(','),
    async authenticate(bearer) {
      const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
        },
      });
      const token = bearer.slice(7);
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return null;
      // Der Claim wird erst nach serverseitiger Tokenpruefung gelesen; die SQL-RPC prueft die Sitzung erneut.
      const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (typeof claims.session_id !== 'string' || !uuidPattern.test(claims.session_id))
        return null;
      return { userId: data.user.id, sessionId: claims.session_id };
    },
    async execute(userId, sessionId, input) {
      const { data, error } = await service.rpc('web_push_settings', {
        p_user_id: userId,
        p_session_id: sessionId,
        p_input: input,
      });
      if (error)
        throw new PushSettingsError(
          error.code === '42501'
            ? 403
            : error.code === 'P0001' && error.message === 'Push test rate limit'
              ? 429
              : 503,
          error.code === '42501'
            ? 'forbidden'
            : error.code === 'P0001' && error.message === 'Push test rate limit'
              ? 'rate_limit'
              : 'unavailable',
        );
      return data;
    },
  }),
);
