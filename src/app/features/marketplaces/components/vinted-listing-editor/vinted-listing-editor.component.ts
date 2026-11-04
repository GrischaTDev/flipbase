import { NgTemplateOutlet } from '@angular/common';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FormFieldComponent } from '../../../../shared/components/form-field/form-field.component';
import { DatePickerComponent } from '../../../../shared/components/date-picker/date-picker.component';
import { selectVintedListingSchedule } from '../../models/vinted-listing-schedule';
import { VintedListingJobService } from '../../services/vinted-listing-job.service';
import {
  vintedListingSourceContent,
  type VintedListingEditorSource,
} from '../../models/vinted-listing-source';
import { VintedRelistingSubmissionService } from '../../services/vinted-relisting-submission.service';
import { VintedListingPhotoSourceService } from '../../services/vinted-listing-photo-source.service';
import {
  emptyVintedListingPhotoOptions,
  type VintedListingPhotoOptions,
  type VintedListingPhotoFilter,
  type VintedListingPhotoBorder,
} from '../../models/vinted-listing-photo-options';
import { VintedListingOriginalPhotoService } from '../../services/vinted-listing-original-photo.service';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { VintedListingPhotoPreviewComponent } from './vinted-listing-photo-preview.component';
import {
  VintedListingScheduleDialogComponent,
  type VintedListingScheduleSelection,
} from '../vinted-listing-schedule-dialog/vinted-listing-schedule-dialog.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { EntryPageLayoutComponent } from '../../../../shared/components/entry-page-layout/entry-page-layout.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { TwoColumnLayoutComponent } from '../../../../shared/components/two-column-layout/two-column-layout.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import { VintedListingMediaComponent } from './vinted-listing-media.component';
import type { ListingImageDraft } from '../../../../shared/components/listing-image-editor/listing-image-draft';
import type { VintedCategory } from '../../../platform-admin/models/vinted-category.model';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedListingDraftService } from '../../services/vinted-listing-draft.service';
import { VintedListingCategoryService } from '../../services/vinted-listing-category.service';
import {
  VintedListingImageService,
  vintedDraftImageError,
} from '../../services/vinted-listing-image.service';
import {
  emptyVintedListingContent,
  missingVintedListingVariables,
  parseVintedListingContent,
  parseVintedListingPrice,
  type VintedListingContent,
} from '../../models/vinted-listing-content';
import {
  VintedListingStorageError,
  type VintedListingDraft,
} from '../../models/vinted-listing-draft';
import { VintedListingTemplatePanelComponent } from '../vinted-listing-template-panel/vinted-listing-template-panel.component';
import { VintedListingBrandDialogComponent } from '../vinted-listing-brand-dialog/vinted-listing-brand-dialog.component';
import { VintedListingFieldsDialogComponent } from '../vinted-listing-fields-dialog/vinted-listing-fields-dialog.component';
import { VintedListingPublicationPreviewComponent } from '../vinted-listing-publication-preview/vinted-listing-publication-preview.component';
import type { MarketplaceConnection } from '../../models/marketplace.models';
import type { VintedListingJob } from '../../models/vinted-listing-job';
import {
  applyVintedListingFieldSelection,
  type VintedListingFieldSelection,
} from '../../models/vinted-listing-field-selection';
import {
  validVintedListingBrand,
  type VintedListingBrandSelection,
} from '../../models/vinted-listing-brand-selection';
import {
  validateVintedListingEditor,
  vintedListingAccountIssue,
} from '../../models/vinted-listing-editor-validation';
import {
  flipbaseVintedListingFields,
  prepareFlipbaseVintedListingContent,
} from '../../models/flipbase-vinted-listing-form';

