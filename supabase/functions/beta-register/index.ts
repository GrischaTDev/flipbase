import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { hashBetaRegistrationToken } from '../_shared/beta-registration-link.ts';
import { readLimitedJsonBody, RequestBodyTooLargeError } from '../_shared/limited-request-body.ts';

interface PendingRegistration {
  auth_user_id: string;
  email: string;
  lease_id: string;
}
export interface BetaRegistrationDependencies {
  allowAttempt(request: Request): Promise<boolean>;
  inspect(hash: string): Promise<{ expires_at: string }>;
  begin(hash: string, requestId: string): Promise<PendingRegistration>;
  setPassword(userId: string, password: string): Promise<void>;
  complete(requestId: string, leaseId: string): Promise<void>;
  session(
    userId: string,
    email: string,
    password: string,
  ): Promise<{ access_token: string; refresh_token: string }>;
  fail(requestId: string, leaseId: string): Promise<void>;
}

const origins = new Set(
  (
    Deno.env.get('BETA_APPLICATION_ALLOWED_ORIGINS') ||
    'https://app.flipbase.de,https://flipbase.de,http://localhost:4200,http://127.0.0.1:4200'
  )
    .split(',')
    .map((value) => value.trim()),
);
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;

export function createBetaRegistrationHandler(deps: BetaRegistrationDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      Vary: 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
      ...(origin && origins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    };
    const respond = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    if (origin && !origins.has(origin)) return respond({ error: 'forbidden_origin' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);
    try {
      if (!(await deps.allowAttempt(request))) {
        await request.body?.cancel();
        return respond({ error: 'rate_limited', message: 'Bitte versuche es später erneut.' }, 429);
      }
    } catch {
      await request.body?.cancel();
      return respond({ error: 'unavailable' }, 503);
    }
    let body: Record<string, unknown>;
    try {
      const parsed = await readLimitedJsonBody(request, 4096);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return respond({ error: 'invalid_body' }, 400);
      body = parsed as Record<string, unknown>;
    } catch (error) {
      return respond(
        { error: 'invalid_body' },
        error instanceof RequestBodyTooLargeError ? 413 : 400,
      );
    }
    if (typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(body.token))
      return respond({ error: 'invalid_link' }, 400);
    if (body.action !== 'inspect' && body.action !== 'complete')
      return respond({ error: 'invalid_action' }, 400);
    if (
      body.action === 'complete' &&
      (typeof body.password !== 'string' ||
        body.password.length < 8 ||
        new TextEncoder().encode(body.password).length > 72 ||
        body.acceptedTerms !== true ||
        typeof body.requestId !== 'string' ||
        !uuidPattern.test(body.requestId))
    ) {
      return respond(
        {
          error: 'invalid_registration',
          message:
            'Bitte ein Passwort mit 8 bis 72 Zeichen eingeben und den Bedingungen zustimmen.',
        },
        400,
      );
    }
    let pending: PendingRegistration | null = null;
    try {
      const hash = await hashBetaRegistrationToken(body.token);
      if (body.action === 'inspect') {
        const result = await deps.inspect(hash);
        return respond({ expiresAt: result.expires_at });
      }
      const requestId = body.requestId as string;
      pending = await deps.begin(hash, requestId);
      await deps.setPassword(pending.auth_user_id, body.password as string);
      await deps.complete(requestId, pending.lease_id);
      // Ein verbrauchter Beta-Link darf selbst bei verlorener Antwort keinen weiteren Login erzeugen.
      const session = await deps.session(
        pending.auth_user_id,
        pending.email,
        body.password as string,
      );
      return respond({ session });
    } catch {
      if (pending && typeof body.requestId === 'string') {
        await deps.fail(body.requestId, pending.lease_id).catch(() => undefined);
      }
      return respond(
        {
          error: 'registration_failed',
          message:
            'Der Registrierungslink ist ungültig oder abgelaufen. Wenn dein Passwort bereits gespeichert wurde, melde dich damit an.',
        },
        400,
      );
    }
  };
}

function productionDependencies(): BetaRegistrationDependencies {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const pepper = Deno.env.get('BETA_APPLICATION_PEPPER');
  if (!url || !serviceKey || !anonKey || !pepper)
    throw new Error('Beta-Registrierung ist nicht konfiguriert');
  // Externe Aufrufe bleiben deutlich kürzer als die exklusive Datenbank-Lease.
  const options = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }),
    },
  };
  const admin = createClient(url, serviceKey, options);
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  };
  return {
    async allowAttempt(request) {
      const originHash = await hashBetaRegistrationToken(
        `${pepper}:registration:${request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'}`,
      );
      const result = await rpc('beta_application_attempt', {
        p_origin_hash: originHash,
        p_max_per_origin: 60,
        p_max_total: 10000,
      });
      return result === true;
    },
    inspect: async (hash) =>
      (await rpc('inspect_beta_registration', { p_token_hash: hash })) as { expires_at: string },
    begin: async (hash, requestId) =>
      (await rpc('begin_beta_registration', {
        p_token_hash: hash,
        p_request_id: requestId,
      })) as PendingRegistration,
    async setPassword(userId, password) {
      const { data: existing, error: loadError } = await admin.auth.admin.getUserById(userId);
      if (
        loadError ||
        !existing.user ||
        (existing.user.banned_until && Date.parse(existing.user.banned_until) > Date.now())
      )
        throw new Error('Konto nicht verfügbar');
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { beta_registration_completed: true },
      });
      if (error) throw new Error(error.message);
    },
    complete: async (requestId, leaseId) => {
      await rpc('complete_beta_registration', { p_request_id: requestId, p_lease_id: leaseId });
    },
    async session(userId, email, password) {
      // Der verbrauchte Beta-Link liefert eine normale Passwortsitzung,
      // keine dauerhaft zum erneuten Passwortsetzen berechtigte Recovery-Sitzung.
      const client = createClient(url, anonKey, options);
      const { data: verified, error: verifyError } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (verifyError || !verified.session || verified.user?.id !== userId)
        throw new Error('Anmeldung fehlgeschlagen');
      return {
        access_token: verified.session.access_token,
        refresh_token: verified.session.refresh_token,
      };
    },
    fail: async (requestId, leaseId) => {
      await rpc('fail_beta_lifecycle_operation', { p_request_id: requestId, p_lease_id: leaseId });
    },
  };
}
if (import.meta.main) {
  try {
    Deno.serve(createBetaRegistrationHandler(productionDependencies()));
  } catch {
    Deno.serve(
      () =>
        new Response(JSON.stringify({ error: 'configuration_missing' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
  }
}
