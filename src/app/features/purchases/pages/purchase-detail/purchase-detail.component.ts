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
import { TranslatePipe } from '@ngx-translate/core';
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
  LucideScale as Scale,
  LucideSparkles as Sparkles,
  LucideSliders as Sliders,
  LucideCheckCircle2 as CheckCircle2,
  LucidePieChart as PieChart,
  LucideX as X,
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
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { ProfitEngineService } from '../../../../core/services/profit-engine.service';
import { LoggerService } from '../../../../core/services/logger.service';
import {
  CostAllocationMode,
  InboundTrackingStatus,
  ItemCondition,
  PurchaseType,
  TrackingCarrier,
} from '../../../../core/models/flipbase.models';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { PurchaseCreateModalComponent } from '../../components/purchase-create-modal/purchase-create-modal.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { StockService } from '../../../../core/services/stock.service';
import {
  PurchaseLineDraft,
  PurchaseLineEditorComponent,
} from '../../components/purchase-line-editor/purchase-line-editor.component';
import { PurchaseLine } from '../../../../core/models/flipbase.models';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { MockDataStoreService } from '../../../../core/services/mock-data-store.service';

@Component({
  selector: 'app-purchase-detail',
  imports: [
    PurchaseCreateModalComponent,
    ModalDialogDirective,
    RouterLink,
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    TranslatePipe,
    LucideDynamicIcon,
    ImageCropperModalComponent,
    CustomSelectComponent,
    PurchaseLineEditorComponent,
  ],
  templateUrl: './purchase-detail.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseDetailComponent {
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

  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
  private readonly mediaService = inject(MediaService);
  private readonly router = inject(Router);
  readonly trackingService = inject(InboundTrackingService);
  private readonly profitEngine = inject(ProfitEngineService);
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly mockStore = inject(MockDataStoreService);

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
    { icon: LucideIconInput; bezeichnung: string; kachel: string; schild: string }
  > = {
    single: {
      icon: ShoppingBag,
      bezeichnung: 'Einzelkauf',
      kachel: 'bg-fb-art-single/15 border-fb-art-single/30 text-fb-art-single',
      schild: 'bg-fb-art-single/10 border-fb-art-single/25 text-fb-art-single',
    },
    mystery_pack: {
      icon: Package,
      bezeichnung: 'Mystery Box',
      kachel: 'bg-fb-art-mystery/15 border-fb-art-mystery/30 text-fb-art-mystery',
      schild: 'bg-fb-art-mystery/10 border-fb-art-mystery/25 text-fb-art-mystery',
    },
    lot: {
      icon: Layers,
      bezeichnung: 'Konvolut',
      kachel: 'bg-fb-art-lot/15 border-fb-art-lot/30 text-fb-art-lot',
      schild: 'bg-fb-art-lot/10 border-fb-art-lot/25 text-fb-art-lot',
    },
    pallet: {
      icon: Boxes,
      bezeichnung: 'Retouren-Palette',
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
  readonly scaleIcon = Scale;
  readonly sparklesIcon = Sparkles;
  readonly slidersIcon = Sliders;
  readonly checkIcon = CheckCircle2;
  readonly chartIcon = PieChart;
  readonly closeIcon = X;
  readonly refreshIcon = RefreshCw;
  readonly imageIcon = Image;
  readonly cropIcon = Crop;
  readonly truckIcon = Truck;
  readonly copyIcon = Copy;
  readonly checkSmallIcon = Check;
  readonly chevronDownIcon = ChevronDown;
  readonly chevronUpIcon = ChevronUp;

  readonly isAddingCost = signal<boolean>(false);
  readonly isEditModalOpen = signal<boolean>(false);
  readonly isAddingItem = signal<boolean>(false);
  readonly isSavingPurchaseLines = signal<boolean>(false);
  readonly isReceivingLines = signal<boolean>(false);
  readonly receivingQuantities = signal<Record<string, number>>({});
  readonly purchaseLineDrafts = signal<readonly PurchaseLineDraft[]>([]);
  readonly purchaseLineEditor = viewChild(PurchaseLineEditorComponent);
  readonly isAllocatorOpen = signal<boolean>(false);
  readonly isCropperOpen = signal<boolean>(false);
  readonly selectedImageFile = signal<File | null>(null);
  readonly selectedImageDataUrl = signal<string | null>(null);

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

  // Lot Allocator interactive state
  readonly allocatorMode = signal<CostAllocationMode>('value_weighted');
  readonly editableExpectedValues = signal<Record<string, number>>({});
  readonly isApplyingAllocation = signal<boolean>(false);

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

  readonly simulatedAllocations = computed(() => {
    const purchase = this.purchaseService.selectedPurchase();
    const items = this.purchaseService.purchaseItems();
    if (!purchase || items.length === 0) return [];

    const totalCost = purchase.total_purchase_cost || purchase.purchase_price;
    const mode = this.allocatorMode();
    const customValues = this.editableExpectedValues();

    const erwarteteWerte = items.map((it) =>
      customValues[it.id] !== undefined ? customValues[it.id] : (it.expected_value ?? 0),
    );

    // Dieselbe Verteilung wie beim Speichern verwenden, damit die Vorschau
    // nicht 99,99 € anzeigt, wo anschliessend 100,00 € gebucht werden.
    const gewichte = mode === 'even' ? items.map(() => 1) : erwarteteWerte;
    const anteile = this.profitEngine.allocateCosts(totalCost, gewichte);

    return items.map((it, index) => ({
      item: it,
      expected_value: erwarteteWerte[index],
      allocated_cost: anteile[index],
      percent_of_total: totalCost > 0 ? (anteile[index] / totalCost) * 100 : 0,
    }));
  });

  readonly totalSimulatedAllocatedCost = computed(() => {
    return this.simulatedAllocations().reduce((sum, a) => sum + a.allocated_cost, 0);
  });

  constructor() {
    effect(() => {
      const purchaseId = this.id();
      const workspaceId = this.workspaceService.currentWorkspace()?.id;
      this.mockStore.isDemoMode();
      if (purchaseId && workspaceId) {
        void this.purchaseService.getPurchaseById(purchaseId);
      }
    });
  }

  openAllocator(): void {
    const items = this.purchaseService.purchaseItems();
    const currentValues: Record<string, number> = {};
    for (const it of items) {
      currentValues[it.id] = it.expected_value || 0;
    }
    this.editableExpectedValues.set(currentValues);
    const p = this.purchaseService.selectedPurchase();
    if (p) {
      this.allocatorMode.set(p.cost_allocation_mode || 'value_weighted');
    }
    this.isAllocatorOpen.set(true);
  }

  closeAllocator(): void {
    this.isAllocatorOpen.set(false);
  }

  updateItemExpectedValue(itemId: string, value: number): void {
    this.editableExpectedValues.update((current) => ({
      ...current,
      [itemId]: Math.max(0, value),
    }));
  }

  async applyAllocations(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase) return;

    this.isApplyingAllocation.set(true);
    const customValues = this.editableExpectedValues();
    const itemValues = Object.entries(customValues).map(([id, expected_value]) => ({
      id,
      expected_value,
    }));

    let ergebnis: { error: Error | null };
    try {
      ergebnis = await this.purchaseService.redistributeCosts(
        purchase.id,
        this.allocatorMode(),
        itemValues,
      );
    } catch (ursache: unknown) {
      ergebnis = { error: this.alsError(ursache) };
    }
    this.isApplyingAllocation.set(false);
    const { error } = ergebnis;
    if (error) {
      this.meldeFehlerWennNichtSynchronisiert('Kosten konnten nicht verteilt werden.', error);
      return;
    }
    this.closeAllocator();
    this.toast.success('Kosten wurden verteilt.');
  }

  async setAllocationMode(mode: CostAllocationMode): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase) return;
    let ergebnis: { error: Error | null };
    try {
      ergebnis = await this.purchaseService.updateCostAllocationMode(purchase.id, mode);
    } catch (ursache: unknown) {
      ergebnis = { error: this.alsError(ursache) };
    }
    const { error } = ergebnis;
    if (error) {
      this.meldeFehlerWennNichtSynchronisiert(
        'Verteilmethode konnte nicht geändert werden.',
        error,
      );
      return;
    }
    this.toast.success('Verteilmethode wurde geändert.');
  }

  async onAddCost(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase || this.costForm.invalid) return;

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
    if (!purchase) return;
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
    if (!purchase || lines.length === 0 || this.isSavingPurchaseLines()) return;

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
    if (!purchase || nowReceived < 1 || nowReceived > remaining) return;

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
    if (!purchase || line.received_quantity > 0) return;

    const receiptResult = await this.purchaseService.receiveIndividualPurchaseLine(
      purchase.id,
      line.id,
      {
        title: line.title_snapshot,
        condition: 'used',
        allocatedPurchaseCost: line.line_total,
      },
    );
    if (receiptResult.error) {
      this.meldeFehlerWennNichtSynchronisiert(
        'Wareneingang für den Einzelartikel konnte nicht gebucht werden.',
        receiptResult.error,
      );
      return;
    }

    await this.purchaseService.getPurchaseById(purchase.id);
    this.toast.success('Einzelartikel wurde erfasst.');
  }

  async onAddItem(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase || this.itemForm.invalid) return;

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
    if (!purchase) return;
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

  // -- Tracking Methods --
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
      ergebnis = await this.purchaseService.updatePurchaseTracking(
        p.id,
        num || null,
        this.trackingCarrierDraft(),
        num ? 'in_transit' : null,
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
