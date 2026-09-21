import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideShoppingBag as ShoppingBag, LucidePlus as Plus } from '@lucide/angular';
import { PurchaseService } from '../../core/services/purchase.service';
import { LegacyPurchaseRecoveryService } from './services/legacy-purchase-recovery.service';
import type { Purchase } from '../../core/models/flipbase.models';
import { ToastService } from '../../shared/components/toast/toast.service';
import { InventoryService } from '../../core/services/inventory.service';
import { StockService } from '../../core/services/stock.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { CostStateComponent } from '../../shared/components/cost-state/cost-state.component';
import { mapPurchaseListRow } from './utils/purchase-presentation';
import type { PurchaseListRow } from './models/purchase-presentation.models';
import { PurchasesColumnId, PurchasesSortField } from '../../core/config/table-defaults.config';
import {
  tableStateDiffersFromDefaults,
  TableSortState,
} from '../../core/models/table-preferences.models';
import { TablePreferencesService } from '../../core/services/table-preferences.service';
import { TableSortHeaderComponent } from '../../shared/components/table-sort-header/table-sort-header.component';

import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/components/custom-select/custom-select.component';
import { PurchaseReceiptPreviewComponent } from './components/purchase-receipt-preview/purchase-receipt-preview.component';
import { DataTableComponent } from '../../shared/components/data-table/data-table.component';

