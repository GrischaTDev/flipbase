import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import {
  CustomSelectComponent,
  type SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { EntryPageLayoutComponent } from '../../../../shared/components/entry-page-layout/entry-page-layout.component';
import { TwoColumnLayoutComponent } from '../../../../shared/components/two-column-layout/two-column-layout.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ListingExtensionService } from '../../services/listing-extension.service';
import { ListingService } from '../../services/listing.service';
import { ListingTemplateService } from '../../services/listing-template.service';
import type {
  ListingContent,
  ListingEditorItem,
  ListingPriceType,
  ListingRow,
  ListingShippingType,
  ListingStyleTone,
} from '../../models/listing.models';
import { canPrepareListing } from '../../models/listing.rules';
import { ListingExtensionHelpComponent } from '../../components/listing-extension-help/listing-extension-help.component';
import type { InventoryItem } from '../../../../core/models/flipbase.models';

@Component({
  selector: 'app-listing-editor',
  imports: [
    ButtonComponent,
    CustomCheckboxComponent,
    CustomSelectComponent,
    EntryPageLayoutComponent,
    ListingExtensionHelpComponent,
    NumberInputComponent,
    ReactiveFormsModule,
    TextFieldComponent,
    TwoColumnLayoutComponent,
  ],
  templateUrl: './listing-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
})
export class ListingEditorComponent {
  readonly listingService = inject(ListingService);
  readonly extension = inject(ListingExtensionService);
  private readonly listingTemplate = inject(ListingTemplateService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private baseline = '';
  readonly isSaving = signal(false);
  readonly helpOpen = signal(false);
  readonly listingId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  readonly isEdit = computed(() => this.listingId() !== null);
  private readonly selectedItemId = signal('');
  readonly priceTypeOptions: readonly SelectOption<ListingPriceType>[] = [
    { value: 'FIXED', label: 'Festpreis' },
    { value: 'NEGOTIABLE', label: 'Verhandlungsbasis' },
  ];
  readonly shippingTypeOptions: readonly SelectOption<ListingShippingType>[] = [
    { value: 'pickup', label: 'Abholung' },
    { value: 'shipping', label: 'Versand' },
    { value: 'both', label: 'Beides' },
  ];
  readonly styleToneOptions: readonly SelectOption<ListingStyleTone>[] = [
    { value: 'dealer', label: 'Neutral' },
    { value: 'collector', label: 'Für Sammler' },
    { value: 'bargain', label: 'Schnäppchen' },
  ];
  readonly itemOptions = computed<readonly SelectOption<string>[]>(() =>
    this.listingService
      .items()
      .filter((item) => !item.archivedAt && item.status !== 'archived' && item.status !== 'sold')
      .map((item) => ({
        value: item.id,
        label: item.title,
        description: this.createIssueFor(item) ?? this.itemStatusLabel(item.status),
      })),
  );
  readonly form = new FormGroup({
    inventoryItemId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/.*\S.*/), Validators.maxLength(65)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(4000)],
    }),
    price: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(99_999_999),
      Validators.pattern(/^\d+(\.\d{1,2})?$/),
    ]),
    priceType: new FormControl<ListingPriceType>('FIXED', { nonNullable: true }),
    shippingType: new FormControl<ListingShippingType>('pickup', { nonNullable: true }),
    shippingPrice: new FormControl<number | null>(null, [
      Validators.min(0),
      Validators.pattern(/^\d+(\.\d{1,2})?$/),
    ]),
    postalCode: new FormControl('', [Validators.pattern(/^\d{5}$/)]),
    styleTone: new FormControl<ListingStyleTone>('dealer', { nonNullable: true }),
    includeNonSmoking: new FormControl(false, { nonNullable: true }),
    includeDisclaimer: new FormControl(true, { nonNullable: true }),
  });
  readonly selectedItem = computed(
    () => this.listingService.items().find((item) => item.id === this.selectedItemId()) ?? null,
  );
  readonly selectedOpenListing = computed(() => {
    if (this.isEdit()) return null;
    const item = this.selectedItem();
    return item ? this.openListingFor(item.id) : null;
  });
  readonly selectedItemIssue = computed(() => {
    if (this.isEdit()) return null;
    const item = this.selectedItem();
    return item ? this.createIssueFor(item) : null;
  });

  constructor() {
    this.extension.start();
    effect(() => {
      const workspaceId = this.workspaceService.currentWorkspace()?.id;
      if (!workspaceId) {
        this.listingService.clear();
        return;
      }
      if (this.listingService.loadedWorkspaceId() !== workspaceId) {
        void this.listingService.load(workspaceId);
      }
    });
    effect(() => {
      const id = this.listingId();
      if (!id) return;
      const row = this.listingService.getById(id);
      if (!row) return;
      this.form.patchValue({ inventoryItemId: row.item.id, ...row.listing.content });
      this.selectedItemId.set(row.item.id);
      this.form.controls.inventoryItemId.disable({ emitEvent: false });
      this.storeBaseline();
    });
    this.form.controls.inventoryItemId.valueChanges.subscribe((itemId) => {
      this.selectedItemId.set(itemId);
      if (this.isEdit() || this.form.controls.price.dirty) return;
      const item = this.listingService.items().find((candidate) => candidate.id === itemId);
      this.form.controls.price.setValue(item?.expectedValue ?? item?.allocatedPurchaseCost ?? 0);
    });
    this.form.controls.shippingType.valueChanges.subscribe((type) => {
      if (type === 'pickup') this.form.controls.shippingPrice.setValue(null);
    });
    this.storeBaseline();
  }

  hasUnsavedChanges(): boolean {
    return this.baseline !== JSON.stringify(this.form.getRawValue());
  }
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }

  async generate(): Promise<void> {
    const item = this.selectedItem();
    const price = this.form.controls.price.value;
    if (!item || price === null) return;
    if (
      (this.form.controls.title.dirty || this.form.controls.description.dirty) &&
      !(await this.confirmDialog.frage({
        titel: 'Manuell bearbeitete Texte ersetzen?',
        text: 'Titel und Beschreibung werden durch die neu erzeugte Vorlage ersetzt.',
        bestaetigenText: 'Texte ersetzen',
      }))
    ) {
      return;
    }
    const generated = this.listingTemplate.generateKleinanzeigenListing(
      this.toInventoryItem(item),
      price,
      {
        includeDisclaimer: this.form.controls.includeDisclaimer.value,
        includeNonSmoking: this.form.controls.includeNonSmoking.value,
        styleTone: this.form.controls.styleTone.value,
      },
    );
    this.form.patchValue({
      title: generated.title.slice(0, 65),
      description: generated.description,
    });
  }

  async copyTexts(): Promise<void> {
    if (!navigator.clipboard) {
      this.toast.error('Texte konnten nicht kopiert werden.');
      return;
    }
    try {
      await navigator.clipboard.writeText(
        `${this.form.controls.title.value}\n\n${this.form.controls.description.value}`,
      );
      this.toast.success('Titel und Beschreibung wurden kopiert.');
    } catch (error: unknown) {
      this.toast.error(
        'Texte konnten nicht kopiert werden.',
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  async save(): Promise<void> {
    const selectedItemIssue = this.selectedItemIssue();
    if (selectedItemIssue) {
      this.toast.error('Dieser Artikel kann nicht vorbereitet werden.', selectedItemIssue);
      return;
    }
    if (this.form.invalid || this.isSaving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    try {
      const content = this.content();
      const result = this.isEdit()
        ? await this.listingService.updateContent(this.listingId()!, content)
        : await this.listingService.prepare(this.form.controls.inventoryItemId.value, content);
      if (result.error) {
        this.toast.error('Inserat konnte nicht gespeichert werden.', result.error.message);
        return;
      }
      this.storeBaseline();
      if (this.isEdit()) {
        this.toast.success('Inserat gespeichert.');
        void this.router.navigate(['/listings']);
        return;
      }
      const row = result.data ? this.listingService.getById(result.data.id) : null;
      if (!this.extension.available() || !row) {
        this.helpOpen.set(true);
        this.toast.success('Inserat wurde vorbereitet.');
        return;
      }
      const payload = await this.listingService.buildExtensionPayload(row);
      this.extension.publish(payload.payload);
      if (payload.missingImages.length) {
        const count = payload.missingImages.length;
        this.toast.warning(
          `${count} ${count === 1 ? 'Bild konnte' : 'Bilder konnten'} nicht übertragen werden.`,
        );
      }
      this.toast.success(
        'Kleinanzeigen wurde geöffnet.',
        'Setze das Inserat nach dem Aufgeben auf Online.',
      );
      void this.router.navigate(['/listings']);
    } finally {
      this.isSaving.set(false);
    }
  }

  cancel(): void {
    void this.router.navigate(['/listings']);
  }
  private content(): ListingContent {
    return {
      title: this.form.controls.title.value,
      description: this.form.controls.description.value,
      price: this.form.controls.price.value ?? 0,
      priceType: this.form.controls.priceType.value,
      shippingType: this.form.controls.shippingType.value,
      shippingPrice: this.form.controls.shippingPrice.value,
      postalCode: this.form.controls.postalCode.value?.trim() || null,
    };
  }
  private storeBaseline(): void {
    this.baseline = JSON.stringify(this.form.getRawValue());
  }

  private createIssueFor(item: ListingEditorItem): string | null {
    const openListing = this.openListingFor(item.id);
    if (openListing) return 'Für diesen Artikel besteht bereits ein offenes Inserat.';
    const eligibility = canPrepareListing({
      status: item.status,
      archived_at: item.archivedAt,
    });
    return eligibility.allowed ? null : eligibility.reason;
  }

  private openListingFor(itemId: string): ListingRow | null {
    return (
      this.listingService
        .rows()
        .find(
          (row) =>
            row.item.id === itemId &&
            row.listing.status !== 'ended' &&
            row.listing.id !== this.listingId(),
        ) ?? null
    );
  }

  private itemStatusLabel(status: ListingEditorItem['status']): string {
    const labels: Record<ListingEditorItem['status'], string> = {
      received: 'Auf Lager',
      needs_review: 'Prüfung nötig',
      researched: 'Recherchiert',
      ready: 'Bereit',
      listed: 'Gelistet',
      reserved: 'Reserviert',
      sold: 'Verkauft',
      returned: 'Retourniert',
      archived: 'Archiviert',
      defective: 'Defekt / Ersatzteil',
    };
    return labels[status];
  }

  private toInventoryItem(item: ListingEditorItem): InventoryItem {
    return {
      id: item.id,
      workspace_id: item.workspaceId,
      title: item.title,
      brand: item.brand,
      category: item.category,
      condition: item.condition,
      condition_notes: item.conditionNotes,
      description: item.description,
      status: item.status,
      allocated_purchase_cost: item.allocatedPurchaseCost,
      expected_value: item.expectedValue,
      archived_at: item.archivedAt,
      media: [...item.media],
    };
  }
}
