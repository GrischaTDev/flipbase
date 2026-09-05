export type BetaApplicationStatus = 'open' | 'accepted' | 'rejected';

export interface BetaApplication {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: BetaApplicationStatus;
  grantedDays: number | null;
  decisionNote: string | null;
  createdAt: string;
}

/** Vorgabe laut Entwurf: sechs Monate. */
export const DEFAULT_GRANTED_DAYS = 180;
