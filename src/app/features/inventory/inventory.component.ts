import { TablePreferencesService } from '../../core/services/table-preferences.service';
import {
  InventoryArchiveService,
  isArchivedInventoryItem,
} from './services/inventory-archive.service';
import { InventoryColumnId, InventorySortField } from '../../core/config/table-defaults.config';
import {
  tableStateDiffersFromDefaults,
  TableSortState,
} from '../../core/models/table-preferences.models';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
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
import { BarcodeScannerComponent } from '../../shared/components/barcode-scanner/barcode-scanner.component';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { StockService } from '../../core/services/stock.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { StockPositionListComponent } from './components/stock-position-list/stock-position-list.component';
import { SaleTargetRouteState } from '../../core/models/sale-target.models';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { SalesService } from '../../core/services/sales.service';
import { buildInventoryPresentation, InventorySourceState } from './utils/inventory-presentation';
import { CostState } from '../../shared/components/cost-state/cost-state.component';

import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CatalogService } from '../../core/services/catalog.service';
import { InventoryViewStateService } from './services/inventory-view-state.service';
import { MediaService } from '../../core/services/media.service';
import { DataTableComponent } from '../../shared/components/data-table/data-table.component';

@Component({
  selector: 'app-inventory',
  imports: [
    BarcodeScannerComponent,
    AiPhotoScannerModalComponent,
    InventoryLabelModalComponent,
    CustomSelectComponent,
    StockPositionListComponent,
    DataTableComponent,
    PageHeaderComponent,
    BadgeComponent,
    ButtonComponent,
  ],
  templateUrl: './inventory.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryComponent {
  private readonly viewState = inject(InventoryViewStateService);
  readonly catalogService = inject(CatalogService);
  private readonly mediaService = inject(MediaService);
  readonly archiveService = inject(InventoryArchiveService);
  get archiveView() {
    return this.viewState.current().archiveView;
  }
  readonly stockViews = [
    { value: 'stock', label: 'Auf Lager' },
    { value: 'sold', label: 'Verkauft' },
    { value: 'all', label: 'Alle Bestandspositionen' },
  ] as const;
  get stockView() {
    return this.viewState.current().stockView;
  }

  async onArchiveItem(item: InventoryItem): Promise<void> {
    if (this.archiveService.pendingIds().has(item.id)) return;
    const archived = !item.archived_at;
    const confirmed = await this.dialog.frage({
      titel: archived ? 'Artikel archivieren?' : 'Aus Archiv holen?',
      text: `„${item.title}“ ${archived ? 'wird archiviert' : 'wird wieder in der aktiven Ansicht angezeigt'}. Der Verkauf und alle Buchungen bleiben erhalten.`,
      bestaetigenText: archived ? 'Archivieren' : 'Aus Archiv holen',
    });
    if (!confirmed) return;
    try {
      await this.archiveService.setArchived(item.workspace_id, item.id, archived);
      this.toast.success(
        archived ? 'Artikel wurde archiviert.' : 'Artikel wurde aus dem Archiv geholt.',
      );
    } catch (error: unknown) {
      this.toast.error(
        'Archivaktion konnte nicht gespeichert werden.',
        error instanceof Error ? error.message : 'Unbekannter Fehler',
      );
    }
  }
  readonly tablePreferences = inject(TablePreferencesService);
  readonly inventoryTableConfig = this.tablePreferences.getTableConfig<
    InventoryColumnId,
    InventorySortField
  >('inventory');
  readonly workspaceId = computed(() => this.workspaceService.currentWorkspace()?.id ?? 'default');
  readonly tablePrefs = computed(() =>
    this.tablePreferences.getTablePreferences<InventoryColumnId, InventorySortField>(
      'inventory',
      this.workspaceId(),
    )(),
  );
  readonly visibleColumns = computed(() =>
    this.tablePrefs()
      .columns.filter((column) => column.visible)
      .map((column) => column.id),
  );
  readonly inventoryService = inject(InventoryService);
  readonly imageUrls = computed(() => {
    const urls = { ...this.catalogService.imageUrls() };
    for (const item of this.inventoryService.items()) {
      if (item.workspace_id !== this.workspaceService.currentWorkspace()?.id) continue;
      const path = this.primaryItemImagePath(item);
      if (path) urls[item.id] = this.mediaService.getMediaUrl(path);
    }
    return urls;
  });
  readonly stockService = inject(StockService);
  readonly purchaseService = inject(PurchaseService);
  readonly salesService = inject(SalesService);
  private readonly router = inject(Router);
  private readonly dialog = inject(ConfirmDialogService);
  readonly workspaceService = inject(WorkspaceService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly toast = inject(ToastService);

  readonly boxesIcon = Boxes;
  readonly plusIcon = Plus;
  readonly tagIcon = Tag;
  readonly trendingIcon = TrendingUp;
  readonly coinsIcon = Coins;
  readonly barcodeIcon = Barcode;
  readonly printerIcon = Printer;
  readonly storeIcon = Store;

  onImageFailed(id: string): void {
    const item = this.inventoryService
      .items()
      .find((entry) => entry.id === id && entry.workspace_id === this.workspaceId());
    const path = item ? this.primaryItemImagePath(item) : null;
    if (path) this.mediaService.reportMediaFailure(path);
    else this.catalogService.invalidateProductImage(id);
  }

  private primaryItemImagePath(item: InventoryItem): string | null {
    return (
      item.media?.find((media) => media.is_primary)?.storage_path ??
      item.media?.[0]?.storage_path ??
      null
    );
  }

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
  get filtersExpanded() {
    return this.viewState.current().filtersExpanded;
  }
  get searchQuery() {
    return this.viewState.current().searchQuery;
  }
  get selectedCondition() {
    return this.viewState.current().selectedCondition;
  }
  get selectedStatus() {
    return this.viewState.current().selectedStatus;
  }
  get activePreset() {
    return this.viewState.current().activePreset;
  }
  readonly activeFilterCount = computed(
    () =>
      [this.activePreset(), this.selectedCondition(), this.selectedStatus()].filter(
        (value) => value !== 'all',
      ).length,
  );
  readonly filterPresetOptions: SelectOption<string>[] = [
    { value: 'all', label: 'Alle Artikel' },
    { value: 'needs_research', label: 'Recherche nötig' },
    { value: 'unlisted', label: 'Nicht gelistet' },
    { value: 'high_margin', label: 'Hohe Marge' },
    { value: 'defective', label: 'Defekt / Bastler' },
    { value: 'store_public', label: 'Im Webshop' },
    { value: 'legacy_review', label: 'Verkaufsstatus klären' },
  ];
  readonly selectedItemIds = signal<Set<string>>(new Set());
  readonly viewModified = computed(
    () =>
      this.archiveView() !== 'active' ||
      this.stockView() !== 'stock' ||
      this.activePreset() !== 'all' ||
      this.selectedCondition() !== 'all' ||
      this.selectedStatus() !== 'all' ||
      this.searchQuery().trim() !== '' ||
      this.selectedItemIds().size > 0 ||
      tableStateDiffersFromDefaults(this.tablePrefs(), this.inventoryTableConfig),
  );

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceService.currentWorkspace()?.id;
      if (workspaceId) {
        void this.stockService.loadPositions(workspaceId);
        void this.catalogService.loadProducts(workspaceId);
      }
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
      returnUrl: '/inventory',
    };
    void this.router.navigate(['/sales/new'], {
      state,
    });
  }

  openSaleForIndividualItem(item: InventoryItem): void {
    if (!isSellableInventoryItem(item)) return;
    const state: SaleTargetRouteState = {
      saleTarget: { kind: 'inventory_item', inventoryItemId: item.id, title: item.title },
      returnUrl: '/inventory',
    };
    void this.router.navigate(['/sales/new'], {
      state,
    });
  }

  async reloadInventorySources(): Promise<void> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId) return;
    await Promise.all([
      this.inventoryService.loadInventory(workspaceId),
      this.stockService.loadPositions(workspaceId),
      this.purchaseService.loadPurchases(workspaceId),
      this.salesService.loadSales(workspaceId),
    ]);
  }

  readonly filterStatusOptions: SelectOption<string>[] = [
    { value: 'all', label: 'Alle Status' },
    { value: 'available', label: 'Verfügbar', badgeClass: 'bg-emerald-400' },
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

  readonly inventorySourceState = computed<InventorySourceState>(() =>
    this.sourceState(
      this.inventoryService.loadedWorkspaceId(),
      this.inventoryService.isLoading(),
      this.inventoryService.loadError(),
    ),
  );
  readonly stockSourceState = computed<InventorySourceState>(() =>
    this.sourceState(
      this.stockService.loadedWorkspaceId(),
      this.stockService.isLoading(),
      this.stockService.loadError(),
    ),
  );
  readonly purchaseSourceState = computed<InventorySourceState>(() =>
    this.sourceState(
      this.purchaseService.loadedWorkspaceId(),
      this.purchaseService.isLoading(),
      this.purchaseService.loadError(),
    ),
  );
  readonly salesSourceState = computed<InventorySourceState>(() =>
    this.sourceState(
      this.salesService.loadedWorkspaceId(),
      this.salesService.isLoading(),
      this.salesService.loadError(),
    ),
  );

  readonly inventoryPresentation = computed(() =>
    buildInventoryPresentation({
      workspaceId: this.workspaceService.currentWorkspace()?.id ?? '',
      inventoryState: this.inventorySourceState(),
      stockState: this.stockSourceState(),
      stockWorkspaceId: this.stockService.loadedWorkspaceId(),
      purchaseState: this.purchaseSourceState(),
      salesState: this.salesSourceState(),
      individualItems: this.inventoryService.items(),
      positions: this.stockService.positions(),
      lots: this.stockService.lots(),
      movements: this.stockService.movements(),
      purchases: this.purchaseService.purchases(),
      sales: this.salesService.sales(),
    }),
  );

  readonly filteredPresentationRows = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const condition = this.selectedCondition();
    const status = this.selectedStatus();
    const preset = this.activePreset();
    const filtered = this.inventoryPresentation().rows.filter((row) => {
      const item = row.inventoryItem;
      const archived = !!item && isArchivedInventoryItem(item);
      const unresolved = row.quantityState !== 'known';
      if (this.archiveView() === 'active' && archived && !unresolved) return false;
      if (this.archiveView() === 'archive' && !archived) return false;
      if (this.archiveView() === 'active' && status !== 'sold' && preset !== 'legacy_review') {
        if (this.stockView() === 'stock' && row.onHandQuantity === 0 && !unresolved) return false;
        if (this.stockView() === 'sold' && row.quantity.sold === 0 && !unresolved) return false;
      }
      if (
        query &&
        ![row.title, item?.sku, item?.ean, item?.brand, item?.model]
          .filter((value): value is string => !!value)
          .some((value) => value.toLowerCase().includes(query))
      ) {
        return false;
      }
      if (condition !== 'all' && row.condition !== condition) return false;
      if (status === 'available' && (unresolved || row.quantity.available <= 0)) return false;
      if (status === 'sold' && row.quantity.sold <= 0) return false;
      if (status === 'reserved' && row.quantity.reserved <= 0 && item?.status !== 'reserved') {
        return false;
      }
      if (status !== 'all' && !['available', 'sold', 'reserved'].includes(status)) {
        if (!item || item.status !== status) return false;
      }
      if (preset === 'all') return true;
      if (!item) return false;
      switch (preset) {
        case 'needs_research':
          return ['received', 'needs_review', 'researched'].includes(item.status);
        case 'unlisted':
          return item.status !== 'listed' && item.status !== 'sold';
        case 'high_margin':
          return (item.profit_potential ?? 0) >= 30;
        case 'defective':
          return item.status === 'defective';
        case 'store_public':
          return item.is_public_store !== false && item.status !== 'sold';
        case 'legacy_review':
          return [
            'legacy_sold_unverified',
            'legacy_sale_header_without_line',
            'sale_status_conflict',
            'multiple_active_sales',
          ].includes(item.sale_state ?? '');
        default:
          return true;
      }
    });
    const sort = this.tablePrefs().sort;
    return [...filtered].sort((left, right) => {
      const comparison =
        sort.field === 'title'
          ? left.title.localeCompare(right.title, 'de', { sensitivity: 'base' })
          : sort.field === 'quantity'
            ? (left.onHandQuantity ?? Number.NEGATIVE_INFINITY) -
              (right.onHandQuantity ?? Number.NEGATIVE_INFINITY)
            : sort.field === 'unit_cost'
              ? this.costValue(left.costPerUnit) - this.costValue(right.costPerUnit)
              : sort.field === 'inventory_value'
                ? this.costValue(left.inventoryValue) - this.costValue(right.inventoryValue)
                : left.id.localeCompare(right.id);
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  });

  toggleColumnVisibility(columnId: InventoryColumnId): void {
    this.tablePreferences.toggleColumnVisibility('inventory', columnId, this.workspaceId());
  }

  onColumnsReordered(event: { previousIndex: number; currentIndex: number }): void {
    this.tablePreferences.reorderColumns(
      'inventory',
      event.previousIndex,
      event.currentIndex,
      this.workspaceId(),
    );
  }

  onSortChanged(sort: TableSortState<InventorySortField>): void {
    this.tablePreferences.setSort('inventory', sort, this.workspaceId());
  }

  resetTablePreferences(): void {
    this.tablePreferences.resetToDefaults('inventory', this.workspaceId());
  }

  resetView(): void {
    this.filtersExpanded.set(false);
    this.archiveView.set('active');
    this.stockView.set('stock');
    this.activePreset.set('all');
    this.selectedCondition.set('all');
    this.selectedStatus.set('all');
    this.searchQuery.set('');
    this.selectedItemIds.set(new Set());
    this.resetTablePreferences();
  }

  private costValue(state: CostState): number {
    return state.kind === 'known' ? state.amount : 0;
  }

  readonly filteredItems = computed(() =>
    this.filteredPresentationRows().flatMap((row) =>
      row.inventoryItem ? [row.inventoryItem] : [],
    ),
  );

  readonly filteredUnitCount = computed(() => {
    const rows = this.filteredPresentationRows();
    if (
      this.inventoryPresentation().sourceState !== 'known' ||
      rows.some((row) => row.onHandQuantity === null)
    )
      return null;
    return rows.reduce((sum, row) => sum + (row.onHandQuantity ?? 0), 0);
  });

  readonly filteredInventoryValue = computed<CostState>(() => {
    const rows = this.filteredPresentationRows();
    if (
      this.inventoryPresentation().sourceState !== 'known' ||
      rows.some((row) => row.quantityState !== 'known' || row.inventoryValue.kind !== 'known')
    ) {
      return { kind: 'open' };
    }
    const valueInCents = rows.reduce(
      (sum, row) =>
        sum +
        (row.inventoryValue.kind === 'known'
          ? Math.round((row.inventoryValue.amount + Number.EPSILON) * 100)
          : 0),
      0,
    );
    return { kind: 'known', amount: valueInCents / 100 };
  });

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

  readonly totalExpectedValue = computed<CostState>(() =>
    this.inventoryPresentation().sourceState === 'known'
      ? {
          kind: 'known',
          amount: this.filteredItems().reduce(
            (sum, item) => sum + (Number(item.expected_value) || 0),
            0,
          ),
        }
      : { kind: 'open' },
  );

  readonly soldUnitCount = computed(() =>
    this.filteredPresentationRows().reduce((sum, row) => sum + row.quantity.sold, 0),
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
      returnUrl: '/inventory',
    };
    void this.router.navigate(['/sales/new'], {
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

  openCreatePage(): void {
    void this.router.navigate(['/purchases/new']);
  }

  setStockView(view: 'stock' | 'sold' | 'all'): void {
    this.stockView.set(view);
    this.archiveView.set(view === 'all' ? 'all' : 'active');
    this.selectedStatus.set('all');
    this.activePreset.set('all');
    this.selectedItemIds.set(new Set());
  }

  openLabelModal(): void {
    this.isLabelModalOpen.set(true);
  }

  closeLabelModal(): void {
    this.isLabelModalOpen.set(false);
  }

  onAiProductDetected(res: AiVisualScanResult): void {
    this.isAiScannerOpen.set(false);
    void this.router.navigate(['/inventory/new'], { state: { aiResult: res } });
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

  private sourceState(
    loadedWorkspaceId: string | null,
    loading: boolean,
    error: Error | null,
  ): InventorySourceState {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (error) return 'error';
    return workspaceId && loadedWorkspaceId === workspaceId && !loading ? 'known' : 'loading';
  }
}
