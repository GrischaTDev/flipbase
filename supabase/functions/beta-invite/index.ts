// Supabase Edge Function: beta-invite
//
// Buendelt Betreiberentscheidungen und alle wiederholbaren Beta-E-Mails hinter
// einer authentifizierten Servergrenze. Der Browser schreibt keine Bewerbung
// direkt und erhaelt niemals einen Registrierungslink zurueck.

import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { type BetaEmailMessage, sendBetaEmail } from '../_shared/beta-email-delivery.ts';
import {
  renderApplicationReceipt,
  renderRegistrationInvite,
} from '../_shared/beta-email-template.ts';

type BetaInviteAction = 'accept' | 'reject' | 'resend' | 'resend_receipt';

export interface BetaInviteApplication {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  granted_days: number | null;
  receipt_email_status: string;
  auth_user_id: string | null;
  invitation_status: string;
  registered_at: string | null;
}

interface BetaInviteUserInput {
  email: string;
  redirectTo: string;
  data: {
    beta_application_id: string;
    first_name: string;
    last_name: string;
    full_name: string;
  };
}

interface BetaRegistrationLinkInput {
  email: string;
  redirectTo: string;
}

type BetaApplicationPatch = Partial<
  Pick<BetaInviteApplication, 'auth_user_id' | 'invitation_status' | 'receipt_email_status'>
> & {
  invitation_sent_at?: string | null;
  invitation_last_error?: string | null;
  receipt_email_sent_at?: string | null;
  receipt_email_last_error?: string | null;
};

export interface BetaInviteDependencies {
  authenticate(token: string): Promise<{ id: string } | null>;
  isOperator(userId: string): Promise<boolean>;
  loadApplication(applicationId: string): Promise<BetaInviteApplication | null>;
  acceptApplication(
    token: string,
    applicationId: string,
    grantedDays: number,
  ): Promise<BetaInviteApplication>;
  rejectApplication(token: string, applicationId: string): Promise<BetaInviteApplication>;
  inviteUser(input: BetaInviteUserInput): Promise<{ userId: string }>;
  generateRegistrationLink(
    input: BetaRegistrationLinkInput,
  ): Promise<{ userId: string; actionLink: string }>;
  sendEmail(message: BetaEmailMessage): Promise<void>;
  updateApplication(
    applicationId: string,
    patch: BetaApplicationPatch,
  ): Promise<BetaInviteApplication>;
  now(): string;
  siteUrl: string;
}

