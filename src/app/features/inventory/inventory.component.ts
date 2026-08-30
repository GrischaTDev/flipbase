import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideDynamicIcon,
  LucideBoxes as Boxes,
  LucideBarcode as Barcode,
  LucidePlus as Plus,
  LucideTag as Tag,
  LucideTrendingUp as TrendingUp,
  LucideCoins as Coins,
  LucidePrinter as Printer,
  LucideStore as Store,
} from '@lucide/angular';
import { InventoryService } from '../../core/services/inventory.service';
import { ItemCreateModalComponent } from './components/item-create-modal/item-create-modal.component';
import { AiPhotoScannerModalComponent } from '../../shared/components/ai-photo-scanner-modal/ai-photo-scanner-modal.component';
import { InventoryLabelModalComponent } from '../../shared/components/inventory-label-modal/inventory-label-modal.component';
import { AiVisualScanResult } from '../../core/services/ai-assistant.service';
import { InventoryItem, ItemStatus, StockPosition } from '../../core/models/flipbase.models';
import {
  isInventoryItemMutationLocked,
  isSellableInventoryItem,
} from '../../core/models/inventory-sellability';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/components/custom-select/custom-select.component';
import { CustomSearchInputComponent } from '../../shared/components/custom-search-input/custom-search-input.component';
import { BarcodeScannerComponent } from '../../shared/components/barcode-scanner/barcode-scanner.component';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { StockService } from '../../core/services/stock.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { StockPositionListComponent } from './components/stock-position-list/stock-position-list.component';
import { SaleTargetRouteState } from '../../core/models/sale-target.models';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';

type FilterPreset = string;

