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
import { Purchase, Supplier } from '../../../../core/models/flipbase.models';
import { PurchaseSellerType } from '../../../../core/models/purchase-seller.models';
import { buildGermanCountryOptions } from '../../utils/country-options';
import { sellerSnapshotFromSupplier } from '../../utils/purchase-seller';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { PurchaseCostingService } from '../../../../core/services/purchase-costing.service';
import {
  PurchaseLineDraft,
  PurchaseLineEditorComponent,
} from '../purchase-line-editor/purchase-line-editor.component';
import {
  PurchaseCostDraft,
  PurchaseCostOverviewValue,
  PurchaseCostType,
} from '../purchase-cost-editor/purchase-cost-adjustments';
import { PackagePriceDialogComponent } from '../package-price-dialog/package-price-dialog.component';
import { purchaseLineStructureFingerprint } from '../../utils/purchase-line-structure';
import { PurchaseCostOverviewDialogComponent } from '../purchase-cost-overview-dialog/purchase-cost-overview-dialog.component';
import { PurchaseCostSummaryComponent } from '../purchase-cost-summary/purchase-cost-summary.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { TwoColumnLayoutComponent } from '../../../../shared/components/two-column-layout/two-column-layout.component';

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
    PackagePriceDialogComponent,
    ButtonComponent,
    CardComponent,
    TextFieldComponent,
    TwoColumnLayoutComponent,
  ],
  templateUrl: './purchase-entry-form.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseEntryFormComponent {
  private readonly purchaseService = inject(PurchaseService);
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly purchaseCostingService = inject(PurchaseCostingService);
  readonly sourcesService = inject(SourcesService);
  readonly suppliersService = inject(SuppliersService);
  readonly trackingService = inject(InboundTrackingService);
  readonly lineEditor = viewChild(PurchaseLineEditorComponent);
  readonly sellerDialog = viewChild(PurchaseSellerDialogComponent);
  readonly costOverviewDialog = viewChild(PurchaseCostOverviewDialogComponent);

  readonly closed = output<void>();
  readonly created = output<void>();

  /** Der zu bearbeitende Einkauf - fehlt er, wird ein neuer angelegt. */
  readonly purchase = input<Purchase | null>(null);

  readonly istBearbeitung = computed(() => this.purchase() !== null);

  /** Quellen und Lieferanten kommen aus den Stammdaten und aendern sich zur Laufzeit. */
  readonly quellenOptionen = computed<SelectOption<string | null>[]>(() => [
    { value: null, label: '-- Quelle wählen --' },
    ...this.sourcesService.sources().map((q) => ({ value: q.id, label: q.name })),
  ]);

  readonly lieferantenOptionen = computed<SelectOption<string | null>[]>(() => [
    { value: null, label: 'Kein gespeicherter Verkäufer' },
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

  readonly sellerTypeOptions: readonly SelectOption<PurchaseSellerType | null>[] = [
    { value: null, label: 'Unbekannt' },
    { value: 'private', label: 'Privatperson' },
    { value: 'business', label: 'Unternehmen' },
  ];
  readonly countryOptions: readonly SelectOption<string | null>[] = [
    { value: null, label: 'Nicht angegeben' },
    ...buildGermanCountryOptions().map((country) => ({ value: country.code, label: country.name })),
  ];
  /** Die Anschrift ist oft erst später bekannt und bleibt bis dahin eingeklappt. */
  readonly sellerAddressExpanded = signal(false);

  readonly sellerDialogOpen = signal(false);
  readonly costDialogOpen = signal(false);
  readonly packagePriceDialogOpen = signal(false);
  readonly confirmedPackageFingerprint = signal<string | null>(null);
  readonly packagePriceStale = signal(false);
  readonly requestId = crypto.randomUUID();
  readonly pricingMode = signal<'individual' | 'total'>('individual');
  readonly discountAmount = signal(0);

  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly persistedDraft = signal<Purchase | null>(null);
  private readonly completed = signal(false);
  private persistedLineIdsByDraftId = new Map<string, string>();

  // Quick add states
  readonly isAddingSource = signal<boolean>(false);
  readonly isAddingSupplier = signal<boolean>(false);
  readonly newSourceName = signal<string>('');
  readonly newSupplierName = signal<string>('');

  /** Die Eingaben selbst leben im Kosteneditor; das Modal hält nur dessen aktuellen Entwurf. */
  readonly costDrafts = signal<readonly PurchaseCostDraft[]>([]);
  readonly initialCostDrafts = signal<readonly PurchaseCostDraft[]>([]);
  readonly areAdditionalCostsValid = signal<boolean>(true);
  readonly purchaseLines = signal<readonly PurchaseLineDraft[]>([]);
  readonly hasPackages = computed(() => this.purchaseLines().some((line) => line.isPackage));
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
    type: new FormControl<PurchaseType>('single', { nonNullable: true }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [],
    }),
    content_status: new FormControl<'known' | 'unknown'>('known', { nonNullable: true }),
    pricing_mode: new FormControl<'individual' | 'total'>('individual', { nonNullable: true }),
    supplier_reference: new FormControl('', { nonNullable: true }),
    discount_amount: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
    source_id: new FormControl<string | null>(null),
    supplier_id: new FormControl<string | null>(null),
    purchase_date: new FormControl<string>(new Date().toISOString().split('T')[0], {
      nonNullable: true,
      validators: [Validators.required],
    }),
    purchase_price: new FormControl<number | null>(null, {
      validators: [Validators.min(0)],
    }),
    tracking_number: new FormControl<string>(''),
    tracking_carrier: new FormControl<TrackingCarrier | null>(null),
    original_url: new FormControl<string>(''),
    external_order_id: new FormControl('', { nonNullable: true }),
    seller_type: new FormControl<PurchaseSellerType | null>(null),
    seller_name: new FormControl('', { nonNullable: true }),
    seller_marketplace_username: new FormControl('', { nonNullable: true }),
    seller_street: new FormControl('', { nonNullable: true }),
    seller_address_extra: new FormControl('', { nonNullable: true }),
    seller_postal_code: new FormControl('', { nonNullable: true }),
    seller_city: new FormControl('', { nonNullable: true }),
    seller_country_code: new FormControl<string | null>(null),
    notes: new FormControl<string>(''),
    // Single item specific fields
    single_item_condition: new FormControl<ItemCondition>('used', { nonNullable: true }),
    single_item_expected_value: new FormControl<number | null>(null),
  });

  /**
   * Übernimmt die Angaben eines gespeicherten Verkäufers bewusst in den Einkauf.
   * Danach gehören sie dem Einkauf; spätere Änderungen am Kontakt wirken nicht zurück.
   */
  onSupplierSelected(supplierId: string | null): void {
    const supplier = supplierId
      ? this.suppliersService.suppliers().find((entry) => entry.id === supplierId)
      : undefined;
    if (supplier) this.applySupplierSnapshot(supplier);
  }

  onSellerAddressToggle(event: Event): void {
    this.sellerAddressExpanded.set((event.target as HTMLDetailsElement).open);
  }

  onSellerCreated(supplier: Supplier): void {
    this.form.controls.supplier_id.setValue(supplier.id);
    this.applySupplierSnapshot(supplier);
    this.sellerDialogOpen.set(false);
  }

  private applySupplierSnapshot(supplier: Supplier): void {
    const snapshot = sellerSnapshotFromSupplier(supplier);
    this.form.patchValue({
      seller_type: snapshot.seller_type,
      seller_name: snapshot.seller_name ?? '',
      seller_street: snapshot.seller_street ?? '',
      seller_address_extra: snapshot.seller_address_extra ?? '',
      seller_postal_code: snapshot.seller_postal_code ?? '',
      seller_city: snapshot.seller_city ?? '',
      seller_country_code: snapshot.seller_country_code,
    });
    this.form.markAsDirty();
    if (
      snapshot.seller_street ||
      snapshot.seller_postal_code ||
      snapshot.seller_city ||
      snapshot.seller_country_code
    ) {
      this.sellerAddressExpanded.set(true);
    }
  }

  async saveNewSource(): Promise<void> {
    const name = this.newSourceName().trim();
    if (!name) return;
    let ergebnis: Awaited<ReturnType<SourcesService['createSource']>>;
    try {
      ergebnis = await this.sourcesService.createSource(name);
    } catch (ursache: unknown) {
      ergebnis = { data: null, error: this.alsError(ursache) };
    }
    const { data, error } = ergebnis;
    if (error || !data) {
      const ursache = error ?? new Error('Die Quelle wurde nicht zurückgegeben.');
      this.errorMessage.set(ursache.message);
      this.meldeFehlerWennNichtSynchronisiert('Quelle konnte nicht angelegt werden.', ursache);
      return;
    }
    this.form.patchValue({ source_id: data.id });
    this.form.markAsDirty();
    this.newSourceName.set('');
    this.isAddingSource.set(false);
    this.toast.success('Quelle wurde angelegt.');
  }

  async saveNewSupplier(): Promise<void> {
    const name = this.newSupplierName().trim();
    if (!name) return;
    let ergebnis: Awaited<ReturnType<SuppliersService['createSupplier']>>;
    try {
      ergebnis = await this.suppliersService.createSupplier(name);
    } catch (ursache: unknown) {
      ergebnis = { data: null, error: this.alsError(ursache) };
    }
    const { data, error } = ergebnis;
    if (error || !data) {
      const ursache = error ?? new Error('Der Lieferant wurde nicht zurückgegeben.');
      this.errorMessage.set(ursache.message);
      this.meldeFehlerWennNichtSynchronisiert('Lieferant konnte nicht angelegt werden.', ursache);
      return;
    }
    this.form.patchValue({ supplier_id: data.id });
    this.form.markAsDirty();
    this.newSupplierName.set('');
    this.isAddingSupplier.set(false);
    this.toast.success('Lieferant wurde angelegt.');
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
  }

  resetToPurchase(vorhandener: Purchase): void {
    this.befuelltFuer = vorhandener.id;
    this.sellerAddressExpanded.set(
      Boolean(
        vorhandener.seller_street ||
        vorhandener.seller_address_extra ||
        vorhandener.seller_postal_code ||
        vorhandener.seller_city ||
        vorhandener.seller_country_code,
      ),
    );
    this.completed.set(false);
    this.persistedDraft.set(null);
    this.errorMessage.set(null);
    this.lineIdMap().clear();
    this.sellerDialogOpen.set(false);
    this.costDialogOpen.set(false);
    this.isAddingSource.set(false);
    this.isAddingSupplier.set(false);
    this.newSourceName.set('');
    this.newSupplierName.set('');

    this.form.reset({
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
      original_url: vorhandener.original_url ?? '',
      external_order_id: vorhandener.external_order_id ?? '',
      seller_type: vorhandener.seller_type ?? null,
      seller_name: vorhandener.seller_name ?? '',
      seller_marketplace_username: vorhandener.seller_marketplace_username ?? '',
      seller_street: vorhandener.seller_street ?? '',
      seller_address_extra: vorhandener.seller_address_extra ?? '',
      seller_postal_code: vorhandener.seller_postal_code ?? '',
      seller_city: vorhandener.seller_city ?? '',
      seller_country_code: vorhandener.seller_country_code ?? null,
      notes: vorhandener.notes ?? '',
      tracking_number: vorhandener.tracking_number ?? '',
      tracking_carrier: vorhandener.tracking_carrier ?? null,
    });

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
      }),
    );
    for (const line of existingLines) {
      if (line.draftId) this.lineIdMap().set(line.draftId, line.draftId);
    }
    this.purchaseLines.set(existingLines);
    this.baselinePurchaseLines.set(existingLines);
    this.lineEditor()?.resetToLines(existingLines);
    this.updateAdditionalCostsValidity();
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
      (this.costOverviewDialog()?.hasUnsavedChanges() ?? false) ||
      this.form.dirty ||
      this.newSourceName().trim().length > 0 ||
      this.newSupplierName().trim().length > 0 ||
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
    if (this.packagePriceStale()) {
      this.errorMessage.set(
        'Die Positionen oder Mengen wurden geändert. Bitte den Paketpreis erneut verteilen.',
      );
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const f = this.form.getRawValue();
    const vorhandener = this.persistedDraft() ?? this.purchase();
    const payload: CreatePurchasePayload = {
      type: f.type,
      request_id: this.requestId,
      content_status: f.content_status,
      pricing_mode: f.pricing_mode,
      shipment_status: vorhandener?.shipment_status,
      tracking_status: vorhandener?.tracking_status,
      cost_allocation_mode: vorhandener?.cost_allocation_mode,
      supplier_reference: f.supplier_reference.trim() || null,
      discount_amount: f.discount_amount,
      title: f.title,
      source_id: f.source_id,
      supplier_id: f.supplier_id,
      purchase_date: f.purchase_date,
      purchase_price: f.purchase_price,
      tracking_number: f.tracking_number?.trim() || null,
      tracking_carrier:
        f.tracking_carrier ||
        (f.tracking_number ? this.trackingService.autoDetectCarrier(f.tracking_number) : null),
      original_url: f.original_url?.trim() || null,
      external_order_id: f.external_order_id.trim() || null,
      seller_type: f.seller_type,
      seller_name: f.seller_name.trim() || null,
      seller_marketplace_username: f.seller_marketplace_username.trim() || null,
      seller_street: f.seller_street.trim() || null,
      seller_address_extra: f.seller_address_extra.trim() || null,
      seller_postal_code: f.seller_postal_code.trim() || null,
      seller_city: f.seller_city.trim() || null,
      seller_country_code: f.seller_country_code,
      notes: f.notes || null,
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
      this.created.emit();
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
      if (gespeicherterEntwurf) {
        this.persistedDraft.set(gespeicherterEntwurf);
        this.adoptPersistedLineIds(gespeicherterEntwurf);
        this.capturePersistedBaseline();
      }
      if (finalizeAfterSave && gespeicherterEntwurf) {
        await this.finalizePersistedDraft(gespeicherterEntwurf);
        return;
      }
      this.isSubmitting.set(false);
      this.toast.success(vorhandener ? 'Einkauf wurde gespeichert.' : 'Einkauf wurde angelegt.');
      this.completed?.set(true);
      this.created.emit();
      this.closed.emit();
    }
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

    await this.purchaseService.refreshAfterFinalization(purchase.workspace_id, purchase.id);
    this.persistedDraft.set(null);
    this.completed?.set(true);
    this.toast.success('Erfassung wurde abgeschlossen.');
    this.created.emit();
    this.closed.emit();
  }

  onPurchaseLinesChanged(lines: readonly PurchaseLineDraft[]): void {
    const lineIds = this.lineIdMap();
    const persistedLines = lines.map((line) => {
      const persistedId = line.draftId ? lineIds.get(line.draftId) : undefined;
      return persistedId ? { ...line, draftId: persistedId } : line;
    });
    this.purchaseLines.set(persistedLines);
    const confirmedFingerprint = this.confirmedPackageFingerprint();
    if (
      confirmedFingerprint &&
      purchaseLineStructureFingerprint(persistedLines) !== confirmedFingerprint
    ) {
      this.packagePriceStale.set(true);
    }
    this.updateAdditionalCostsValidity();
    this.updatePurchasePriceEditability();
    if (this.form.controls.pricing_mode.value === 'total' || persistedLines.length === 0) return;

    if (persistedLines.some((line) => line.unitPurchasePrice === null || line.lineTotal === null)) {
      this.form.controls.purchase_price.setValue(null);
      return;
    }
    const lineTotal = persistedLines.reduce((total, line) => total + (line.lineTotal ?? 0), 0);
    this.form.controls.purchase_price.setValue(Number(lineTotal.toFixed(2)));
  }

  confirmPackagePrice(total: number): void {
    const editor = this.lineEditor();
    if (!editor || this.purchaseLines().length === 0 || this.hasPackages()) return;

    editor.applyPackagePrice(total);
    this.form.controls.pricing_mode.setValue('individual');
    this.form.controls.purchase_price.setValue(Number(total.toFixed(2)));
    this.confirmedPackageFingerprint.set(purchaseLineStructureFingerprint(this.purchaseLines()));
    this.packagePriceStale.set(false);
    this.packagePriceDialogOpen.set(false);
    this.form.markAsDirty();
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
