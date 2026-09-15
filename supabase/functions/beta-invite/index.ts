// Supabase Edge Function: beta-invite
//
// Versendet eine Einladungs-E-Mail fuer eine angenommene Beta-Bewerbung.
// Darf ausschliesslich von authentifizierten Plattform-Betreibern aufgerufen werden.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const ALLOWED_ORIGINS = new Set(
  (
    Deno.env.get('BETA_INVITE_ALLOWED_ORIGINS') ??
    'https://app.flipbase.de,https://flipbase.de,http://localhost:4200'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origin && (ALLOWED_ORIGINS.has(origin) || origin.endsWith('.flipbase.de'))) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function respond(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method !== 'POST') {
    return respond({ error: 'method_not_allowed' }, 405, origin);
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return respond({ error: 'unauthorized' }, 401, origin);
  }
  const token = authHeader.replace('Bearer ', '').trim();

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error('beta-invite: Fehlende Supabase-Umgebungsvariablen.');
    return respond({ error: 'internal' }, 500, origin);
  }

  // 1. Authentifizierung des Aufrufers
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return respond({ error: 'unauthorized' }, 401, origin);
  }

  // 2. Betreiber-Rolle pruefen
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: operator, error: operatorError } = await serviceClient
    .from('platform_operators')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (operatorError || !operator) {
    console.warn(`beta-invite: Nicht-Betreiber ${user.id} versuchte Aufruf.`);
    return respond({ error: 'forbidden' }, 403, origin);
  }

  // 3. Rumpf lesen & pruefen
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return respond({ error: 'invalid_body' }, 400, origin);
  }

  if (typeof rawBody !== 'object' || rawBody === null) {
    return respond({ error: 'invalid_body' }, 400, origin);
  }

  const { applicationId } = rawBody as { applicationId?: unknown };
  if (typeof applicationId !== 'string' || !applicationId.trim()) {
    return respond({ error: 'missing_application_id' }, 400, origin);
  }

  // 4. Bewerbung laden
  const { data: application, error: appError } = await serviceClient
    .from('beta_applications')
    .select('id, first_name, last_name, email, status')
    .eq('id', applicationId.trim())
    .maybeSingle();

  if (appError || !application) {
    return respond({ error: 'not_found' }, 404, origin);
  }

  if (application.status !== 'accepted') {
    return respond(
      {
        error: 'application_not_accepted',
        message: 'Nur angenommene Bewerbungen koennen eingeladen werden.',
      },
      400,
      origin,
    );
  }

  // 5. Einladung ueber Supabase Auth Admin versenden
  const fullName = `${application.first_name} ${application.last_name}`.trim();
  const siteUrl = Deno.env.get('SITE_URL') ?? 'https://app.flipbase.de';
  const redirectTo = `${siteUrl.replace(/\/$/, '')}/auth/set-password`;

  const { data: inviteData, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
    application.email,
    {
      data: {
        first_name: application.first_name,
        last_name: application.last_name,
        full_name: fullName,
      },
      redirectTo,
    },
  );

  if (inviteError) {
    const errorMsg = inviteError.message ?? '';
    // Nutzer existiert bereits
    if (
      errorMsg.includes('already registered') ||
      errorMsg.includes('already been registered') ||
      inviteError.status === 422
    ) {
      console.log(`beta-invite: Nutzer ${application.email} existiert bereits in auth.users.`);
      return respond({ ok: true, alreadyRegistered: true }, 200, origin);
    }

    console.error(`beta-invite: Einladungsfehler fuer ${application.email}:`, inviteError.message);
    return respond({ error: 'invite_failed', message: inviteError.message }, 500, origin);
  }

  console.log(
    `beta-invite: Einladung erfolgreich an ${application.email} gesendet (User ID: ${inviteData.user.id}).`,
  );
  return respond({ ok: true, invited: true, userId: inviteData.user.id }, 200, origin);
});
