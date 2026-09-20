import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  BetaApplication,
  BetaApplicationStatus,
  BetaEmailStatus,
  BetaInvitationStatus,
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
  auth_user_id: string | null;
  invitation_status: string;
  invitation_sent_at: string | null;
  invitation_last_error: string | null;
  registered_at: string | null;
}

type BetaInviteActionBody =
  | { applicationId: string; action: 'accept'; grantedDays: number }
  | { applicationId: string; action: 'reject' | 'resend' | 'resend_receipt' };

const APPLICATION_FIELDS =
  'id, first_name, last_name, email, status, granted_days, decision_note, decided_at, created_at, receipt_email_status, receipt_email_sent_at, receipt_email_last_error, auth_user_id, invitation_status, invitation_sent_at, invitation_last_error, registered_at';

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

  /** Bleibt bis zur Umstellung der Verwaltungsseite als kompatibler Aufruf erhalten. */
  async decide(
    id: string,
    status: Exclude<BetaApplicationStatus, 'open'>,
    grantedDays: number | null,
    _note: string | null,
  ): Promise<void> {
    if (status === 'accepted') {
      await this.accept(id, grantedDays ?? 60);
      return;
    }
    await this.reject(id);
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
      authUserId: row.auth_user_id,
      invitationStatus: row.invitation_status as BetaInvitationStatus,
      invitationSentAt: row.invitation_sent_at,
      invitationLastError: row.invitation_last_error,
      registeredAt: row.registered_at,
    };
  }
}
