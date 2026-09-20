import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { PlatformUser, WorkspaceLicenseStatus } from '../models/platform-user.model';
import { BetaApplicationStatus, BetaInvitationStatus } from '../models/beta-application.model';

interface PlatformUserRow {
  readonly user_id: string;
  readonly full_name: string;
  readonly email: string;
  readonly workspace_id: string | null;
  readonly workspace_name: string | null;
  readonly application_status: string | null;
  readonly invitation_status: string | null;
  readonly registered_at: string | null;
  readonly license_status: string | null;
  readonly beta_starts_at: string | null;
  readonly beta_ends_at: string | null;
}

@Injectable({ providedIn: 'root' })
export class PlatformUserService {
  private readonly supabase = inject(SupabaseService);

  async list(): Promise<readonly PlatformUser[]> {
    const { data, error } = await this.supabase.client.rpc('list_platform_users');
    if (error) throw new Error(error.message);

    return ((data ?? []) as PlatformUserRow[]).map((row) => ({
      userId: row.user_id,
      fullName: row.full_name,
      email: row.email,
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      applicationStatus: row.application_status as BetaApplicationStatus | null,
      invitationStatus: row.invitation_status as BetaInvitationStatus | null,
      registeredAt: row.registered_at,
      licenseStatus: row.license_status as WorkspaceLicenseStatus | null,
      betaStartsAt: row.beta_starts_at,
      betaEndsAt: row.beta_ends_at,
    }));
  }
}
