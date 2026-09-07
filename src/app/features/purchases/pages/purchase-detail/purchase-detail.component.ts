import { TablePreferencesService } from '../../../../core/services/table-preferences.service';
import { TableColumnOption } from '../../../../core/models/table-preferences';
import { TableColumnPickerComponent } from '../../../../shared/components/table-column-picker/table-column-picker.component';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
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
  LucideReceipt as Receipt,
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
import { MockDataStoreService } from '../../../../core/services/mock-data-store.service';
import { PurchaseCostingService } from '../../../../core/services/purchase-costing.service';
import { PurchaseCorrectionDialogComponent } from '../../components/purchase-correction-dialog/purchase-correction-dialog.component';
import { PurchaseLifecycleActionsComponent } from '../../components/purchase-lifecycle-actions/purchase-lifecycle-actions.component';
import { PurchaseDetailTableComponent } from '../../components/purchase-detail-table/purchase-detail-table.component';
import { mapPurchaseDetailRows } from '../../utils/purchase-presentation';
import { InventoryService } from '../../../../core/services/inventory.service';
import { SalesService } from '../../../../core/services/sales.service';
import { RecordHistoryContainer } from '../../../audit/components/record-history/record-history.container';
import { PurchaseCostRepairComponent } from '../../components/purchase-cost-repair/purchase-cost-repair.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { TwoColumnLayoutComponent } from '../../../../shared/components/two-column-layout/two-column-layout.component';

