import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { CurrencyPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { PackageContentDialogComponent } from '../../components/package-content-dialog/package-content-dialog.component';
import { summarizePackageContents } from '../../utils/package-content-summary';
import {
  LucideDynamicIcon,
  LucideIconInput,
  LucideArrowLeft as ArrowLeft,
  LucideShoppingBag as ShoppingBag,
  LucidePackage as Package,
  LucideLayers as Layers,
  LucideBoxes as Boxes,
  LucidePlus as Plus,
  LucideTrash2 as Trash2,
  LucidePencil as Pencil,
  LucideExternalLink as ExternalLink,
  LucideCoins as Coins,
  LucidePrinter as Printer,
  LucideSparkles as Sparkles,
  LucideSliders as Sliders,
  LucideCheckCircle2 as CheckCircle2,
  LucideRefreshCw as RefreshCw,
  LucideImage as Image,
  LucideCrop as Crop,
  LucideTruck as Truck,
  LucideCopy as Copy,
  LucideCheck as Check,
  LucideChevronDown as ChevronDown,
  LucideChevronUp as ChevronUp,
} from '@lucide/angular';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { MediaService } from '../../../../core/services/media.service';
import { InboundTrackingService } from '../../../../core/services/inbound-tracking.service';
import {
  ImageCropperModalComponent,
  CroppedImageResult,
} from '../../../../shared/components/image-cropper-modal/image-cropper-modal.component';
import { LoggerService } from '../../../../core/services/logger.service';
import {
  InboundTrackingStatus,
  ItemCondition,
  Purchase,
  PurchaseType,
  TrackingCarrier,
} from '../../../../core/models/flipbase.models';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { StockService } from '../../../../core/services/stock.service';
import {
  isPricedPurchaseLineDraft,
  PurchaseLineDraft,
  PurchaseLineEditorComponent,
} from '../../components/purchase-line-editor/purchase-line-editor.component';
import { PurchaseLine } from '../../../../core/models/flipbase.models';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { PurchaseCostingService } from '../../../../core/services/purchase-costing.service';
import { PurchaseCorrectionDialogComponent } from '../../components/purchase-correction-dialog/purchase-correction-dialog.component';
import { PurchaseLifecycleActionsComponent } from '../../components/purchase-lifecycle-actions/purchase-lifecycle-actions.component';
import { PurchaseSellerDetailsDialogComponent } from '../../components/purchase-seller-details-dialog/purchase-seller-details-dialog.component';
import { PurchaseDocumentsCardComponent } from '../../components/purchase-documents-card/purchase-documents-card.component';
import { PurchaseDocumentService } from '../../../../core/services/purchase-document.service';
import { PurchaseSelfReceiptService } from '../../services/purchase-self-receipt.service';
import { purchaseSellerLabel } from '../../utils/purchase-seller';
import { PurchaseDetailTableComponent } from '../../components/purchase-detail-table/purchase-detail-table.component';
import { getPurchaseDisplayTitle, mapPurchaseDetailRows } from '../../utils/purchase-presentation';
import { InventoryService } from '../../../../core/services/inventory.service';
import { SalesService } from '../../../../core/services/sales.service';
import { RecordHistoryContainer } from '../../../audit/components/record-history/record-history.container';
import { EntryPageLayoutComponent } from '../../../../shared/components/entry-page-layout/entry-page-layout.component';
import { PurchaseEntryFormComponent } from '../../components/purchase-entry-form/purchase-entry-form.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { TwoColumnLayoutComponent } from '../../../../shared/components/two-column-layout/two-column-layout.component';
import { getPurchaseStatusPresentation } from '../../utils/purchase-status-presentation';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { PurchaseCostSummaryComponent } from '../../components/purchase-cost-summary/purchase-cost-summary.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { PurchaseProductReturnService } from '../../services/purchase-product-return.service';

@Component({
  selector: 'app-purchase-detail',
  imports: [
    CurrencyPipe,
    PackageContentDialogComponent,
    ReactiveFormsModule,
    DatePipe,
    NgTemplateOutlet,
    LucideDynamicIcon,
    ImageCropperModalComponent,
    CustomSelectComponent,
    PurchaseCorrectionDialogComponent,
    PurchaseLifecycleActionsComponent,
    PurchaseSellerDetailsDialogComponent,
    PurchaseDocumentsCardComponent,
    PurchaseDetailTableComponent,
    RecordHistoryContainer,
    EntryPageLayoutComponent,
    PurchaseEntryFormComponent,
    BadgeComponent,
    NoticeBannerComponent,
    ButtonComponent,
    CardComponent,
    TwoColumnLayoutComponent,
    NumberInputComponent,
    TextFieldComponent,
    PurchaseCostSummaryComponent,
    ModalShellComponent,
  ],
  templateUrl: './purchase-detail.component.html',
  host: { class: 'block', '(window:beforeunload)': 'onBeforeUnload($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseDetailComponent {
  private readonly productReturn = inject(PurchaseProductReturnService);
  readonly getPurchaseStatusPresentation = getPurchaseStatusPresentation;
  /**
   * Vorgaben fuer die eigenen Auswahlfelder.
   *
   * Ein natives Auswahlfeld klappt eine Liste auf, die das Betriebssystem
   * zeichnet - hell, mit fremder Schrift, ohne Bezug zum Rest. Deshalb
   * uebernimmt `app-custom-select`, und die Eintraege stehen hier.
   */
  readonly zustandsOptionen: SelectOption<string>[] = [
    { value: 'new', label: 'Neu / OVP' },
    { value: 'like_new', label: 'Wie neu' },
    { value: 'very_good', label: 'Sehr gut' },
    { value: 'used', label: 'Gebraucht' },
    { value: 'heavily_used', label: 'Stark gebraucht' },
    { value: 'defective', label: 'Defekt / Ersatzteil' },
  ];

  /** Haengt am Dienst und wird deshalb berechnet. */
  readonly dienstleisterOptionen = computed<SelectOption<TrackingCarrier | null>[]>(() => [
    { value: null, label: 'Auto-Erkennung' },
    ...this.trackingService.carrierOptions.map((c) => ({
      value: c.value as TrackingCarrier,
      label: c.label,
    })),
  ]);

  readonly kostenartOptionen: SelectOption<string>[] = [
    { value: 'shipping', label: 'Versand / Fracht' },
    { value: 'travel', label: 'Fahrtkosten / Sprit' },
    { value: 'packaging', label: 'Verpackungsmaterial' },
    { value: 'transport', label: 'Spedition / Transport' },
    { value: 'customs', label: 'Zoll' },
    { value: 'import', label: 'Zoll / Importabgaben' },
    { value: 'fee', label: 'Gebühren' },
    { value: 'other', label: 'Sonstiges' },
  ];

  readonly id = input.required<string>();
  readonly edit = input(false);
  readonly isEditing = signal(false);
  readonly editingPurchase = signal<Purchase | null>(null);
  readonly historyRevision = signal(0);
  readonly isReloadingAfterSave = signal(false);
  readonly saveReloadFailed = signal(false);
  readonly purchase = computed(() => {
    // Beim Nachladen bleibt der Arbeitsbereich samt ungesendetem Kommentar erhalten.
    const purchase = this.purchaseService.selectedPurchase() ?? this.editingPurchase();
    return purchase?.id === this.id() &&
      purchase.workspace_id === this.workspaceService.currentWorkspace()?.id
      ? purchase
      : null;
  });
  readonly purchaseDisplayTitle = computed(
    () => getPurchaseDisplayTitle(this.purchase()) ?? 'Einkauf',
  );
  readonly entryForm = viewChild(PurchaseEntryFormComponent);
  private readonly requestedCostEditor = signal(false);
  readonly trackingNumberControl = new FormControl('', { nonNullable: true });
  private openedEditId: string | null = null;

  private readonly dialog = inject(ConfirmDialogService);
  readonly purchaseService = inject(PurchaseService);
  readonly stockService = inject(StockService);
  private readonly inventoryService = inject(InventoryService);
  private readonly salesService = inject(SalesService);

  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
  private readonly mediaService = inject(MediaService);
  private readonly router = inject(Router);
  readonly trackingService = inject(InboundTrackingService);
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly purchaseCostingService = inject(PurchaseCostingService);
  private readonly documentService = inject(PurchaseDocumentService);
  private readonly selfReceipts = inject(PurchaseSelfReceiptService);
  readonly isCreatingSelfReceipt = signal(false);
  readonly selfReceiptError = signal<string | null>(null);
  readonly selfReceiptMissing = computed(() => {
    const purchase = this.purchase();
    return Boolean(
      purchase?.receipt_mode === 'self' &&
      purchase.entry_status === 'finalized' &&
      purchase.finalized_at &&
      !this.documentService.isLoading() &&
      (this.documentService.loadedPurchaseId() === purchase.id ||
        this.documentService.loadError() !== null) &&
      !this.documentService
        .documents()
        .some(
          (document) =>
            document.purchase_id === purchase.id &&
            document.document_type === 'self_receipt' &&
            document.source_finalized_at === purchase.finalized_at,
        ),
    );
  });

  async retrySelfReceipt(): Promise<void> {
    const purchase = this.purchase();
    if (!purchase || !this.selfReceiptMissing() || this.isCreatingSelfReceipt()) return;
    this.isCreatingSelfReceipt.set(true);
    this.selfReceiptError.set(null);
    const result = await this.selfReceipts.ensureForFinalizedPurchase(purchase.id);
    this.isCreatingSelfReceipt.set(false);
    if (result.error) {
      this.selfReceiptError.set(result.error.message);
      return;
    }
    this.historyRevision.update((revision) => revision + 1);
    this.toast.success('Eigenbeleg wurde erstellt.');
  }

  /** Fortschrittsstufen der Sendungsverfolgung – typisiert, damit der Zugriff auf statusConfig im Template typsicher bleibt. */
  readonly trackingSteps: readonly InboundTrackingStatus[] = [
    'pending',
    'in_transit',
    'out_for_delivery',
    'delivered',
  ];

  readonly arrowLeftIcon = ArrowLeft;
  readonly bagIcon = ShoppingBag;
  readonly packageIcon = Package;
  readonly layersIcon = Layers;
  readonly boxesIcon = Boxes;

  /**
   * Symbol, Farbe und Bezeichnung je Einkaufsart.
   *
   * Dieselben Sinnbilder und Farben wie im Erfassungsdialog: Wer dort eine
   * Mystery Box am lila Paket erkennt, erkennt sie hier wieder. Vorher trugen
   * alle vier Arten dasselbe indigofarbene Symbol, die Art stand nur im
   * Kleingedruckten daneben.
   *
   * Bewusst ein vollstaendiger Record wie `EINKAUFSART_BEZEICHNUNG`: So
   * verlangt TypeScript fuer jede neue Art auch ein Aussehen. Die Klassen
   * stehen ausgeschrieben da, weil Tailwind zusammengesetzte Namen nicht
   * findet und die Farbe sonst stillschweigend fehlte.
   */
  private readonly artStile: Record<
    PurchaseType,
    { icon: LucideIconInput; kachel: string; schild: string }
  > = {
    single: {
      icon: ShoppingBag,
      kachel: 'bg-fb-art-single/15 border-fb-art-single/30 text-fb-art-single',
      schild: 'bg-fb-art-single/10 border-fb-art-single/25 text-fb-text-primary',
    },
    mystery_pack: {
      icon: Package,
      kachel: 'bg-fb-art-mystery/15 border-fb-art-mystery/30 text-fb-art-mystery',
      schild: 'bg-fb-art-mystery/10 border-fb-art-mystery/25 text-fb-art-mystery',
    },
    lot: {
      icon: Layers,
      kachel: 'bg-fb-art-lot/15 border-fb-art-lot/30 text-fb-art-lot',
      schild: 'bg-fb-art-lot/10 border-fb-art-lot/25 text-fb-art-lot',
    },
    pallet: {
      icon: Boxes,
      kachel: 'bg-fb-art-pallet/15 border-fb-art-pallet/30 text-fb-art-pallet',
      schild: 'bg-fb-art-pallet/10 border-fb-art-pallet/25 text-fb-art-pallet',
    },
  };

  /** Das Aussehen des geoeffneten Einkaufs. */
  readonly artStil = computed(
    () => this.artStile[this.purchaseService.selectedPurchase()?.type ?? 'single'],
  );
  readonly plusIcon = Plus;
  readonly trashIcon = Trash2;
  readonly editIcon = Pencil;
  readonly linkIcon = ExternalLink;
  readonly coinsIcon = Coins;
  readonly printIcon = Printer;
  readonly sparklesIcon = Sparkles;
  readonly slidersIcon = Sliders;
  readonly checkIcon = CheckCircle2;
  readonly refreshIcon = RefreshCw;
  readonly imageIcon = Image;
  readonly cropIcon = Crop;
  readonly truckIcon = Truck;
  readonly copyIcon = Copy;
  readonly checkSmallIcon = Check;
  readonly chevronDownIcon = ChevronDown;
  readonly chevronUpIcon = ChevronUp;

  readonly isAddingCost = signal<boolean>(false);
  readonly isAddingItem = signal<boolean>(false);
  readonly isSavingPurchaseLines = signal<boolean>(false);
  readonly isReceivingLines = signal<boolean>(false);
  readonly receivingQuantities = signal<Record<string, number>>({});
  readonly purchaseLineDrafts = signal<readonly PurchaseLineDraft[]>([]);
  readonly purchaseLineEditor = viewChild(PurchaseLineEditorComponent);
  readonly isCropperOpen = signal<boolean>(false);
  readonly selectedImageFile = signal<File | null>(null);
  readonly selectedImageDataUrl = signal<string | null>(null);
  readonly isLifecycleSubmitting = signal(false);
  readonly isCorrectionDialogOpen = signal(false);
  readonly isSellerDetailsDialogOpen = signal(false);
  readonly purchaseSellerLabel = purchaseSellerLabel;

  editPurchase(purchaseId: string): void {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase || purchase.id !== purchaseId || purchase.entry_status === 'finalized') return;
    if (this.isEditing() && this.editingPurchase()?.id === purchaseId) return;
    this.editingPurchase.set(purchase);
    this.isEditing.set(true);
  }

  editCosts(purchaseId: string): void {
    this.editPurchase(purchaseId);
    this.requestedCostEditor.set(this.isEditing());
  }

  hasUnsavedChanges(): boolean {
    return (
      (this.entryForm()?.hasUnsavedChanges() ?? false) ||
      (this.packageContentDialog()?.hasUnsavedChanges() ?? false)
    );
  }

  canNavigateTo(url: string): boolean {
    return this.productReturn.isCatalogHandoff(url);
  }

  private hasOpenPricesForStock(): boolean {
    return this.hasOpenPurchasePrices?.() ?? false;
  }

  isSaving(): boolean {
    return (
      (this.isReloadingAfterSave() && !this.saveReloadFailed()) ||
      (this.entryForm()?.isSaving() ?? false)
    );
  }

  saveDraft(): void {
    void this.entryForm()?.onSubmit();
  }

  async discardEdits(): Promise<void> {
    if (this.isSaving()) return;
    if (
      this.hasUnsavedChanges() &&
      !(await this.dialog.frage({
        titel: 'Änderungen verwerfen?',
        text: 'Die nicht gespeicherten Änderungen an diesem Einkauf gehen verloren.',
        bestaetigenText: 'Verwerfen',
        abbrechenText: 'Weiter bearbeiten',
      }))
    )
      return;
    const purchase = this.purchaseService.selectedPurchase();
    if (purchase && (purchase.entry_status ?? 'draft') === 'draft') {
      this.editingPurchase.set(purchase);
      this.entryForm()?.resetToPurchase(purchase);
    } else {
      this.isEditing.set(false);
      this.editingPurchase.set(null);
    }
  }

  async finishEditing(): Promise<void> {
    const purchaseId = this.id();
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    this.isReloadingAfterSave.set(true);
    this.saveReloadFailed.set(false);
    let purchase: Purchase | null;
    try {
      purchase = await this.purchaseService.getPurchaseById(purchaseId);
    } catch {
      purchase = null;
    }
    if (this.id() !== purchaseId || this.workspaceService.currentWorkspace()?.id !== workspaceId)
      return;
    if (!purchase || purchase.id !== purchaseId || purchase.workspace_id !== workspaceId) {
      this.saveReloadFailed.set(true);
      return;
    }
    if (purchase && (purchase.entry_status ?? 'draft') === 'draft') {
      this.editingPurchase.set(purchase);
      this.entryForm()?.resetToPurchase(purchase);
    } else {
      this.isEditing.set(false);
      this.editingPurchase.set(null);
    }
    this.historyRevision.update((revision) => revision + 1);
    this.isReloadingAfterSave.set(false);
  }

  returnToPurchases(): void {
    void this.router.navigate(['/purchases']);
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges() || this.isSaving()) event.preventDefault();
  }

  readonly hasRecordedPurchaseSale = computed(
    () => this.purchaseService.purchaseSaleHistoryState() === 'recorded',
  );
  readonly canReopenPurchase = computed(
    () =>
      this.purchaseService.selectedPurchase()?.entry_status === 'finalized' &&
      this.purchaseService.purchaseSaleHistoryState() === 'none',
  );
  readonly canCorrectPurchase = computed(
    () =>
      this.purchaseService.selectedPurchase()?.entry_status === 'finalized' &&
      this.hasRecordedPurchaseSale(),
  );

  // Tracking state
  readonly isEditingTracking = signal<boolean>(false);
  readonly trackingNumberDraft = signal<string>('');
  readonly trackingCarrierDraft = signal<TrackingCarrier | null>(null);
  readonly trackingCopied = signal<boolean>(false);
  readonly isMarkingDelivered = signal<boolean>(false);
  /** Die Sendungsverfolgung zeigt standardmaessig nur Status und Fortschrittsbalken. */
  readonly isTrackingExpanded = signal<boolean>(false);

  readonly trackingInfo = computed(() => {
    const p = this.purchaseService.selectedPurchase();
    if (!p?.tracking_number) return null;
    return this.trackingService.getTrackingInfo(
      p.tracking_number,
      p.tracking_carrier,
      p.tracking_status,
    );
  });

  readonly quantityPurchaseLines = computed(() =>
    this.purchaseService.purchaseLines().filter((line) => line.line_kind === 'quantity'),
  );
  readonly selectedReceiptLines = computed(() =>
    this.quantityPurchaseLines().flatMap((line) => {
      const receivedQuantity = this.receivingQuantities()[line.id] ?? 0;
      const remainingQuantity = line.ordered_quantity - line.received_quantity;
      return receivedQuantity >= 1 && receivedQuantity <= remainingQuantity
        ? [{ purchaseLineId: line.id, receivedQuantity }]
        : [];
    }),
  );
  readonly hasOpenPurchasePrices = computed(() => {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase) return false;
    const pricingMode =
      purchase.pricing_mode ?? (purchase.type === 'mystery_pack' ? 'total' : 'individual');
    if (pricingMode === 'total') return false;
    const loadedLines = this.purchaseService.purchaseLines();
    const lines = loadedLines.length > 0 ? loadedLines : (purchase.purchase_lines ?? []);
    return lines.some(
      (line) =>
        line.price_mode === 'open' ||
        line.price_mode === 'unpriced_mystery' ||
        line.unit_purchase_price === null ||
        line.line_total === null,
    );
  });
  readonly individualPurchaseLines = computed(() =>
    this.purchaseService
      .purchaseLines()
      .filter((line) => line.line_kind === 'individual' && !line.is_package),
  );
  readonly hasOutstandingReceiptLines = computed(() =>
    [...this.quantityPurchaseLines(), ...this.individualPurchaseLines()].some(
      (line) => line.received_quantity < line.ordered_quantity,
    ),
  );
  readonly packageContentDialog = viewChild(PackageContentDialogComponent);
  readonly capturingPackage = signal<PurchaseLine | null>(null);
  readonly packageLines = computed(() =>
    this.purchaseService.purchaseLines().filter((line) => line.is_package),
  );
  readonly packageSummaries = computed(() => {
    const purchase = this.purchase();
    const salesLoaded =
      !!purchase &&
      !this.salesService.loadError() &&
      this.salesService.loadedWorkspaceId() === purchase.workspace_id;
    return this.packageLines().map((line) =>
      summarizePackageContents(
        line,
        this.purchaseService.purchaseItems(),
        this.salesService.sales(),
        salesLoaded,
      ),
    );
  });
  readonly canCapturePackage = computed(() => {
    const purchase = this.purchase();
    return (
      !!purchase &&
      !this.hasOpenPurchasePrices() &&
      purchase.receiving_status !== 'archived' &&
      (purchase.shipment_status === 'arrived' ||
        !!purchase.arrived_at ||
        purchase.receiving_status === 'received')
    );
  });

  captureContent(): void {
    const line = this.packageLines()[0];
    if (line && this.canCapturePackage()) this.capturingPackage.set(line);
    else if (this.purchase()) this.editPurchase(this.purchase()!.id);
  }

  async packageContentSaved(): Promise<void> {
    this.capturingPackage.set(null);
    await this.finishEditing();
  }
  readonly visibleItemCount = computed(() => {
    const quantityCount = this.quantityPurchaseLines().reduce(
      (sum, line) => sum + line.ordered_quantity,
      0,
    );
    return this.purchaseService.purchaseItems().length + quantityCount;
  });

  readonly purchaseDetailRows = computed(() => {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase) return [];
    const inventoryState =
      this.inventoryService.loadedWorkspaceId() === purchase.workspace_id &&
      this.inventoryService.istGeladen()
        ? ('loaded' as const)
        : this.inventoryService.loadError()
          ? ('error' as const)
          : ('loading' as const);
    const stockState = this.stockService.loadError()
      ? ('error' as const)
      : this.stockService.loadedWorkspaceId() === purchase.workspace_id
        ? ('loaded' as const)
        : ('loading' as const);
    const salesState = this.salesService.loadError()
      ? ('error' as const)
      : this.salesService.loadedWorkspaceId() === purchase.workspace_id
        ? ('loaded' as const)
        : ('loading' as const);
    return mapPurchaseDetailRows(
      {
        ...purchase,
        purchase_lines: (purchase.purchase_lines ?? []).filter((line) => !line.is_package),
        items: (purchase.items ?? []).filter((item) => !item.source_package_line_id),
      },
      {
        inventoryItems: this.purchaseService
          .purchaseItems()
          .filter((item) => !item.source_package_line_id),
        stockLots: this.stockService.lots(),
        stockMovements: this.stockService.movements(),
        sales: this.salesService.sales(),
        inventoryState,
        stockState,
        salesState,
      },
    );
  });

  readonly costForm = new FormGroup({
    type: new FormControl('shipping', { nonNullable: true, validators: [Validators.required] }),
    amount: new FormControl<number>(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.01)],
    }),
    description: new FormControl(''),
  });

  readonly itemForm = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    condition: new FormControl<ItemCondition>('used', { nonNullable: true }),
    expected_value: new FormControl<number | null>(null),
  });

  purchaseTotalCost(purchase: Purchase): number | null {
    if (purchase.purchase_price === null) return null;
    if (purchase.total_purchase_cost !== undefined && purchase.total_purchase_cost !== null) {
      return purchase.total_purchase_cost;
    }
    return Number(
      (
        purchase.purchase_price -
        (purchase.discount_amount ?? 0) +
        (purchase.shipping_cost || 0) +
        (purchase.other_costs || 0) +
        (purchase.costs ?? []).reduce((sum, cost) => sum + Number(cost.amount || 0), 0)
      ).toFixed(2),
    );
  }

  purchaseAdditionalCost(purchase: Purchase): number | null {
    const totalCost = this.purchaseTotalCost(purchase);
    if (purchase.purchase_price === null || totalCost === null) return null;
    return Number((totalCost - purchase.purchase_price).toFixed(2));
  }

  constructor() {
    effect(() => {
      const form = this.entryForm();
      if (!form || !this.requestedCostEditor()) return;
      this.requestedCostEditor.set(false);
      queueMicrotask(() => {
        if (this.entryForm() === form && this.isEditing()) form.openCostEditor();
      });
    });
    this.trackingNumberControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.trackingNumberDraft.set(value);
      if (value.trim())
        this.trackingCarrierDraft.set(this.trackingService.autoDetectCarrier(value));
    });
    effect(() => {
      const purchase = this.purchase();
      const requestedEdit = this.edit();
      untracked(() => {
        if (!purchase) return;
        if (purchase.entry_status === 'finalized') {
          this.isEditing.set(false);
          this.editingPurchase.set(null);
        } else if (
          (purchase.entry_status ?? 'draft') === 'draft' ||
          (requestedEdit && this.openedEditId !== purchase.id)
        ) {
          this.openedEditId = purchase.id;
          this.editPurchase(purchase.id);
          if (
            this.editingPurchase() !== purchase &&
            !this.hasUnsavedChanges() &&
            !this.isSaving()
          ) {
            this.editingPurchase.set(purchase);
            this.entryForm()?.resetToPurchase(purchase);
          }
        }
      });
    });
    effect(() => {
      const purchaseId = this.id();
      const workspaceId = this.workspaceService.currentWorkspace()?.id;
      this.capturingPackage.set(null);
      // Die Workspace-Initialisierung verwirft vorherige Detailanfragen. Erst danach
      // laden; ein Listenfehler darf den unabhängig ladbaren Einkauf nicht blockieren.
      if (
        this.purchaseService.loadedWorkspaceId() !== workspaceId &&
        !this.purchaseService.loadError()
      )
        return;
      this.isEditing.set(false);
      this.editingPurchase.set(null);
      this.openedEditId = null;
      this.isReloadingAfterSave.set(false);
      this.saveReloadFailed.set(false);
      if (purchaseId && workspaceId) {
        untracked(() => {
          void Promise.all([
            this.purchaseService.getPurchaseById(purchaseId),
            this.stockService.loadPositions(workspaceId),
          ]);
        });
      }
    });
  }

  async onAddCost(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase || purchase.entry_status === 'finalized' || this.costForm.invalid) return;

    const val = this.costForm.getRawValue();
    const { error } = await this.purchaseService.addPurchaseCost(
      purchase.id,
      val.type,
      val.amount,
      val.description || undefined,
    );
    if (error) {
      this.meldeFehlerWennNichtSynchronisiert(
        'Nebenkosten konnten nicht gespeichert werden.',
        error,
      );
      return;
    }

    this.costForm.reset({ type: 'shipping', amount: 0, description: '' });
    this.isAddingCost.set(false);
    this.toast.success('Nebenkosten wurden hinzugefügt.');
  }

  async onDeleteCost(costId: string): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase || purchase.entry_status === 'finalized') return;
    const { error } = await this.purchaseService.deletePurchaseCost(costId, purchase.id);
    if (error) {
      this.meldeFehlerWennNichtSynchronisiert('Nebenkosten konnten nicht gelöscht werden.', error);
      return;
    }
    this.toast.success('Nebenkosten wurden gelöscht.');
  }

  onImageCropped(result: CroppedImageResult): void {
    this.selectedImageFile.set(result.file);
    this.selectedImageDataUrl.set(result.dataUrl);
    this.isCropperOpen.set(false);
  }

  removeSelectedImage(): void {
    this.selectedImageFile.set(null);
    this.selectedImageDataUrl.set(null);
  }

  onPurchaseLineDraftsChanged(lines: readonly PurchaseLineDraft[]): void {
    this.purchaseLineDrafts.set(lines);
  }

  async savePurchaseLines(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    const lines = this.purchaseLineDrafts();
    if (
      !purchase ||
      purchase.entry_status === 'finalized' ||
      this.hasOpenPricesForStock() ||
      lines.length === 0 ||
      this.isSavingPurchaseLines()
    )
      return;
    if (!lines.every(isPricedPurchaseLineDraft)) {
      this.toast.error('Positionspreise fehlen.');
      return;
    }

    this.isSavingPurchaseLines.set(true);
    const result = await this.purchaseService.createPurchaseLines(purchase.id, lines);
    this.isSavingPurchaseLines.set(false);
    if (result.error) {
      this.meldeFehlerWennNichtSynchronisiert(
        'Einkaufspositionen konnten nicht gespeichert werden.',
        result.error,
      );
      return;
    }

    await this.purchaseService.getPurchaseById(purchase.id);
    this.purchaseLineDrafts.set([]);
    this.purchaseLineEditor()?.clear();
    this.toast.success('Einkaufspositionen wurden gespeichert.');
  }

  startReceivingLines(): void {
    if (
      this.purchaseService.selectedPurchase()?.entry_status === 'finalized' ||
      this.hasOpenPricesForStock() ||
      !this.hasOutstandingReceiptLines() ||
      this.hasUnsavedChanges() ||
      this.isSaving()
    )
      return;
    const quantities = this.quantityPurchaseLines().reduce<Record<string, number>>(
      (result, line) => {
        result[line.id] = Math.max(0, line.ordered_quantity - line.received_quantity);
        return result;
      },
      {},
    );
    this.receivingQuantities.set(quantities);
    this.isReceivingLines.set(true);
  }

  updateReceivingQuantity(lineId: string, value: number): void {
    this.receivingQuantities.update((quantities) => ({
      ...quantities,
      [lineId]: Math.max(0, Math.floor(value || 0)),
    }));
  }

  async receivePurchaseLine(line: PurchaseLine): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    const nowReceived = this.receivingQuantities()[line.id] ?? 0;
    const remaining = line.ordered_quantity - line.received_quantity;
    if (
      !purchase ||
      purchase.entry_status === 'finalized' ||
      this.hasOpenPricesForStock() ||
      this.hasUnsavedChanges() ||
      this.isSaving() ||
      nowReceived < 1 ||
      nowReceived > remaining
    )
      return;

    const result = await this.purchaseService.receivePurchaseLines(purchase.id, [
      { purchaseLineId: line.id, receivedQuantity: nowReceived },
    ]);
    if (result.error) {
      this.meldeFehlerWennNichtSynchronisiert(
        'Wareneingang konnte nicht gebucht werden.',
        result.error,
      );
      return;
    }

    await Promise.all([
      this.purchaseService.getPurchaseById(purchase.id),
      this.stockService.loadPositions(purchase.workspace_id),
    ]);
    this.toast.success('Wareneingang wurde gebucht.');
  }

  async receiveSelectedPurchaseLines(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    const lines = this.selectedReceiptLines();
    if (
      !purchase ||
      purchase.entry_status === 'finalized' ||
      this.hasOpenPricesForStock() ||
      this.hasUnsavedChanges() ||
      this.isSaving() ||
      this.isLifecycleSubmitting() ||
      lines.length === 0
    )
      return;

    this.isLifecycleSubmitting.set(true);
    const result = await this.purchaseService.receivePurchaseLines(purchase.id, lines);
    if (result.error) {
      this.isLifecycleSubmitting.set(false);
      this.meldeFehlerWennNichtSynchronisiert(
        'Wareneingang konnte nicht gebucht werden.',
        result.error,
      );
      return;
    }

    await Promise.all([
      this.purchaseService.getPurchaseById(purchase.id),
      this.stockService.loadPositions(purchase.workspace_id),
    ]);
    this.isLifecycleSubmitting.set(false);
    this.isReceivingLines.set(false);
    this.historyRevision.update((revision) => revision + 1);
    this.toast.success('Wareneingang wurde gebucht.');
  }

  async captureIndividualItem(line: PurchaseLine): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (
      !purchase ||
      purchase.entry_status === 'finalized' ||
      this.hasOpenPricesForStock() ||
      this.hasUnsavedChanges() ||
      this.isSaving() ||
      line.received_quantity >= line.ordered_quantity
    )
      return;

    const receiptResult = await this.purchaseService.receiveIndividualPurchaseLine(
      purchase.id,
      line.id,
      {
        title: line.title_snapshot,
        condition: 'used',
      },
    );
    if (receiptResult.error) {
      this.meldeFehlerWennNichtSynchronisiert(
        'Wareneingang für den Einzelartikel konnte nicht gebucht werden.',
        receiptResult.error,
      );
      return;
    }

    this.toast.success('Einzelartikel wurde erfasst.');
  }

  captureIndividualItemById(lineId: string): void {
    const line = this.individualPurchaseLines().find((candidate) => candidate.id === lineId);
    if (line) void this.captureIndividualItem(line);
  }

  async onAddItem(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (
      !purchase ||
      purchase.entry_status === 'finalized' ||
      this.hasOpenPricesForStock() ||
      this.itemForm.invalid
    )
      return;

    const val = this.itemForm.getRawValue();
    const res = await this.purchaseService.addItemToPurchase(purchase.id, {
      title: val.title,
      condition: val.condition,
      expected_value: val.expected_value || undefined,
    });

    if (res.error) {
      this.meldeFehlerWennNichtSynchronisiert(
        'Artikel konnte nicht gespeichert werden.',
        res.error,
      );
      return;
    }

    let bildFehlgeschlagen = false;
    if (res.data && this.selectedImageFile()) {
      try {
        await this.mediaService.uploadItemMedia(res.data.id, this.selectedImageFile()!, true);
      } catch (err) {
        this.logger.warn('Image upload error on item create in purchase detail:', err);
        bildFehlgeschlagen = true;
      }
    }

    this.removeSelectedImage();
    this.itemForm.reset({ title: '', condition: 'used', expected_value: null });
    this.isAddingItem.set(false);
    if (bildFehlgeschlagen) {
      this.toast.warning('Artikel wurde angelegt.', 'Das Bild konnte nicht hochgeladen werden.');
    } else {
      this.toast.success('Artikel wurde angelegt.');
    }
  }

  async onDeletePurchase(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (
      !purchase ||
      purchase.entry_status !== 'draft' ||
      this.hasUnsavedChanges() ||
      this.isSaving()
    )
      return;
    const title = getPurchaseDisplayTitle(purchase);
    const text = title
      ? `„${title}“ wird gelöscht, zusammen mit allen zugeordneten Artikeln und Nebenkosten. Das lässt sich nicht rückgängig machen.`
      : 'Dieser Einkauf wird gelöscht, zusammen mit allen zugeordneten Artikeln und Nebenkosten. Das lässt sich nicht rückgängig machen.';
    const bestaetigt = await this.dialog.frage({
      titel: 'Einkauf löschen?',
      text,
      bestaetigenText: 'Löschen',
      gefahr: true,
    });
    if (bestaetigt) {
      const { error } = await this.purchaseService.deletePurchase(
        purchase.id,
        purchase.workspace_id,
      );
      if (error) {
        this.meldeFehlerWennNichtSynchronisiert('Einkauf konnte nicht gelöscht werden.', error);
        return;
      }
      this.toast.success('Einkauf wurde gelöscht.');
      await this.router.navigate(['/purchases']);
    }
  }

  async reopenPurchase(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase || !this.canReopenPurchase() || this.isLifecycleSubmitting()) return;

    this.isLifecycleSubmitting.set(true);
    let result: Awaited<ReturnType<PurchaseCostingService['reopenPurchase']>>;
    try {
      result = await this.purchaseCostingService.reopenPurchase(purchase.workspace_id, purchase.id);
    } catch (cause: unknown) {
      result = {
        data: null,
        error: this.alsError(cause),
        reportedBySyncStatus: false,
      };
    }
    this.isLifecycleSubmitting.set(false);
    if (result.error) {
      this.meldeFehlerWennNichtSynchronisiert(
        'Einkauf konnte nicht wieder geöffnet werden.',
        result.error,
      );
      return;
    }

    if (!result.data) {
      this.toast.error('Einkauf konnte nicht wieder geöffnet werden.');
      return;
    }
    const refreshError = await this.purchaseService.refreshAfterCostingChange(
      purchase.workspace_id,
      purchase.id,
      result.data,
    );
    if (!refreshError) this.editPurchase(purchase.id);
    this.historyRevision.update((revision) => revision + 1);
    this.toast.success('Einkauf wurde wieder geöffnet.');
    if (refreshError) {
      this.toast.warning(
        'Der Einkauf ist wieder geöffnet, aber noch nicht vollständig neu geladen.',
        'Bitte lade die Seite erneut.',
      );
    }
  }

  async finalizePurchase(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (
      !purchase ||
      purchase.entry_status === 'finalized' ||
      this.hasOpenPricesForStock() ||
      this.isLifecycleSubmitting() ||
      this.hasUnsavedChanges() ||
      this.isSaving()
    ) {
      return;
    }

    this.isLifecycleSubmitting.set(true);
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
    this.isLifecycleSubmitting.set(false);
    if (result.error) {
      this.meldeFehlerWennNichtSynchronisiert(
        'Einkauf konnte nicht abgeschlossen werden.',
        result.error,
      );
      return;
    }

    if (!result.data) {
      this.toast.error('Einkauf konnte nicht abgeschlossen werden.');
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
    this.historyRevision.update((revision) => revision + 1);
    this.toast.success('Erfassung wurde abgeschlossen.');
    if (selfReceiptResult.error) {
      this.selfReceiptError.set(selfReceiptResult.error.message);
      this.toast.warning('Einkauf abgeschlossen, Eigenbeleg fehlt.');
    }
    if (refreshError) {
      this.toast.warning(
        'Der Einkauf ist abgeschlossen, aber noch nicht vollständig neu geladen.',
        'Bitte lade die Seite erneut.',
      );
    }
  }

  async reloadPurchaseSaleHistory(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase || purchase.entry_status !== 'finalized' || this.isLifecycleSubmitting()) return;

    this.isLifecycleSubmitting.set(true);
    await this.purchaseService.loadPurchaseSaleHistory(purchase.workspace_id, purchase.id);
    this.isLifecycleSubmitting.set(false);
  }

  async onCorrectionSaved(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase) return;
    this.isCorrectionDialogOpen.set(false);
    await this.purchaseService.getPurchaseById(purchase.id);
    this.historyRevision.update((revision) => revision + 1);
    this.toast.success('Einkauf wurde korrigiert.');
  }

  // -- Tracking Methods --
  async markAsOrdered(): Promise<void> {
    await this.applyWorkflowStatus('ordered', 'Der Einkauf wurde als bestellt markiert.');
  }

  async markAsArrived(): Promise<void> {
    await this.applyWorkflowStatus('arrived', 'Die Paketankunft wurde bestätigt.');
  }

  private async applyWorkflowStatus(
    status: 'ordered' | 'arrived',
    successMessage: string,
  ): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (
      !purchase ||
      this.isLifecycleSubmitting() ||
      this.hasUnsavedChanges() ||
      this.isSaving() ||
      (status === 'arrived' && this.hasOpenPricesForStock())
    )
      return;
    this.isLifecycleSubmitting.set(true);
    const { error } = await this.purchaseService.setPurchaseWorkflowStatus(purchase.id, status);
    this.isLifecycleSubmitting.set(false);
    if (error) {
      this.meldeFehlerWennNichtSynchronisiert(
        'Der Einkaufsstatus konnte nicht geändert werden.',
        error,
      );
      return;
    }
    this.historyRevision.update((revision) => revision + 1);
    this.toast.success(successMessage);
  }

  startEditTracking(): void {
    const p = this.purchaseService.selectedPurchase();
    this.trackingNumberDraft.set(p?.tracking_number || '');
    this.trackingNumberControl.setValue(p?.tracking_number || '', { emitEvent: false });
    this.trackingCarrierDraft.set(p?.tracking_carrier || null);
    this.isEditingTracking.set(true);
  }

  onTrackingDraftInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.trackingNumberDraft.set(val);
    if (val && val.trim()) {
      this.trackingCarrierDraft.set(this.trackingService.autoDetectCarrier(val));
    }
  }

  async saveTracking(): Promise<void> {
    const p = this.purchaseService.selectedPurchase();
    if (!p || this.hasUnsavedChanges() || this.isSaving()) return;
    const num = this.trackingNumberDraft().trim();
    let ergebnis: { error: Error | null };
    try {
      const carrier = this.trackingCarrierDraft();
      ergebnis =
        num && !carrier
          ? { error: new Error('Zur Sendungsnummer wird ein Dienstleister benötigt.') }
          : await this.purchaseService.updatePurchaseTracking(
              p.id,
              num || null,
              num ? carrier : null,
              'pending',
            );
    } catch (ursache: unknown) {
      ergebnis = { error: this.alsError(ursache) };
    }
    const { error } = ergebnis;
    if (error) {
      this.meldeFehlerWennNichtSynchronisiert(
        'Sendungsverfolgung konnte nicht gespeichert werden.',
        error,
      );
      return;
    }
    this.isEditingTracking.set(false);
    this.historyRevision.update((revision) => revision + 1);
    this.toast.success(
      num ? 'Sendungsverfolgung wurde gespeichert.' : 'Sendungsverfolgung wurde entfernt.',
    );
  }

  toggleTrackingDetails(): void {
    this.isTrackingExpanded.update((offen) => !offen);
  }

  cancelEditTracking(): void {
    this.isEditingTracking.set(false);
  }

  copyTrackingNumber(): void {
    const info = this.trackingInfo();
    if (!info) return;
    navigator.clipboard.writeText(info.tracking_number);
    this.trackingCopied.set(true);
    setTimeout(() => this.trackingCopied.set(false), 2000);
  }

  openTrackingPortal(): void {
    const info = this.trackingInfo();
    if (!info?.tracking_url) return;
    window.open(info.tracking_url, '_blank', 'noopener,noreferrer');
  }

  async markDeliveredAndSync(): Promise<void> {
    const p = this.purchaseService.selectedPurchase();
    if (!p || this.hasOpenPricesForStock() || this.hasUnsavedChanges() || this.isSaving()) return;
    this.isMarkingDelivered.set(true);
    let ergebnis: { error: Error | null };
    try {
      ergebnis = await this.purchaseService.markPurchaseDeliveredAndSyncItems(p.id);
    } catch (ursache: unknown) {
      ergebnis = { error: this.alsError(ursache) };
    }
    this.isMarkingDelivered.set(false);
    const { error } = ergebnis;
    if (error) {
      this.meldeFehlerWennNichtSynchronisiert(
        'Einkauf konnte nicht als zugestellt markiert werden.',
        error,
      );
      return;
    }
    this.historyRevision.update((revision) => revision + 1);
    this.toast.success('Einkauf wurde als zugestellt markiert.');
  }

  private meldeFehlerWennNichtSynchronisiert(title: string, error: Error): void {
    if (!this.syncStatus.istZentralGemeldet(error)) this.toast.error(title, error.message);
  }

  private alsError(ursache: unknown): Error {
    return ursache instanceof Error ? ursache : new Error('Die Aktion ist fehlgeschlagen.');
  }
}
