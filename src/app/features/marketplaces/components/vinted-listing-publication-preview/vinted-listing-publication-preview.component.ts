import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { LucideX } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import type { ListingImageDraft } from '../../../../shared/components/listing-image-editor/listing-image-draft';
import { VintedBrandSearchService } from '../../../platform-admin/services/vinted-brand-search.service';
import type { VintedBrand } from '../../../platform-admin/models/vinted-brand.model';
import type { MarketplaceConnection } from '../../models/marketplace.models';
import type { VintedListingCategoryFields } from '../../models/vinted-listing-category-fields';
import type { VintedListingDraft } from '../../models/vinted-listing-draft';
import {
  vintedListingJobLabel,
  type VintedListingJob,
  type VintedListingPermission,
} from '../../models/vinted-listing-job';
import { reviewVintedListingPublication } from '../../models/vinted-listing-publication-review';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceBrowserTestApiService } from '../../services/marketplace-browser-test-api.service';
import { VintedListingCategoryService } from '../../services/vinted-listing-category.service';
import {
  VintedListingJobService,
  type VintedListingJobIntent,
} from '../../services/vinted-listing-job.service';
import {
  VintedListingScheduleDialogComponent,
  type VintedListingScheduleSelection,
} from '../vinted-listing-schedule-dialog/vinted-listing-schedule-dialog.component';

