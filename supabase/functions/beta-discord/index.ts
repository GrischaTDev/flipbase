import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createDiscordState, verifyDiscordState } from './discord-oauth.ts';

interface DiscordConfig {
  appUrl: string;
  clientId: string;
  clientSecret: string;
  botToken: string;
  guildId: string;
  roleId: string;
  stateSecret: string;
}

function readConfig(): DiscordConfig | null {
  const values = {
    appUrl: Deno.env.get('BETA_APP_URL')?.replace(/\/$/u, '') ?? 'https://app.flipbase.de',
    clientId: Deno.env.get('DISCORD_CLIENT_ID')?.trim() ?? '',
    clientSecret: Deno.env.get('DISCORD_CLIENT_SECRET')?.trim() ?? '',
    botToken: Deno.env.get('DISCORD_BOT_TOKEN')?.trim() ?? '',
    guildId: Deno.env.get('DISCORD_GUILD_ID')?.trim() ?? '',
    roleId: Deno.env.get('DISCORD_BETA_ROLE_ID')?.trim() ?? '',
    stateSecret: Deno.env.get('DISCORD_OAUTH_STATE_SECRET')?.trim() ?? '',
  };
  if (
    !Object.values(values).every(Boolean) ||
    !/^\d{17,22}$/u.test(values.clientId) ||
    !/^\d{17,22}$/u.test(values.guildId) ||
    !/^\d{17,22}$/u.test(values.roleId) ||
    values.stateSecret.length < 32
  ) {
    return null;
  }
  try {
    const url = new URL(values.appUrl);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return null;
    return values;
  } catch {
    return null;
  }
}

