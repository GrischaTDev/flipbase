import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideDynamicIcon,
  LucideArrowLeft as ArrowLeft,
  LucideShoppingBag as ShoppingBag,
  LucidePackage as Package,
  LucideLayers as Layers,
  LucideBoxes as Boxes,
  LucidePlus as Plus,
  LucideTrash2 as Trash2,
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
  TrackingCarrier,
} from '../../../../core/models/flipbase.models';

@Component({
  selector: 'app-purchase-detail',
  imports: [
    ModalDialogDirective,
    RouterLink,
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    TranslatePipe,
    LucideDynamicIcon,
    ImageCropperModalComponent,
  ],
  templateUrl: './purchase-detail.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseDetailComponent {
  readonly id = input.required<string>();

  readonly purchaseService = inject(PurchaseService);

  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
  private readonly mediaService = inject(MediaService);
  private readonly router = inject(Router);
  readonly trackingService = inject(InboundTrackingService);
  private readonly profitEngine = inject(ProfitEngineService);

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
  readonly plusIcon = Plus;
  readonly trashIcon = Trash2;
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
  readonly isAddingItem = signal<boolean>(false);
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
      if (purchaseId) {
        this.purchaseService.getPurchaseById(purchaseId);
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

    await this.purchaseService.redistributeCosts(purchase.id, this.allocatorMode(), itemValues);
    this.isApplyingAllocation.set(false);
    this.closeAllocator();
  }

  async setAllocationMode(mode: CostAllocationMode): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase) return;
    await this.purchaseService.updateCostAllocationMode(purchase.id, mode);
  }

  async onAddCost(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase || this.costForm.invalid) return;

    const val = this.costForm.getRawValue();
    await this.purchaseService.addPurchaseCost(
      purchase.id,
      val.type,
      val.amount,
      val.description || undefined,
    );

    this.costForm.reset({ type: 'shipping', amount: 0, description: '' });
    this.isAddingCost.set(false);
  }

  async onDeleteCost(costId: string): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase) return;
    await this.purchaseService.deletePurchaseCost(costId, purchase.id);
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

  async onAddItem(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase || this.itemForm.invalid) return;

    const val = this.itemForm.getRawValue();
    const res = await this.purchaseService.addItemToPurchase(purchase.id, {
      title: val.title,
      condition: val.condition,
      expected_value: val.expected_value || undefined,
    });

    if (res.data && this.selectedImageFile()) {
      try {
        await this.mediaService.uploadItemMedia(res.data.id, this.selectedImageFile()!, true);
      } catch (err) {
        this.logger.warn('Image upload error on item create in purchase detail:', err);
      }
    }

    this.removeSelectedImage();
    this.itemForm.reset({ title: '', condition: 'used', expected_value: null });
    this.isAddingItem.set(false);
  }

  async onDeletePurchase(): Promise<void> {
    const purchase = this.purchaseService.selectedPurchase();
    if (!purchase) return;
    if (confirm('Möchtest du diesen Einkauf und alle zugehörigen Daten wirklich löschen?')) {
      await this.purchaseService.deletePurchase(purchase.id);
      this.router.navigate(['/purchases']);
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
    await this.purchaseService.updatePurchaseTracking(
      p.id,
      num || null,
      this.trackingCarrierDraft(),
      num ? 'in_transit' : null,
    );
    this.isEditingTracking.set(false);
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
    await this.purchaseService.markPurchaseDeliveredAndSyncItems(p.id);
    this.isMarkingDelivered.set(false);
  }
}
