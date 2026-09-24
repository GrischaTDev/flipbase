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
import { PurchaseSellerDialogComponent } from '../../../sellers/components/purchase-seller-dialog/purchase-seller-dialog.component';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  beschreibePurchaseProblem,
  CreatePurchasePayload,
  CreatePurchaseResult,
  PurchaseService,
} from '../../../../core/services/purchase.service';
import { SourcesService } from '../../../../core/services/sources.service';
import { SuppliersService } from '../../../../core/services/suppliers.service';
import { InboundTrackingService } from '../../../../core/services/inbound-tracking.service';
import {
  PurchaseType,
  ItemCondition,
  TrackingCarrier,
} from '../../../../core/models/flipbase.models';
import { DatePickerComponent } from '../../../../shared/components/date-picker/date-picker.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { Purchase, Source, Supplier } from '../../../../core/models/flipbase.models';
import { sellerSnapshotFromSupplier } from '../../utils/purchase-seller';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { WorkspaceContextLockService } from '../../../../core/services/workspace-context-lock.service';
import { PurchaseCostingService } from '../../../../core/services/purchase-costing.service';
import {
  PurchaseLineDraft,
  PurchaseLineEditorComponent,
} from '../purchase-line-editor/purchase-line-editor.component';
import { PurchaseSourceDialogComponent } from '../purchase-source-dialog/purchase-source-dialog.component';
import {
  PurchaseCostDraft,
  PurchaseCostOverviewValue,
  PurchaseCostType,
} from '../purchase-cost-editor/purchase-cost-adjustments';
import { PurchaseCostOverviewDialogComponent } from '../purchase-cost-overview-dialog/purchase-cost-overview-dialog.component';
import { PurchaseCostSummaryComponent } from '../purchase-cost-summary/purchase-cost-summary.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { TwoColumnLayoutComponent } from '../../../../shared/components/two-column-layout/two-column-layout.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { PurchaseSelfReceiptService } from '../../services/purchase-self-receipt.service';
import type { PendingPurchaseDocument } from '../../../../core/models/purchase-document.models';
import { PurchaseDocumentService } from '../../../../core/services/purchase-document.service';
import { PurchaseDocumentsCardComponent } from '../purchase-documents-card/purchase-documents-card.component';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { CatalogService } from '../../../../core/services/catalog.service';
import { BarcodeProductInfo } from '../../../../core/services/barcode-lookup.service';
import { PurchaseProductReturnService } from '../../services/purchase-product-return.service';

interface PurchaseNavigationDraft {
  form: ReturnType<PurchaseEntryFormComponent['form']['getRawValue']>;
  lines: readonly PurchaseLineDraft[];
  costs: readonly PurchaseCostDraft[];
  formDirty: boolean;
}

const purchaseCostTypes = new Set<PurchaseCostType>([
  'shipping',
  'travel',
  'packaging',
  'transport',
  'customs',
  'import',
  'fee',
  'other',
]);

function isPurchaseCostType(value: string): value is PurchaseCostType {
  return purchaseCostTypes.has(value as PurchaseCostType);
}

function purchaseLinesEqual(
  left: readonly PurchaseLineDraft[],
  right: readonly PurchaseLineDraft[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((line, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      line.draftId === other.draftId &&
      line.catalogProductId === other.catalogProductId &&
      line.titleSnapshot === other.titleSnapshot &&
      line.ean === other.ean &&
      line.lineKind === other.lineKind &&
      !!line.isPackage === !!other.isPackage &&
      line.orderedQuantity === other.orderedQuantity &&
      line.condition === other.condition &&
      line.priceMode === other.priceMode &&
      line.unitPurchasePrice === other.unitPurchasePrice &&
      line.lineTotal === other.lineTotal &&
      line.estimatedMarketValue === other.estimatedMarketValue
    );
  });
}

function purchaseCostsEqual(
  left: readonly PurchaseCostDraft[],
  right: readonly PurchaseCostDraft[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((cost, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      cost.type === other.type &&
      cost.amount === other.amount &&
      cost.description === other.description &&
      (cost.taxTreatment ?? null) === (other.taxTreatment ?? null) &&
      cost.allocationMethod === other.allocationMethod &&
      cost.targetPurchaseLineId === other.targetPurchaseLineId
    );
  });
}