const textOptions = { nonNullable: true as const, validators: [Validators.maxLength(20000)] };
const labels = (text: string) =>
  text
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
@Component({
  selector: 'app-vinted-listing-editor',
  templateUrl: './vinted-listing-editor.component.html',
  imports: [
    NgTemplateOutlet,
    DatePickerComponent,
    FormFieldComponent,
    ReactiveFormsModule,
    ButtonComponent,
    CardComponent,
    CustomSelectComponent,
    VintedListingPhotoPreviewComponent,
    CustomCheckboxComponent,
    EntryPageLayoutComponent,
    TextFieldComponent,
    TwoColumnLayoutComponent,
    NoticeBannerComponent,
    CategoryPickerComponent,
    VintedListingMediaComponent,
    VintedListingTemplatePanelComponent,
    VintedListingBrandDialogComponent,
    VintedListingFieldsDialogComponent,
    VintedListingPublicationPreviewComponent,
    VintedListingScheduleDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [VintedListingCategoryService],
  host: { class: 'block min-w-0', '(window:beforeunload)': 'beforeUnload($event)' },
})
export class VintedListingEditorComponent {
  readonly modalActions = input(false);
  readonly plannedJob = input<VintedListingJob | null>(null);
  readonly waitingPlan = signal<VintedListingJob | null>(null);
  readonly photoFilter = signal<VintedListingPhotoFilter>('none');
  readonly photoBorder = signal<VintedListingPhotoBorder>('none');
  readonly relistTiming = signal<'now' | 'delay' | 'scheduled'>('now');
  readonly relistMinutes = signal(5);
  readonly relistTimingOptions = [
    { value: 'now' as const, label: 'Sofort relisten' },
    { value: 'delay' as const, label: 'Verzögert relisten' },
    { value: 'scheduled' as const, label: 'Relisting planen' },
  ];
  readonly relistMinuteOptions = [1, 2, 3, 5, 10].map((value) => ({
    value,
    label: `${value} Min.`,
  }));
  readonly relistScheduleForm = new FormGroup({
    date: new FormControl('', { nonNullable: true }),
    time: new FormControl('', { nonNullable: true }),
  });
  private readonly jobsApi = inject(VintedListingJobService);
  readonly source = input<VintedListingEditorSource | null>(null);
  readonly closed = output<void>();
  readonly publicationReturned = output<void>();
  readonly relisting = computed(
    () =>
      this.source()?.mode === 'relist' || !!this.plannedJob() || !!this.draft()?.relistExternalId,
  );
  readonly photoSize = signal<number | null>(null);
  readonly preparingPhotos = signal(false);
  readonly preparingSource = signal(false);
  private sourcePrepared = false;
  private sourceDescriptionKnown = false;
  private sourceDescription = '';
  private readonly relistingSubmission = inject(VintedRelistingSubmissionService);
  private readonly photoSources = inject(VintedListingPhotoSourceService);
  readonly photoScope = computed(() => {
    const entry = this.source()?.entry;
    return entry
      ? { workspaceId: entry.workspaceId, connectionId: entry.connectionId, entryId: entry.id }
      : null;
  });
  readonly photoSizeOptions = [
    { value: 'none' as const, label: 'Keine Änderung' },
    { value: 1200, label: '1200 Pixel' },
    { value: 1600, label: '1600 Pixel' },
    { value: 2400, label: '2400 Pixel' },
  ];
  readonly photoFilterOptions = [
    { value: 'none' as const, label: 'Keine Änderung' },
    { value: 'lighter' as const, label: 'Heller' },
    { value: 'darker' as const, label: 'Dunkler' },
    { value: 'soft' as const, label: 'Weicher' },
  ];
  readonly photoBorderOptions = [
    { value: 'none' as const, label: 'Kein Rahmen' },
    { value: 'small' as const, label: 'Klein' },
    { value: 'medium' as const, label: 'Mittel' },
    { value: 'large' as const, label: 'Groß' },
  ];
  selectPhotoSize(value: number | string | null): void {
    this.photoSize.set(
      typeof value === 'number' && [1200, 1600, 2400].includes(value) ? value : null,
    );
  }
  private readonly photoUrls = new Set<string>();
  readonly store = inject(MarketplaceAccountStore);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(VintedListingDraftService);
  private readonly imageApi = inject(VintedListingImageService);
  private readonly originals = inject(VintedListingOriginalPhotoService);
  private readonly liveCategoryApi = inject(VintedListingCategoryService);
  private readonly sellingCategories = new Map<
    number,
    { id: number; title: string; path: string }
  >();
  private readonly dialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef, { optional: true });
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly context = computed(() => {
    const user = this.auth.currentUser();
    const workspace = this.workspace.currentWorkspace();
    return user && workspace && !workspace.archived_at && this.store.canManage()
      ? JSON.stringify([
          user.id,
          workspace.id,
          this.params().get('draftId'),
          this.plannedJob()?.id,
          this.source()?.entry.connectionId,
          this.source()?.entry.id,
          this.source()?.mode,
        ])
      : null;
  });
  readonly workspaceId = computed(() => this.workspace.currentWorkspace()?.id ?? null);
  readonly draft = signal<VintedListingDraft | null>(null);
  /** Über die Entwurfsliste geöffnet; „Inserat erstellen“ behält seinen Titel auch nach dem Speichern. */
  readonly openedSavedDraft = computed(() => this.params().get('draftId') !== null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly imageEditing = signal(false);
  readonly dirty = signal(false);
  readonly error = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly conflict = signal(false);
  readonly progress = signal('');
  readonly publicationAttempted = signal(false);
  readonly saveAttempted = signal(false);
  readonly images = signal<readonly ListingImageDraft[]>([]);
  readonly categories = signal<readonly VintedCategory[]>([]);
  readonly categoryError = signal<string | null>(null);
  readonly categoryLoading = signal(false);
  readonly brandSelectionContext = signal<string | null>(null);
  readonly publication = signal<{
    readonly scopeKey: string;
    readonly userId: string;
    readonly draft: VintedListingDraft;
    readonly account: MarketplaceConnection;
    readonly images: readonly ListingImageDraft[];
  } | null>(null);
  readonly publicationBusy = signal(false);
  readonly publicationSchedule = signal<VintedListingScheduleSelection | null>(null);
  readonly planningPublication = signal(false);
  readonly publicationAnnouncement = signal('');
  readonly jobRefresh = signal(0);
  readonly fieldSelection = signal<{
    readonly scopeKey: string;
    readonly connectionId: string;
    readonly categoryId: number;
    readonly content: VintedListingContent;
  } | null>(null);
  private readonly selectedFields = signal<VintedListingFieldSelection | null>(null);
  private readonly selectedBrand = signal<
    (VintedListingBrandSelection & { categoryId: number | null }) | null
  >(null);
  private brandEdited = false;
  private readonly referenceContent = signal(emptyVintedListingContent());
  private readonly changed = signal(0);
  private loadedContext: string | null = null;
  private generation = 0;
  private activeSave: Promise<void> | null = null;
  private requestId = crypto.randomUUID();
  readonly validateImage = vintedDraftImageError;
  readonly form = new FormGroup({
    aiPhoto: new FormControl(false, { nonNullable: true }),
    title: new FormControl('', textOptions),
    description: new FormControl('', textOptions),
    price: new FormControl('', textOptions),
    categoryId: new FormControl<string | null>(null),
    brand: new FormControl('', textOptions),
    size: new FormControl('', textOptions),
    condition: new FormControl('', textOptions),
    colors: new FormControl('', textOptions),
    materials: new FormControl('', textOptions),
    connectionId: new FormControl<string | null>(null),
  });
  readonly accountOptions = computed(() => [
    { value: null, label: 'Noch kein Konto auswählen' },
    ...this.store
      .connections()
      .filter(
        (account) => account.marketplace === 'vinted' && account.workspaceId === this.workspaceId(),
      )
      .map((account) => ({ value: account.connectionId, label: account.displayName })),
  ]);
  readonly selectedAccount = computed(() => {
    this.changed();
    return this.store
      .connections()
      .find((account) => account.connectionId === this.form.controls.connectionId.value);
  });
  readonly accountIssue = computed(() =>
    vintedListingAccountIssue(this.selectedAccount(), this.workspaceId()),
  );
  readonly categorySource = computed(() => {
    const connectionId = this.selectedAccount()?.connectionId;
    this.sellingCategories.clear();
    return connectionId
      ? this.liveCategoryApi.source(connectionId, (category) => {
          if (this.form.controls.connectionId.value === connectionId)
            this.sellingCategories.set(category.id, category);
        })
      : null;
  });
  readonly priceError = computed(() => {
    this.changed();
    try {
      const price = parseVintedListingPrice(this.form.controls.price.value);
      return price === null
        ? 'Ergänze bitte: Verkaufspreis.'
        : price <= 0
          ? 'Der Verkaufspreis muss größer als 0 € sein.'
          : null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Ungültiger Verkaufspreis.';
    }
  });
  readonly content = computed(() => {
    this.changed();
    try {
      return this.contentSnapshot(true);
    } catch {
      return this.referenceContent();
    }
  });
  readonly contentError = computed(() => {
    this.changed();
    try {
      this.contentSnapshot();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Eine Artikelangabe ist ungültig.';
    }
  });
  readonly missingVariables = computed(() => missingVintedListingVariables(this.content()));
  readonly status = computed(() =>
    this.saving()
      ? this.progress() || 'Entwurf wird gespeichert …'
      : this.conflict()
        ? 'Versionskonflikt'
        : this.dirty()
          ? 'Änderungen noch nicht gespeichert'
          : this.draft()
            ? 'Entwurf gespeichert'
            : 'Noch kein Entwurf angelegt',
  );
  readonly canSave = computed(
    () =>
      this.store.canManage() &&
      !this.loading() &&
      !this.loadError() &&
      !this.saving() &&
      !this.imageEditing() &&
      !this.preparingPhotos() &&
      !this.preparingSource() &&
      !this.conflict() &&
      this.dirty(),
  );
  readonly canSelectBrand = computed(
    () =>
      this.store.canManage() &&
      !!this.context() &&
      this.context() === this.loadedContext &&
      !this.loading() &&
      !this.loadError() &&
      !this.saving() &&
      !this.imageEditing() &&
      !this.preparingPhotos() &&
      !this.preparingSource() &&
      !this.conflict(),
  );
  readonly brandScope = computed(() => this.context() ?? 'unavailable');
  private readonly fieldSelectionScope = computed(() => {
    this.changed();
    const connectionId = this.form.controls.connectionId.value;
    const account = this.store.connections().find((value) => value.connectionId === connectionId);
    return JSON.stringify([
      this.context(),
      connectionId,
      account?.externalAccountId,
      account?.workspaceId,
      account?.status,
      account?.executionMode,
      this.currentCategoryId(),
    ]);
  });
  readonly categorySchema = computed(() => {
    const content = this.content();
    if (this.context() !== this.loadedContext) return null;
    return content.categoryId === null
      ? null
      : flipbaseVintedListingFields(content.categoryId, content.categoryLabel, content);
  });
  readonly fieldErrors = computed(() => {
    const stored = this.draft()?.images ?? [];
    const photos = this.images().map((image) => {
      const saved = stored.find((entry) => entry.id === image.key);
      return {
        mimeType: image.file?.type ?? saved?.mimeType ?? '',
        byteSize: image.file?.size ?? saved?.byteSize ?? 0,
      };
    });
    const errors = validateVintedListingEditor(this.content(), photos, this.categorySchema());
    const categoryId = this.currentCategoryId();
    const category =
      this.categories().find((value) => value.id === categoryId) ??
      (categoryId === null ? undefined : this.sellingCategories.get(categoryId)) ??
      (this.categories().length > 0 && categoryId === this.referenceContent().categoryId
        ? this.referenceContent()
        : undefined);
    if (!this.relisting() && categoryId !== null && !category)
      return {
        ...errors,
        category:
          this.categoryError() ??
          (this.categoryLoading()
            ? 'Die Kategorien werden geladen. Warte bitte kurz.'
            : 'Diese Kategorie ist nicht verfügbar. Wähle eine passende Kategorie aus.'),
      };
    return !this.relisting() &&
      category &&
      this.categories().some((value) => value.parentId === categoryId)
      ? { ...errors, category: `Wähle unter „${category.title}“ eine passende Unterkategorie aus.` }
      : errors;
  });
  readonly additionalFieldErrors = computed(() =>
    Object.entries(this.visibleFieldErrors())
      .filter(
        ([field]) =>
          ![
            'title',
            'description',
            'price',
            'category',
            'photos',
            'brand',
            'size',
            'condition',
            'color',
            'material',
            'package',
          ].includes(field),
      )
      .map(([, message]) => message),
  );
  readonly visibleFieldErrors = computed<Readonly<Record<string, string>>>(() =>
    this.publicationAttempted() ? this.fieldErrors() : {},
  );
  readonly publicationHint = computed(
    () =>
      this.accountIssue() ??
      (this.currentCategoryId() === null
        ? 'Wähle eine Kategorie, um die passenden Artikelangaben auszufüllen.'
        : this.categorySchema() === null
          ? 'Ergänze die Artikelangaben. Server- und Kontofreigabe werden vor der Veröffentlichung geprüft.'
          : 'Ergänze die markierten Angaben. Server- und Kontofreigabe werden beim Veröffentlichen geprüft.'),
  );
  readonly canSelectFields = computed(() => {
    this.changed();
    return this.canSelectBrand() && this.currentCategoryId() !== null;
  });
  readonly canPreparePublication = computed(() => {
    const draft = this.draft();
    const account = this.store
      .connections()
      .find((value) => value.connectionId === draft?.connectionId);
    return (
      this.canSelectFields() &&
      this.accountIssue() === null &&
      Object.keys(this.fieldErrors()).length === 0 &&
      !this.dirty() &&
      !!draft &&
      draft.workspaceId === this.workspaceId() &&
      draft.connectionId === this.form.controls.connectionId.value &&
      account?.marketplace === 'vinted'
    );
  });
  readonly canStartPublication = computed(
    () => this.canSelectBrand() && !this.categoryLoading() && !this.publication(),
  );
  private readonly publicationScope = computed(() =>
    JSON.stringify([
      this.fieldSelectionScope(),
      this.draft()?.id,
      this.draft()?.revision,
      this.changed(),
    ]),
  );
  readonly packageLabel = computed(() => {
    const content = this.content();
    if (content.packageSizeId === null) return 'Noch nicht festgelegt';
    const selection = this.selectedFields();
    return selection?.categoryId === content.categoryId &&
      selection.fields.includes('package') &&
      selection.values.packageSizeId === content.packageSizeId
      ? selection.packageLabel
      : 'Bereits festgelegt';
  });

  constructor() {
    effect(() => {
      const photoDisabled = this.saving() || this.imageEditing();
      const accountDisabled = this.relisting();
      untracked(() => {
        const controls = [
          { control: this.form.controls.aiPhoto, disabled: photoDisabled },
          { control: this.form.controls.connectionId, disabled: accountDisabled },
        ];
        for (const { control, disabled } of controls) {
          if (control.disabled === disabled) continue;
          if (disabled) control.disable({ emitEvent: false });
          else control.enable({ emitEvent: false });
        }
      });
    });
    effect(() => {
      const context = this.context();
      untracked(() => void this.load(context));
    });
    effect(() => {
      const source = this.source();
      const snapshot = this.store.snapshot();
      if (source?.mode !== 'relist' || !snapshot) return;
      const entry = snapshot.publications.items.find(
        (entry) =>
          entry.id === source.entry.id &&
          entry.connectionId === source.entry.connectionId &&
          entry.workspaceId === source.entry.workspaceId,
      );
      untracked(() => {
        const control = this.form.controls.description;
        if (
          !entry ||
          this.loading() ||
          this.preparingSource() ||
          this.loadedContext !== this.context() ||
          this.sourceDescriptionKnown ||
          control.dirty ||
          control.value !== this.sourceDescription
        )
          return;
        const description =
          this.store.cachedListingDescription(entry.connectionId, entry)?.description ??
          entry.text ??
          entry.listingContent?.description ??
          null;
        if (description === null) return;
        control.setValue(description, { emitEvent: false });
        this.sourceDescriptionKnown = true;
        this.sourceDescription = description;
        this.changed.update((value) => value + 1);
      });
    });
    effect(() => {
      const scope = this.fieldSelectionScope();
      const selection = this.fieldSelection();
      if (selection && selection.scopeKey !== scope) untracked(() => this.closeFieldSelection());
      if (this.canSelectFields() && (!selection || selection.scopeKey !== scope))
        untracked(() => this.openFieldSelection());
    });
    effect(() => {
      const opened = this.publication();
      if (opened && (!this.canPreparePublication() || opened.scopeKey !== this.publicationScope()))
        untracked(() => this.closePublication());
    });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.markChanged());
    this.destroyRef.onDestroy(() => {
      this.generation++;
      this.photoUrls.forEach((url) => URL.revokeObjectURL(url));
    });
  }
  publishNow(): void {
    this.publicationSchedule.set(null);
    void this.openPublication();
  }
  async submitRelisting(): Promise<void> {
    if (this.preparingSource() || this.preparingPhotos() || this.saving() || this.publication())
      return;
    this.error.set(null);
    try {
      const scheduled = this.relistTiming() === 'scheduled';
      this.publicationSchedule.set(
        scheduled
          ? {
              ...selectVintedListingSchedule(
                {
                  ...this.relistScheduleForm.getRawValue(),
                  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
                Date.now(),
              ),
              latePolicy: 'pause_after_30_minutes',
            }
          : null,
      );
      const source = this.source();
      if (source?.mode === 'relist') {
        if (!this.canStartPublication()) return;
        this.publicationAttempted.set(true);
        const description = this.form.controls.description;
        const descriptionKnown =
          this.sourceDescriptionKnown ||
          description.dirty ||
          description.value !== this.sourceDescription;
        const errors = this.fieldErrors();
        if (errors['title'] || (descriptionKnown && errors['description']) || this.form.invalid) {
          this.focusFirstIssue();
          return;
        }
        const pending = this.relistingSubmission.start({
          entry: source.entry,
          account: this.store
            .connections()
            .find((account) => account.connectionId === source.entry.connectionId)!,
          title: this.form.controls.title.value,
          description: description.value,
          descriptionKnown,
          photoOptions: this.photoOptions(),
          schedule: this.publicationSchedule(),
          delaySeconds: this.relistTiming() === 'delay' ? this.relistMinutes() * 60 : 0,
          requestId: this.requestId,
        });
        this.preparingSource.set(true);
        this.closed.emit();
        // Fortschritt und Fehler gehören ab jetzt dem appweiten Auftrag, auch nach Destroy.
        await pending.catch(() => undefined);
        return;
      }
      await this.openPublication();
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Die Planung konnte nicht gespeichert werden.',
      );
    }
  }
  private readPhoto(url: string): Promise<Blob> {
    return this.photoSources.read(url, this.photoScope());
  }
  openSchedule(): void {
    if (this.canStartPublication()) this.planningPublication.set(true);
  }
  schedulePublication(schedule: VintedListingScheduleSelection): void {
    this.planningPublication.set(false);
    this.publicationSchedule.set(schedule);
    void this.openPublication();
  }
  /** Ungespeicherte Eingaben sichern; der Auftrag startet ohne zusätzlichen Bestätigungsschritt. */
  async openPublication(): Promise<void> {
    if (!this.canStartPublication()) return;
    this.planningPublication.set(false);
    this.publicationAttempted.set(true);
    if (
      !this.canSelectFields() ||
      this.accountIssue() ||
      this.contentError() ||
      Object.keys(this.fieldErrors()).length
    ) {
      if (this.relisting()) {
        const hiddenIssue = Object.entries(this.fieldErrors()).find(
          ([field]) => !['title', 'description'].includes(field),
        )?.[1];
        this.error.set(this.accountIssue() ?? this.contentError() ?? hiddenIssue ?? null);
      }
      this.focusFirstIssue();
      return;
    }
    // Auch unveränderte ältere Entwürfe müssen vor dem Auftrag die eigene Formularversion sichern.
    if (
      this.draft() &&
      (!same(this.content(), this.draft()!.content) ||
        !same(this.photoOptions(), this.draft()!.photoOptions ?? emptyVintedListingPhotoOptions()))
    )
      this.dirty.set(true);
    if (this.dirty()) {
      if (!this.canStartPublication()) return;
      await this.save();
    }
    if (!this.canPreparePublication()) return;
    const draft = this.draft()!;
    const account = this.store
      .connections()
      .find((value) => value.connectionId === draft.connectionId)!;
    this.publicationAnnouncement.set('');
    this.publication.set({
      scopeKey: this.publicationScope(),
      userId: this.auth.currentUser()!.id,
      draft: structuredClone(draft),
      account: structuredClone(account),
      images: [...this.images()],
    });
    setTimeout(() => {
      const feedback = this.host?.nativeElement.querySelector<HTMLElement>(
        '[data-publication-review]',
      );
      feedback?.focus({ preventScroll: true });
      feedback?.scrollIntoView({ block: 'nearest' });
    });
  }
  closePublication(): void {
    this.publicationBusy.set(false);
    this.publication.set(null);
  }
  returnToEditor(): void {
    if (this.publicationBusy()) return;
    this.closePublication();
    setTimeout(() => {
      if (this.modalActions()) this.publicationReturned.emit();
      else
        this.host?.nativeElement.querySelector<HTMLElement>('[data-review-opener] button')?.focus();
    });
  }
  publicationAccepted(job: VintedListingJob): void {
    const opened = this.publication();
    if (
      !opened ||
      !this.canPreparePublication() ||
      opened.scopeKey !== this.publicationScope() ||
      job.workspaceId !== opened.draft.workspaceId ||
      job.draftId !== opened.draft.id ||
      job.connectionId !== opened.draft.connectionId ||
      job.draftRevision !== opened.draft.revision ||
      job.action !== 'publish'
    )
      return;
    this.closePublication();
    this.publicationAnnouncement.set(
      'Die Veröffentlichung wurde beauftragt. Den aktuellen Stand findest Du unter „Laufende Aktionen“.',
    );
    this.publicationSchedule.set(null);
    this.jobRefresh.update((value) => value + 1);
    if (this.source() || this.plannedJob()) {
      this.waitingPlan.set(null);
      this.closed.emit();
    }
    setTimeout(() =>
      this.host?.nativeElement.querySelector<HTMLElement>('[data-review-opener] button')?.focus(),
    );
  }
  openBrandSelection(): void {
    if (this.canSelectBrand()) this.brandSelectionContext.set(this.context());
  }
  openFieldSelection(): void {
    if (!this.canSelectFields()) return;
    this.fieldSelection.set({
      scopeKey: this.fieldSelectionScope(),
      connectionId: this.form.controls.connectionId.value ?? '',
      categoryId: this.currentCategoryId()!,
      content: this.content(),
    });
  }
  closeFieldSelection(): void {
    this.fieldSelection.set(null);
  }
  textLimitHelp(field: 'title' | 'description'): string {
    this.changed();
    const schema = this.categorySchema();
    const maximum = field === 'title' ? schema?.titleMaxLength : schema?.descriptionMaxLength;
    const length = this.form.controls[field].value.length;
    return maximum == null ? `${length} Zeichen` : `${length} von ${maximum} Zeichen.`;
  }
  selectFields(selection: VintedListingFieldSelection, keepOpen = false): void {
    const opened = this.fieldSelection();
    if (!opened || !this.canSelectFields() || opened.scopeKey !== this.fieldSelectionScope())
      return;
    try {
      const content = applyVintedListingFieldSelection(this.content(), selection);
      if (selection.fields.includes('size'))
        this.form.controls.size.setValue(content.sizeLabel, { emitEvent: false });
      if (selection.fields.includes('condition'))
        this.form.controls.condition.setValue(content.conditionLabel, { emitEvent: false });
      if (selection.fields.includes('color'))
        this.form.controls.colors.setValue(content.colorLabels.join(', '), { emitEvent: false });
      if (selection.fields.includes('material'))
        this.form.controls.materials.setValue(content.materialLabels.join(', '), {
          emitEvent: false,
        });
      const previous = this.selectedFields();
      this.selectedFields.set({
        categoryId: selection.categoryId,
        fields: [
          ...new Set([
            ...(previous?.categoryId === selection.categoryId ? previous.fields : []),
            ...selection.fields,
          ]),
        ],
        values: {
          attributes: content.attributes,
          sizeId: content.sizeId,
          sizeLabel: content.sizeLabel,
          conditionId: content.conditionId,
          conditionLabel: content.conditionLabel,
          colorIds: content.colorIds,
          colorLabels: content.colorLabels,
          materialIds: content.materialIds,
          materialLabels: content.materialLabels,
          packageSizeId: content.packageSizeId,
        },
        packageLabel: selection.fields.includes('package')
          ? selection.packageLabel
          : (previous?.packageLabel ?? ''),
      });
      this.markChanged();
      if (!keepOpen) this.closeFieldSelection();
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Die Auswahl konnte nicht übernommen werden.',
      );
    }
  }
  closeBrandSelection(): void {
    this.brandSelectionContext.set(null);
  }
  selectBrand(selection: VintedListingBrandSelection): void {
    if (
      !this.canSelectBrand() ||
      !this.brandSelectionContext() ||
      this.brandSelectionContext() !== this.context() ||
      !validVintedListingBrand(selection)
    )
      return;
    this.form.controls.brand.setValue(selection.brandLabel, { emitEvent: false });
    this.selectedBrand.set({ ...selection, categoryId: this.currentCategoryId() });
    this.markChanged();
    this.closeBrandSelection();
  }
  selectInlineBrand(selection: VintedListingBrandSelection): void {
    this.openBrandSelection();
    this.selectBrand(selection);
  }
  editBrand(label: string): void {
    this.brandEdited = true;
    this.selectedBrand.set(null);
    this.form.controls.brand.setValue(label);
  }
  changeImages(images: readonly ListingImageDraft[]): void {
    const previous = this.images();
    const changed =
      images.length !== previous.length ||
      images.some(
        (image, index) =>
          image.key !== previous[index]?.key ||
          image.file !== previous[index]?.file ||
          image.storagePath !== previous[index]?.storagePath ||
          image.fileName !== previous[index]?.fileName,
      );
    this.images.set(images);
    if (changed) this.markChanged();
  }
  applyTemplate(content: VintedListingContent): void {
    this.referenceContent.set(content);
    this.patch(content, this.form.controls.connectionId.value);
    this.markChanged();
  }
  setImageEditing(editing: boolean): void {
    this.imageEditing.set(editing);
  }
  /** Speichert ausschließlich auf ausdrücklichen Wunsch; die geöffnete Seite bleibt bestehen. */
  async save(): Promise<void> {
    this.saveAttempted.set(true);
    if (this.activeSave) return this.activeSave;
    if (
      !this.context() ||
      this.loading() ||
      this.loadError() ||
      this.conflict() ||
      this.imageEditing() ||
      !this.dirty()
    )
      return;
    const context = this.loadedContext;
    const generation = this.generation;
    const change = this.changed();
    this.saving.set(true);
    this.error.set(null);
    const task = this.persist(generation, change);
    this.activeSave = task;
    await task;
    if (this.activeSave === task) this.activeSave = null;
    if (!this.current(generation, context)) return;
    this.saving.set(false);
    this.progress.set('');
  }
  async reload(): Promise<void> {
    if (this.saving()) return;
    if (
      this.dirty() &&
      !(await this.dialog.frage({
        titel: 'Aktuellen Entwurf laden?',
        text: 'Deine noch nicht gespeicherten Eingaben werden durch den gespeicherten Stand ersetzt.',
        bestaetigenText: 'Stand laden',
      }))
    )
      return;
    const context = this.context();
    const id = this.draft()?.id ?? this.params().get('draftId');
    await this.load(context, true, id);
  }
  async canLeave(): Promise<boolean> {
    if (this.publicationBusy()) return false;
    if (this.activeSave) await this.activeSave;
    return (
      (!this.dirty() && !this.imageEditing()) ||
      (await this.dialog.frage({
        titel: 'Entwurf verlassen?',
        text: 'Deine letzten Änderungen sind noch nicht gespeichert. Wenn Du die Seite verlässt, gehen diese Eingaben verloren.',
        bestaetigenText: 'Seite verlassen',
        abbrechenText: 'Weiter bearbeiten',
      }))
    );
  }
  async cancel(): Promise<void> {
    if (this.source() || this.plannedJob()) {
      if (await this.canLeave()) {
        const waiting = this.waitingPlan();
        if (waiting) {
          try {
            await this.jobsApi.editPlan(waiting, false);
            this.waitingPlan.set(null);
          } catch (error) {
            this.error.set(
              error instanceof Error
                ? error.message
                : 'Die Planung konnte nicht fortgesetzt werden.',
            );
            return;
          }
        }
        this.closed.emit();
      }
      return;
    }
    await this.router.navigate(['/marketplaces/vinted/listing-drafts']);
  }
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty() || this.saving() || this.imageEditing() || this.publicationBusy()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  private categoryConnectionId: string | null = null;
  private markChanged(): void {
    if (!this.relisting() && this.form.controls.connectionId.value !== this.categoryConnectionId)
      void this.reloadCategories();
    if (!this.loading() && !this.loadError()) {
      const selection = this.selectedBrand();
      if (
        selection &&
        (selection.categoryId !== this.currentCategoryId() ||
          selection.brandLabel !== this.form.controls.brand.value)
      )
        this.selectedBrand.set(null);
      const fields = this.selectedFields();
      if (fields) {
        if (fields.categoryId !== this.currentCategoryId()) this.selectedFields.set(null);
        else
          this.selectedFields.set({
            ...fields,
            fields: fields.fields.filter((field) => {
              switch (field) {
                case 'accessory_department':
                  return true;
                case 'size':
                  return fields.values.sizeLabel === this.form.controls.size.value;
                case 'condition':
                  return fields.values.conditionLabel === this.form.controls.condition.value;
                case 'color':
                  return same(fields.values.colorLabels, labels(this.form.controls.colors.value));
                case 'material':
                  return same(
                    fields.values.materialLabels,
                    labels(this.form.controls.materials.value),
                  );
                case 'package':
                  return true;
              }
            }),
          });
      }
      this.changed.update((value) => value + 1);
      this.dirty.set(true);
    }
  }
  private current(generation: number, context = this.loadedContext): boolean {
    return (
      !this.destroyRef.destroyed &&
      generation === this.generation &&
      context !== null &&
      context === this.context()
    );
  }
  private async load(
    context: string | null,
    force = false,
    idOverride: string | null = null,
  ): Promise<void> {
    if (!force && context === this.loadedContext) return;
    this.loadedContext = context;
    this.closeBrandSelection();
    this.closeFieldSelection();
    this.closePublication();
    this.publicationAnnouncement.set('');
    this.publicationSchedule.set(null);
    this.planningPublication.set(false);
    const generation = ++this.generation;
    this.activeSave = null;
    this.loading.set(true);
    this.publicationAttempted.set(false);
    this.saveAttempted.set(false);
    this.imageEditing.set(false);
    this.preparingPhotos.set(false);
    this.preparingSource.set(false);
    this.sourcePrepared = false;
    this.sourceDescriptionKnown = false;
    this.sourceDescription = '';
    this.photoSize.set(null);
    this.photoFilter.set('none');
    this.photoBorder.set('none');
    this.draft.set(null);
    this.images.set([]);
    this.categories.set([]);
    this.error.set(null);
    this.loadError.set(null);
    this.categoryError.set(null);
    this.categoryLoading.set(false);
    this.conflict.set(false);
    this.dirty.set(false);
    this.saving.set(false);
    this.referenceContent.set(emptyVintedListingContent());
    this.patch(emptyVintedListingContent(), null);
    this.requestId = crypto.randomUUID();
    if (!context) {
      this.loading.set(false);
      return;
    }
    const workspaceId = this.workspaceId()!;
    const id = idOverride ?? this.plannedJob()?.draftId ?? this.params().get('draftId');
    try {
      if (this.plannedJob() && !this.waitingPlan()) {
        const paused = await this.jobsApi.editPlan(this.plannedJob()!, true);
        if (!this.current(generation, context)) {
          await this.jobsApi.editPlan(paused, false);
          return;
        }
        this.waitingPlan.set(paused);
        this.relistTiming.set('scheduled');
        if (paused.scheduledAt) {
          const date = new Date(paused.scheduledAt);
          this.relistScheduleForm.setValue({
            date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
            time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
          });
        }
      }
      const source = this.source();
      if (source) {
        if (source.entry.workspaceId !== workspaceId)
          throw new Error('Der Arbeitsbereich hat sich geändert.');
        if (source.mode === 'relist') {
          const description =
            this.store.cachedListingDescription(source.entry.connectionId, source.entry)
              ?.description ?? null;
          const content = vintedListingSourceContent(source.entry, description);
          this.sourceDescriptionKnown =
            description !== null || source.entry.text !== null || !!source.entry.listingContent;
          this.sourceDescription = content.description;
          this.referenceContent.set(content);
          this.patch(content, source.entry.connectionId);
          const urls = source.entry.imageUrls?.length
            ? source.entry.imageUrls
            : source.entry.imageUrl
              ? [source.entry.imageUrl]
              : [];
          this.images.set(
            urls.map((previewUrl, index) => ({
              key: crypto.randomUUID(),
              storagePath: null,
              file: null,
              fileName: `photo-${index + 1}.jpg`,
              previewUrl,
            })),
          );
          this.dirty.set(true);
          this.loading.set(false);
          return;
        }
        const current = await this.store.readListingContent(
          source.entry.connectionId,
          source.entry.id,
        );
        if (!this.current(generation, context)) return;
        if (current.externalId !== source.entry.externalId)
          throw new Error('Die Artikelzuordnung hat sich geändert.');
        const savedOriginals = await this.originals.read(
          { workspaceId, connectionId: source.entry.connectionId },
          current.externalId,
        );
        if (!this.current(generation, context)) return;
        const sources =
          savedOriginals ??
          current.photoUrls.map((previewUrl, index) => ({
            previewUrl,
            fileName: `photo-${index + 1}.jpg`,
          }));
        const images: ListingImageDraft[] = [];
        for (const photo of sources) {
          const blob = await this.readPhoto(photo.previewUrl);
          const file = new File([blob], photo.fileName, { type: blob.type });
          if (!this.current(generation, context)) return;
          const previewUrl = URL.createObjectURL(file);
          this.photoUrls.add(previewUrl);
          images.push({
            key: crypto.randomUUID(),
            storagePath: null,
            file,
            fileName: file.name,
            previewUrl,
          });
        }
        if (!images.length)
          throw new Error('Die Originalfotos konnten nicht vollständig geladen werden.');
        this.referenceContent.set(current.content);
        this.patch({ ...current.content, aiPhoto: current.aiPhoto }, source.entry.connectionId);
        this.images.set(images);
        this.changed.update((value) => value + 1);
        this.dirty.set(true);
      } else if (id) {
        const draft = await this.api.load(workspaceId, id);
        if (!this.current(generation, context)) return;
        const images = await this.imageApi.previews(draft);
        if (!this.current(generation, context)) return;
        this.draft.set(draft);
        this.referenceContent.set(draft.content);
        this.patch(draft.content, draft.connectionId);
        this.images.set(images);
        this.photoSize.set(draft.photoOptions?.resize ?? null);
        this.photoFilter.set(draft.photoOptions?.filter ?? 'none');
        this.photoBorder.set(draft.photoOptions?.border ?? 'none');
      } else {
        const requestedId = this.route.snapshot.queryParamMap?.get('connectionId');
        const requestedWorkspace = this.route.snapshot.queryParamMap?.get('workspaceId');
        const requestedAccount =
          requestedId && requestedWorkspace === workspaceId
            ? this.store
                .connections()
                .find(
                  (account) =>
                    account.connectionId === requestedId && account.workspaceId === workspaceId,
                )
            : null;
        this.form.controls.connectionId.setValue(
          requestedId
            ? (requestedAccount?.connectionId ?? null)
            : (this.store.selectedConnection()?.connectionId ?? null),
          { emitEvent: false },
        );
        if (requestedId && !requestedAccount)
          this.error.set(
            'Das ausgewählte Vinted-Konto ist nicht mehr verfügbar. Wähle ein Konto für diesen Arbeitsbereich.',
          );
      }
    } catch (error) {
      if (this.current(generation, context))
        this.loadError.set(
          error instanceof Error ? error.message : 'Der Entwurf konnte nicht geladen werden.',
        );
    }
    if (!this.current(generation, context)) return;
    this.loading.set(false);
    await this.reloadCategories();
  }
  async reloadCategories(): Promise<void> {
    if (!this.canSelectBrand()) return;
    const connectionId = this.form.controls.connectionId.value;
    this.categoryConnectionId = connectionId;
    const generation = this.generation,
      context = this.loadedContext;
    this.categoryLoading.set(true);
    this.categoryError.set(null);
    this.categories.set([]);
    try {
      if (!connectionId) return;
      const snapshot = await this.liveCategoryApi.readSnapshot(connectionId);
      if (
        this.current(generation, context) &&
        this.form.controls.connectionId.value === connectionId
      )
        this.categories.set(snapshot.categories);
    } catch {
      if (
        this.current(generation, context) &&
        this.form.controls.connectionId.value === connectionId
      )
        this.categoryError.set(
          'Die Vinted-Kategorien konnten nicht geladen werden. Deine Eingaben bleiben erhalten.',
        );
    } finally {
      if (
        this.current(generation, context) &&
        this.form.controls.connectionId.value === connectionId
      )
        this.categoryLoading.set(false);
    }
  }
  readonly photoOptions = computed<VintedListingPhotoOptions>(() => ({
    resize: this.photoSize(),
    ...(this.photoFilter() !== 'none' ? { filter: this.photoFilter() } : {}),
    ...(this.photoBorder() !== 'none' ? { border: this.photoBorder() } : {}),
    crops: Object.fromEntries(
      this.images().flatMap((image) => (image.crop ? [[image.key, image.crop]] : [])),
    ),
  }));
  private async persist(generation: number, change: number): Promise<void> {
    const context = this.loadedContext;
    const workspaceId = this.workspaceId()!;
    try {
      if (this.form.invalid)
        throw new Error('Eine Eingabe ist zu lang. Kürze sie vor dem Speichern.');
      const content = this.contentSnapshot();
      const connectionId = this.form.controls.connectionId.value;
      const selection = [...this.images()];
      let draft = this.draft();
      draft = draft
        ? await this.api.save(draft, content, connectionId)
        : this.source()?.mode === 'relist'
          ? await this.api.createRelisting(
              workspaceId,
              content,
              connectionId!,
              this.requestId,
              this.source()!.entry.externalId!,
            )
          : await this.api.create(workspaceId, content, connectionId, this.requestId);
      if (!this.current(generation, context)) return;
      this.draft.set(draft);
      // Wiederholte Neuanlage liefert den bereits vorhandenen Stand; neue Eingaben benötigen eine neue Revision.
      if (!same(draft.content, content) || draft.connectionId !== connectionId) {
        draft = await this.api.save(draft, content, connectionId);
        if (!this.current(generation, context)) return;
        this.draft.set(draft);
      }
      const ids: string[] = [];
      const crops: Record<string, NonNullable<ListingImageDraft['crop']>> = {};
      let replaceIds = draft.images
        // Beibehaltene Bilder bleiben für ihre eigene Ersetzung reserviert.
        .filter((stored) => !selection.some((image) => image.key === stored.id))
        .map((image) => image.id);
      for (const [index, image] of selection.entries()) {
        let id = image.key;
        const stored = draft.images.find((entry) => entry.id === image.key);
        const renamed = stored && !image.file && stored.fileName !== image.fileName;
        const originalFile = image.originalFile ?? (image.crop ? null : image.file);
        if (originalFile || renamed) {
          this.progress.set(`Foto ${index + 1} von ${selection.length} wird hochgeladen …`);
          const oldIds = new Set(draft.images.map((entry) => entry.id));
          const replaceId = stored?.id ?? replaceIds[0];
          const file =
            originalFile ?? (await this.imageApi.renamedFile(draft, image.key, image.fileName));
          if (!this.current(generation, context)) return;
          draft = await this.imageApi.upload(draft, file, replaceId);
          if (!this.current(generation, context)) return;
          replaceIds = replaceIds.filter((id) => id !== replaceId);
          const added = draft.images.find((entry) => !oldIds.has(entry.id));
          if (!added)
            throw new Error(
              'Das hochgeladene Foto konnte nicht zugeordnet werden. Lade den Entwurf erneut.',
            );
          id = added.id;
          this.draft.set(draft);
          this.images.update((images) =>
            images.map((entry) =>
              entry.key === image.key && entry.file === image.file
                ? {
                    ...entry,
                    key: added.id,
                    file: null,
                    originalFile: null,
                    storagePath: added.storagePath,
                  }
                : entry,
            ),
          );
        }
        if (image.crop) crops[id] = image.crop;
        ids.push(id);
      }
      if (
        !same(
          draft.images.map((image) => image.id),
          ids,
        )
      ) {
        draft = await this.imageApi.setOrder(draft, ids);
        if (!this.current(generation, context)) return;
        this.draft.set(draft);
      }
      const options: VintedListingPhotoOptions = {
        resize: this.photoSize(),
        ...(this.photoFilter() !== 'none' ? { filter: this.photoFilter() } : {}),
        ...(this.photoBorder() !== 'none' ? { border: this.photoBorder() } : {}),
        crops,
      };
      if (!same(options, draft.photoOptions ?? emptyVintedListingPhotoOptions())) {
        draft = await this.imageApi.savePhotoOptions(draft, options);
        if (!this.current(generation, context)) return;
        this.draft.set(draft);
      }
      this.referenceContent.set(content);
      this.dirty.set(change !== this.changed());
    } catch (error) {
      if (!this.current(generation, context)) return;
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Der Entwurf konnte nicht gespeichert werden. Deine Eingaben bleiben erhalten.',
      );
      if (error instanceof VintedListingStorageError && error.code === 'conflict')
        this.conflict.set(true);
    }
  }
  private contentSnapshot(allowIncompletePrice = false): VintedListingContent {
    const values = this.form.getRawValue();
    let priceCents: number | null;
    try {
      priceCents = parseVintedListingPrice(values.price);
    } catch (error) {
      if (!allowIncompletePrice) throw error;
      priceCents = null;
    }
    const previous = this.referenceContent();
    const categoryId = values.categoryId === null ? null : Number(values.categoryId);
    const categorySame = categoryId === previous.categoryId;
    const selectedBrand = this.selectedBrand();
    const colorLabels = labels(values.colors),
      materialLabels = labels(values.materials);
    const content = parseVintedListingContent({
      ...previous,
      aiPhoto: values.aiPhoto,
      title: values.title,
      description: values.description,
      priceCents,
      categoryId,
      categoryLabel:
        (categoryId === null ? undefined : this.sellingCategories.get(categoryId)?.path) ??
        this.categories().find((category) => category.id === categoryId)?.path ??
        (categorySame ? previous.categoryLabel : ''),
      brandLabel: values.brand,
      brandId:
        selectedBrand &&
        selectedBrand.categoryId === categoryId &&
        selectedBrand.brandLabel === values.brand
          ? selectedBrand.brandId
          : !this.brandEdited && categorySame && values.brand === previous.brandLabel
            ? previous.brandId
            : null,
      sizeLabel: values.size,
      sizeId: categorySame && values.size === previous.sizeLabel ? previous.sizeId : null,
      conditionLabel: values.condition,
      conditionId:
        categorySame && values.condition === previous.conditionLabel ? previous.conditionId : null,
      colorLabels,
      colorIds: categorySame && same(colorLabels, previous.colorLabels) ? previous.colorIds : [],
      materialLabels,
      materialIds:
        categorySame && same(materialLabels, previous.materialLabels) ? previous.materialIds : [],
      packageSizeId: categorySame ? previous.packageSizeId : null,
      attributes: categorySame ? previous.attributes : {},
    });
    const fields = this.selectedFields();
    return prepareFlipbaseVintedListingContent(
      fields?.categoryId === categoryId
        ? applyVintedListingFieldSelection(content, fields)
        : content,
    );
  }
  private focusFirstIssue(): void {
    setTimeout(() =>
      this.host?.nativeElement
        .querySelector<HTMLElement>(
          '[aria-invalid="true"]:not(:disabled), [data-listing-issue] input:not([hidden]):not([type="hidden"]):not(:disabled), [data-listing-issue] button:not(:disabled)',
        )
        ?.focus(),
    );
  }
  private patch(content: VintedListingContent, connectionId: string | null): void {
    this.brandEdited = false;
    this.selectedBrand.set(null);
    this.selectedFields.set(null);
    this.form.reset(
      {
        aiPhoto: content.aiPhoto ?? false,
        title: content.title,
        description: content.description,
        price:
          content.priceCents === null
            ? ''
            : (content.priceCents / 100).toFixed(2).replace('.', ','),
        categoryId: content.categoryId === null ? null : String(content.categoryId),
        brand: content.brandLabel,
        size: content.sizeLabel,
        condition: content.conditionLabel,
        colors: content.colorLabels.join(', '),
        materials: content.materialLabels.join(', '),
        connectionId,
      },
      { emitEvent: false },
    );
    this.changed.update((value) => value + 1);
  }
  private currentCategoryId(): number | null {
    const value = this.form.controls.categoryId.value;
    return value === null ? null : Number(value);
  }
}
