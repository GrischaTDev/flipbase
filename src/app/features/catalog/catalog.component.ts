import { TablePreferencesService } from '../../core/services/table-preferences.service';
import { CatalogColumnId, CatalogSortField } from '../../core/config/table-defaults.config';
import { TableColumnMenuComponent } from '../../shared/components/table-column-menu/table-column-menu.component';
import { TableSortHeaderComponent } from '../../shared/components/table-sort-header/table-sort-header.component';
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
import {
  LucideDynamicIcon,
  LucidePlus as Plus,
  LucideSearch as Search,
  LucideBookOpen as BookOpen,
} from '@lucide/angular';
import { CatalogProduct, TrackingMode } from '../../core/models/flipbase.models';
import { CatalogService } from '../../core/services/catalog.service';
import { StockService } from '../../core/services/stock.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { parseCsv } from '../../shared/utils/csv';
import { normalizeGtin } from '../../shared/utils/gtin';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { CatalogProductDialogComponent } from './components/catalog-product-dialog/catalog-product-dialog.component';

interface CatalogImportRow {
  readonly title: string;
  readonly ean: string | null;
  readonly brand: string | null;
  readonly trackingMode: TrackingMode;
  readonly error: string | null;
}

@Component({
  selector: 'app-catalog',
  imports: [
    TableColumnMenuComponent,
    TableSortHeaderComponent,
    LucideDynamicIcon,
    PageHeaderComponent,
    CatalogProductDialogComponent,
  ],
  templateUrl: './catalog.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogComponent {
  readonly tablePreferences = inject(TablePreferencesService);
  readonly catalogService = inject(CatalogService);
  readonly stockService = inject(StockService);
  private readonly workspaceService = inject(WorkspaceService);
  readonly workspaceId = computed(() => this.workspaceService.currentWorkspace()?.id ?? 'default');
  readonly catalogTableConfig = this.tablePreferences.getTableConfig<
    CatalogColumnId,
    CatalogSortField
  >('catalog');
  readonly tablePrefs = computed(() =>
    this.tablePreferences.getTablePreferences<CatalogColumnId, CatalogSortField>(
      'catalog',
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

  readonly plusIcon = Plus;
  readonly searchIcon = Search;
  readonly bookOpenIcon = BookOpen;
  readonly searchQuery = signal('');
  readonly viewModified = computed(
    () =>
      this.searchQuery().trim() !== '' ||
      tableStateDiffersFromDefaults(this.tablePrefs(), this.catalogTableConfig),
  );
  readonly isCreateOpen = signal(false);
  readonly csvRows = signal<readonly CatalogImportRow[]>([]);
  readonly csvHasErrors = computed(() => this.csvRows().some((row) => Boolean(row.error)));
  readonly csvError = signal<string | null>(null);
  readonly isImportingCsv = signal(false);

  readonly filteredProducts = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase('de');
    const products = !query
      ? [...this.catalogService.products()]
      : this.catalogService
          .products()
          .filter((product) =>
            [product.title, product.ean, product.brand, product.model]
              .filter((value): value is string => Boolean(value))
              .some((value) => value.toLocaleLowerCase('de').includes(query)),
          );
    const sort = this.tablePrefs().sort;
    return products.sort((left, right) => {
      const comparison =
        sort.field === 'available'
          ? this.availableStock(left) - this.availableStock(right)
          : left.title.localeCompare(right.title, 'de', { sensitivity: 'base' });
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  });

  toggleColumnVisibility(columnId: CatalogColumnId): void {
    this.tablePreferences.toggleColumnVisibility('catalog', columnId, this.workspaceId());
  }

  onColumnsReordered(event: { previousIndex: number; currentIndex: number }): void {
    this.tablePreferences.reorderColumns(
      'catalog',
      event.previousIndex,
      event.currentIndex,
      this.workspaceId(),
    );
  }

  onSortChanged(sort: TableSortState<CatalogSortField>): void {
    this.tablePreferences.setSort('catalog', sort, this.workspaceId());
  }

  resetTablePreferences(): void {
    this.tablePreferences.resetToDefaults('catalog', this.workspaceId());
  }

  resetView(): void {
    this.searchQuery.set('');
    this.resetTablePreferences();
  }

  ariaSort(field: string): 'ascending' | 'descending' | null {
    const sort = this.tablePrefs().sort;
    if (sort.field !== field) return null;
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  readonly stockByProduct = computed(
    () =>
      new Map(
        this.stockService.positions().map((position) => [position.catalog_product_id, position]),
      ),
  );
  readonly isLoading = computed(
    () => this.catalogService.isLoading() || this.stockService.isLoading(),
  );
  readonly loadError = computed(
    () => this.catalogService.loadError() ?? this.stockService.loadError(),
  );

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceService.currentWorkspace()?.id;
      if (!workspaceId) return;
      void this.reload();
    });
  }

  availableStock(product: CatalogProduct): number {
    return this.stockByProduct().get(product.id)?.available_quantity ?? 0;
  }

  async reload(): Promise<void> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId) return;
    await Promise.all([
      this.catalogService.loadProducts(workspaceId),
      this.stockService.loadPositions(workspaceId),
    ]);
  }

  async previewCsv(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    this.csvError.set(null);
    this.csvRows.set([]);
    try {
      const file = input.files[0];
      if (file.size > 2 * 1024 * 1024) throw new Error('CSV darf höchstens 2 MB groß sein.');
      const parsed = parseCsv(await file.text());
      if (!parsed.headers.includes('title')) throw new Error('CSV benötigt die Spalte „title“.');
      const seenEans = new Set<string>();
      const existingEans = new Set(
        this.catalogService.products().flatMap((product) => (product.ean ? [product.ean] : [])),
      );
      this.csvRows.set(
        parsed.rows.map((row) => {
          const title = row['title']?.trim() ?? '';
          const eanValue = row['ean']?.trim() ?? '';
          const ean = eanValue ? normalizeGtin(eanValue) : null;
          const duplicate = Boolean(ean && (seenEans.has(ean) || existingEans.has(ean)));
          if (ean) seenEans.add(ean);
          return {
            title,
            ean,
            brand: row['brand']?.trim() || null,
            trackingMode: row['tracking_mode'] === 'individual' ? 'individual' : 'quantity',
            error: !title
              ? 'Titel fehlt.'
              : eanValue && !ean
                ? 'EAN/GTIN ungültig.'
                : duplicate
                  ? 'EAN ist bereits vorhanden.'
                  : null,
          };
        }),
      );
      if (!parsed.rows.length) throw new Error('CSV enthält keine Datenzeilen.');
    } catch (error: unknown) {
      this.csvError.set(
        error instanceof Error ? error.message : 'CSV konnte nicht gelesen werden.',
      );
    } finally {
      input.value = '';
    }
  }

  async importCsv(): Promise<void> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    const rows = this.csvRows();
    if (!workspaceId || !rows.length || rows.some((row) => row.error) || this.isImportingCsv())
      return;
    this.isImportingCsv.set(true);
    this.csvError.set(null);
    try {
      for (const row of rows) {
        const result = await this.catalogService.createProduct({
          workspaceId,
          title: row.title,
          brand: row.brand,
          ean: row.ean,
          trackingMode: row.trackingMode,
          isPublicStore: false,
        });
        if (result.error) throw result.error;
      }
      this.csvRows.set([]);
      await this.reload();
    } catch (error: unknown) {
      this.csvError.set(
        error instanceof Error ? error.message : 'CSV-Import konnte nicht abgeschlossen werden.',
      );
    } finally {
      this.isImportingCsv.set(false);
    }
  }
}