const ALLOWED_ORIGINS = new Set(
  (
    Deno.env.get('BETA_INVITE_ALLOWED_ORIGINS') ??
    'https://app.flipbase.de,https://flipbase.de,http://localhost:4200'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const APPLICATION_FIELDS =
  'id, first_name, last_name, email, status, granted_days, receipt_email_status, auth_user_id, invitation_status, registered_at';

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

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
  return message.replaceAll(/https?:\/\/\S+/gu, '[Link entfernt]').slice(0, 500);
}

function redirectUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/u, '')}/auth/set-password`;
}

function isAction(value: unknown): value is BetaInviteAction {
  return ['accept', 'reject', 'resend', 'resend_receipt'].includes(String(value));
}

async function storeInvitationFailure(
  dependencies: BetaInviteDependencies,
  applicationId: string,
  error: unknown,
): Promise<void> {
  await dependencies.updateApplication(applicationId, {
    invitation_status: 'failed',
    invitation_last_error: boundedError(error),
  });
}

export function createBetaInviteHandler(
  dependencies: BetaInviteDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
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
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) return respond({ error: 'unauthorized' }, 401, origin);

    const user = await dependencies.authenticate(token);
    if (!user) return respond({ error: 'unauthorized' }, 401, origin);
    if (!(await dependencies.isOperator(user.id))) {
      return respond({ error: 'forbidden' }, 403, origin);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return respond({ error: 'invalid_body' }, 400, origin);
    }
    if (typeof rawBody !== 'object' || rawBody === null) {
      return respond({ error: 'invalid_body' }, 400, origin);
    }

    const body = rawBody as Record<string, unknown>;
    const applicationId = typeof body.applicationId === 'string' ? body.applicationId.trim() : '';
    if (!applicationId) {
      return respond({ error: 'missing_application_id' }, 400, origin);
    }
    if (!isAction(body.action)) {
      return respond({ error: 'invalid_action' }, 400, origin);
    }

    if (body.action === 'reject') {
      try {
        const application = await dependencies.rejectApplication(token, applicationId);
        return respond({ ok: true, application }, 200, origin);
      } catch (error) {
        return respond({ error: 'decision_failed', message: boundedError(error) }, 400, origin);
      }
    }

    if (body.action === 'accept') {
      const grantedDays = body.grantedDays;
      if (!Number.isInteger(grantedDays) || Number(grantedDays) < 1 || Number(grantedDays) > 3650) {
        return respond({ error: 'invalid_granted_days' }, 400, origin);
      }

      let application: BetaInviteApplication;
      try {
        application = await dependencies.acceptApplication(
          token,
          applicationId,
          Number(grantedDays),
        );
      } catch (error) {
        return respond({ error: 'decision_failed', message: boundedError(error) }, 400, origin);
      }

      try {
        const fullName = `${application.first_name} ${application.last_name}`.trim();
        const invited = await dependencies.inviteUser({
          email: application.email,
          redirectTo: redirectUrl(dependencies.siteUrl),
          data: {
            beta_application_id: application.id,
            first_name: application.first_name,
            last_name: application.last_name,
            full_name: fullName,
          },
        });
        application = await dependencies.updateApplication(application.id, {
          auth_user_id: invited.userId,
          invitation_status: 'sent',
          invitation_sent_at: dependencies.now(),
          invitation_last_error: null,
        });
        return respond({ ok: true, application }, 200, origin);
      } catch (error) {
        await storeInvitationFailure(dependencies, application.id, error);
        return respond(
          {
            error: 'invite_failed',
            message: 'Die Einladung konnte nicht versendet werden.',
          },
          502,
          origin,
        );
      }
    }

    const application = await dependencies.loadApplication(applicationId);
    if (!application) return respond({ error: 'not_found' }, 404, origin);

    if (body.action === 'resend_receipt') {
      try {
        const receipt = renderApplicationReceipt({
          firstName: application.first_name,
        });
        await dependencies.sendEmail({ to: application.email, ...receipt });
        const updated = await dependencies.updateApplication(application.id, {
          receipt_email_status: 'sent',
          receipt_email_sent_at: dependencies.now(),
          receipt_email_last_error: null,
        });
        return respond({ ok: true, application: updated }, 200, origin);
      } catch (error) {
        const updated = await dependencies.updateApplication(application.id, {
          receipt_email_status: 'failed',
          receipt_email_last_error: boundedError(error),
        });
        return respond(
          {
            error: 'receipt_failed',
            message: 'Die Bestaetigung konnte nicht versendet werden.',
            application: updated,
          },
          502,
          origin,
        );
      }
    }

    if (application.status !== 'accepted' || !application.auth_user_id) {
      return respond({ error: 'invitation_not_ready' }, 409, origin);
    }
    if (application.registered_at) {
      return respond({ error: 'already_registered' }, 409, origin);
    }
    if (!application.granted_days) {
      return respond({ error: 'missing_granted_days' }, 409, origin);
    }

    try {
      const link = await dependencies.generateRegistrationLink({
        email: application.email,
        redirectTo: redirectUrl(dependencies.siteUrl),
      });
      if (link.userId !== application.auth_user_id) {
        throw new Error('Der Registrierungslink gehoert nicht zum verknuepften Nutzer.');
      }
      const invitation = renderRegistrationInvite({
        firstName: application.first_name,
        actionLink: link.actionLink,
        grantedDays: application.granted_days,
      });
      await dependencies.sendEmail({ to: application.email, ...invitation });
      const updated = await dependencies.updateApplication(application.id, {
        invitation_status: 'sent',
        invitation_sent_at: dependencies.now(),
        invitation_last_error: null,
      });
      return respond({ ok: true, application: updated }, 200, origin);
    } catch (error) {
      await storeInvitationFailure(dependencies, application.id, error);
      return respond(
        {
          error: 'invite_failed',
          message: 'Die Einladung konnte nicht versendet werden.',
        },
        502,
        origin,
      );
    }
  };
}

function createProductionDependencies(): BetaInviteDependencies {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    throw new Error('Fehlende Supabase-Umgebungsvariablen.');
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const userClient = (token: string) =>
    createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

  return {
    async authenticate(token) {
      const { data, error } = await userClient(token).auth.getUser();
      return error || !data.user ? null : { id: data.user.id };
    },
    async isOperator(userId) {
      const { data, error } = await serviceClient
        .from('platform_operators')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data !== null;
    },
    async loadApplication(applicationId) {
      const { data, error } = await serviceClient
        .from('beta_applications')
        .select(APPLICATION_FIELDS)
        .eq('id', applicationId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as BetaInviteApplication | null;
    },
    async acceptApplication(token, applicationId, grantedDays) {
      const { data, error } = await userClient(token).rpc('accept_beta_application', {
        p_application_id: applicationId,
        p_granted_days: grantedDays,
      });
      if (error || !data) {
        throw new Error(error?.message ?? 'Bewerbung konnte nicht angenommen werden.');
      }
      return data as BetaInviteApplication;
    },
    async rejectApplication(token, applicationId) {
      const { data, error } = await userClient(token).rpc('reject_beta_application', {
        p_application_id: applicationId,
      });
      if (error || !data) {
        throw new Error(error?.message ?? 'Bewerbung konnte nicht abgelehnt werden.');
      }
      return data as BetaInviteApplication;
    },
    async inviteUser(input) {
      const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(input.email, {
        data: input.data,
        redirectTo: input.redirectTo,
      });
      if (error || !data.user) {
        throw new Error(error?.message ?? 'Einladung fehlgeschlagen.');
      }
      return { userId: data.user.id };
    },
    async generateRegistrationLink(input) {
      const { data, error } = await serviceClient.auth.admin.generateLink({
        type: 'recovery',
        email: input.email,
        options: { redirectTo: input.redirectTo },
      });
      if (error || !data.properties?.action_link || !data.user) {
        throw new Error(error?.message ?? 'Registrierungslink konnte nicht erzeugt werden.');
      }
      return { userId: data.user.id, actionLink: data.properties.action_link };
    },
    sendEmail: sendBetaEmail,
    async updateApplication(applicationId, patch) {
      const { data, error } = await serviceClient
        .from('beta_applications')
        .update(patch)
        .eq('id', applicationId)
        .select(APPLICATION_FIELDS)
        .single();
      if (error || !data) {
        throw new Error(error?.message ?? 'Versandstatus konnte nicht gespeichert werden.');
      }
      return data as BetaInviteApplication;
    },
    now: () => new Date().toISOString(),
    siteUrl: Deno.env.get('SITE_URL') ?? 'https://app.flipbase.de',
  };
}

if (import.meta.main) {
  try {
    Deno.serve(createBetaInviteHandler(createProductionDependencies()));
  } catch {
    console.error('beta-invite: Serverkonfiguration ist unvollstaendig.');
    Deno.serve((request) => respond({ error: 'internal' }, 500, request.headers.get('origin')));
  }
}
