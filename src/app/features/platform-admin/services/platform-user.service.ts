import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  PlatformUser,
  PlatformUserActionType,
  PlatformUserRecentAction,
  WorkspaceLicenseStatus,
} from '../models/platform-user.model';
import { BetaApplicationStatus, BetaInvitationStatus } from '../models/beta-application.model';

@Injectable({ providedIn: 'root' })
export class PlatformUserService {
  private readonly supabase = inject(SupabaseService);

  async list(): Promise<readonly PlatformUser[]> {
    const { data, error } = await this.supabase.client.rpc('list_platform_user_usage');
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
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
      lastSignInAt: row.last_sign_in_at,
      lastActionAt: row.last_action_at,
      purchasesCreated30Days: row.purchases_created_30_days,
      salesRecorded30Days: row.sales_recorded_30_days,
    }));
  }

  async listRecentActions(userId: string): Promise<readonly PlatformUserRecentAction[]> {
    const { data, error } = await this.supabase.client.rpc('list_platform_user_recent_actions', {
      p_user_id: userId,
    });
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      eventId: row.event_id,
      eventType: row.event_type as PlatformUserActionType,
      createdAt: row.created_at,
    }));
  }
}
