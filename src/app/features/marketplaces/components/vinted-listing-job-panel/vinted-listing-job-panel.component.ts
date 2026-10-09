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

@Component({
  selector: 'app-vinted-listing-job-panel',
  templateUrl: './vinted-listing-job-panel.component.html',
  imports: [ButtonComponent, CardComponent, NoticeBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedListingJobPanelComponent {
  readonly workspaceId = input.required<string>();
  readonly draftId = input.required<string>();
  readonly draftRevision = input.required<number>();
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly store = inject(MarketplaceAccountStore);
  private readonly api = inject(VintedListingJobService);
  readonly jobs = signal<readonly VintedListingJob[]>([]);
  readonly loading = signal(false);
  readonly cancelling = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly announcement = signal('');
  private generation = 0;
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
      const key = this.context();
      untracked(() => {
        this.generation++;
        this.jobs.set([]);
        this.loading.set(false);
        this.cancelling.set(null);
        this.error.set(null);
        this.announcement.set('');
        if (key) void this.refresh();
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
    });
  }
  async refresh(): Promise<void> {
    const key = this.context(),
      generation = this.generation;
    if (!key || this.loading() || this.cancelling()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const jobs = await this.api.list(this.workspaceId(), this.draftId());
      if (this.current(key, generation)) this.jobs.set(jobs);
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
