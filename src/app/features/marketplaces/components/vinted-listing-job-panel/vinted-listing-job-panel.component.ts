import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedListingJobService } from '../../services/vinted-listing-job.service';
import { vintedListingJobLabel, type VintedListingJob } from '../../models/vinted-listing-job';
import type { VintedListingDraft } from '../../models/vinted-listing-draft';
import {
  VintedListingScheduleDialogComponent,
  type VintedListingScheduleSelection,
} from '../vinted-listing-schedule-dialog/vinted-listing-schedule-dialog.component';

@Component({
  selector: 'app-vinted-listing-job-panel',
  templateUrl: './vinted-listing-job-panel.component.html',
  imports: [
    ButtonComponent,
    CardComponent,
    NoticeBannerComponent,
    VintedListingScheduleDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedListingJobPanelComponent {
  readonly workspaceId = input.required<string>();
  readonly draftId = input.required<string>();
  readonly draftRevision = input.required<number>();
  readonly draft = input<VintedListingDraft | null>(null);
  readonly draftReady = input(false);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly store = inject(MarketplaceAccountStore);
  private readonly api = inject(VintedListingJobService);
  readonly jobs = signal<readonly VintedListingJob[]>([]);
  readonly loading = signal(false);
  readonly cancelling = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly announcement = signal('');
  readonly planning = signal<{
    readonly job: VintedListingJob;
    readonly draft: VintedListingDraft;
    readonly initial: VintedListingScheduleSelection;
  } | null>(null);
  readonly planningBusy = signal(false);
  readonly planningError = signal<string | null>(null);
  private lastPlanningRequest: { readonly key: string; readonly requestId: string } | null = null;
  private generation = 0;
  private readonly refreshRequested = signal(false);
  private readonly context = computed(() => {
    const user = this.auth.currentUser(),
      workspace = this.workspace.currentWorkspace();
    return user &&
      workspace &&
      !workspace.archived_at &&
      workspace.id === this.workspaceId() &&
      this.store.canManage()
      ? JSON.stringify([user.id, workspace.id, this.draftId()])
      : null;
  });
  readonly available = computed(() => this.context() !== null);
  readonly entries = computed(() =>
    this.jobs().map((job) => ({
      job,
      label: vintedListingJobLabel(job),
      changed:
        job.draftRevision !== this.draftRevision() &&
        ['queued', 'paused', 'claimed', 'writing', 'outcome_unknown'].includes(job.state),
      cancellable: ['queued', 'paused'].includes(job.state),
      reschedulable: this.planCompatible(job),
      time: this.formatTime(job),
      reason: this.reason(job),
      url:
        job.externalId && job.providerState !== 'draft'
          ? 'https://www.vinted.de/items/' + job.externalId
          : null,
    })),
  );
  constructor() {
    effect(() => {
      const token = this.auth.session()?.access_token;
      if (token) untracked(() => this.api.authenticate(token));
    });
    effect((onCleanup) => {
      const key = this.context();
      untracked(() => {
        this.generation++;
        this.refreshRequested.set(false);
        this.jobs.set([]);
        this.loading.set(false);
        this.cancelling.set(null);
        this.error.set(null);
        this.announcement.set('');
        this.planning.set(null);
        this.planningBusy.set(false);
        this.planningError.set(null);
        this.lastPlanningRequest = null;
        if (key) {
          const generation = this.generation;
          const requestRefresh = () => {
            if (this.current(key, generation)) this.refreshRequested.set(true);
          };
          try {
            onCleanup(
              this.api.listen(this.workspaceId(), this.draftId(), requestRefresh, requestRefresh),
            );
          } catch {
            // Der manuelle Abruf bleibt bei einer fehlenden Live-Verbindung verfügbar.
          }
          void this.refresh();
        }
      });
    });
    effect(() => {
      if (
        this.refreshRequested() &&
        this.context() &&
        !this.loading() &&
        !this.cancelling() &&
        !this.planning() &&
        !this.planningBusy()
      ) {
        untracked(() => {
          void this.refresh();
        });
      }
    });
    effect(() => {
      const plan = this.planning(),
        draft = this.draft(),
        ready = this.draftReady();
      if (
        plan &&
        (!ready ||
          !draft ||
          draft.revision !== plan.draft.revision ||
          draft.connectionId !== plan.draft.connectionId ||
          draft.id !== plan.draft.id ||
          draft.workspaceId !== plan.draft.workspaceId)
      ) {
        this.planning.set(null);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
    });
  }
  async refresh(): Promise<void> {
    const key = this.context(),
      generation = this.generation;
    if (!key || this.loading() || this.cancelling() || this.planning() || this.planningBusy())
      return;
    this.loading.set(true);
    this.refreshRequested.set(false);
    this.error.set(null);
    try {
      const jobs = await this.api.list(this.workspaceId(), this.draftId());
      if (this.current(key, generation)) {
        const previous = this.jobs();
        if (
          previous.length &&
          jobs.some((job) => {
            const before = previous.find((entry) => entry.id === job.id);
            return !before || before.state !== job.state || before.errorCode !== job.errorCode;
          })
        )
          this.announcement.set('Der Auftragsverlauf wurde aktualisiert.');
        this.jobs.set(jobs);
      }
    } catch {
      if (this.current(key, generation))
        this.error.set('Der Verlauf konnte nicht geladen werden. Bitte aktualisiere ihn erneut.');
    } finally {
      if (this.current(key, generation)) this.loading.set(false);
    }
  }
  async cancelJob(job: VintedListingJob): Promise<void> {
    const key = this.context(),
      generation = this.generation;
    const current = this.jobs().find(
      (entry) => entry.id === job.id && entry.version === job.version,
    );
    if (
      !key ||
      this.loading() ||
      this.cancelling() ||
      this.planning() ||
      this.planningBusy() ||
      !current ||
      !['queued', 'paused'].includes(current.state)
    )
      return;
    this.cancelling.set(current.id);
    this.error.set(null);
    try {
      const cancelled = await this.api.cancel(current);
      if (this.current(key, generation)) {
        this.jobs.update((jobs) =>
          jobs.map((entry) => (entry.id === cancelled.id ? cancelled : entry)),
        );
        this.announcement.set('Der wartende Auftrag wurde abgebrochen.');
      }
    } catch {
      if (this.current(key, generation))
        this.error.set(
          'Der Auftrag konnte nicht abgebrochen werden. Bitte aktualisiere den Verlauf; möglicherweise hat die Vorbereitung bereits begonnen.',
        );
    } finally {
      if (this.current(key, generation)) this.cancelling.set(null);
    }
  }
  openPlan(job: VintedListingJob): void {
    const current = this.jobs().find(
      (entry) => entry.id === job.id && entry.version === job.version,
    );
    const draft = this.draft();
    if (
      !this.context() ||
      !current ||
      !draft ||
      !this.draftReady() ||
      this.loading() ||
      this.cancelling() ||
      this.planningBusy() ||
      this.planning() ||
      !this.planCompatible(current)
    )
      return;
    this.planningError.set(null);
    this.planning.set({
      job: current,
      draft,
      initial: {
        scheduledAt: current.scheduledAt!,
        timeZone: current.timeZone!,
        latePolicy: current.latePolicy,
      },
    });
  }
  closePlan(): void {
    if (!this.planningBusy()) this.planning.set(null);
  }
  async reschedule(schedule: VintedListingScheduleSelection): Promise<void> {
    const plan = this.planning(),
      key = this.context(),
      generation = this.generation;
    if (
      !plan ||
      !key ||
      !this.draftReady() ||
      this.planningBusy() ||
      this.draft()?.revision !== plan.draft.revision ||
      !this.planCompatible(plan.job) ||
      !this.jobs().some((job) => job.id === plan.job.id && job.version === plan.job.version)
    )
      return;
    const requestKey = JSON.stringify([
      key,
      plan.job.id,
      plan.job.version,
      plan.draft.revision,
      schedule.scheduledAt,
      schedule.timeZone,
      schedule.latePolicy,
    ]);
    if (this.lastPlanningRequest?.key !== requestKey)
      this.lastPlanningRequest = { key: requestKey, requestId: crypto.randomUUID() };
    const requestId = this.lastPlanningRequest.requestId;
    this.planningBusy.set(true);
    this.planningError.set(null);
    try {
      const next = await this.api.reschedule(plan.job, plan.draft, requestId, schedule);
      if (this.current(key, generation)) {
        this.jobs.update((jobs) => [
          next,
          ...jobs
            .filter((job) => job.id !== next.id)
            .map((job) =>
              job.id === plan.job.id
                ? { ...job, state: 'cancelled' as const, version: job.version + 1 }
                : job,
            ),
        ]);
        this.planning.set(null);
        this.announcement.set(
          'Der neue Termin wurde gespeichert. Der bisherige Auftrag wurde aufgehoben.',
        );
      }
    } catch {
      if (this.current(key, generation))
        this.planningError.set(
          'Die Planung konnte nicht bestätigt werden. Wiederhole dieselben Angaben oder schließe den Dialog und aktualisiere den Verlauf.',
        );
    } finally {
      if (this.current(key, generation)) this.planningBusy.set(false);
    }
  }
  private planCompatible(job: VintedListingJob): boolean {
    const draft = this.draft();
    return (
      !!draft &&
      !!draft.connectionId &&
      draft.id === job.draftId &&
      draft.workspaceId === job.workspaceId &&
      draft.connectionId === job.connectionId &&
      !!job.scheduledAt &&
      !!job.timeZone &&
      ['queued', 'paused'].includes(job.state)
    );
  }
  private current(key: string, generation: number): boolean {
    return generation === this.generation && key === this.context();
  }
  private formatTime(job: VintedListingJob): string {
    const timeZone = job.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    return (
      new Intl.DateTimeFormat('de-DE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
        timeZone,
      }).format(new Date(job.scheduledAt ?? job.createdAt)) +
      ' (' +
      timeZone +
      ')'
    );
  }
  private reason(job: VintedListingJob): string {
    if (job.state === 'outcome_unknown')
      return 'Die Anbieterantwort fehlt. Prüfe den Artikel bei Vinted. Nicht erneut veröffentlichen, solange der Ausgang unklar ist.';
    if (job.errorCode === 'schedule_late')
      return 'Der Termin wurde um mehr als 30 Minuten verpasst. Die Veröffentlichung ist angehalten.';
    if (job.errorCode === 'authorization_revoked' || job.errorCode === 'connection_changed')
      return 'Die Konto- oder Ausführungsfreigabe ist nicht mehr gültig.';
    if (job.state === 'failed') return 'Der Versuch wurde ohne bestätigten Anbietererfolg beendet.';
    if (job.state === 'queued')
      return job.executionMode === 'local'
        ? 'Wartet auf den Termin und die verbundene Erweiterung.'
        : 'Wartet auf den Termin und die verfügbare Cloud-Ausführung.';
    return '';
  }
}