@Component({
  selector: 'app-purchases',
  imports: [
    RouterLink,
    DatePipe,
    TranslatePipe,
    CostStateComponent,
    PageHeaderComponent,
    BadgeComponent,
    ButtonComponent,
    TableSortHeaderComponent,
    CustomSelectComponent,
    DataTableComponent,
    PurchaseReceiptPreviewComponent,
  ],
  templateUrl: './purchases.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchasesComponent {
  readonly purchaseService = inject(PurchaseService);
  readonly recovery = inject(LegacyPurchaseRecoveryService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly inventoryService = inject(InventoryService);
  private readonly stockService = inject(StockService);
  private readonly workspaceService = inject(WorkspaceService);
  readonly tablePreferences = inject(TablePreferencesService);
  private requestedStockWorkspaceId = '';

  readonly bagIcon = ShoppingBag;
  readonly plusIcon = Plus;
  readonly activeStatus = signal('all');
  readonly sellerId = signal('');
  readonly statusOptions: readonly SelectOption<string>[] = [
    { value: 'all', label: 'Alle' },
    { value: 'draft', label: 'Entwurf' },
    { value: 'ordered', label: 'Bestellt' },
    { value: 'partially_received', label: 'Teillieferung' },
    { value: 'received', label: 'Angekommen' },
    { value: 'archived', label: 'Archiv' },
  ];
  readonly sellerOptions = computed(() => {
    const sellers = new Map<string, string>();
    for (const purchase of this.purchaseService.purchases()) {
      const id = purchase.supplier_id ?? purchase.supplier?.id;
      if (id) sellers.set(id, purchase.supplier?.name ?? 'Unbekannter Verkäufer');
    }
    return [...sellers]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  });
  readonly sellerSelectOptions = computed<readonly SelectOption<string>[]>(() => [
    { value: '', label: 'Verkäufer ist …' },
    ...this.sellerOptions().map((seller) => ({
      value: seller.id,
      label: `${seller.name} · ${seller.id.slice(-6)}`,
    })),
  ]);
  readonly selectedSeller = computed(() =>
    this.sellerOptions().find((seller) => seller.id === this.sellerId()),
  );
  readonly searchQuery = signal('');
  readonly hasPurchases = computed(() => this.purchaseService.purchases().length > 0);
  readonly isPurchaseListLoading = computed(() => {
    const workspaceId = this.workspaceService.currentWorkspace()?.id ?? null;
    if (workspaceId === null) return false;
    return (
      this.purchaseService.isLoading() ||
      (!this.purchaseService.loadError() &&
        this.purchaseService.loadedWorkspaceId() !== workspaceId)
    );
  });
  readonly hasOnlyArchivedPurchases = computed(
    () =>
      this.hasPurchases() &&
      this.purchaseService
        .purchases()
        .every((purchase) => purchase.receiving_status === 'archived'),
  );
  readonly canShowArchiveFromEmpty = computed(
    () =>
      this.hasOnlyArchivedPurchases() &&
      this.activeStatus() !== 'archived' &&
      this.sellerId() === '' &&
      this.searchQuery().trim() === '',
  );
  readonly emptyTitle = computed(() =>
    this.hasPurchases() ? 'Keine passenden Einkäufe' : 'Keine Einkäufe vorhanden',
  );
  readonly emptyText = computed(() =>
    this.hasPurchases() ? 'Ändere die Suche oder die Filter.' : 'Erstelle deinen ersten Einkauf.',
  );
  readonly workspaceId = computed(() => this.workspaceService.currentWorkspace()?.id ?? 'default');
  readonly purchasesTableConfig = this.tablePreferences.getTableConfig<
    PurchasesColumnId,
    PurchasesSortField
  >('purchases');
  readonly tablePrefs = computed(() =>
    this.tablePreferences.getTablePreferences<PurchasesColumnId, PurchasesSortField>(
      'purchases',
      this.workspaceId(),
    )(),
  );
  readonly visibleColumns = computed(() =>
    this.tablePrefs()
      .columns.filter((column) => column.visible)
      .map((column) => column.id),
  );
  readonly orderedVisibleColumns = computed(() =>
    this.tablePrefs().columns.filter((column) => column.visible),
  );
  readonly viewModified = computed(
    () =>
      this.activeStatus() !== 'all' ||
      this.sellerId() !== '' ||
      this.searchQuery().trim() !== '' ||
      tableStateDiffersFromDefaults(this.tablePrefs(), this.purchasesTableConfig),
  );

  ariaSort(field: string): 'ascending' | 'descending' | null {
    const sort = this.tablePrefs().sort;
    if (sort.field !== field) return null;
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  retryLoadPurchases(): void {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (workspaceId) void this.purchaseService.loadPurchases(workspaceId);
  }

  readonly filteredPurchases = computed(() => {
    const status = this.activeStatus();
    return this.purchaseService.purchases().filter((purchase) => {
      const archived = purchase.receiving_status === 'archived';
      if (status === 'archived') return archived && this.matchesSeller(purchase);
      if (archived || !this.matchesSeller(purchase)) return false;
      if (status === 'all') return true;
      if (status === 'received')
        return (
          purchase.receiving_status === 'received' ||
          (purchase.shipment_status === 'arrived' &&
            purchase.receiving_status !== 'partially_received')
        );
      if (status === 'ordered') return purchase.receiving_status === 'ordered';
      return (purchase.receiving_status ?? 'draft') === status;
    });
  });

  private matchesSeller(purchase: Purchase): boolean {
    return !this.sellerId() || (purchase.supplier_id ?? purchase.supplier?.id) === this.sellerId();
  }

  readonly purchaseRows = computed(() => {
    const workspaceId = this.workspaceService.currentWorkspace()?.id ?? null;
    const inventoryState =
      workspaceId !== null &&
      this.inventoryService.loadedWorkspaceId() === workspaceId &&
      this.inventoryService.istGeladen()
        ? ('loaded' as const)
        : this.inventoryService.loadError()
          ? ('error' as const)
          : ('loading' as const);
    const stockState = this.stockService.loadError()
      ? ('error' as const)
      : workspaceId !== null && this.stockService.loadedWorkspaceId() === workspaceId
        ? ('loaded' as const)
        : ('loading' as const);
    const rows = this.filteredPurchases().map((purchase) =>
      mapPurchaseListRow(purchase, {
        inventoryItems: inventoryState === 'loaded' ? this.inventoryService.items() : [],
        stockLots: this.stockService.lots(),
        stockMovements: this.stockService.movements(),
        sales: [],
        inventoryState,
        stockState,
        salesState: 'loaded',
      }),
    );
    const query = this.searchQuery().trim().toLocaleLowerCase('de');
    const filtered = query
      ? rows.filter((row) =>
          [row.reference, row.title, row.supplierLabel, row.sellerSearchText, row.supplierReference]
            .join(' ')
            .toLocaleLowerCase('de')
            .includes(query),
        )
      : rows;
    const sort = this.tablePrefs().sort;
    return [...filtered].sort((left, right) => {
      const comparison =
        sort.field === 'title'
          ? left.title.localeCompare(right.title, 'de', { sensitivity: 'base' })
          : sort.field === 'total_cost'
            ? this.costValue(left.totalCost) - this.costValue(right.totalCost)
            : left.purchaseDate.localeCompare(right.purchaseDate);
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  });

  toggleColumnVisibility(columnId: PurchasesColumnId): void {
    this.tablePreferences.toggleColumnVisibility('purchases', columnId, this.workspaceId());
  }

  onColumnsReordered(event: { previousIndex: number; currentIndex: number }): void {
    this.tablePreferences.reorderColumns(
      'purchases',
      event.previousIndex,
      event.currentIndex,
      this.workspaceId(),
    );
  }

  onSortChanged(sort: TableSortState<PurchasesSortField>): void {
    this.tablePreferences.setSort('purchases', sort, this.workspaceId());
  }

  resetTablePreferences(): void {
    this.tablePreferences.resetToDefaults('purchases', this.workspaceId());
  }

  resetView(): void {
    this.clearFilters();
    this.resetTablePreferences();
  }

  clearFilters(): void {
    this.activeStatus.set('all');
    this.sellerId.set('');
    this.searchQuery.set('');
  }

  showArchive(): void {
    this.activeStatus.set('archived');
    this.sellerId.set('');
    this.searchQuery.set('');
  }

  private costValue(state: PurchaseListRow['totalCost']): number {
    return state.kind === 'known' ? state.amount : 0;
  }

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceId();
      untracked(() => {
        this.activeStatus.set('all');
        this.searchQuery.set('');
        this.sellerId.set('');
        try {
          const stored: unknown = JSON.parse(
            localStorage.getItem(`flipbase_purchase_filters_v2_${workspaceId}`) ?? 'null',
          );
          if (stored && typeof stored === 'object') {
            const filters = stored as Record<string, unknown>;
            if (
              typeof filters['status'] === 'string' &&
              this.statusOptions.some((option) => option.value === filters['status'])
            )
              this.activeStatus.set(filters['status']);
            if (typeof filters['query'] === 'string') this.searchQuery.set(filters['query']);
            if (typeof filters['sellerId'] === 'string') this.sellerId.set(filters['sellerId']);
          }
        } catch {
          /* Bei unlesbaren Einstellungen mit der vollständigen Ansicht starten. */
        }
      });
    });
    effect(() => {
      const key = `flipbase_purchase_filters_v2_${this.workspaceId()}`;
      const value = JSON.stringify({
        status: this.activeStatus(),
        query: this.searchQuery(),
        sellerId: this.sellerId(),
      });
      try {
        localStorage.setItem(key, value);
      } catch {
        /* Die Ansicht bleibt ohne lokalen Speicher bedienbar. */
      }
    });
    effect(() => {
      const workspaceId = this.workspaceService.currentWorkspace()?.id;
      if (!workspaceId || workspaceId === this.requestedStockWorkspaceId) return;
      this.requestedStockWorkspaceId = workspaceId;
      void this.stockService.loadPositions(workspaceId);
    });
  }

  openPurchase(event: MouseEvent, id: string): void {
    if (event.target instanceof Element && event.target.closest('a, button, input, select')) return;
    if (window.getSelection()?.toString()) return;
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    void this.router.navigate(['/purchases', id]);
  }

  exportLegacyPurchases(): void {
    try {
      this.recovery.exportBackup();
      this.toast.success('Die Sicherungsdatei wurde zum Herunterladen bereitgestellt.');
    } catch {
      this.toast.error(
        'Die Sicherung konnte nicht erstellt werden. Die lokalen Daten bleiben erhalten.',
      );
    }
  }
}
