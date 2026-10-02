import type { BetaApplicationStatus, BetaInvitationStatus } from './beta-application.model';

export type WorkspaceLicenseStatus = 'pending' | 'active' | 'expired' | 'suspended';

export interface PlatformUser {
  readonly applicationId?: string | null;
  readonly invitationExpiresAt?: string | null;
  readonly revokedAt?: string | null;
  readonly betaEndedAt?: string | null;
  readonly userId: string;
  readonly fullName: string;
  readonly email: string;
  readonly workspaceId: string | null;
  readonly workspaceName: string | null;
  readonly applicationStatus: BetaApplicationStatus | null;
  readonly invitationStatus: BetaInvitationStatus | null;
  readonly registeredAt: string | null;
  readonly licenseStatus: WorkspaceLicenseStatus | null;
  readonly betaStartsAt: string | null;
  readonly betaEndsAt: string | null;
  readonly lastSignInAt: string | null;
  readonly lastActionAt: string | null;
  readonly purchasesCreated30Days: number;
  readonly salesRecorded30Days: number;
}

export type PlatformUserActionType =
  'purchase_draft_created' | 'purchase_finalized' | 'sale_recorded';

export interface PlatformUserRecentAction {
  readonly eventId: string;
  readonly eventType: PlatformUserActionType;
  readonly createdAt: string;
}