@Component({
  selector: 'app-purchase-detail',
  imports: [
    TableColumnPickerComponent,
    RouterLink,
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    LucideDynamicIcon,
    ImageCropperModalComponent,
    CustomSelectComponent,
    PurchaseLineEditorComponent,
    PurchaseCorrectionDialogComponent,
    PurchaseLifecycleActionsComponent,
    PurchaseDetailTableComponent,
    RecordHistoryContainer,
    PurchaseCostRepairComponent,
    PageHeaderComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    TwoColumnLayoutComponent,
  ],
  templateUrl: './purchase-detail.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseDetailComponent {
  getEntryStatusTone(
    status?: string | null,
  ): 'neutral' | 'info' | 'success' | 'caution' | 'critical' {
    switch (status) {
      case 'draft':
        return 'caution';
      case 'finalized':
        return 'success';
      case 'reopened':
        return 'info';
      case 'cancelled':
        return 'critical';
      default:
        return 'neutral';
    }
  }

  getEntryStatusLabel(status?: string | null): string {
    switch (status) {
      case 'draft':
        return 'Entwurf';
      case 'finalized':
        return 'Abgeschlossen';
      case 'reopened':
        return 'Wiedereröffnet';
      case 'cancelled':
        return 'Storniert';
      default:
        return status ?? 'Unbekannt';
    }
  }

  readonly tablePreferences = inject(TablePreferencesService);
  private readonly allTableColumns: readonly TableColumnOption[] = [
    { id: 'title', label: 'Artikel und Aktionen', required: true },
    { id: 'quantity', label: 'Menge' },
    { id: 'condition', label: 'Zustand' },
    { id: 'estimated', label: 'Geschätzter Marktwert' },
    { id: 'allocated', label: 'Kostenanteil pro Stück' },
    { id: 'unit_price', label: 'Einkaufspreis pro Stück' },
    { id: 'additional', label: 'Zusätzlicher Kostenanteil' },
    { id: 'total_cost', label: 'Gesamtkosten pro Stück' },
    { id: 'available', label: 'Verfügbar' },
    { id: 'sold', label: 'Verkauft' },
  ];
  readonly tableColumns = computed<readonly TableColumnOption[]>(() =>
    this.allTableColumns.filter((column) =>
      this.purchaseDetailRows()[0]?.kind === 'mystery'
        ? !['unit_price', 'additional', 'total_cost'].includes(column.id)
        : !['condition', 'estimated', 'allocated'].includes(column.id),
    ),
  );
  readonly visibleColumns = computed(() =>
    this.tablePreferences
      .visibleColumns('purchase_articles', this.allTableColumns)
      .filter((id) => this.tableColumns().some((column) => column.id === id)),
  );
  setPurchaseVisibleColumns(selected: readonly string[]): void {
    const currentIds = new Set(this.tableColumns().map((column) => column.id));
    const otherColumns = this.tablePreferences
      .visibleColumns('purchase_articles', this.allTableColumns)
      .filter((id) => !currentIds.has(id));
    this.tablePreferences.setVisibleColumns('purchase_articles', [...otherColumns, ...selected]);
  }

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
  private readonly mockStore = inject(MockDataStoreService);
  private readonly purchaseCostingService = inject(PurchaseCostingService);

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
  readonly receiptIcon = Receipt;
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

  editPurchase(purchaseId: string): void {
    void this.router.navigate(['/purchases', purchaseId, 'edit']);
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
  readonly individualPurchaseLines = computed(() =>
    this.purchaseService.purchaseLines().filter((line) => line.line_kind === 'individual'),
  );
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
    return mapPurchaseDetailRows(purchase, {
      inventoryItems: this.purchaseService.purchaseItems(),
      stockLots: this.stockService.lots(),
      stockMovements: this.stockService.movements(),
      sales: this.salesService.sales(),
      inventoryState,
      stockState,
      salesState,
    });
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
        purchase.purchase_price +
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
      const purchaseId = this.id();
      const workspaceId = this.workspaceService.currentWorkspace()?.id;
      this.mockStore.isDemoMode();
      if (purchaseId && workspaceId) {
        void Promise.all([
          this.purchaseService.getPurchaseById(purchaseId),
          this.stockService.loadPositions(workspaceId),
        ]);
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
    if (this.purchaseService.selectedPurchase()?.entry_status === 'finalized') return;
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

  async captureIndividualItem(line: PurchaseLine): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (
      !purchase ||
      purchase.entry_status === 'finalized' ||
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
    if (!purchase || purchase.entry_status === 'finalized' || this.itemForm.invalid) return;

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
    if (!purchase || purchase.entry_status !== 'draft') return;
    const bestaetigt = await this.dialog.frage({
      titel: 'Einkauf löschen?',
      text: `„${purchase.title}“ wird gelöscht, zusammen mit allen zugeordneten Artikeln und Nebenkosten. Das lässt sich nicht rückgängig machen.`,
      bestaetigenText: 'Löschen',
      gefahr: true,
    });
    if (bestaetigt) {
      const { error } = await this.purchaseService.deletePurchase(purchase.id);
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

    await this.purchaseService.getPurchaseById(purchase.id);
    this.toast.success('Einkauf wurde wieder geöffnet.');
  }

  async finalizePurchase(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase || purchase.entry_status === 'finalized' || this.isLifecycleSubmitting()) {
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

    await this.purchaseService.refreshAfterFinalization(purchase.workspace_id, purchase.id);
    this.toast.success('Erfassung wurde abgeschlossen.');
  }

  async refreshCostRepair(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase || this.workspaceService.currentWorkspace()?.id !== purchase.workspace_id) return;
    await Promise.all([
      this.purchaseService.refreshAfterFinalization(purchase.workspace_id, purchase.id),
      this.salesService.loadSales(purchase.workspace_id),
    ]);
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
    if (!purchase || this.isLifecycleSubmitting()) return;
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
    this.toast.success(successMessage);
  }

  startEditTracking(): void {
    const p = this.purchaseService.selectedPurchase();
    this.trackingNumberDraft.set(p?.tracking_number || '');
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
    if (!p) return;
    const num = this.trackingNumberDraft().trim();
    let ergebnis: { error: Error | null };
    try {
      const carrier = this.trackingCarrierDraft();
      ergebnis =
        num && carrier
          ? await this.purchaseService.setPurchaseWorkflowStatus(p.id, 'in_transit', {
              number: num,
              carrier,
            })
          : { error: new Error('Sendungsnummer und Dienstleister werden benötigt.') };
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
    this.toast.success('Sendungsverfolgung wurde gespeichert.');
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
    if (!p) return;
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
    this.toast.success('Einkauf wurde als zugestellt markiert.');
  }

  private meldeFehlerWennNichtSynchronisiert(title: string, error: Error): void {
    if (!this.syncStatus.istZentralGemeldet(error)) this.toast.error(title, error.message);
  }

  private alsError(ursache: unknown): Error {
    return ursache instanceof Error ? ursache : new Error('Die Aktion ist fehlgeschlagen.');
  }
}