function corsHeaders(origin: string | null, appUrl: string): Record<string, string> {
  const allowedOrigins = new Set([
    new URL(appUrl).origin,
    ...(Deno.env.get('BETA_DISCORD_ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ]);
  return {
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...(origin && allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
  };
}

function respond(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function isDiscordUser(value: unknown): value is { id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    /^\d{17,22}$/u.test(value.id)
  );
}

async function exchangeDiscordCode(
  config: DiscordConfig,
  code: string,
): Promise<{ userId: string; accessToken: string }> {
  const redirectUri = `${config.appUrl}/auth/discord-callback`;
  const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenResponse.ok) throw new Error(`Discord OAuth: ${tokenResponse.status}`);
  const token: unknown = await tokenResponse.json();
  if (
    !token ||
    typeof token !== 'object' ||
    !('access_token' in token) ||
    typeof token.access_token !== 'string'
  ) {
    throw new Error('Discord OAuth: Zugangstoken fehlt.');
  }

  const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!userResponse.ok) throw new Error(`Discord Nutzer: ${userResponse.status}`);
  const discordUser: unknown = await userResponse.json();
  if (!isDiscordUser(discordUser)) throw new Error('Discord Nutzerkennung ungueltig.');

  return { userId: discordUser.id, accessToken: token.access_token };
}

async function assignDiscordRole(
  config: DiscordConfig,
  discordUserId: string,
  accessToken: string,
): Promise<void> {
  const memberResponse = await fetch(
    `https://discord.com/api/v10/guilds/${config.guildId}/members/${discordUserId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${config.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: accessToken }),
    },
  );
  if (![201, 204].includes(memberResponse.status)) {
    throw new Error(`Discord Serverbeitritt: ${memberResponse.status}`);
  }

  const roleResponse = await fetch(
    `https://discord.com/api/v10/guilds/${config.guildId}/members/${discordUserId}/roles/${config.roleId}`,
    { method: 'PUT', headers: { Authorization: `Bot ${config.botToken}` } },
  );
  if (roleResponse.status !== 204) throw new Error(`Discord Rollenvergabe: ${roleResponse.status}`);
}

Deno.serve(async (request: Request) => {
  const config = readConfig();
  const appUrl = config?.appUrl ?? 'https://app.flipbase.de';
  const origin = request.headers.get('origin');
  const cors = corsHeaders(origin, appUrl);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405, cors);
  if (!origin || !cors['Access-Control-Allow-Origin']) {
    return respond({ error: 'origin_not_allowed' }, 403, cors);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return respond({ error: 'unavailable' }, 503, cors);
  const authorization = request.headers.get('authorization') ?? '';
  const jwt = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!jwt) return respond({ error: 'unauthorized' }, 401, cors);

  const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userResult, error: authError } = await client.auth.getUser(jwt);
  if (authError || !userResult.user) return respond({ error: 'unauthorized' }, 401, cors);
  const userId = userResult.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond({ error: 'invalid_body' }, 400, cors);
  }
  if (!body || typeof body !== 'object' || !('action' in body)) {
    return respond({ error: 'invalid_body' }, 400, cors);
  }
  const input = body as Record<string, unknown>;
  if (!['status', 'authorize', 'complete'].includes(String(input.action))) {
    return respond({ error: 'invalid_action' }, 400, cors);
  }

  const application = await client
    .from('beta_applications')
    .select('id, registered_at')
    .eq('auth_user_id', userId)
    .eq('status', 'accepted')
    .maybeSingle();
  if (application.error) return respond({ error: 'unavailable' }, 503, cors);
  let eligible = false;
  if (application.data?.registered_at) {
    const license = await client
      .from('workspace_licenses')
      .select('ends_at')
      .eq('beta_application_id', application.data.id)
      .eq('status', 'active')
      .maybeSingle();
    if (license.error) return respond({ error: 'unavailable' }, 503, cors);
    eligible = Boolean(license.data?.ends_at && Date.parse(license.data.ends_at) > Date.now());
  }

  const linked = await client
    .from('beta_discord_links')
    .select('discord_user_id')
    .eq('auth_user_id', userId)
    .maybeSingle();
  if (linked.error) return respond({ error: 'unavailable' }, 503, cors);

  if (input.action === 'status') {
    return respond(
      { eligible, linked: Boolean(linked.data), configured: Boolean(config) },
      200,
      cors,
    );
  }
  if (!eligible) return respond({ error: 'beta_access_required' }, 403, cors);
  if (linked.data) return respond({ linked: true }, 200, cors);
  if (!config) return respond({ error: 'not_configured' }, 503, cors);

  if (input.action === 'authorize') {
    const state = await createDiscordState(userId, config.stateSecret);
    const url = new URL('https://discord.com/oauth2/authorize');
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      scope: 'identify guilds.join',
      state,
      redirect_uri: `${config.appUrl}/auth/discord-callback`,
      prompt: 'consent',
    }).toString();
    return respond({ authorizationUrl: url.toString() }, 200, cors);
  }

  if (
    typeof input.code !== 'string' ||
    !input.code ||
    input.code.length > 500 ||
    typeof input.state !== 'string' ||
    input.state.length > 1000 ||
    !(await verifyDiscordState(input.state, userId, config.stateSecret))
  ) {
    return respond({ error: 'invalid_discord_state' }, 400, cors);
  }

  try {
    const discord = await exchangeDiscordCode(config, input.code);
    const existing = await client
      .from('beta_discord_links')
      .select('auth_user_id')
      .eq('discord_user_id', discord.userId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data && existing.data.auth_user_id !== userId) {
      return respond({ error: 'discord_account_in_use' }, 409, cors);
    }
    await assignDiscordRole(config, discord.userId, discord.accessToken);
    const saved = await client
      .from('beta_discord_links')
      .insert({ auth_user_id: userId, discord_user_id: discord.userId });
    if (saved.error) throw saved.error;
    return respond({ linked: true }, 200, cors);
  } catch (error) {
    console.error(
      'beta-discord: Verknuepfung fehlgeschlagen:',
      error instanceof Error ? error.message : 'Unbekannter Fehler',
    );
    return respond({ error: 'discord_link_failed' }, 502, cors);
  }
});
