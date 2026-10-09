import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  listingIdentifier,
  listingResponse,
  type VintedListingDraft,
} from '../models/vinted-listing-draft';
import {
  parseVintedListingJob,
  parseVintedListingPermission,
  type VintedListingJob,
  type VintedListingJobAction,
  type VintedListingPermission,
} from '../models/vinted-listing-job';
import type { VintedListingLatePolicy } from '../models/vinted-listing-schedule';

export interface VintedListingJobIntent {
  /** Für denselben Versuch behalten, auch wenn die Antwort verloren geht. */
  readonly requestId: string;
  readonly action: VintedListingJobAction;
  readonly aiPhoto: boolean;
  readonly schedule: {
    readonly scheduledAt: string;
    readonly timeZone: string;
    readonly latePolicy: VintedListingLatePolicy;
  } | null;
}
function invalid(): never {
  throw new Error(
    'Der Inseratauftrag passt nicht zu Deinen aktuellen Angaben. Lade den Verlauf erneut.',
  );
}
function intentArguments(intent: VintedListingJobIntent) {
  if (
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(intent.requestId) ||
    !['publish', 'vinted_draft'].includes(intent.action) ||
    typeof intent.aiPhoto !== 'boolean'
  )
    return invalid();
  return {
    p_action: intent.action,
    p_request_id: intent.requestId,
    p_ai_photo: intent.aiPhoto,
    ...(intent.schedule
      ? {
          p_scheduled_at: intent.schedule.scheduledAt,
          p_time_zone: intent.schedule.timeZone,
          p_late_policy: intent.schedule.latePolicy,
        }
      : {}),
  };
}
function accepted(
  value: unknown,
  draft: VintedListingDraft,
  intent: VintedListingJobIntent,
  replacesJobId: string | null,
): VintedListingJob {
  const result = parseVintedListingJob(value, draft.workspaceId, draft.id);
  if (
    result.draftRevision !== draft.revision ||
    result.action !== intent.action ||
    result.replacesJobId !== replacesJobId ||
    (result.connectionId !== null && result.connectionId !== draft.connectionId)
  )
    return invalid();
  if (
    intent.schedule
      ? result.scheduledAt === null ||
        Date.parse(result.scheduledAt) !== Date.parse(intent.schedule.scheduledAt) ||
        result.timeZone !== intent.schedule.timeZone ||
        result.latePolicy !== intent.schedule.latePolicy
      : result.scheduledAt !== null
  )
    return invalid();
  return result;
}

@Injectable({ providedIn: 'root' })
export class VintedListingJobService {
  private readonly client = inject(SupabaseService).client;
  async readPermission(
    workspaceId: string,
    connectionId: string,
  ): Promise<VintedListingPermission> {
    return parseVintedListingPermission(
      listingResponse(
        await this.client.rpc('marketplace_read_listing_permission', {
          p_workspace_id: workspaceId,
          p_connection_id: connectionId,
        }),
      ),
    );
  }
  async approve(
    workspaceId: string,
    connectionId: string,
    externalAccountId: string,
  ): Promise<VintedListingPermission> {
    return parseVintedListingPermission(
      listingResponse(
        await this.client.rpc('marketplace_approve_listings', {
          p_workspace_id: workspaceId,
          p_connection_id: connectionId,
          p_expected_external_account_id: externalAccountId,
        }),
      ),
    );
  }
  async revoke(
    workspaceId: string,
    connectionId: string,
    authorizationVersion: number,
  ): Promise<VintedListingPermission> {
    return parseVintedListingPermission(
      listingResponse(
        await this.client.rpc('marketplace_revoke_listings', {
          p_workspace_id: workspaceId,
          p_connection_id: connectionId,
          p_authorization_version: authorizationVersion,
        }),
      ),
    );
  }
  async list(workspaceId: string, draftId?: string): Promise<readonly VintedListingJob[]> {
    const result = listingResponse(
      await this.client.rpc('marketplace_read_listing_jobs', {
        p_workspace_id: workspaceId,
        ...(draftId ? { p_draft_id: listingIdentifier(draftId) } : {}),
      }),
    );
    if (!result || typeof result !== 'object' || Array.isArray(result)) return invalid();
    const items = (result as Record<string, unknown>)['items'];
    if (!Array.isArray(items) || items.length > 50) return invalid();
    const jobs = items.map((value) => parseVintedListingJob(value, workspaceId, draftId));
    if (new Set(jobs.map((job) => job.id)).size !== jobs.length) return invalid();
    return jobs;
  }
  async enqueue(
    draft: VintedListingDraft,
    intent: VintedListingJobIntent,
  ): Promise<VintedListingJob> {
    if (!draft.connectionId) return invalid();
    const result = listingResponse(
      await this.client.rpc('marketplace_enqueue_listing', {
        p_draft_id: listingIdentifier(draft.id),
        p_expected_revision: draft.revision,
        ...intentArguments(intent),
      }),
    );
    return accepted(result, draft, intent, null);
  }
  async replace(
    job: VintedListingJob,
    draft: VintedListingDraft,
    intent: VintedListingJobIntent,
  ): Promise<VintedListingJob> {
    if (
      !draft.connectionId ||
      !intent.schedule ||
      job.scheduledAt === null ||
      job.workspaceId !== draft.workspaceId ||
      job.draftId !== draft.id ||
      job.connectionId !== draft.connectionId ||
      !['queued', 'paused'].includes(job.state)
    )
      return invalid();
    const result = listingResponse(
      await this.client.rpc('marketplace_replace_planned_listing', {
        p_job_id: listingIdentifier(job.id),
        p_expected_version: job.version,
        p_expected_revision: draft.revision,
        ...intentArguments(intent),
        p_scheduled_at: intent.schedule.scheduledAt,
        p_time_zone: intent.schedule.timeZone,
      }),
    );
    return accepted(result, draft, intent, job.id);
  }
  async cancel(job: VintedListingJob): Promise<VintedListingJob> {
    const result = parseVintedListingJob(
      listingResponse(
        await this.client.rpc('marketplace_cancel_listing_job', {
          p_job_id: listingIdentifier(job.id),
          p_expected_version: job.version,
        }),
      ),
      job.workspaceId,
      job.draftId,
      job.id,
    );
    if (result.state !== 'cancelled') return invalid();
    return result;
  }
}
