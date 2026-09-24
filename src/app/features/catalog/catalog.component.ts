import { TablePreferencesService } from '../../core/services/table-preferences.service';
import { CatalogColumnId, CatalogSortField } from '../../core/config/table-defaults.config';
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
  untracked,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InventoryService } from '../../core/services/inventory.service';
import { isSellableInventoryItem } from '../../core/models/inventory-sellability';
import type { SaleTarget, SaleTargetRouteState } from '../../core/models/sale-target.models';
import { PurchaseService } from '../../core/services/purchase.service';
import { MediaService } from '../../core/services/media.service';
import { buildCatalogOverview, CatalogOverviewRow } from './utils/catalog-overview';
import { CatalogViewStateService } from './services/catalog-view-state.service';
import { LucidePlus as Plus, LucideBookOpen as BookOpen } from '@lucide/angular';
import { CatalogService } from '../../core/services/catalog.service';
import { StockService } from '../../core/services/stock.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { ProductThumbnailComponent } from '../../shared/components/product-thumbnail/product-thumbnail.component';
import { DataTableComponent } from '../../shared/components/data-table/data-table.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { parseCsv } from '../../shared/utils/csv';
import { normalizeGtin } from '../../shared/utils/gtin';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { ArticleLifecycleService } from './services/article-lifecycle.service';
import { ArticleMediaCleanupService } from './services/article-media-cleanup.service';
import {
  articleViews,
  matchesArticleView,
  parseArticleView,
  type ArticleView,
} from './models/article-view';

interface CatalogImportRow {
  readonly title: string;
  readonly ean: string | null;
  readonly brand: string | null;
  readonly error: string | null;
}