@Component({
  selector: 'app-inventory',
  imports: [
    BarcodeScannerComponent,
    RouterLink,
    CurrencyPipe,
    TranslatePipe,
    LucideDynamicIcon,
    ItemCreateModalComponent,
    AiPhotoScannerModalComponent,
    InventoryLabelModalComponent,
    CustomSelectComponent,
    CustomSearchInputComponent,
    StockPositionListComponent,
  ],
  templateUrl: './inventory.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryComponent {
  readonly inventoryService = inject(InventoryService);
  readonly stockService = inject(StockService);
  private readonly router = inject(Router);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly toast = inject(ToastService);

  @ViewChild('createModal') createModal?: ItemCreateModalComponent;

  readonly boxesIcon = Boxes;
  readonly plusIcon = Plus;
  readonly tagIcon = Tag;
  readonly trendingIcon = TrendingUp;
  readonly coinsIcon = Coins;
  readonly barcodeIcon = Barcode;
  readonly printerIcon = Printer;
  readonly storeIcon = Store;

  readonly isCreateModalOpen = signal<boolean>(false);

  /** Scanner zum Auffinden eines Artikels ueber sein gedrucktes Etikett. */
  readonly isScanningLabel = signal<boolean>(false);

  /**
   * Oeffnet den Artikel, dessen Nummer gescannt wurde.
   *
   * Gesucht wird ueber die interne Artikelnummer und ersatzweise ueber die EAN
   * - ein fremder Barcode auf der Ware selbst soll ebenfalls zum Ziel fuehren.
   */
  onEtikettGescannt(code: string): void {
    this.isScanningLabel.set(false);
    const gesucht = code.trim().toUpperCase();

    const treffer = this.inventoryService
      .items()
      .find((i) => i.sku?.toUpperCase() === gesucht || i.ean?.toUpperCase() === gesucht);

    if (treffer) {
      this.router.navigate(['/inventory', treffer.id]);
    } else {
      this.scanMeldung.set(`Kein Artikel mit der Nummer ${code} gefunden.`);
      setTimeout(() => this.scanMeldung.set(null), 5000);
    }
  }

  readonly scanMeldung = signal<string | null>(null);
  readonly isAiScannerOpen = signal<boolean>(false);
  readonly isLabelModalOpen = signal<boolean>(false);
  readonly searchQuery = signal<string>('');
  readonly selectedCondition = signal<string>('all');
  readonly selectedStatus = signal<string>('all');
  readonly activePreset = signal<FilterPreset>('all');
  readonly selectedItemIds = signal<Set<string>>(new Set());

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceService.currentWorkspace()?.id;
      if (workspaceId) void this.stockService.loadPositions(workspaceId);
    });
  }

  openSaleForStockPosition(position: StockPosition): void {
    const state: SaleTargetRouteState = {
      saleTarget: {
        kind: 'catalog_product',
        catalogProductId: position.catalog_product_id,
        title: position.title,
        availableQuantity: position.available_quantity,
      },
    };
    void this.router.navigate(['/sales'], {
      state,
    });
  }

  openSaleForIndividualItem(item: InventoryItem): void {
    if (!isSellableInventoryItem(item)) return;
    const state: SaleTargetRouteState = {
      saleTarget: { kind: 'inventory_item', inventoryItemId: item.id, title: item.title },
    };
    void this.router.navigate(['/sales'], {
      state,
    });
  }

  reloadStock(): void {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (workspaceId) void this.stockService.loadPositions(workspaceId);
  }

  readonly filterStatusOptions: SelectOption<string>[] = [
    { value: 'all', label: 'Alle Status' },
    { value: 'received', label: 'Auf Lager', badgeClass: 'bg-blue-400' },
    { value: 'needs_review', label: 'Prüfung nötig', badgeClass: 'bg-amber-400' },
    { value: 'researched', label: 'Recherchiert', badgeClass: 'bg-indigo-400' },
    { value: 'ready', label: 'Bereit', badgeClass: 'bg-amber-400' },
    { value: 'listed', label: 'Gelistet', badgeClass: 'bg-emerald-400' },
    { value: 'reserved', label: 'Reserviert', badgeClass: 'bg-fb-neutral' },
    { value: 'defective', label: 'Defekt / Ersatzteil', badgeClass: 'bg-rose-400' },
    { value: 'returned', label: 'Retourniert', badgeClass: 'bg-fb-neutral' },
    { value: 'archived', label: 'Archiviert', badgeClass: 'bg-fb-neutral' },
    { value: 'sold', label: 'Verkauft', badgeClass: 'bg-purple-400' },
  ];

  readonly filterConditionOptions: SelectOption<string>[] = [
    { value: 'all', label: 'Alle Zustände' },
    { value: 'new', label: 'Neu / OVP' },
    { value: 'like_new', label: 'Wie neu' },
    { value: 'very_good', label: 'Sehr gut' },
    { value: 'used', label: 'Gebraucht' },
    { value: 'heavily_used', label: 'Stark gebraucht' },
    { value: 'defective', label: 'Defekt / Ersatzteil' },
  ];

  readonly storePublishedCount = computed(
    () =>
      this.inventoryService
        .items()
        .filter((i) => i.is_public_store !== false && i.status !== 'sold').length,
  );

  // Filtered Items Computed Signal
  readonly filteredItems = computed(() => {
    let list = this.inventoryService.items();
    const query = this.searchQuery().toLowerCase().trim();

    if (query) {
      list = list.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          (item.sku && item.sku.toLowerCase().includes(query)) ||
          (item.ean && item.ean.toLowerCase().includes(query)) ||
          (item.brand && item.brand.toLowerCase().includes(query)) ||
          (item.model && item.model.toLowerCase().includes(query)),
      );
    }

    const preset = this.activePreset();
    switch (preset) {
      case 'needs_research':
        list = list.filter((item) =>
          ['received', 'needs_review', 'researched'].includes(item.status),
        );
        break;
      case 'unlisted':
        list = list.filter((item) => item.status !== 'listed' && item.status !== 'sold');
        break;
      case 'high_margin':
        list = list.filter((item) => (item.profit_potential ?? 0) >= 30);
        break;
      case 'defective':
        list = list.filter((item) => item.status === 'defective');
        break;
      case 'store_public':
        list = list.filter((item) => item.is_public_store !== false && item.status !== 'sold');
        break;
      case 'legacy_review':
        list = list.filter((item) =>
          [
            'legacy_sold_unverified',
            'legacy_sale_header_without_line',
            'sale_status_conflict',
            'multiple_active_sales',
          ].includes(item.sale_state ?? ''),
        );
        break;
    }

    const cond = this.selectedCondition();
    if (cond !== 'all') {
      list = list.filter((item) => item.condition === cond);
    }

    const stat = this.selectedStatus();
    if (stat !== 'all') {
      list = list.filter((item) => item.status === stat);
    }

    return list;
  });

  readonly filteredStockPositions = computed(() => {
    if (
      this.selectedCondition() !== 'all' ||
      this.selectedStatus() !== 'all' ||
      this.activePreset() !== 'all'
    ) {
      return [];
    }
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.stockService.positions();
    return this.stockService
      .positions()
      .filter((position) => position.title.toLowerCase().includes(query));
  });

  readonly filteredUnitCount = computed(
    () =>
      this.filteredStockPositions().reduce((sum, position) => sum + position.on_hand_quantity, 0) +
      this.filteredItems().filter(isSellableInventoryItem).length,
  );

  async onChangeItemStatus(item: InventoryItem, newStatus: ItemStatus | null): Promise<void> {
    if (!newStatus || newStatus === item.status || isInventoryItemMutationLocked(item)) return;
    const { error } = await this.inventoryService.updateItemStatus(item.id, newStatus);
    if (error) {
      this.meldeFehlerWennNichtSynchronisiert('Artikelstatus konnte nicht geändert werden.', error);
      return;
    }
    this.toast.success('Artikelstatus wurde geändert.');
  }

  async onTogglePublicStore(item: InventoryItem, event?: Event): Promise<void> {
    event?.stopPropagation();
    event?.preventDefault();
    if (isInventoryItemMutationLocked(item)) return;
    const nextVal = item.is_public_store === false;
    const { error } = await this.inventoryService.updateItem(item.id, {
      is_public_store: nextVal,
    });
    if (error) {
      this.meldeFehlerWennNichtSynchronisiert('Shop-Freigabe konnte nicht geändert werden.', error);
      return;
    }
    this.toast.success(
      nextVal ? 'Artikel wurde im Shop veröffentlicht.' : 'Artikel wurde aus dem Shop entfernt.',
    );
  }

  readonly totalTiedCapital = computed(() =>
    this.filteredItems().reduce((sum, item) => sum + (item.allocated_purchase_cost || 0), 0),
  );

  readonly totalExpectedValue = computed(() =>
    this.filteredItems().reduce((sum, item) => sum + (Number(item.expected_value) || 0), 0),
  );

  readonly totalProfitPotential = computed(() =>
    this.filteredItems().reduce(
      (sum, item) =>
        sum + Math.max(0, (Number(item.expected_value) || 0) - (item.allocated_purchase_cost || 0)),
      0,
    ),
  );

  readonly itemsToPrint = computed<InventoryItem[]>(() => {
    const selected = this.selectedItemIds();
    if (selected.size === 0) {
      return this.filteredItems();
    }
    return this.filteredItems().filter((item) => selected.has(item.id));
  });

  toggleSelectItem(id: string): void {
    const next = new Set(this.selectedItemIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedItemIds.set(next);
  }

  openSingleLabel(item: InventoryItem): void {
    this.selectedItemIds.set(new Set([item.id]));
    this.openLabelModal();
  }

  async onRestoreLegacyItem(item: InventoryItem): Promise<void> {
    if (item.sale_state !== 'legacy_sold_unverified') return;
    const confirmed = await this.dialog.frage({
      titel: 'Artikel wieder in Bestand nehmen?',
      text: `„${item.title}“ wird auf „Bereit“ gesetzt. Die Korrektur wird automatisch dokumentiert.`,
      bestaetigenText: 'Artikel ist noch vorhanden',
    });
    if (!confirmed) return;

    const { error } = await this.inventoryService.resolveLegacySoldItem(item.id);
    if (error) {
      this.meldeFehlerWennNichtSynchronisiert('Verkaufsstatus konnte nicht geklärt werden.', error);
      return;
    }
    this.toast.success('Artikel wurde wieder in den Bestand aufgenommen.');
  }

  openLegacySaleReconciliation(item: InventoryItem): void {
    if (item.sale_state !== 'legacy_sold_unverified') return;
    const state: SaleTargetRouteState = {
      legacyReconciliation: {
        kind: 'legacy_sold_unverified',
        inventoryItemId: item.id,
      },
      saleTarget: { kind: 'inventory_item', inventoryItemId: item.id, title: item.title },
    };
    void this.router.navigate(['/sales'], {
      state,
    });
  }

  toggleSelectAll(): void {
    const items = this.filteredItems();
    if (this.selectedItemIds().size === items.length && items.length > 0) {
      this.selectedItemIds.set(new Set());
    } else {
      this.selectedItemIds.set(new Set(items.map((i) => i.id)));
    }
  }

  isItemSelected(id: string): boolean {
    return this.selectedItemIds().has(id);
  }

  isAllSelected(): boolean {
    const items = this.filteredItems();
    return items.length > 0 && this.selectedItemIds().size === items.length;
  }

  readonly isIndeterminate = computed(() => {
    const count = this.selectedItemIds().size;
    const total = this.filteredItems().length;
    return count > 0 && count < total;
  });

  openCreateModal(): void {
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }

  openLabelModal(): void {
    this.isLabelModalOpen.set(true);
  }

  closeLabelModal(): void {
    this.isLabelModalOpen.set(false);
  }

  onAiProductDetected(res: AiVisualScanResult): void {
    this.isAiScannerOpen.set(false);
    this.isCreateModalOpen.set(true);

    // Give modal a tick to render and prefill
    setTimeout(() => {
      if (this.createModal) {
        this.createModal.prefillWithAiResult(res);
      }
    }, 50);
  }

  setPreset(preset: string): void {
    this.activePreset.set(preset);
    if (preset === 'all') {
      this.selectedStatus.set('all');
    } else {
      this.selectedStatus.set(preset);
    }
  }

  private meldeFehlerWennNichtSynchronisiert(title: string, error: Error): void {
    if (!this.syncStatus.istZentralGemeldet(error)) this.toast.error(title, error.message);
  }
}