@Component({
  selector: 'app-vinted-listing-publication-preview',
  templateUrl: './vinted-listing-publication-preview.component.html',
  imports: [
    ButtonComponent,
    CustomCheckboxComponent,
    ModalShellComponent,
    NoticeBannerComponent,
    VintedListingScheduleDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedListingPublicationPreviewComponent {
  readonly scopeKey = input.required<string>();
  readonly userId = input.required<string>();
  readonly draft = input.required<VintedListingDraft>();
  readonly account = input.required<MarketplaceConnection>();
  readonly images = input<readonly ListingImageDraft[]>([]);
  readonly disabled = input(false);
  readonly accepted = output<VintedListingJob>();
  readonly closed = output<void>();
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly schema = signal<VintedListingCategoryFields | null>(null);
  readonly brands = signal<readonly VintedBrand[]>([]);
  readonly permission = signal<VintedListingPermission | null>(null);
  readonly runtimeEnabled = signal(false);
  readonly jobs = signal<readonly VintedListingJob[]>([]);
  readonly consent = signal(false);
  readonly aiPhoto = signal(false);
  readonly schedule = signal<VintedListingScheduleSelection | null>(null);
  readonly planning = signal(false);
  private readonly intent = signal<VintedListingJobIntent | null>(null);
  readonly intentLocked = computed(() => this.intent() !== null);
  readonly closeIcon = LucideX;
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly store = inject(MarketplaceAccountStore);
  private readonly categoryApi = inject(VintedListingCategoryService);
  private readonly brandApi = inject(VintedBrandSearchService);
  private readonly browserApi = inject(MarketplaceBrowserTestApiService);
  private readonly api = inject(VintedListingJobService);
  private readonly destroyRef = inject(DestroyRef);
  private loadedBinding: string | null = null;
  private generation = 0;
  private closing = false;
  private acceptedOnce = false;
  private readonly available = computed(() => {
    const user = this.auth.currentUser(),
      workspace = this.workspace.currentWorkspace(),
      account = this.account(),
      draft = this.draft();
    const current = this.store
      .connections()
      .find((value) => value.connectionId === account.connectionId);
    return (
      !!user &&
      user.id === this.userId() &&
      !!workspace &&
      !workspace.archived_at &&
      workspace.id === draft.workspaceId &&
      this.store.canManage() &&
      draft.connectionId === account.connectionId &&
      account.workspaceId === draft.workspaceId &&
      account.marketplace === 'vinted' &&
      account.executionMode === 'cloud' &&
      account.status === 'connected' &&
      /^[1-9][0-9]{0,31}$/.test(account.externalAccountId ?? '') &&
      !!current &&
      current.workspaceId === account.workspaceId &&
      current.marketplace === account.marketplace &&
      current.externalAccountId === account.externalAccountId &&
      current.status === account.status &&
      current.executionMode === account.executionMode
    );
  });
  private readonly binding = computed(() =>
    JSON.stringify([
      this.scopeKey(),
      this.userId(),
      this.auth.currentUser()?.id,
      this.workspace.currentWorkspace()?.id,
      this.available(),
      this.draft().id,
      this.draft().revision,
      this.draft().connectionId,
      this.account().connectionId,
      this.account().externalAccountId,
    ]),
  );
  readonly review = computed(() => {
    const schema = this.schema();
    return schema
      ? reviewVintedListingPublication(
          this.draft(),
          schema,
          this.brands(),
          this.intent()?.aiPhoto ?? this.aiPhoto(),
        )
      : null;
  });
  readonly blockedJob = computed(
    () =>
      this.jobs().find((job) =>
        ['queued', 'paused', 'claimed', 'writing', 'outcome_unknown', 'confirmed'].includes(
          job.state,
        ),
      ) ?? null,
  );
  readonly blockedLabel = computed(() =>
    this.blockedJob() ? vintedListingJobLabel(this.blockedJob()!) : '',
  );
  readonly canSubmit = computed(
    () =>
      this.available() &&
      !this.disabled() &&
      !this.loading() &&
      !this.busy() &&
      this.runtimeEnabled() &&
      this.review()?.ready === true &&
      !this.blockedJob() &&
      this.permission()?.executionMode === 'cloud' &&
      (this.permission()?.allowed === true || this.consent()),
  );
  readonly price = computed(() =>
    this.draft().content.priceCents === null
      ? 'Noch nicht festgelegt'
      : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
          this.draft().content.priceCents! / 100,
        ),
  );
  readonly packageLabel = computed(
    () =>
      this.schema()
        ?.fields.find((field) => field.field === 'package')
        ?.choices.find((choice) => choice.id === this.draft().content.packageSizeId)?.label ??
      'Noch nicht festgelegt',
  );
  readonly scheduleLabel = computed(() => {
    const value = this.schedule();
    return value
      ? new Intl.DateTimeFormat('de-DE', {
          timeZone: value.timeZone,
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(value.scheduledAt)) + ` (${value.timeZone})`
      : 'Sofort';
  });
  readonly submitLabel = computed(() =>
    this.intentLocked()
      ? 'Diesen Auftrag erneut prüfen'
      : this.permission()?.allowed
        ? this.schedule()
          ? 'Veröffentlichung planen'
          : 'Sofort beauftragen'
        : 'Freigeben und beauftragen',
  );

  constructor() {
    effect(() => {
      const binding = this.binding();
      untracked(() => {
        if (binding === this.loadedBinding) return;
        this.loadedBinding = binding;
        this.generation++;
        this.closing = false;
        this.acceptedOnce = false;
        this.loading.set(false);
        this.busy.set(false);
        this.intent.set(null);
        this.consent.set(false);
        this.aiPhoto.set(false);
        this.schedule.set(null);
        this.planning.set(false);
        void this.load();
      });
    });
    this.destroyRef.onDestroy(() => this.generation++);
  }
  async load(): Promise<void> {
    const binding = this.binding();
    if (
      !this.available() ||
      this.closing ||
      this.loading() ||
      this.busy() ||
      binding !== this.loadedBinding ||
      this.destroyRef.destroyed
    )
      return;
    const generation = ++this.generation,
      draft = this.draft(),
      account = this.account();
    this.loading.set(true);
    this.error.set(null);
    this.schema.set(null);
    this.permission.set(null);
    this.runtimeEnabled.set(false);
    this.jobs.set([]);
    try {
      if (draft.content.categoryId === null) throw new Error('Wähle zuerst eine Vinted-Kategorie.');
      const [schema, brands, permission, availability, jobs] = await Promise.all([
        this.categoryApi.read(account.connectionId, draft.content.categoryId),
        draft.content.brandId !== null
          ? this.brandApi.search(draft.content.brandLabel.slice(0, 100), draft.workspaceId)
          : Promise.resolve([] as VintedBrand[]),
        this.api.readPermission(draft.workspaceId, account.connectionId),
        this.browserApi.available(),
        this.api.list(draft.workspaceId, draft.id),
      ]);
      if (!this.current(generation, binding)) return;
      // Fehlerhafte Kategorien werden abgefangen, bevor der abgeleitete Zustand entsteht.
      reviewVintedListingPublication(draft, schema, brands, this.aiPhoto());
      this.brands.set(brands);
      this.schema.set(schema);
      this.permission.set(permission);
      this.runtimeEnabled.set(
        availability.available &&
          !availability.readOnly &&
          availability.listingPublishingEnabled === true,
      );
      this.jobs.set(jobs);
    } catch (error) {
      if (this.current(generation, binding))
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Die Veröffentlichungsvorschau konnte nicht geprüft werden. Versuche es erneut.',
        );
    } finally {
      if (this.current(generation, binding)) this.loading.set(false);
    }
  }
  openSchedule(): void {
    if (
      !this.closing &&
      !this.destroyRef.destroyed &&
      !this.busy() &&
      !this.disabled() &&
      !this.intentLocked() &&
      this.available()
    )
      this.planning.set(true);
  }
  closeSchedule(): void {
    this.planning.set(false);
  }
  selectSchedule(selection: VintedListingScheduleSelection): void {
    if (
      this.closing ||
      this.destroyRef.destroyed ||
      this.busy() ||
      this.disabled() ||
      this.intentLocked() ||
      !this.available()
    )
      return;
    if (
      !Number.isFinite(Date.parse(selection.scheduledAt)) ||
      Date.parse(selection.scheduledAt) <= Date.now() ||
      !['pause_after_30_minutes', 'publish_when_available'].includes(selection.latePolicy)
    )
      return;
    try {
      new Intl.DateTimeFormat('de-DE', { timeZone: selection.timeZone }).format(
        new Date(selection.scheduledAt),
      );
    } catch {
      return;
    }
    this.schedule.set(selection);
    this.closeSchedule();
  }
  chooseNow(): void {
    if (
      !this.closing &&
      !this.destroyRef.destroyed &&
      this.available() &&
      !this.busy() &&
      !this.disabled() &&
      !this.intentLocked()
    )
      this.schedule.set(null);
  }
  async submit(): Promise<void> {
    const binding = this.binding();
    if (
      !this.canSubmit() ||
      this.closing ||
      this.acceptedOnce ||
      binding !== this.loadedBinding ||
      this.destroyRef.destroyed
    )
      return;
    const draft = this.draft(),
      account = this.account(),
      generation = this.generation;
    const intent = this.intent() ?? {
      requestId: crypto.randomUUID(),
      action: 'publish' as const,
      aiPhoto: this.aiPhoto(),
      schedule: this.schedule(),
    };
    if (
      !this.intent() &&
      intent.schedule &&
      Date.parse(intent.schedule.scheduledAt) <= Date.now()
    ) {
      this.error.set('Der Termin liegt inzwischen in der Vergangenheit. Wähle einen neuen Termin.');
      return;
    }
    this.intent.set(intent);
    this.busy.set(true);
    this.error.set(null);
    try {
      if (!this.permission()?.allowed) {
        const permission = await this.api.approve(
          draft.workspaceId,
          account.connectionId,
          account.externalAccountId!,
        );
        if (!this.current(generation, binding) || this.disabled()) return;
        if (!permission.allowed || permission.executionMode !== 'cloud')
          throw new Error('Die Inseratfreigabe konnte nicht bestätigt werden.');
        this.permission.set(permission);
      }
      if (!this.current(generation, binding) || this.disabled()) return;
      const accepted = await this.api.enqueue(draft, intent);
      if (!this.current(generation, binding)) return;
      if (
        accepted.externalAccountId !== account.externalAccountId ||
        accepted.executionMode !== account.executionMode ||
        accepted.connectionId !== account.connectionId
      )
        throw new Error(
          'Die Auftragsantwort passt nicht zu Deinem Zielkonto. Prüfe den Auftragsverlauf.',
        );
      this.acceptedOnce = true;
      this.accepted.emit(accepted);
    } catch (error) {
      if (this.current(generation, binding))
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Die Auftragsantwort fehlt. Prüfe den Verlauf oder prüfe denselben Auftrag erneut.',
        );
    } finally {
      if (this.current(generation, binding)) this.busy.set(false);
    }
  }
  async revoke(): Promise<void> {
    const permission = this.permission(),
      binding = this.binding();
    if (
      !permission?.allowed ||
      this.busy() ||
      this.loading() ||
      this.disabled() ||
      this.intentLocked() ||
      this.closing ||
      !this.available() ||
      binding !== this.loadedBinding
    )
      return;
    const generation = this.generation;
    this.busy.set(true);
    this.error.set(null);
    try {
      const next = await this.api.revoke(
        this.draft().workspaceId,
        this.account().connectionId,
        permission.authorizationVersion,
      );
      if (this.current(generation, binding)) {
        this.permission.set(next);
        this.consent.set(false);
      }
    } catch (error) {
      if (this.current(generation, binding))
        this.error.set(
          error instanceof Error ? error.message : 'Die Freigabe konnte nicht beendet werden.',
        );
    } finally {
      if (this.current(generation, binding)) this.busy.set(false);
    }
  }
  close(): void {
    if (this.busy() || this.closing) return;
    this.closing = true;
    this.generation++;
    this.closed.emit();
  }
  private current(generation: number, binding: string): boolean {
    return (
      !this.closing &&
      !this.destroyRef.destroyed &&
      this.available() &&
      generation === this.generation &&
      binding === this.binding()
    );
  }
}
