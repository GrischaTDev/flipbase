import type { BetaApplicationStatus, BetaInvitationStatus } from './beta-application.model';

export type WorkspaceLicenseStatus = 'pending' | 'active' | 'expired' | 'suspended';

export interface PlatformUser {
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
}