@Component({
  selector: 'app-catalog',
  imports: [
    RouterLink,
    DataTableComponent,
    TableSortHeaderComponent,
    ReactiveFormsModule,
    ProductThumbnailComponent,
    ButtonComponent,
    PageHeaderComponent,
  ],
  templateUrl: './catalog.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogComponent {
  readonly tablePreferences = inject(TablePreferencesService);
  readonly catalogService = inject(CatalogService);
  readonly stockService = inject(StockService);
  readonly inventoryService = inject(InventoryService);
  private readonly purchaseService = inject(PurchaseService);
  private readonly mediaService = inject(MediaService);
  private readonly viewState = inject(CatalogViewStateService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirmation = inject(ConfirmDialogService);
  readonly lifecycle = inject(ArticleLifecycleService);
  readonly cleanup = inject(ArticleMediaCleanupService);
  readonly articleViews = articleViews;
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly view = computed(() => parseArticleView(this.queryParams().get('view')));
  readonly actionError = signal<string | null>(null);
  readonly actionMessage = signal<string | null>(null);
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
  readonly bookOpenIcon = BookOpen;
  readonly searchControl = new FormControl(this.viewState.searchFor(this.workspaceId()), {
    nonNullable: true,
  });
  readonly searchQuery = toSignal(this.searchControl.valueChanges, {
    initialValue: this.searchControl.value,
  });
  readonly viewModified = computed(
    () =>
      this.searchQuery().trim() !== '' ||
      tableStateDiffersFromDefaults(this.tablePrefs(), this.catalogTableConfig),
  );
  readonly csvRows = signal<readonly CatalogImportRow[]>([]);
  readonly csvHasErrors = computed(() => this.csvRows().some((row) => Boolean(row.error)));
  readonly csvError = signal<string | null>(null);
  readonly isImportingCsv = signal(false);
  readonly overview = computed(() =>
    buildCatalogOverview(
      this.workspaceId(),
      this.catalogService.products(),
      this.inventoryService.items(),
      this.purchaseService.purchases().flatMap((purchase) => purchase.purchase_lines ?? []),
      this.stockService.loadedWorkspaceId() === this.workspaceId()
        ? this.stockService.positions()
        : [],
      this.stockService.loadedWorkspaceId() === this.workspaceId() ? this.stockService.lots() : [],
      this.stockService.loadedWorkspaceId() === this.workspaceId()
        ? this.stockService.movements()
        : [],
    ),
  );
  readonly filteredProducts = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase('de');
    const visible = this.overview().filter((product) => matchesArticleView(product, this.view()));
    const products = !query
      ? [...visible]
      : visible.filter((product) =>
          [product.title, product.ean, product.brand, product.model, product.category]
            .filter((value): value is string => Boolean(value))
            .some((value) => value.toLocaleLowerCase('de').includes(query)),
        );
    const sort = this.tablePrefs().sort;
    return products.sort((left, right) => {
      if (sort.field !== 'title') {
        const first =
          sort.field === 'available'
            ? left.available
            : sort.field === 'on_hand'
              ? left.onHand
              : left.inventoryValue;
        const second =
          sort.field === 'available'
            ? right.available
            : sort.field === 'on_hand'
              ? right.onHand
              : right.inventoryValue;
        if (first === null || second === null)
          return first === second ? 0 : first === null ? 1 : -1;
        return sort.direction === 'asc' ? first - second : second - first;
      }
      const comparison = left.title.localeCompare(right.title, 'de', { sensitivity: 'base' });
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
    this.searchControl.setValue('');
    this.resetTablePreferences();
    void this.setView('active');
  }

  async setView(view: ArticleView): Promise<void> {
    await this.router.navigate(['/catalog'], { queryParams: view === 'active' ? {} : { view } });
  }

  statusLabel(row: CatalogOverviewRow): string {
    if (row.archivedAt) return 'Archiviert';
    if (row.quantityState === 'review_required') return 'Zu prüfen';
    if (row.reserved && row.reserved > 0) return 'Reserviert';
    if (row.onHand === 0) return 'Ohne Bestand';
    return row.available && row.available > 0 ? 'Verfügbar' : 'Nicht verfügbar';
  }

  formatCurrency(value: number | null): string {
    return value === null
      ? 'Zu prüfen'
      : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
  }

  private saleTargetFor(row: CatalogOverviewRow): SaleTarget | null {
    if (row.archivedAt) return null;
    if (row.kind === 'item') {
      const item = this.inventoryService.items().find((entry) => entry.id === row.id);
      return item && isSellableInventoryItem(item) && row.available === 1
        ? { kind: 'inventory_item', inventoryItemId: item.id, title: item.title }
        : null;
    }
    const position = this.stockService
      .positions()
      .find((entry) => entry.catalog_product_id === row.id && entry.available_quantity > 0);
    return position
      ? {
          kind: 'catalog_product',
          catalogProductId: row.id,
          title: row.title,
          availableQuantity: position.available_quantity,
        }
      : null;
  }

  canSell(row: CatalogOverviewRow): boolean {
    return this.saleTargetFor(row) !== null;
  }

  openSale(row: CatalogOverviewRow): void {
    const saleTarget = this.saleTargetFor(row);
    if (!saleTarget) return;
    const state: SaleTargetRouteState = { saleTarget, returnUrl: '/catalog?view=stock' };
    void this.router.navigate(['/sales/new'], { state });
  }

  async setArchived(row: CatalogOverviewRow): Promise<void> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId || this.lifecycle.pendingIds().has(row.key)) return;
    const archived = row.archivedAt === null;
    const stock = row.onHand === null ? 'ungeklärtem Bestand' : `${row.onHand} Stück Bestand`;
    const value = this.formatCurrency(row.inventoryValue);
    const confirmed = await this.confirmation.frage({
      titel: archived ? 'Artikel archivieren?' : 'Artikel wiederherstellen?',
      text: archived
        ? `„${row.title}“ hat ${stock} und einen Bestandswert von ${value}. Menge, Wert und Belege bleiben erhalten. Neue Verkäufe und Inserate sind bis zur Wiederherstellung gesperrt.`
        : `„${row.title}“ wird wieder in den aktiven Artikeln angezeigt.`,
      bestaetigenText: archived ? 'Archivieren' : 'Wiederherstellen',
    });
    if (!confirmed || this.workspaceService.currentWorkspace()?.id !== workspaceId) return;
    this.actionError.set(null);
    try {
      await this.lifecycle.setArchived(workspaceId, row.kind, row.id, archived);
      if (this.workspaceService.currentWorkspace()?.id !== workspaceId) return;
      await this.reload();
      this.actionMessage.set(archived ? 'Artikel archiviert.' : 'Artikel wiederhergestellt.');
    } catch (error: unknown) {
      if (this.workspaceService.currentWorkspace()?.id === workspaceId)
        this.actionError.set(
          error instanceof Error ? error.message : 'Archivaktion fehlgeschlagen.',
        );
    }
  }

  async deleteUnused(row: CatalogOverviewRow): Promise<void> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId || !row.canOfferDelete || this.lifecycle.pendingIds().has(row.key)) return;
    const confirmed = await this.confirmation.frage({
      titel: 'Unbenutzten Artikel löschen?',
      text: `„${row.title}“ wird endgültig gelöscht. Die Datenbank lässt das nur zu, wenn keine Einkäufe, Bestände, Verkäufe, Aufträge oder Inserate dazu gehören.`,
      bestaetigenText: 'Endgültig löschen',
      gefahr: true,
    });
    if (!confirmed || this.workspaceService.currentWorkspace()?.id !== workspaceId) return;
    this.actionError.set(null);
    try {
      await this.lifecycle.deleteUnused(workspaceId, row.kind, row.id);
      if (this.workspaceService.currentWorkspace()?.id !== workspaceId) return;
      await this.reload();
      this.actionMessage.set('Artikel gelöscht.');
      try {
        await this.cleanup.retry(workspaceId);
      } catch {
        // Der Artikel ist bereits gelöscht; der Bildauftrag bleibt für einen erneuten Versuch erhalten.
      }
    } catch (error: unknown) {
      if (this.workspaceService.currentWorkspace()?.id === workspaceId)
        this.actionError.set(
          error instanceof Error ? error.message : 'Artikel konnte nicht gelöscht werden.',
        );
    }
  }

  async retryCleanup(): Promise<void> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId) return;
    try {
      await this.cleanup.retry(workspaceId, true);
    } catch {
      // Die Warteschlange bleibt erhalten und der sichtbare Hinweis bleibt stehen.
    }
  }

  ariaSort(field: string): 'ascending' | 'descending' | null {
    const sort = this.tablePrefs().sort;
    if (sort.field !== field) return null;
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  readonly isLoading = computed(
    () =>
      this.catalogService.isLoading() ||
      this.stockService.isLoading() ||
      this.inventoryService.isLoading() ||
      this.purchaseService.isLoading(),
  );
  readonly loadError = computed(
    () =>
      this.catalogService.loadError() ??
      this.stockService.loadError() ??
      this.inventoryService.loadError() ??
      this.purchaseService.loadError(),
  );

  constructor() {
    this.searchControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((query) => {
      this.viewState.rememberSearch(this.workspaceId(), query);
    });
    effect(() => {
      const workspaceId = this.workspaceService.currentWorkspace()?.id;
      if (!workspaceId) return;
      untracked(() => {
        this.actionError.set(null);
        this.actionMessage.set(null);
        this.cleanup.status.set(null);
        this.cleanup.error.set(null);
        this.searchControl.setValue(this.viewState.searchFor(workspaceId));
        void this.reload();
        void this.cleanup.retry(workspaceId).catch(() => undefined);
      });
    });
  }

  availableStock(product: CatalogOverviewRow): number | null {
    return product.available;
  }

  imageUrl(product: CatalogOverviewRow): string | null {
    return product.primary_media_path
      ? this.mediaService.getMediaUrl(product.primary_media_path)
      : null;
  }

  imageFailed(product: CatalogOverviewRow): void {
    if (product.primary_media_path)
      this.mediaService.reportMediaFailure(product.primary_media_path);
  }

  async reload(): Promise<void> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId) return;
    await Promise.all([
      this.catalogService.loadProducts(workspaceId),
      this.stockService.loadPositions(workspaceId),
      this.inventoryService.loadInventory(workspaceId),
      this.purchaseService.loadPurchases(workspaceId),
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
