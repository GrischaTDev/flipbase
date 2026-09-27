import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  BetaAccessStatus,
  BetaApplication,
  BetaApplicationStatus,
  BetaEmailStatus,
  BetaInvitationStatus,
  BetaRejectionEmailStatus,
} from '../models/beta-application.model';

interface BetaApplicationRow {
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
  workspace_licenses?:
    | { status: string; ends_at: string | null }
    | { status: string; ends_at: string | null }[]
    | null;
}

type BetaInviteActionBody =
  | { applicationId: string; action: 'accept'; grantedDays: number }
  | {
      applicationId: string;
      action:
        | 'reject'
        | 'resend'
        | 'resend_receipt'
        | 'resend_operator_notice'
        | 'resend_rejection'
        | 'delete_rejected';
    };

const APPLICATION_FIELDS =
  'id, first_name, last_name, email, status, granted_days, decision_note, decided_at, created_at, receipt_email_status, receipt_email_sent_at, receipt_email_last_error, operator_email_status, operator_email_sent_at, operator_email_last_error, auth_user_id, invitation_status, invitation_sent_at, invitation_last_error, rejection_email_status, rejection_email_sent_at, rejection_email_last_error, registered_at, workspace_licenses(status, ends_at)';

/** Liest Bewerbungen und fuehrt Entscheidungen nur ueber die geschuetzte Edge Function aus. */
@Injectable({ providedIn: 'root' })
export class BetaApplicationService {
  private readonly supabase = inject(SupabaseService);

  async list(): Promise<BetaApplication[]> {
    const { data, error } = await this.supabase.client
      .from('beta_applications')
      .select(APPLICATION_FIELDS)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.mapRow(row as BetaApplicationRow));
  }

  accept(id: string, grantedDays: number): Promise<BetaApplication> {
    return this.invokeAction({ applicationId: id, grantedDays, action: 'accept' });
  }

  reject(id: string): Promise<BetaApplication> {
    return this.invokeAction({ applicationId: id, action: 'reject' });
  }

  resendInvitation(id: string): Promise<BetaApplication> {
    return this.invokeAction({ applicationId: id, action: 'resend' });
  }

  resendApplicationReceipt(id: string): Promise<BetaApplication> {
    return this.invokeAction({ applicationId: id, action: 'resend_receipt' });
  }

  resendOperatorNotice(id: string): Promise<BetaApplication> {
    return this.invokeAction({ applicationId: id, action: 'resend_operator_notice' });
  }

  resendRejection(id: string): Promise<BetaApplication> {
    return this.invokeAction({ applicationId: id, action: 'resend_rejection' });
  }

  async deleteRejected(id: string): Promise<void> {
    const { data, error } = await this.supabase.client.functions.invoke('beta-invite', {
      body: { applicationId: id, action: 'delete_rejected' },
    });
    if (error) {
      throw new Error(error.message || 'Die Beta-Bewerbung konnte nicht gelöscht werden.');
    }
    if ((data as { deletedApplicationId?: unknown } | null)?.deletedApplicationId !== id) {
      throw new Error('Der Server hat das Löschen der Beta-Bewerbung nicht bestätigt.');
    }
  }

  private async invokeAction(body: BetaInviteActionBody): Promise<BetaApplication> {
    const { data, error } = await this.supabase.client.functions.invoke('beta-invite', { body });
    if (error) {
      throw new Error(error.message || 'Die Beta-Bewerbung konnte nicht verarbeitet werden.');
    }

    const application = (data as { application?: unknown } | null)?.application;
    if (!application || typeof application !== 'object') {
      throw new Error('Die Serverantwort enthaelt keine Beta-Bewerbung.');
    }
    return this.mapRow(application as BetaApplicationRow);
  }

  private mapRow(row: BetaApplicationRow): BetaApplication {
    const embeddedLicense = Array.isArray(row.workspace_licenses)
      ? (row.workspace_licenses[0] ?? null)
      : row.workspace_licenses;
    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      status: row.status as BetaApplicationStatus,
      grantedDays: row.granted_days,
      decisionNote: row.decision_note,
      decidedAt: row.decided_at,
      createdAt: row.created_at,
      receiptEmailStatus: row.receipt_email_status as BetaEmailStatus,
      receiptEmailSentAt: row.receipt_email_sent_at,
      receiptEmailLastError: row.receipt_email_last_error,
      operatorEmailStatus: row.operator_email_status as BetaEmailStatus,
      operatorEmailSentAt: row.operator_email_sent_at,
      operatorEmailLastError: row.operator_email_last_error,
      authUserId: row.auth_user_id,
      invitationStatus: row.invitation_status as BetaInvitationStatus,
      invitationSentAt: row.invitation_sent_at,
      invitationLastError: row.invitation_last_error,
      rejectionEmailStatus: row.rejection_email_status as BetaRejectionEmailStatus,
      rejectionEmailSentAt: row.rejection_email_sent_at,
      rejectionEmailLastError: row.rejection_email_last_error,
      registeredAt: row.registered_at,
      licenseStatus: (embeddedLicense?.status as BetaAccessStatus | undefined) ?? null,
      betaEndsAt: embeddedLicense?.ends_at ?? null,
    };
  }
}
