import { parseVintedListingDraft, type VintedListingDraft } from './vinted-listing-draft';
import { parseVintedListingJob, type VintedListingJob } from './vinted-listing-job';

export interface VintedRelistingPlanRecord {
  readonly job: VintedListingJob;
  readonly draft: VintedListingDraft;
}

export function parseVintedRelistingPlan(
  value: unknown,
  workspaceId: string,
  connectionId: string,
): VintedRelistingPlanRecord {
  const invalid = (): never => {
    throw new Error('Die geplanten Inseratangaben konnten nicht sicher zugeordnet werden.');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const data = value as Record<string, unknown>;
  const job = parseVintedListingJob(data['job'], workspaceId);
  const draft = parseVintedListingDraft(data['draft'], workspaceId, job.draftId);
  if (
    job.connectionId !== connectionId ||
    draft.connectionId !== connectionId ||
    draft.revision !== job.draftRevision ||
    !job.relistExternalId ||
    draft.relistExternalId !== job.relistExternalId ||
    (job.itemTitle !== undefined && draft.content.title !== job.itemTitle)
  )
    return invalid();
  return { job, draft };
}
