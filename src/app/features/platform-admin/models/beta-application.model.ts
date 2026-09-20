export type BetaApplicationStatus = 'open' | 'accepted' | 'rejected';
export type BetaEmailStatus = 'pending' | 'sent' | 'failed';
export type BetaInvitationStatus = 'not_sent' | 'sending' | 'sent' | 'failed';

export interface BetaApplication {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: BetaApplicationStatus;
  grantedDays: number | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  receiptEmailStatus: BetaEmailStatus;
  receiptEmailSentAt: string | null;
  receiptEmailLastError: string | null;
  authUserId: string | null;
  invitationStatus: BetaInvitationStatus;
  invitationSentAt: string | null;
  invitationLastError: string | null;
  registeredAt: string | null;
}

/** Vorgabe fuer neue Beta-Freigaben; im Annahmedialog anpassbar. */
export const DEFAULT_GRANTED_DAYS = 60;
