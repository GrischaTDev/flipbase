import { NgTemplateOutlet } from '@angular/common';
import { KleinanzeigenAccountsComponent } from '../kleinanzeigen-accounts/kleinanzeigen-accounts.component';
import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import { kleinanzeigenCategories } from '../../models/kleinanzeigen-categories';
import { kleinanzeigenCategoryPath } from '../../../../../../supabase/functions/_shared/kleinanzeigen-form-contracts';
import {
  kleinanzeigenJobStatus,
  kleinanzeigenJobIssue,
  type KleinanzeigenListingJob,
} from '../../models/kleinanzeigen-listing-job';
import { KleinanzeigenPublicationPanelComponent } from '../kleinanzeigen-publication-panel/kleinanzeigen-publication-panel.component';
import { KleinanzeigenListingJobService } from '../../services/kleinanzeigen-listing-job.service';
import type { KleinanzeigenListingJobScope } from '../../services/kleinanzeigen-listing-job.service';
import type { KleinanzeigenDraftInput } from '../../models/kleinanzeigen-transfer-mapping';
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
  viewChild,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  FormRecord,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { MarketplacePlatformPickerComponent } from '../../../../shared/components/marketplace-platform-picker/marketplace-platform-picker.component';
import type { MarketplaceId } from '../../../../core/services/marketplace-settings.service';
import { MarketplaceSettingsService } from '../../../../core/services/marketplace-settings.service';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { KleinanzeigenListingFieldsComponent } from '../kleinanzeigen-listing-fields/kleinanzeigen-listing-fields.component';
import {
  ListingTransferService,
  type PreparedKleinanzeigenTransfer,
} from '../../services/listing-transfer.service';
import { KleinanzeigenExtensionBridge } from '../../services/kleinanzeigen-extension-bridge';
import { KleinanzeigenAccountService } from '../../services/kleinanzeigen-account.service';
import { KleinanzeigenFormSchemaService } from '../../services/kleinanzeigen-form-schema.service';
import type { MarketplaceListingReference } from '../../models/marketplace-overview.models';
import type { KleinanzeigenAccount } from '../../../../../../supabase/functions/_shared/kleinanzeigen-contracts';
import type {
  KleinanzeigenCategoryChoice,
  KleinanzeigenProviderSchema,
} from '../../../../../../supabase/functions/_shared/kleinanzeigen-form-contracts';
import type { KleinanzeigenTransferDraft } from '../../../../../../supabase/functions/_shared/kleinanzeigen-listing-contracts';
import { retainKleinanzeigenCategoryFields } from '../../models/kleinanzeigen-category-fields';
import {
  kleinanzeigenContentKey,
  validateKleinanzeigenPublication,
} from '../../models/kleinanzeigen-provider-schema';
@Component({
  selector: 'app-listing-transfer-dialog',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    MarketplacePlatformPickerComponent,
    KleinanzeigenAccountsComponent,
    CategoryPickerComponent,
    ModalShellComponent,
    ButtonComponent,
    NoticeBannerComponent,
    TextFieldComponent,
    NumberInputComponent,
    CustomSelectComponent,
    ProductThumbnailComponent,
    KleinanzeigenListingFieldsComponent,
    KleinanzeigenPublicationPanelComponent,
  ],
  providers: [
    ListingTransferService,
    KleinanzeigenListingJobService,
    KleinanzeigenExtensionBridge,
    KleinanzeigenFormSchemaService,
  ],
  templateUrl: './listing-transfer-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingTransferDialogComponent {
  readonly kleinanzeigenAccount = viewChild(KleinanzeigenAccountsComponent);
  readonly source = input.required<MarketplaceListingReference>();
  readonly targetConnectionId = input<string | null>(null);
  readonly closed = output<void>();
  readonly saved = output<KleinanzeigenTransferDraft>();
  readonly published = output<KleinanzeigenListingJob>();
  readonly publicationConfirmed = signal(false);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly settings = inject(MarketplaceSettingsService);
  private readonly transfers = inject(ListingTransferService);
  readonly publicationJobs = inject(KleinanzeigenListingJobService);
  readonly publishing = signal(false);
  readonly publicationStatus = computed(() => {
    const job = this.publicationJobs.job();
    return job ? kleinanzeigenJobStatus(job) : null;
  });
  readonly publicationIssue = computed(() =>
    kleinanzeigenJobIssue(this.publicationJobs.job()?.errorCode ?? null),
  );

  readonly publicationPreparation = signal(false);
  readonly publicationPending = computed(() =>
    ['queued', 'claimed', 'writing', 'outcome_unknown'].includes(
      this.publicationJobs.job()?.state ?? '',
    ),
  );
  private publicationRequestId = crypto.randomUUID();
  private readonly accountsApi = inject(KleinanzeigenAccountService);
  private readonly schemas = inject(KleinanzeigenFormSchemaService);
  readonly bindingIssue = this.schemas.bindingIssue;
  readonly accountManagementOpen = signal(false);
  readonly extension = inject(KleinanzeigenExtensionBridge);
  private readonly confirmation = inject(ConfirmDialogService);
  private generation = 0;
  private owner: string | null = null;
  private lastSavedContent: string | null = null;
  private openedContent: string | null = null;
  readonly accounts = signal<readonly KleinanzeigenAccount[]>([]);
  readonly preview = signal<PreparedKleinanzeigenTransfer | null>(null);
  readonly savedDraft = signal<KleinanzeigenTransferDraft | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly schema = signal<KleinanzeigenProviderSchema | null>(null);
  readonly schemaRevision = signal<string | null>(null);
  readonly categorySource = kleinanzeigenCategories;
  readonly categorySelection = new FormControl<string | null>(null);
  readonly categoryPath = signal('');
  readonly categoryLabel = signal('');
  readonly categoryChoices = signal<readonly KleinanzeigenCategoryChoice[]>([]);
  readonly selectedShippingGroup = signal('');
  readonly selectedShippingMethods = signal<readonly string[]>([]);
  readonly formTick = signal(0);
  readonly submitted = signal(false);
  private readonly selectedTarget = signal('');
  readonly platform = new FormControl('', { nonNullable: true });
  readonly selectedPlatform = signal('');
  readonly availablePlatforms = computed<readonly MarketplaceId[]>(() =>
    (['vinted', 'ebay', 'kleinanzeigen'] as const).filter((id) =>
      this.settings.isMarketplaceEnabled(id),
    ),
  );
  readonly unavailablePlatforms: readonly MarketplaceId[] = ['vinted', 'ebay'];
  readonly step = computed(() =>
    this.preview() ? 'form' : this.selectedPlatform() ? 'account' : 'platform',
  );
  readonly stepTitle = computed(() =>
    this.step() === 'platform'
      ? 'Plattform wählen'
      : this.step() === 'account'
        ? 'Konto wählen'
        : 'Kleinanzeigen',
  );
  readonly schemaLoadFailed = signal(false);
  readonly target = new FormControl('', { nonNullable: true });
  readonly shippingGroup = new FormControl('', { nonNullable: true });
  readonly attributes = new FormRecord<FormControl<string>>({});
  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(65), Validators.pattern(/\S/u)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(4000), Validators.pattern(/\S/u)],
    }),
    price: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(99999999),
      Validators.pattern(/^\d+(?:\.\d{1,2})?$/u),
    ]),
    priceType: new FormControl<'FIXED' | 'NEGOTIABLE'>('FIXED', { nonNullable: true }),
    shippingType: new FormControl<'pickup' | 'both'>('pickup', { nonNullable: true }),
    postalCode: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(/^\d{5}$/u)],
    }),
  });
  readonly targetOptions = computed(() =>
    this.accounts().map((account) => ({
      value: account.connectionId,
      label: account.displayName,
      description: 'Kleinanzeigen · Privatkonto',
    })),
  );
  readonly attributeHints = computed(() =>
    Object.entries(this.preview()?.attributeHints ?? {}).map(([label, value]) => ({
      label:
        (
          {
            brand: 'Marke',
            size: 'Größe',
            condition: 'Zustand',
            color: 'Farbe',
            material: 'Material',
          } as Record<string, string>
        )[label] ?? label,
      value,
    })),
  );
  readonly categoryOptions = computed(() =>
    this.categoryChoices().map((choice) => ({
      value: choice.path,
      label: choice.label + (choice.isParent ? ' …' : ''),
    })),
  );
  readonly priceTypes = [
    { value: 'FIXED', label: 'Festpreis' },
    { value: 'NEGOTIABLE', label: 'Verhandlungsbasis' },
  ];
  readonly shippingTypes = [
    { value: 'pickup', label: 'Abholung' },
    { value: 'both', label: 'Versand und Abholung' },
  ];
  readonly publicationIssues = computed(() => {
    this.formTick();
    const schema = this.schema();
    return schema
      ? validateKleinanzeigenPublication(
          this.content(),
          schema,
          this.preview()?.originalPhotoReferences.length ?? 0,
        )
      : [{ field: 'categoryId', message: 'Wähle und prüfe die Kleinanzeigen-Kategorie.' }];
  });
  readonly fieldErrors = computed<Readonly<Record<string, string>>>(() => {
    this.formTick();
    return Object.fromEntries(
      this.publicationIssues()
        .filter((issue) => {
          const field = issue.field === 'priceCents' ? 'price' : issue.field;
          return (
            this.submitted() ||
            this.form.get(field)?.touched ||
            this.attributes.controls[field]?.touched ||
            (field === 'categoryId' && this.categorySelection.touched)
          );
        })
        .map((issue) => [issue.field, issue.message]),
    );
  });
  readonly publicationScope = computed<KleinanzeigenListingJobScope | null>(() => {
    const account = this.accounts().find((value) => value.connectionId === this.selectedTarget());
    return account?.localGrant?.active && account.localGrant.canPublish
      ? {
          workspaceId: account.workspaceId,
          connectionId: account.connectionId,
          externalAccountId: account.externalAccountId,
          generation: account.localGrant.generation,
          accountType: account.accountType,
        }
      : null;
  });
  readonly unsavedChanges = computed(() => {
    this.formTick();
    this.savedDraft();
    return this.lastSavedContent !== kleinanzeigenContentKey(this.content());
  });
  readonly publicationMessages = computed(() =>
    this.publicationIssues().map((issue) => issue.message),
  );
  constructor() {
    effect(() => {
      const disabled =
        this.busy() ||
        this.publishing() ||
        this.publicationPending() ||
        this.publicationConfirmed();
      untracked(() => {
        if (disabled) this.categorySelection.disable({ emitEvent: false });
        else this.categorySelection.enable({ emitEvent: false });
      });
    });
    effect(() => {
      const disabled = this.publishing();
      for (const control of [this.platform, this.target]) {
        if (disabled) control.disable({ emitEvent: false });
        else control.enable({ emitEvent: false });
      }
    });
    const destroy = inject(DestroyRef);
    const subscriptions = [
      this.categorySelection.valueChanges.subscribe((path) => void this.selectCategory(path)),
      this.form.events.subscribe(() => this.formTick.update((value) => value + 1)),
      this.attributes.events.subscribe(() => this.formTick.update((value) => value + 1)),
      this.shippingGroup.valueChanges.subscribe((value) => {
        this.selectedShippingGroup.set(value);
        this.selectedShippingMethods.set([]);
        this.formTick.update((tick) => tick + 1);
      }),
      this.platform.valueChanges.subscribe((value) => {
        this.selectedPlatform.set(value);
        this.target.setValue('', { emitEvent: false });
        this.selectedTarget.set('');
        this.clearPreparation();
      }),
      this.target.valueChanges.subscribe((value) => {
        this.selectedTarget.set(value);
        this.clearPreparation();
        if (this.selectedPlatform() === 'kleinanzeigen' && value) void this.prepare();
      }),
    ];
    destroy.onDestroy(() => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      this.cancel();
    });
    this.extension.checkInstallation();
    effect(() => {
      const source = this.source();
      const userId = this.auth.currentUser()?.id;
      const workspace = this.workspace.currentWorkspace();
      const ready = this.settings.ready();
      const enabled = this.settings.isKleinanzeigenEnabled();
      const preferred = this.targetConnectionId();
      untracked(() => {
        this.cancel();
        this.clearPreparation();
        this.accounts.set([]);
        this.platform.setValue('', { emitEvent: false });
        this.selectedPlatform.set('');
        this.target.setValue('', { emitEvent: false });
        this.selectedTarget.set('');
        this.owner = userId ?? null;
        if (
          userId &&
          workspace?.id === source.workspaceId &&
          !workspace.archived_at &&
          source.platform === 'vinted' &&
          ready &&
          enabled
        )
          void this.loadAccounts(source.workspaceId, preferred);
      });
    });
  }
  selectPlatform(platform: MarketplaceId): void {
    if (
      this.busy() ||
      this.publishing() ||
      !this.availablePlatforms().includes(platform) ||
      this.unavailablePlatforms.includes(platform)
    )
      return;
    this.platform.setValue(platform);
  }
  async back(): Promise<void> {
    if (this.busy() || this.publishing() || this.publicationPending()) return;
    if (
      this.preview() &&
      (this.form.dirty ||
        this.attributes.dirty ||
        (this.lastSavedContent ?? this.openedContent) !==
          kleinanzeigenContentKey(this.content())) &&
      !(await this.confirmation.frage({
        titel: 'Konto wechseln?',
        text: 'Deine ungespeicherten Änderungen werden verworfen. Gespeicherte Entwürfe bleiben erhalten.',
        bestaetigenText: 'Änderungen verwerfen',
        abbrechenText: 'Weiter bearbeiten',
      }))
    )
      return;
    if (this.step() === 'form') {
      this.target.setValue('');
    } else {
      this.platform.setValue('');
    }
  }
  async accountChanged(): Promise<void> {
    const generation = this.generation;
    const path = this.categoryPath();
    await this.loadAccounts(this.source().workspaceId, null);
    if (!this.current(generation)) return;
    this.accountManagementOpen.set(false);
    if (!this.target.value) return;
    if (!this.accounts().some((account) => account.connectionId === this.target.value)) {
      this.error.set('Das ausgewählte Konto ist nicht mehr verfügbar. Wähle es erneut.');
      return;
    }
    if (path) await this.selectCategory(path);
  }
  private cancel(): void {
    this.generation++;
    this.transfers.cancel();
    this.schemas.cancel();
    this.publicationJobs.cancel();
  }
  private clearPreparation(): void {
    this.generation++;
    this.transfers.cancel();
    this.schemas.cancel();
    this.publicationJobs.cancel();
    this.accountManagementOpen.set(false);
    this.submitted.set(false);
    this.preview.set(null);
    this.savedDraft.set(null);
    this.publicationConfirmed.set(false);
    this.publicationPreparation.set(false);
    this.publicationRequestId = crypto.randomUUID();
    this.schema.set(null);
    this.schemaLoadFailed.set(false);
    this.schemaRevision.set(null);
    this.categoryPath.set('');
    this.categorySelection.setValue(null, { emitEvent: false });
    this.categoryLabel.set('');
    this.categoryChoices.set([]);
    this.shippingGroup.setValue('', { emitEvent: false });
    this.selectedShippingGroup.set('');
    this.selectedShippingMethods.set([]);
    this.form.reset();
    this.lastSavedContent = null;
    this.openedContent = null;
    this.notice.set(null);
    this.error.set(null);
    this.busy.set(false);
    for (const key of Object.keys(this.attributes.controls)) this.attributes.removeControl(key);
  }
  private current(generation: number): boolean {
    return (
      generation === this.generation &&
      this.owner !== null &&
      this.auth.currentUser()?.id === this.owner &&
      this.workspace.currentWorkspace()?.id === this.source().workspaceId &&
      !this.workspace.currentWorkspace()?.archived_at
    );
  }
  private async loadAccounts(workspaceId: string, preferred: string | null): Promise<void> {
    const generation = this.generation;
    this.busy.set(true);
    try {
      const result = await this.accountsApi.readAccounts(workspaceId);
      if (!this.current(generation)) return;
      this.accounts.set(
        result.canManage
          ? result.accounts.filter(
              (account) => account.status !== 'disconnected' && account.accountType === 'private',
            )
          : [],
      );
      if (preferred && this.accounts().some((account) => account.connectionId === preferred)) {
        this.platform.setValue('kleinanzeigen', { emitEvent: false });
        this.selectedPlatform.set('kleinanzeigen');
      }
    } catch {
      if (this.current(generation))
        this.error.set('Die Kleinanzeigen-Zielkonten konnten nicht geladen werden.');
    } finally {
      if (this.current(generation)) this.busy.set(false);
    }
  }
  async prepare(): Promise<void> {
    if (
      this.busy() ||
      !this.accounts().some((account) => account.connectionId === this.target.value)
    )
      return;
    const generation = ++this.generation;
    this.busy.set(true);
    this.error.set(null);
    try {
      const preview = await this.transfers.prepare(
        this.source(),
        this.target.value,
        crypto.randomUUID(),
      );
      if (!this.current(generation)) return;
      this.preview.set(preview);
      this.savedDraft.set(null);
      this.lastSavedContent = null;
      this.form.setValue({
        title: preview.content.title,
        description: preview.content.description,
        price: preview.content.priceCents === null ? null : preview.content.priceCents / 100,
        priceType: preview.content.priceType,
        shippingType: preview.content.shippingType === 'pickup' ? 'pickup' : 'both',
        postalCode: preview.content.postalCode ?? '',
      });
      this.openedContent = kleinanzeigenContentKey(this.content());
      this.form.markAsPristine();
      this.form.markAsUntouched();
    } catch (error) {
      if (this.current(generation)) this.error.set(this.message(error));
    } finally {
      if (this.current(generation)) this.busy.set(false);
    }
  }
  async selectCategory(path: string | null): Promise<void> {
    if (this.busy() || this.publishing()) return;
    const previousFields = this.content().categoryFields;
    this.categoryPath.set(path ?? '');
    this.categoryLabel.set(path ? (this.categorySource.getCategory(path)?.fullName ?? '') : '');
    this.schema.set(null);
    this.schemaRevision.set(null);
    this.notice.set(null);
    this.error.set(null);
    for (const key of Object.keys(this.attributes.controls))
      this.attributes.removeControl(key, { emitEvent: false });
    this.shippingGroup.setValue('', { emitEvent: false });
    this.selectedShippingGroup.set('');
    this.selectedShippingMethods.set([]);
    this.formTick.update((value) => value + 1);
    if (!path) return;
    if (!this.categorySource.getCategory(path)?.isLeaf) {
      this.notice.set('Wähle eine vollständige Unterkategorie.');
      return;
    }
    if (!kleinanzeigenCategoryPath(path)) {
      this.notice.set(
        'Diese Kategorie ist im Baum vorhanden. Ihre automatische Übergabe wird noch nicht unterstützt.',
      );
      return;
    }
    this.publicationPreparation.set(true);
    await this.browse(path, previousFields);
  }
  async browse(path: string, previousFields?: Readonly<Record<string, string>>): Promise<void> {
    const account = this.accounts().find(
      (candidate) => candidate.connectionId === this.target.value,
    );
    if (this.busy() || !this.preview() || !account) return;
    const generation = this.generation;
    this.busy.set(true);
    this.error.set(null);
    this.schemaLoadFailed.set(false);
    try {
      const result = await this.schemas.browse(
        {
          workspaceId: account.workspaceId,
          connectionId: account.connectionId,
          externalAccountId: account.externalAccountId,
          generation: account.localGrant?.generation ?? 0,
        },
        path,
        this.publicationPreparation() ? 'provider' : 'saved',
      );
      if (!this.current(generation)) return;
      this.categoryPath.set(result.categoryPath);
      this.categorySelection.setValue(result.categoryPath || null, { emitEvent: false });
      this.categoryLabel.set(result.categoryLabel);
      this.categoryChoices.set(result.choices);
      if (result.schema) {
        const values = retainKleinanzeigenCategoryFields(
          previousFields ?? this.content().categoryFields,
          result.schema,
          this.preview()?.attributeHints ?? {},
        );
        for (const key of Object.keys(this.attributes.controls))
          this.attributes.removeControl(key, { emitEvent: false });
        for (const field of result.schema.fields)
          this.attributes.addControl(
            field.key,
            new FormControl(values[field.key] ?? '', { nonNullable: true }),
            { emitEvent: false },
          );
        this.shippingGroup.setValue(values['ad-shipping-package-size'] ?? '');
        this.selectedShippingMethods.set(
          JSON.parse(values['ad-shipping-options'] ?? '[]') as string[],
        );
        this.schema.set(result.schema);
        this.schemaRevision.set(result.schemaRevision);
      } else {
        this.schema.set(null);
        this.schemaRevision.set(null);
      }
      this.formTick.update((value) => value + 1);
    } catch (error) {
      if (this.current(generation)) {
        this.schemaLoadFailed.set(true);
        this.schema.set(null);
        this.schemaRevision.set(null);
        if (this.publicationPreparation()) this.error.set(this.message(error));
        else this.notice.set(this.message(error));
      }
    } finally {
      if (this.current(generation)) this.busy.set(false);
    }
  }
  chooseMethods(values: readonly string[]): void {
    this.selectedShippingMethods.set(values);
    this.formTick.update((value) => value + 1);
  }
  content(): KleinanzeigenDraftInput {
    const value = this.form.getRawValue();
    const price = value.price;
    const cents = price === null ? null : Math.round(price * 100);
    const fields: Record<string, string> = { ...this.attributes.getRawValue() };
    if (
      value.shippingType === 'both' &&
      this.shippingGroup.value &&
      this.selectedShippingMethods().length
    ) {
      fields['ad-shipping-package-size'] = this.shippingGroup.value;
      fields['ad-shipping-options'] = JSON.stringify(this.selectedShippingMethods());
    }
    return {
      title: value.title,
      description: value.description,
      priceCents: cents,
      currency: 'EUR',
      priceType: value.priceType,
      shippingType: value.shippingType,
      shippingPriceCents: null,
      postalCode: value.postalCode.trim() || null,
      categoryId: this.schema()?.categoryPath ?? (this.categoryPath() || null),
      categoryFields: fields,
      schemaRevision: this.schemaRevision(),
    };
  }
  async save(): Promise<void> {
    const preview = this.preview();
    if (
      this.busy() ||
      !preview ||
      this.publicationConfirmed() ||
      this.savedDraft()?.status === 'online' ||
      this.savedDraft()?.status === 'ended'
    )
      return;
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set(
        'Prüfe Titel, Beschreibung und Preis. Die vollständigen übernommenen Texte bleiben erhalten.',
      );
      return;
    }
    const generation = this.generation;
    this.busy.set(true);
    this.error.set(null);
    try {
      const content = this.content();
      if (content.priceCents === null) throw new Error('Trage einen gültigen Europreis ein.');
      const draft = await this.transfers.save(
        preview,
        { ...content, priceCents: content.priceCents },
        this.savedDraft()?.revision ?? null,
      );
      if (!this.current(generation)) return;
      this.savedDraft.set(draft);
      this.lastSavedContent = kleinanzeigenContentKey(draft.content);
      if (this.lastSavedContent !== kleinanzeigenContentKey(this.content())) {
        this.form.markAsDirty();
        this.notice.set(
          'Eine vorhandene Zielfassung wurde geladen. Deine Änderungen sind noch nicht gespeichert. Prüfe sie und speichere erneut.',
        );
        return;
      }
      this.form.markAsPristine();
      this.attributes.markAsPristine();
      this.notice.set(
        draft.imagesComplete
          ? 'Deine Inseratsangaben und Bilder sind gesichert.'
          : 'Deine Inseratsangaben sind gespeichert; die Bildübernahme ist noch unvollständig.',
      );
      this.saved.emit(draft);
    } catch (error) {
      if (this.current(generation)) this.error.set(this.message(error));
    } finally {
      if (this.current(generation)) this.busy.set(false);
    }
  }
  async publish(): Promise<void> {
    if (
      this.busy() ||
      this.publishing() ||
      this.publicationPending() ||
      !this.preview() ||
      this.publicationConfirmed()
    )
      return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    this.attributes.markAllAsTouched();
    this.categorySelection.markAsTouched();
    const scope = this.publicationScope();
    if (!scope) {
      this.error.set(
        'Für dieses Konto fehlt die aktuelle Veröffentlichungsfreigabe. Öffne das Zahnrad am Konto.',
      );
      return;
    }
    const generation = this.generation;
    if (!this.extension.formSchemaAvailable()) {
      this.error.set(
        'Für Eigenschaften und Veröffentlichung ist die Flipbase-Erweiterung erforderlich. Prüfe die Erweiterung in diesem Browserprofil.',
      );
      return;
    }
    if (!this.schema()) {
      this.error.set(
        'Wähle eine vollständige Kleinanzeigen-Kategorie und prüfe die Eigenschaften.',
      );
      return;
    }
    this.form.markAllAsTouched();
    if (this.form.invalid || this.publicationIssues().length) {
      this.error.set('Ergänze die fehlenden Angaben und prüfe die markierten Felder.');
      return;
    }
    this.publishing.set(true);
    this.error.set(null);
    try {
      const selectedPath = this.schema()!.categoryPath;
      const oldRevision = this.schemaRevision();
      this.publicationPreparation.set(true);
      await this.browse(selectedPath);
      if (!this.current(generation) || this.error()) return;
      if (this.schemaRevision() !== oldRevision || this.publicationIssues().length) {
        this.notice.set(
          'Die aktuellen Kleinanzeigen-Felder wurden ergänzt. Prüfe sie und klicke anschließend erneut auf Inserieren.',
        );
        return;
      }
      await this.save();
      const draft = this.savedDraft();
      if (
        !this.current(generation) ||
        this.error() ||
        !draft ||
        !draft.imagesComplete ||
        this.unsavedChanges()
      )
        return;
      if (
        this.publicationScope()?.connectionId !== scope.connectionId ||
        this.publicationScope()?.generation !== scope.generation
      )
        return;
      const job = await this.publicationJobs.enqueue(
        scope,
        draft.id,
        draft.revision,
        this.publicationRequestId,
      );
      if (!this.current(generation)) return;
      if (job && !['queued', 'claimed', 'writing', 'outcome_unknown'].includes(job.state))
        this.publicationRequestId = crypto.randomUUID();
      if (job?.state === 'confirmed') this.onPublished(job);
    } catch (error) {
      if (this.current(generation) && !this.publicationJobs.error())
        this.error.set(this.message(error));
    } finally {
      this.publishing.set(false);
    }
  }
  onPublished(job: KleinanzeigenListingJob): void {
    const draft = this.savedDraft();
    if (
      this.publicationConfirmed() ||
      !draft ||
      job.state !== 'confirmed' ||
      job.draftId !== draft.id ||
      job.workspaceId !== draft.workspaceId ||
      job.connectionId !== draft.targetConnectionId
    )
      return;
    this.publicationConfirmed.set(true);
    this.notice.set('Dein Inserat ist jetzt bei Kleinanzeigen online.');
    this.published.emit(job);
  }
  async close(): Promise<void> {
    if (this.busy() || this.publishing()) return;
    if (
      this.preview() &&
      (this.form.dirty ||
        this.attributes.dirty ||
        this.lastSavedContent !== kleinanzeigenContentKey(this.content())) &&
      !(await this.confirmation.frage({
        titel: 'Übertragung schließen?',
        text: 'Deine ungespeicherten Änderungen werden verworfen. Bereits gespeicherte Entwürfe bleiben erhalten.',
        bestaetigenText: 'Änderungen verwerfen',
        abbrechenText: 'Weiter bearbeiten',
      }))
    )
      return;
    this.cancel();
    this.closed.emit();
  }
  private message(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Die Übertragung konnte nicht bestätigt werden.';
  }
}
