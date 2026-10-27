import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import type { VintedListingDraft } from '../../models/vinted-listing-draft';
import { vintedListingJobLabel, type VintedListingJob } from '../../models/vinted-listing-job';
import type { VintedListingActionEntry } from '../../services/vinted-action-overview-header.store';
import { VintedActionOverviewHeaderStore } from '../../services/vinted-action-overview-header.store';
import { VintedListingDraftService } from '../../services/vinted-listing-draft.service';
import { VintedListingJobService } from '../../services/vinted-listing-job.service';
import {
  VintedListingScheduleDialogComponent,
  type VintedListingScheduleSelection,
} from '../vinted-listing-schedule-dialog/vinted-listing-schedule-dialog.component';

@Component({
  selector: 'app-vinted-listing-action-overview',
  templateUrl: './vinted-listing-action-overview.component.html',
  imports: [ButtonComponent, NoticeBannerComponent, VintedListingScheduleDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedListingActionOverviewComponent {
  readonly entries = input.required<readonly VintedListingActionEntry[]>();
  private readonly jobsApi = inject(VintedListingJobService);
  private readonly draftsApi = inject(VintedListingDraftService);
  private readonly overview = inject(VintedActionOverviewHeaderStore);
  readonly busy = signal<string | null>(null);
  readonly loadingPlan = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly planningError = signal<string | null>(null);
  readonly planning = signal<{ job: VintedListingJob; draft: VintedListingDraft } | null>(null);
  private lastRequest: { key: string; id: string } | null = null;

  readonly rows = computed(() =>
    this.entries().map(({ job, accountName }) => ({
      job,
      accountName,
      label: vintedListingJobLabel(job),
      time: new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: job.timeZone ?? 'Europe/Berlin',
      }).format(new Date(job.scheduledAt ?? job.updatedAt)),
      planned: !!job.scheduledAt && ['queued', 'paused'].includes(job.state),
      cancellable: ['queued', 'paused'].includes(job.state),
      url:
        job.externalId && job.providerState !== 'draft'
          ? 'https://www.vinted.de/items/' + job.externalId
          : null,
    })),
  );
  readonly planInitial = computed<VintedListingScheduleSelection | null>(() => {
    const job = this.planning()?.job;
    return job?.scheduledAt && job.timeZone
      ? { scheduledAt: job.scheduledAt, timeZone: job.timeZone, latePolicy: job.latePolicy }
      : null;
  });
  private current(job: VintedListingJob): boolean {
    return (
      !!this.overview.context() &&
      this.entries().some(({ job: value }) => value.id === job.id && value.version === job.version)
    );
  }
  async cancel(job: VintedListingJob): Promise<void> {
    if (
      !this.current(job) ||
      !['queued', 'paused'].includes(job.state) ||
      this.busy() ||
      this.planning()
    )
      return;
    const context = this.overview.context();
    this.busy.set(job.id);
    this.error.set(null);
    try {
      await this.jobsApi.cancel(job);
      if (context === this.overview.context()) await this.overview.refresh();
    } catch {
      if (context === this.overview.context())
        this.error.set(
          'Der Auftrag konnte nicht abgebrochen werden. Bitte aktualisiere den Status.',
        );
    } finally {
      this.busy.set(null);
    }
  }
  async openPlan(job: VintedListingJob): Promise<void> {
    if (
      !this.current(job) ||
      !job.scheduledAt ||
      !job.timeZone ||
      !['queued', 'paused'].includes(job.state) ||
      this.busy() ||
      this.loadingPlan() ||
      this.planning()
    )
      return;
    const context = this.overview.context();
    this.error.set(null);
    this.loadingPlan.set(job.id);
    try {
      const draft = await this.draftsApi.load(job.workspaceId, job.draftId);
      if (context !== this.overview.context() || !this.current(job)) return;
      if (draft.workspaceId !== job.workspaceId || draft.connectionId !== job.connectionId)
        throw new Error('Der Entwurf gehört nicht zum geplanten Auftrag.');
      this.lastRequest = null;
      this.planning.set({ job, draft });
    } catch {
      if (context === this.overview.context())
        this.error.set(
          'Die Planung kann nicht geladen werden. Öffne den Entwurf und prüfe den Status.',
        );
    } finally {
      this.loadingPlan.set(null);
    }
  }
  closePlan(): void {
    if (!this.busy()) this.planning.set(null);
  }
  async reschedule(schedule: VintedListingScheduleSelection): Promise<void> {
    const plan = this.planning();
    if (!plan || !this.current(plan.job) || this.busy()) return;
    const context = this.overview.context();
    const key = JSON.stringify([
      context,
      plan.job.id,
      plan.job.version,
      plan.draft.revision,
      schedule.scheduledAt,
      schedule.timeZone,
      schedule.latePolicy,
    ]);
    if (this.lastRequest?.key !== key)
      this.lastRequest = { key, id: crypto.randomUUID() };
    this.busy.set(plan.job.id);
    this.planningError.set(null);
    try {
      await this.jobsApi.reschedule(plan.job, plan.draft, this.lastRequest.id, schedule);
      if (context !== this.overview.context()) return;
      this.planning.set(null);
      await this.overview.refresh();
    } catch {
      if (context === this.overview.context())
        this.planningError.set(
          'Der neue Termin konnte nicht bestätigt werden. Versuche denselben Termin erneut oder aktualisiere den Auftragsstatus.',
        );
    } finally {
      this.busy.set(null);
    }
  }
}
