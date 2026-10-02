// Supabase Edge Function: beta-invite
//
// Buendelt Betreiberentscheidungen und alle wiederholbaren Beta-E-Mails hinter
// einer authentifizierten Servergrenze. Der Browser schreibt keine Bewerbung
// direkt und erhaelt niemals einen Registrierungslink zurueck.

import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { type BetaEmailMessage, sendBetaEmail } from '../_shared/beta-email-delivery.ts';
import {
  renderApplicationReceipt,
  renderApplicationRejection,
  renderRegistrationInvite,
  renderOperatorApplicationNotice,
} from '../_shared/beta-email-template.ts';

import {
  createBetaRegistrationToken,
  hashBetaRegistrationToken,
  buildBetaRegistrationUrl,
} from '../_shared/beta-registration-link.ts';

type BetaInviteAction =
  | 'accept'
  | 'reject'
  | 'resend'
  | 'resend_receipt'
  | 'resend_operator_notice'
  | 'resend_rejection'
  | 'delete_rejected'
  | 'withdraw'
  | 'extend'
  | 'end';

export interface BetaInviteApplication {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  granted_days: number | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  receipt_email_status: string;
  receipt_email_sent_at: string | null;
  receipt_email_last_error: string | null;
  operator_email_status: string;
  operator_email_sent_at: string | null;
  operator_email_last_error: string | null;
  auth_user_id: string | null;
  invitation_status: string;
  invitation_sent_at: string | null;
  invitation_last_error: string | null;
  rejection_email_status: string;
  rejection_email_sent_at: string | null;
  rejection_email_last_error: string | null;
  registered_at: string | null;
  invitation_expires_at?: string | null;
  revoked_at?: string | null;
  workspace_licenses?:
    | { status: string; ends_at: string | null }
    | { status: string; ends_at: string | null }[]
    | null;
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

type BetaApplicationPatch = Partial<
  Pick<
    BetaInviteApplication,
    | 'auth_user_id'
    | 'invitation_status'
    | 'receipt_email_status'
    | 'operator_email_status'
    | 'rejection_email_status'
  >
> & {
  invitation_sent_at?: string | null;
  invitation_last_error?: string | null;
  receipt_email_sent_at?: string | null;
  receipt_email_last_error?: string | null;
  operator_email_sent_at?: string | null;
  operator_email_last_error?: string | null;
  rejection_email_sent_at?: string | null;
  rejection_email_last_error?: string | null;
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
  deleteRejectedApplication(token: string, applicationId: string): Promise<void>;
  inviteUser(input: BetaInviteUserInput): Promise<{ userId: string }>;
  prepareInvitation(
    applicationId: string,
    requestId: string,
  ): Promise<{ actionLink: string; expiresAt: string; replayed: boolean; leaseId: string }>;
  finishInvitation(
    requestId: string,
    leaseId: string,
    sent: boolean,
    error: string | null,
  ): Promise<void>;
  withdrawApplication(applicationId: string, requestId: string): Promise<void>;
  changeDuration(
    token: string,
    applicationId: string,
    requestId: string,
    action: 'extend' | 'end',
    days: number,
  ): Promise<void>;
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
  'id, first_name, last_name, email, status, granted_days, decision_note, decided_at, created_at, receipt_email_status, receipt_email_sent_at, receipt_email_last_error, operator_email_status, operator_email_sent_at, operator_email_last_error, auth_user_id, invitation_status, invitation_sent_at, invitation_last_error, rejection_email_status, rejection_email_sent_at, rejection_email_last_error, registered_at, invitation_expires_at, revoked_at, workspace_licenses(status, ends_at)';

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

function betaAppUrl(): string {
  const configuredUrl = Deno.env.get('BETA_APP_URL')?.trim();
  if (configuredUrl) return configuredUrl;
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (supabaseUrl) {
    const hostname = new URL(supabaseUrl).hostname;
    if (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === 'kong') {
      return 'http://127.0.0.1:4200';
    }
  }
  return 'https://app.flipbase.de';
}

function isAction(value: unknown): value is BetaInviteAction {
  return [
    'accept',
    'reject',
    'resend',
    'resend_receipt',
    'resend_operator_notice',
    'resend_rejection',
    'delete_rejected',
    'withdraw',
    'extend',
    'end',
  ].includes(String(value));
}

async function sendInvitation(
  dependencies: BetaInviteDependencies,
  application: BetaInviteApplication,
  requestId: string,
  origin: string | null,
): Promise<Response> {
  let prepared: Awaited<ReturnType<BetaInviteDependencies['prepareInvitation']>>;
  try {
    prepared = await dependencies.prepareInvitation(application.id, requestId);
  } catch (error) {
    return respond({ error: 'invitation_busy', message: boundedError(error) }, 409, origin);
  }
  if (prepared.replayed)
    return respond(
      { ok: true, application: await dependencies.loadApplication(application.id) },
      200,
      origin,
    );
  try {
    if (!application.auth_user_id) {
      const invited = await dependencies.inviteUser({
        email: application.email,
        redirectTo: redirectUrl(dependencies.siteUrl),
        data: {
          beta_application_id: application.id,
          first_name: application.first_name,
          last_name: application.last_name,
          full_name: (application.first_name + ' ' + application.last_name).trim(),
        },
      });
      await dependencies.updateApplication(application.id, { auth_user_id: invited.userId });
    }
    await dependencies.sendEmail({
      to: application.email,
      ...renderRegistrationInvite({
        firstName: application.first_name,
        actionLink: prepared.actionLink,
        grantedDays: application.granted_days!,
        expiresAt: prepared.expiresAt,
      }),
    });
    await dependencies.finishInvitation(requestId, prepared.leaseId, true, null);
    return respond(
      { ok: true, application: await dependencies.loadApplication(application.id) },
      200,
      origin,
    );
  } catch (error) {
    await dependencies.finishInvitation(requestId, prepared.leaseId, false, boundedError(error));
    return respond(
      {
        error: 'invite_failed',
        message: 'Die Einladung konnte nicht versendet werden.',
        application: await dependencies.loadApplication(application.id),
      },
      502,
      origin,
    );
  }
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

    const requestId = typeof body.requestId === 'string' ? body.requestId : crypto.randomUUID();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(requestId))
      return respond({ error: 'invalid_request_id' }, 400, origin);
    if (body.action === 'withdraw' || body.action === 'extend' || body.action === 'end') {
      const days = Number(body.days ?? 0);
      if (body.action === 'extend' && (!Number.isInteger(days) || days < 1 || days > 3650))
        return respond({ error: 'invalid_days' }, 400, origin);
      try {
        if (body.action === 'withdraw')
          await dependencies.withdrawApplication(applicationId, requestId);
        else await dependencies.changeDuration(token, applicationId, requestId, body.action, days);
        return respond(
          {
            ok: true,
            deletedApplicationId: body.action === 'withdraw' ? applicationId : undefined,
          },
          200,
          origin,
        );
      } catch (error) {
        return respond({ error: 'action_failed', message: boundedError(error) }, 409, origin);
      }
    }
    if (body.action === 'reject') {
      let application: BetaInviteApplication;
      try {
        application = await dependencies.rejectApplication(token, applicationId);
      } catch (error) {
        return respond({ error: 'decision_failed', message: boundedError(error) }, 400, origin);
      }

      try {
        const rejection = renderApplicationRejection({ firstName: application.first_name });
        await dependencies.sendEmail({ to: application.email, ...rejection });
        application = await dependencies.updateApplication(application.id, {
          rejection_email_status: 'sent',
          rejection_email_sent_at: dependencies.now(),
          rejection_email_last_error: null,
        });
        return respond({ ok: true, application }, 200, origin);
      } catch (error) {
        const failedApplication = await dependencies.updateApplication(application.id, {
          rejection_email_status: 'failed',
          rejection_email_last_error: boundedError(error),
        });
        return respond(
          {
            error: 'rejection_email_failed',
            message:
              'Die Ablehnung wurde gespeichert, aber die E-Mail konnte nicht versendet werden.',
            application: failedApplication,
          },
          502,
          origin,
        );
      }
    }

    if (body.action === 'delete_rejected') {
      try {
        await dependencies.deleteRejectedApplication(token, applicationId);
        return respond({ ok: true, deletedApplicationId: applicationId }, 200, origin);
      } catch (error) {
        return respond({ error: 'delete_failed', message: boundedError(error) }, 400, origin);
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

      return sendInvitation(dependencies, application, requestId, origin);
    }

    const application = await dependencies.loadApplication(applicationId);
    if (!application) return respond({ error: 'not_found' }, 404, origin);

    if (body.action === 'resend_rejection') {
      if (application.status !== 'rejected') {
        return respond({ error: 'rejection_not_ready' }, 409, origin);
      }
      try {
        const rejection = renderApplicationRejection({ firstName: application.first_name });
        await dependencies.sendEmail({ to: application.email, ...rejection });
        const updated = await dependencies.updateApplication(application.id, {
          rejection_email_status: 'sent',
          rejection_email_sent_at: dependencies.now(),
          rejection_email_last_error: null,
        });
        return respond({ ok: true, application: updated }, 200, origin);
      } catch (error) {
        const updated = await dependencies.updateApplication(application.id, {
          rejection_email_status: 'failed',
          rejection_email_last_error: boundedError(error),
        });
        return respond(
          {
            error: 'rejection_email_failed',
            message: 'Die Ablehnungsmail konnte nicht versendet werden.',
            application: updated,
          },
          502,
          origin,
        );
      }
    }

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

    if (body.action === 'resend_operator_notice') {
      if (application.operator_email_status !== 'failed') {
        return respond({ error: 'operator_notice_not_failed' }, 409, origin);
      }
      try {
        await dependencies.sendEmail({
          to: Deno.env.get('BETA_OPERATOR_EMAIL')?.trim() || 'beta@flipbase.de',
          ...renderOperatorApplicationNotice({
            firstName: application.first_name,
            lastName: application.last_name,
            email: application.email,
          }),
        });
        const updated = await dependencies.updateApplication(application.id, {
          operator_email_status: 'sent',
          operator_email_sent_at: dependencies.now(),
          operator_email_last_error: null,
        });
        return respond({ ok: true, application: updated }, 200, origin);
      } catch (error) {
        const updated = await dependencies.updateApplication(application.id, {
          operator_email_status: 'failed',
          operator_email_last_error: boundedError(error),
        });
        return respond(
          {
            error: 'operator_notice_failed',
            message: 'Die Betreiber-Benachrichtigung konnte nicht versendet werden.',
            application: updated,
          },
          502,
          origin,
        );
      }
    }

    if (application.status !== 'accepted' || application.revoked_at) {
      return respond({ error: 'invitation_not_ready' }, 409, origin);
    }
    if (application.registered_at) {
      return respond({ error: 'already_registered' }, 409, origin);
    }
    if (!application.granted_days) {
      return respond({ error: 'missing_granted_days' }, 409, origin);
    }

    return sendInvitation(dependencies, application, requestId, origin);
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
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }),
    },
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
    async deleteRejectedApplication(token, applicationId) {
      const { error } = await userClient(token).rpc('delete_rejected_beta_application', {
        p_application_id: applicationId,
      });
      if (error) {
        throw new Error(error.message ?? 'Bewerbung konnte nicht gelöscht werden.');
      }
    },
    async inviteUser(input) {
      const { data, error } = await serviceClient.auth.admin.createUser({
        email: input.email,
        email_confirm: false,
        user_metadata: input.data,
      });
      if (error || !data.user)
        throw new Error(error?.message ?? 'Konto konnte nicht vorbereitet werden.');
      return { userId: data.user.id };
    },
    async prepareInvitation(applicationId, requestId) {
      const token = createBetaRegistrationToken();
      const { data, error } = await serviceClient.rpc('prepare_beta_invitation', {
        p_application_id: applicationId,
        p_request_id: requestId,
        p_token_hash: await hashBetaRegistrationToken(token),
      });
      if (error) throw new Error(error.message);
      return {
        actionLink: buildBetaRegistrationUrl(betaAppUrl(), token),
        expiresAt: data.expires_at,
        replayed: data.replayed === true,
        leaseId: data.lease_id,
      };
    },
    async finishInvitation(requestId, leaseId, sent, errorMessage) {
      const { error } = await serviceClient.rpc('complete_beta_invitation', {
        p_request_id: requestId,
        p_lease_id: leaseId,
        p_sent: sent,
        p_error: errorMessage,
      });
      if (error) throw new Error(error.message);
    },
    async withdrawApplication(applicationId, requestId) {
      const { data, error } = await serviceClient.rpc('prepare_beta_withdrawal', {
        p_application_id: applicationId,
        p_request_id: requestId,
      });
      if (error) throw new Error(error.message);
      if (data.replayed) return;
      try {
        if (data.user_id) {
          // Der Widerruf sperrt den Beta-Zugang bereits. Die Auth-Löschung prüft
          // erneut, ob das Konto inzwischen verwendet wird, und beendet die Sitzungen.
          const { error: deleteError } = await serviceClient.auth.admin.deleteUser(data.user_id);
          if (deleteError && deleteError.status !== 404) throw new Error(deleteError.message);
        }
        const { error: finishError } = await serviceClient.rpc('complete_beta_withdrawal', {
          p_request_id: requestId,
          p_lease_id: data.lease_id,
        });
        if (finishError) throw new Error(finishError.message);
      } catch (error) {
        await serviceClient.rpc('fail_beta_lifecycle_operation', {
          p_request_id: requestId,
          p_lease_id: data.lease_id,
        });
        await serviceClient
          .from('beta_applications')
          .update({ withdrawal_status: 'failed', withdrawal_last_error: boundedError(error) })
          .eq('id', applicationId);
        throw error;
      }
    },
    async changeDuration(token, applicationId, requestId, action, days) {
      const { error } = await userClient(token).rpc('change_beta_duration', {
        p_application_id: applicationId,
        p_request_id: requestId,
        p_action: action,
        p_days: days,
      });
      if (error) throw new Error(error.message);
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
    siteUrl: betaAppUrl(),
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
