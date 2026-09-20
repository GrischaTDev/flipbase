export type BetaApplicationStatus = 'open' | 'accepted' | 'rejected';
export type BetaEmailStatus = 'pending' | 'sent' | 'failed';
export type BetaInvitationStatus = 'not_sent' | 'sending' | 'sent' | 'failed';
export type BetaRejectionEmailStatus = 'not_sent' | 'sending' | 'sent' | 'failed';
export type BetaAccessStatus = 'pending' | 'active' | 'expired' | 'suspended';

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
  rejectionEmailStatus: BetaRejectionEmailStatus;
  rejectionEmailSentAt: string | null;
  rejectionEmailLastError: string | null;
  registeredAt: string | null;
  licenseStatus: BetaAccessStatus | null;
  betaEndsAt: string | null;
}

/** Vorgabe fuer neue Beta-Freigaben; im Annahmedialog anpassbar. */
export const DEFAULT_GRANTED_DAYS = 60;