@Component({
  selector: 'app-purchase-entry-form',
  imports: [
    ReactiveFormsModule,
    CustomSelectComponent,
    DatePickerComponent,
    PurchaseLineEditorComponent,
    PurchaseCostOverviewDialogComponent,
    PurchaseCostSummaryComponent,
    PurchaseSellerDialogComponent,
    PurchaseSourceDialogComponent,
    CardComponent,
    TextFieldComponent,
    TwoColumnLayoutComponent,
    ButtonComponent,
    PurchaseDocumentsCardComponent,
  ],
  templateUrl: './purchase-entry-form.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseEntryFormComponent {
  private readonly purchaseService = inject(PurchaseService);
  private readonly router = inject(Router);
  private readonly workspace = inject(WorkspaceService);
  private readonly catalog = inject(CatalogService);
  private readonly productReturn = inject(PurchaseProductReturnService);
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly purchaseCostingService = inject(PurchaseCostingService);
  private readonly documentService = inject(PurchaseDocumentService);
  private readonly selfReceipts = inject(PurchaseSelfReceiptService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workspaceContext = inject(WorkspaceContextLockService);
  private readonly releaseWorkspaceLock = this.workspaceContext.acquire();
  readonly sourcesService = inject(SourcesService);
  readonly suppliersService = inject(SuppliersService);
  readonly trackingService = inject(InboundTrackingService);
  readonly lineEditor = viewChild(PurchaseLineEditorComponent);
  readonly sellerDialog = viewChild(PurchaseSellerDialogComponent);
  readonly sourceDialog = viewChild(PurchaseSourceDialogComponent);
  readonly costOverviewDialog = viewChild(PurchaseCostOverviewDialogComponent);

  readonly closed = output<void>();
  readonly created = output<string>();

  /** Der zu bearbeitende Einkauf - fehlt er, wird ein neuer angelegt. */
  readonly purchase = input<Purchase | null>(null);

  readonly istBearbeitung = computed(() => this.purchase() !== null);

  /** Quellen und Lieferanten kommen aus den Stammdaten und aendern sich zur Laufzeit. */
  readonly quellenOptionen = computed<SelectOption<string | null>[]>(() => [
    { value: null, label: '-- Quelle wählen --' },
    ...this.sourcesService.sources().map((q) => ({ value: q.id, label: q.name })),
  ]);

  readonly lieferantenOptionen = computed<SelectOption<string | null>[]>(() => [
    { value: null, label: '-- Verkäufer wählen --' },
    ...this.suppliersService.suppliers().map((l) => ({ value: l.id, label: l.name })),
  ]);

  readonly dienstleisterOptionen = computed<SelectOption<string | null>[]>(() => [
    { value: null, label: 'Auto-Erkennung' },
    ...this.trackingService.carrierOptions.map((c) => ({ value: c.value, label: c.label })),
  ]);

  readonly zustandsOptionen: SelectOption<string>[] = [
    { value: 'new', label: 'Neu / OVP' },
    { value: 'like_new', label: 'Wie neu' },
    { value: 'very_good', label: 'Sehr gut' },
    { value: 'used', label: 'Gebraucht' },
    { value: 'heavily_used', label: 'Stark gebraucht' },
    { value: 'defective', label: 'Defekt / Ersatzteil' },
  ];
  readonly contentStatusOptions: readonly SelectOption<string>[] = [
    { value: 'unknown', label: 'Noch nicht vollständig bekannt' },
    { value: 'known', label: 'Vollständig bekannt' },
  ];
  readonly pricingModeOptions: readonly SelectOption<string>[] = [
    { value: 'total', label: 'Gesamtkaufpreis / Paketpreis' },
    { value: 'individual', label: 'Einzelpreise' },
  ];

  readonly sellerDialogOpen = signal(false);
  readonly sourceDialogOpen = signal(false);
  readonly costDialogOpen = signal(false);
  readonly requestId = crypto.randomUUID();
  readonly pricingMode = signal<'individual' | 'total'>('individual');
  readonly discountAmount = signal(0);

  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly persistedDraft = signal<Purchase | null>(null);
  readonly pendingDocuments = signal<readonly PendingPurchaseDocument[]>([]);
  private readonly completed = signal(false);
  private persistedLineIdsByDraftId = new Map<string, string>();

  /** Die Eingaben selbst leben im Kosteneditor; das Modal hält nur dessen aktuellen Entwurf. */
  readonly costDrafts = signal<readonly PurchaseCostDraft[]>([]);
  readonly initialCostDrafts = signal<readonly PurchaseCostDraft[]>([]);
  readonly areAdditionalCostsValid = signal<boolean>(true);
  readonly purchaseLines = signal<readonly PurchaseLineDraft[]>([]);
  readonly orderedItemCount = computed(() =>
    this.purchaseLines().reduce((total, line) => total + line.orderedQuantity, 0),
  );
  private readonly baselinePurchaseLines = signal<readonly PurchaseLineDraft[]>([]);
  private readonly baselineCostDrafts = signal<readonly PurchaseCostDraft[]>([]);
  readonly purchaseBasePrice = signal<number | null>(null);
  readonly additionalCostsTotal = computed(() =>
    this.costDrafts().reduce((sum, cost) => sum + cost.amount, 0),
  );
  readonly totalCosts = computed(() => {
    const purchaseBasePrice = this.purchaseBasePrice();
    return purchaseBasePrice === null
      ? null
      : Number(
          (purchaseBasePrice - this.discountAmount() + this.additionalCostsTotal()).toFixed(2),
        );
  });
  readonly purchaseLineOptions = computed<SelectOption<string>[]>(() => {
    return this.purchaseLines().flatMap((line) =>
      line.draftId ? [{ value: line.draftId, label: line.titleSnapshot }] : [],
    );
  });

  readonly form = new FormGroup({
    receipt_mode: new FormControl<'external' | 'self'>('external', { nonNullable: true }),
    seller_name: new FormControl('', { nonNullable: true }),
    type: new FormControl<PurchaseType>('single', { nonNullable: true }),
    // Technischer Kompatibilitätswert für ältere Einkaufsdatensätze. Neue Eingaben
    // verwenden ausschließlich `notes` als sichtbare Beschreibung.
    title: new FormControl('', { nonNullable: true }),
    content_status: new FormControl<'known' | 'unknown'>('known', { nonNullable: true }),
    pricing_mode: new FormControl<'individual' | 'total'>('individual', { nonNullable: true }),
    supplier_reference: new FormControl('', { nonNullable: true }),
    discount_amount: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
    source_id: new FormControl<string | null>(null),
    supplier_id: new FormControl<string | null>(null, { validators: [Validators.required] }),
    purchase_date: new FormControl<string>(new Date().toISOString().split('T')[0], {
      nonNullable: true,
      validators: [Validators.required],
    }),
    purchase_price: new FormControl<number | null>(null, {
      validators: [Validators.min(0)],
    }),
    tracking_number: new FormControl<string>(''),
    tracking_carrier: new FormControl<TrackingCarrier | null>(null),
    notes: new FormControl('', { nonNullable: true }),
    // Single item specific fields
    single_item_condition: new FormControl<ItemCondition>('used', { nonNullable: true }),
    single_item_expected_value: new FormControl<number | null>(null),
  });

  onSellerCreated(supplier: Supplier): void {
    this.form.controls.supplier_id.setValue(supplier.id);
    this.form.markAsDirty();
    this.sellerDialogOpen.set(false);
  }

  setReceiptMode(mode: 'external' | 'self'): void {
    if (this.form.controls.receipt_mode.value === mode) return;
    this.form.controls.receipt_mode.setValue(mode);
    this.form.controls.receipt_mode.markAsDirty();
    this.form.controls.supplier_id.setValue(null);
    this.form.controls.seller_name.setValue('');
    this.updateSellerRequirement(mode);
  }

  private updateSellerRequirement(mode: 'external' | 'self'): void {
    this.form.controls.supplier_id.setValidators(mode === 'external' ? [Validators.required] : []);
    this.form.controls.supplier_id.updateValueAndValidity({ emitEvent: false });
  }

  onSourceCreated(source: Source): void {
    this.form.controls.source_id.setValue(source.id);
    this.form.markAsDirty();
    this.sourceDialogOpen.set(false);
  }

  onTrackingNumberInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    if (val && val.trim()) {
      const detected = this.trackingService.autoDetectCarrier(val);
      this.form.patchValue({ tracking_carrier: detected });
    }
  }

  /**
   * Der Einkauf, dessen Angaben bereits im Formular stehen.
   *
   * Bewusst kein Signal: Der Einkauf kommt als abgeleiteter Wert herein und
   * wird neu berechnet, sobald sich anderswo etwas am Bestand aendert. Ohne
   * diese Bremse haette jede solche Neuberechnung das Formular
   * zurueckgesetzt - mitten im Tippen.
   */
  private befuelltFuer: string | null = null;

  constructor() {
    this.destroyRef.onDestroy(this.releaseWorkspaceLock);
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (!(event instanceof NavigationEnd)) return;
      const editor = this.lineEditor();
      const workspaceId = this.workspace.currentWorkspace()?.id;
      if (editor && workspaceId && (this.router.url === '/purchases/new' || this.purchase()))
        void this.restoreProductReturn(editor, workspaceId);
    });
    this.form.controls.pricing_mode.valueChanges.subscribe((mode) => {
      this.pricingMode.set(mode);
      this.updatePurchasePriceEditability();
      if (mode === 'individual') this.onPurchaseLinesChanged(this.purchaseLines());
    });
    this.form.controls.discount_amount.valueChanges.subscribe((amount) =>
      this.discountAmount.set(amount),
    );
    this.form.controls.purchase_price.valueChanges.subscribe((price) => {
      this.purchaseBasePrice.set(price);
    });
    this.updatePurchasePriceEditability();
    effect(() => {
      const vorhandener = this.purchase();
      if (!vorhandener || this.befuelltFuer === vorhandener.id) return;
      untracked(() => this.resetToPurchase(vorhandener));
    });
    effect(() => {
      const editor = this.lineEditor();
      const purchase = this.purchase();
      const workspaceId = this.workspace.currentWorkspace()?.id;
      if (!editor || !workspaceId || (this.router.url !== '/purchases/new' && !purchase)) return;
      untracked(() => void this.restoreProductReturn(editor, workspaceId));
    });
  }

  openProductCreation(initialProduct: BarcodeProductInfo | null): void {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    const editor = this.lineEditor();
    if (!workspaceId || !editor) return;
    if (this.pendingDocuments().length) {
      this.errorMessage.set(
        'Bitte speichere den Einkauf vor dem Wechsel, damit angehängte Belege erhalten bleiben.',
      );
      return;
    }
    const draft: PurchaseNavigationDraft = {
      form: this.form.getRawValue(),
      lines: editor.getDrafts(),
      costs: this.costDrafts(),
      formDirty: this.form.dirty,
    };
    const token = this.productReturn.begin(this.router.url.split('?')[0], workspaceId, draft);
    void this.router.navigate(['/catalog/new'], {
      queryParams: { purchaseReturn: token },
      state: { initialProduct },
    });
  }

  private async restoreProductReturn(
    editor: PurchaseLineEditorComponent,
    workspaceId: string,
  ): Promise<void> {
    const context = this.productReturn.consume(this.router.url.split('?')[0], workspaceId);
    if (!context) return;
    const draft = context.draft as PurchaseNavigationDraft;
    this.form.reset(draft.form);
    if (draft.formDirty) this.form.markAsDirty();
    this.costDrafts.set(draft.costs);
    this.initialCostDrafts.set(draft.costs);
    this.purchaseLines.set(draft.lines);
    editor.resetToLines(draft.lines);
    this.updateAdditionalCostsValidity();
    if (!context.createdProductId) return;
    await this.catalog.loadProducts(workspaceId);
    const product = this.catalog
      .products()
      .find((item) => item.id === context.createdProductId && item.workspace_id === workspaceId);
    if (product) editor.productCreated(product);
    else
      this.errorMessage.set(
        'Artikel wurde erstellt, konnte aber nicht geladen werden. Bitte füge ihn über die Artikelsuche hinzu.',
      );
  }

  resetToPurchase(vorhandener: Purchase): void {
    this.befuelltFuer = vorhandener.id;
    this.completed.set(false);
    this.persistedDraft.set(null);
    this.pendingDocuments.set([]);
    this.errorMessage.set(null);
    this.lineIdMap().clear();
    this.sellerDialogOpen.set(false);
    this.sourceDialogOpen.set(false);
    this.costDialogOpen.set(false);

    this.form.reset({
      receipt_mode: vorhandener.receipt_mode ?? 'external',
      seller_name: vorhandener.receipt_mode === 'self' ? (vorhandener.seller_name ?? '') : '',
      type: vorhandener.type,
      content_status: vorhandener.content_status ?? 'known',
      pricing_mode:
        vorhandener.pricing_mode ?? (vorhandener.type === 'mystery_pack' ? 'total' : 'individual'),
      supplier_reference: vorhandener.supplier_reference ?? '',
      discount_amount: vorhandener.discount_amount ?? 0,
      title: vorhandener.title,
      source_id: vorhandener.source_id ?? null,
      supplier_id: vorhandener.supplier_id ?? null,
      purchase_date: vorhandener.purchase_date,
      purchase_price: vorhandener.purchase_price,
      notes: vorhandener.notes ?? '',
      tracking_number: vorhandener.tracking_number ?? '',
      tracking_carrier: vorhandener.tracking_carrier ?? null,
    });
    this.updateSellerRequirement(vorhandener.receipt_mode ?? 'external');

    // Ohne die vorhandenen Zeilen waere das Speichern ein Loeschen: Der
    // Dialog schickt immer die vollstaendige Liste.
    const existingCosts: readonly PurchaseCostDraft[] = (vorhandener.costs ?? []).map((cost) => ({
      type: isPurchaseCostType(cost.type) ? cost.type : 'other',
      amount: Number(cost.amount),
      description: cost.description ?? '',
      taxTreatment: cost.tax_treatment ?? null,
      allocationMethod:
        cost.allocation_method === 'direct'
          ? 'direct'
          : cost.allocation_method === 'quantity'
            ? 'by_quantity'
            : 'by_value',
      targetPurchaseLineId: cost.target_purchase_line_id ?? null,
    }));
    this.initialCostDrafts.set(existingCosts);
    this.costDrafts.set(existingCosts);
    this.baselineCostDrafts.set(existingCosts);
    const existingLines: readonly PurchaseLineDraft[] = (vorhandener.purchase_lines ?? []).map(
      (line) => ({
        draftId: line.id,
        catalogProductId: line.catalog_product_id ?? null,
        titleSnapshot: line.title_snapshot,
        ean: line.ean_snapshot ?? null,
        lineKind: line.line_kind,
        isPackage: line.is_package ?? false,
        orderedQuantity: line.ordered_quantity,
        condition: (line.condition_snapshot ?? 'used') as ItemCondition,
        priceMode: line.price_mode ?? 'priced',
        unitPurchasePrice: line.unit_purchase_price,
        lineTotal: line.line_total,
        estimatedMarketValue: line.estimated_market_value ?? null,
        structuralLocked: line.received_quantity > 0,
      }),
    );
    for (const line of existingLines) {
      if (line.draftId) this.lineIdMap().set(line.draftId, line.draftId);
    }
    this.purchaseLines.set(existingLines);
    this.baselinePurchaseLines.set(existingLines);
    this.lineEditor()?.resetToLines(existingLines);
    this.updateAdditionalCostsValidity();
    if (existingLines.length > 0) this.updatePurchaseBasePriceFromLines(existingLines);
    this.updatePurchasePriceEditability();
  }

  async onSubmit(): Promise<void> {
    if (this.isSaving()) return;
    await this.persistPurchase(false);
  }

  hasUnsavedChanges(): boolean {
    if (this.completed?.()) return false;
    return (
      this.isSubmitting() ||
      (typeof this.sellerDialog === 'function' && (this.sellerDialog()?.form.dirty ?? false)) ||
      (this.sourceDialog()?.hasUnsavedChanges() ?? false) ||
      (this.costOverviewDialog()?.hasUnsavedChanges() ?? false) ||
      this.form.dirty ||
      this.pendingDocuments().length > 0 ||
      (typeof this.lineEditor === 'function' &&
        (this.lineEditor()?.hasUnsavedChanges() ?? false)) ||
      !purchaseLinesEqual(this.purchaseLines(), this.baselinePurchaseLines()) ||
      !purchaseCostsEqual(this.costDrafts(), this.baselineCostDrafts())
    );
  }

  isSaving(): boolean {
    return this.isSubmitting();
  }

  canSaveDraft(): boolean {
    return this.form.valid && this.areAdditionalCostsValid() && !this.isSaving();
  }

  selectPurchaseType(type: PurchaseType): void {
    if (this.form.controls.type.value === type) return;
    this.form.controls.type.setValue(type);
    this.form.controls.type.markAsDirty();
  }

  openCostEditor(): void {
    this.initialCostDrafts.set(this.costDrafts());
    this.costDialogOpen.set(true);
  }

  onCostOverviewSaved(value: PurchaseCostOverviewValue): void {
    this.form.controls.discount_amount.setValue(value.discountAmount);
    this.form.controls.discount_amount.markAsDirty();
    this.costDrafts.set(value.costs);
    this.initialCostDrafts.set(value.costs);
    this.updateAdditionalCostsValidity();
    this.costDialogOpen.set(false);
  }

  async onFinalize(): Promise<void> {
    if (this.isSaving()) return;
    await this.persistPurchase(true);
  }

  private async persistPurchase(finalizeAfterSave: boolean): Promise<void> {
    if (this.isSaving()) return;
    const purchaseLines = this.purchaseLines();
    if (finalizeAfterSave && purchaseLines.length === 0) {
      this.errorMessage.set('Bitte erfasse mindestens eine Einkaufsposition.');
      return;
    }
    if (this.form.invalid) return;
    const editor = this.lineEditor();
    if (editor?.lineRows.invalid) {
      this.errorMessage.set('Bitte prüfe die markierten Artikelangaben.');
      editor.focusFirstError();
      return;
    }
    if (!this.areAdditionalCostsValid()) {
      this.errorMessage.set(
        'Direkte Zusatzkosten benötigen eine gültige Zielposition, bevor du den Entwurf speichern kannst.',
      );
      return;
    }
    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const f = this.form.getRawValue();
    const vorhandener = this.persistedDraft() ?? this.purchase();
    const supplier = f.supplier_id
      ? this.suppliersService.suppliers().find((entry) => entry.id === f.supplier_id)
      : undefined;
    const sellerSnapshot = supplier ? sellerSnapshotFromSupplier(supplier) : null;
    const isSelfReceipt = f.receipt_mode === 'self';
    const existingSeller =
      !isSelfReceipt &&
      f.supplier_id &&
      f.supplier_id === vorhandener?.supplier_id &&
      vorhandener.receipt_mode !== 'self'
        ? vorhandener
        : null;
    const payload: CreatePurchasePayload = {
      receipt_mode: f.receipt_mode,
      type: f.type,
      request_id: this.requestId,
      content_status: f.content_status,
      pricing_mode: f.pricing_mode,
      shipment_status: vorhandener?.shipment_status,
      tracking_status: vorhandener?.tracking_status,
      cost_allocation_mode: vorhandener?.cost_allocation_mode,
      supplier_reference: f.supplier_reference.trim() || null,
      discount_amount: f.discount_amount,
      title: '',
      source_id: f.source_id,
      supplier_id: f.supplier_id,
      purchase_date: f.purchase_date,
      purchase_price: f.purchase_price,
      tracking_number: f.tracking_number?.trim() || null,
      tracking_carrier:
        f.tracking_carrier ||
        (f.tracking_number ? this.trackingService.autoDetectCarrier(f.tracking_number) : null),
      seller_type: isSelfReceipt
        ? null
        : (sellerSnapshot?.seller_type ?? existingSeller?.seller_type ?? null),
      seller_name: isSelfReceipt
        ? f.seller_name.trim() || null
        : (sellerSnapshot?.seller_name ?? existingSeller?.seller_name ?? null),
      seller_street: isSelfReceipt
        ? null
        : (sellerSnapshot?.seller_street ?? existingSeller?.seller_street ?? null),
      seller_address_extra: isSelfReceipt
        ? null
        : (sellerSnapshot?.seller_address_extra ?? existingSeller?.seller_address_extra ?? null),
      seller_postal_code: isSelfReceipt
        ? null
        : (sellerSnapshot?.seller_postal_code ?? existingSeller?.seller_postal_code ?? null),
      seller_city: isSelfReceipt
        ? null
        : (sellerSnapshot?.seller_city ?? existingSeller?.seller_city ?? null),
      seller_country_code: isSelfReceipt
        ? null
        : (sellerSnapshot?.seller_country_code ?? existingSeller?.seller_country_code ?? null),
      notes: f.notes.trim() || null,
      initial_costs: this.costDrafts().filter((cost) => cost.amount > 0),
      single_item_condition: f.single_item_condition,
      single_item_expected_value: f.single_item_expected_value || undefined,
      purchase_lines: purchaseLines,
    };

    let speicherergebnis: { error: Error | null };
    let anlegeergebnis: CreatePurchaseResult | null = null;
    let aenderungsergebnis: Awaited<ReturnType<PurchaseService['updatePurchaseDraft']>> | null =
      null;
    try {
      if (vorhandener) {
        aenderungsergebnis = await this.purchaseService.updatePurchaseDraft(
          vorhandener.id,
          payload,
        );
        speicherergebnis = { error: aenderungsergebnis.error };
      } else {
        anlegeergebnis = await this.purchaseService.createPurchase(payload);
        speicherergebnis = { error: anlegeergebnis.error };
      }
    } catch (ursache: unknown) {
      speicherergebnis = { error: this.alsError(ursache) };
    }
    const { error } = speicherergebnis;

    if (anlegeergebnis?.status === 'partial') {
      this.isSubmitting.set(false);
      this.persistedDraft.set(anlegeergebnis.data);
      this.adoptPersistedLineIds(anlegeergebnis.data);
      if (!(await this.uploadPendingDocuments(anlegeergebnis.data.id))) return;
      const ungemeldeteProbleme = anlegeergebnis.problems.filter(
        (problem) => !problem.reportedBySyncStatus,
      );
      if (ungemeldeteProbleme.length > 0) {
        this.toast.warning(
          'Einkauf wurde angelegt, aber nicht vollständig.',
          ungemeldeteProbleme.map(beschreibePurchaseProblem).join('\n'),
        );
      }
      if (finalizeAfterSave) {
        this.errorMessage.set(
          'Der Entwurf wurde gespeichert, ist aber noch unvollständig und wurde nicht abgeschlossen.',
        );
        return;
      }
      this.completed?.set(true);
      this.created.emit(anlegeergebnis.data.id);
      this.closed.emit();
      return;
    }

    if (error) {
      this.isSubmitting.set(false);
      this.errorMessage.set(error.message);
      if (!anlegeergebnis?.reportedBySyncStatus) {
        this.meldeFehlerWennNichtSynchronisiert(
          vorhandener
            ? 'Einkauf konnte nicht gespeichert werden.'
            : 'Einkauf konnte nicht angelegt werden.',
          error,
        );
      }
    } else {
      const gespeicherterEntwurf = aenderungsergebnis?.data ?? anlegeergebnis?.data ?? vorhandener;
      if (!gespeicherterEntwurf) {
        this.isSubmitting.set(false);
        this.errorMessage.set('Der gespeicherte Einkauf wurde nicht zurückgegeben.');
        return;
      }
      this.persistedDraft.set(gespeicherterEntwurf);
      this.adoptPersistedLineIds(gespeicherterEntwurf);
      this.capturePersistedBaseline();
      if (!(await this.uploadPendingDocuments(gespeicherterEntwurf.id))) {
        this.isSubmitting.set(false);
        return;
      }
      if (finalizeAfterSave) {
        await this.finalizePersistedDraft(gespeicherterEntwurf);
        return;
      }
      this.isSubmitting.set(false);
      this.toast.success(vorhandener ? 'Einkauf wurde gespeichert.' : 'Einkauf wurde angelegt.');
      this.completed?.set(true);
      this.created.emit(gespeicherterEntwurf.id);
      this.closed.emit();
    }
  }

  private async uploadPendingDocuments(purchaseId: string): Promise<boolean> {
    const pendingDocuments = this.pendingDocuments();
    if (pendingDocuments.length === 0) return true;

    const failed: PendingPurchaseDocument[] = [];
    for (const pending of pendingDocuments) {
      this.pendingDocuments.update((current) =>
        current.map((document) =>
          document.id === pending.id
            ? { ...document, status: 'uploading' as const, error: null }
            : document,
        ),
      );
      let error: Error | null;
      try {
        ({ error } = await this.documentService.upload(
          purchaseId,
          pending.file,
          pending.documentType,
        ));
      } catch (cause: unknown) {
        error = this.alsError(cause);
      }
      if (error) failed.push({ ...pending, status: 'error', error: error.message });
    }

    this.pendingDocuments.set(failed);
    if (failed.length === 0) return true;

    this.errorMessage.set(
      `Der Einkauf wurde gespeichert. ${failed.length === 1 ? 'Ein Beleg konnte' : `${failed.length} Belege konnten`} nicht hochgeladen werden.`,
    );
    this.toast.warning(
      'Einkauf gespeichert, Beleg-Upload unvollständig.',
      'Versuche die fehlgeschlagenen Belege erneut oder entferne sie.',
    );
    return false;
  }

  private async finalizePersistedDraft(purchase: Purchase): Promise<void> {
    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    let result: Awaited<ReturnType<PurchaseCostingService['finalizePurchase']>>;
    try {
      result = await this.purchaseCostingService.finalizePurchase(
        purchase.workspace_id,
        purchase.id,
      );
    } catch (cause: unknown) {
      result = {
        data: null,
        error: this.alsError(cause),
        reportedBySyncStatus: false,
      };
    }
    this.isSubmitting.set(false);

    if (result.error) {
      this.errorMessage.set(result.error.message);
      this.meldeFehlerWennNichtSynchronisiert(
        'Erfassung konnte nicht abgeschlossen werden.',
        result.error,
      );
      return;
    }

    if (!result.data) {
      this.errorMessage.set('Die bestätigten Abschlussdaten fehlen. Bitte erneut versuchen.');
      return;
    }
    const refreshError = await this.purchaseService.refreshAfterCostingChange(
      purchase.workspace_id,
      purchase.id,
      result.data,
    );
    const selfReceiptResult =
      purchase.receipt_mode === 'self'
        ? await this.selfReceipts.ensureForFinalizedPurchase(purchase.id)
        : { error: null };
    this.persistedDraft.set(null);
    this.completed?.set(true);
    this.toast.success('Erfassung wurde abgeschlossen.');
    if (selfReceiptResult.error) {
      this.toast.warning(
        'Einkauf abgeschlossen, Eigenbeleg fehlt.',
        'Öffne den Einkauf und erstelle den Eigenbeleg dort erneut.',
      );
    }
    if (refreshError) {
      this.toast.warning(
        'Der Einkauf ist abgeschlossen, aber noch nicht vollständig neu geladen.',
        'Bitte lade die Seite erneut.',
      );
    }
    this.created.emit(purchase.id);
    this.closed.emit();
  }

  onPurchaseLinesChanged(lines: readonly PurchaseLineDraft[]): void {
    const lineIds = this.lineIdMap();
    const persistedLines = lines.map((line) => {
      const persistedId = line.draftId ? lineIds.get(line.draftId) : undefined;
      return persistedId ? { ...line, draftId: persistedId } : line;
    });
    this.purchaseLines.set(persistedLines);
    this.updateAdditionalCostsValidity();
    this.updatePurchasePriceEditability();
    this.updatePurchaseBasePriceFromLines(persistedLines);
  }

  onCostsChanged(costs: readonly PurchaseCostDraft[]): void {
    this.costDrafts.set(costs);
    this.updateAdditionalCostsValidity();
  }

  private updateAdditionalCostsValidity(): void {
    const availableLineIds = new Set(
      this.purchaseLines().flatMap((line) => (line.draftId ? [line.draftId] : [])),
    );
    this.areAdditionalCostsValid.set(
      this.costDrafts().every(
        (cost) =>
          cost.allocationMethod !== 'direct' ||
          (cost.targetPurchaseLineId !== null && availableLineIds.has(cost.targetPurchaseLineId)),
      ),
    );
  }

  private updatePurchaseBasePriceFromLines(lines: readonly PurchaseLineDraft[]): void {
    if (this.form.controls.pricing_mode.value === 'total') return;

    const knownTotals = lines
      .map((line) => line.lineTotal)
      .filter((value): value is number => value !== null);
    const purchaseBasePrice =
      knownTotals.length === lines.length
        ? Number(knownTotals.reduce((sum, value) => sum + value, 0).toFixed(2))
        : null;
    this.form.controls.purchase_price.setValue(purchaseBasePrice, { emitEvent: false });
    this.purchaseBasePrice.set(purchaseBasePrice);
  }

  private capturePersistedBaseline(): void {
    this.baselinePurchaseLines.set(this.purchaseLines());
    this.baselineCostDrafts.set(this.costDrafts());
    this.form.markAsPristine();
  }

  private updatePurchasePriceEditability(): void {
    const purchasePrice = this.form.controls.purchase_price;
    if (this.form.controls.pricing_mode.value === 'total' || this.purchaseLines().length === 0) {
      purchasePrice.enable({ emitEvent: false });
      this.purchaseBasePrice.set(purchasePrice.value);
      return;
    }
    purchasePrice.disable({ emitEvent: false });
    this.purchaseBasePrice.set(purchasePrice.value);
  }

  private adoptPersistedLineIds(purchase: Purchase): void {
    const persistedLines = purchase.purchase_lines ?? [];
    const currentLines = this.purchaseLines();
    if (persistedLines.length !== currentLines.length) return;

    const lineIds = this.lineIdMap();
    const rebasedLines = currentLines.map((line, index) => {
      const persistedId = persistedLines[index].id;
      if (line.draftId) lineIds.set(line.draftId, persistedId);
      lineIds.set(persistedId, persistedId);
      return { ...line, draftId: persistedId };
    });
    this.purchaseLines.set(rebasedLines);

    const rebasedCosts = this.costDrafts().map((cost) => {
      if (cost.allocationMethod !== 'direct' || !cost.targetPurchaseLineId) return cost;
      return {
        ...cost,
        targetPurchaseLineId: lineIds.get(cost.targetPurchaseLineId) ?? cost.targetPurchaseLineId,
      };
    });
    this.costDrafts.set(rebasedCosts);
    this.initialCostDrafts.set(rebasedCosts);
  }

  private lineIdMap(): Map<string, string> {
    this.persistedLineIdsByDraftId ??= new Map<string, string>();
    return this.persistedLineIdsByDraftId;
  }

  private meldeFehlerWennNichtSynchronisiert(title: string, error: Error): void {
    if (!this.syncStatus.istZentralGemeldet(error)) this.toast.error(title, error.message);
  }

  private alsError(ursache: unknown): Error {
    return ursache instanceof Error ? ursache : new Error('Die Aktion ist fehlgeschlagen.');
  }
}
