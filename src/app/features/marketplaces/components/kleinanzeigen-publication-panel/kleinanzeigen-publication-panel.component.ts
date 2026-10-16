import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { KleinanzeigenExtensionBridge } from '../../services/kleinanzeigen-extension-bridge';
import {
  KleinanzeigenListingJobService,
  type KleinanzeigenListingJobScope,
} from '../../services/kleinanzeigen-listing-job.service';
import {
  kleinanzeigenJobStatus,
  kleinanzeigenJobIssue,
  type KleinanzeigenListingJob,
} from '../../models/kleinanzeigen-listing-job';
@Component({
  selector: 'app-kleinanzeigen-publication-panel',
  imports: [ButtonComponent, NoticeBannerComponent],
  providers: [KleinanzeigenListingJobService],
  templateUrl: './kleinanzeigen-publication-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KleinanzeigenPublicationPanelComponent {
  readonly scope = input<KleinanzeigenListingJobScope | null>(null);
  readonly draftId = input.required<string>();
  readonly revision = input.required<number>();
  readonly unsaved = input(false);
  readonly issues = input<readonly string[]>([]);
  readonly published = input(false);
  readonly publicationAllowed = input(true);
  readonly confirmed = output<KleinanzeigenListingJob>();
  readonly jobs = inject(KleinanzeigenListingJobService);
  readonly extension = inject(KleinanzeigenExtensionBridge);
  readonly localError = signal<string | null>(null);
  private requestId = crypto.randomUUID();
  private emittedConfirmation: string | null = null;
  readonly status = computed(() => {
    const job = this.jobs.job();
    return job
      ? kleinanzeigenJobStatus(job)
      : this.published()
        ? 'Bereits bei Kleinanzeigen veröffentlicht'
        : 'Entwurf gespeichert';
  });
  readonly issue = computed(() => kleinanzeigenJobIssue(this.jobs.job()?.errorCode ?? null));
  readonly hasUnresolvedJob = computed(() => {
    const state = this.jobs.job()?.state;
    return !!state && ['queued', 'claimed', 'writing', 'outcome_unknown'].includes(state);
  });
  readonly canPublish = computed(
    () =>
      !!this.scope() &&
      this.publicationAllowed() &&
      !this.unsaved() &&
      !this.issues().length &&
      !this.published() &&
      !this.hasUnresolvedJob() &&
      this.jobs.job()?.state !== 'confirmed' &&
      !this.jobs.busy() &&
      this.extension.capabilities().publish &&
      this.extension.quotaAvailable(),
  );
  constructor() {
    effect(() => {
      const job = this.jobs.job();
      const id = this.draftId();
      if (job?.state === 'confirmed' && job.draftId === id) {
        const key = job.workspaceId + ':' + job.id + ':' + job.verifiedAt;
        if (key !== this.emittedConfirmation) {
          this.emittedConfirmation = key;
          untracked(() => this.confirmed.emit(job));
        }
      }
    });

    effect(() => {
      const scope = this.scope();
      const id = this.draftId();
      untracked(() => {
        this.jobs.cancel();
        this.localError.set(null);
        this.requestId = crypto.randomUUID();
        if (scope && id)
          void this.jobs
            .latest(scope, id)
            .catch((error) => this.localError.set(this.message(error)));
      });
    });
  }
  async publish(): Promise<void> {
    const scope = this.scope();
    if (!scope || !this.canPublish()) return;
    this.localError.set(null);
    try {
      const result = await this.jobs.enqueue(
        scope,
        this.draftId(),
        this.revision(),
        this.requestId,
      );
      if (result && !['queued', 'claimed', 'writing', 'outcome_unknown'].includes(result.state))
        this.requestId = crypto.randomUUID();
    } catch (error) {
      this.localError.set(this.message(error));
    }
  }
  async check(): Promise<void> {
    const scope = this.scope();
    const job = this.jobs.job();
    if (!scope || !job || this.jobs.busy()) return;
    this.localError.set(null);
    try {
      const result = await this.jobs.reconcile(scope, job.id);
      void result;
    } catch (error) {
      this.localError.set(this.message(error));
    }
  }
  async resume(): Promise<void> {
    const scope = this.scope();
    const job = this.jobs.job();
    if (!scope || !job || !['queued', 'claimed'].includes(job.state) || this.jobs.busy()) return;
    this.localError.set(null);
    try {
      await this.jobs.enqueue(scope, this.draftId(), this.revision(), this.requestId);
    } catch (error) {
      this.localError.set(this.message(error));
    }
  }
  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Der Auftrag konnte nicht geprüft werden.';
  }
}
