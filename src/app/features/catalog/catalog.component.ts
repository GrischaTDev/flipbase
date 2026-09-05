import { TablePreferencesService } from '../../core/services/table-preferences.service';
import { TableColumnOption } from '../../core/models/table-preferences';
import { TableColumnPickerComponent } from '../../shared/components/table-column-picker/table-column-picker.component';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  LucideDynamicIcon,
  LucidePlus as Plus,
  LucideSearch as Search,
  LucideX as X,
} from '@lucide/angular';
import { CatalogProduct, TrackingMode } from '../../core/models/flipbase.models';
import { CatalogService } from '../../core/services/catalog.service';
import { StockService } from '../../core/services/stock.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { ModalDialogDirective } from '../../shared/directives/modal-dialog.directive';
import { parseCsv } from '../../shared/utils/csv';
import { normalizeGtin } from '../../shared/utils/gtin';

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
    TableColumnPickerComponent,
    ReactiveFormsModule,
    LucideDynamicIcon,
    ModalDialogDirective,
  ],
  templateUrl: './catalog.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogComponent {
  readonly tablePreferences = inject(TablePreferencesService);
  readonly tableColumns = computed<readonly TableColumnOption[]>(() => [
    { id: 'title', label: 'Artikel', required: true },
    { id: 'ean', label: 'EAN' },
    { id: 'tracking', label: 'Nachverfolgung' },
    { id: 'available', label: 'Verfügbar' },
    { id: 'store', label: 'Webshop' },
  ]);
  readonly visibleColumns = computed(() =>
    this.tablePreferences.visibleColumns('catalog', this.tableColumns()),
  );
  readonly catalogService = inject(CatalogService);
  readonly stockService = inject(StockService);
  private readonly workspaceService = inject(WorkspaceService);

  readonly plusIcon = Plus;
  readonly searchIcon = Search;
  readonly closeIcon = X;
  readonly searchQuery = signal('');
  readonly isCreateOpen = signal(false);
  readonly isSaving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly csvRows = signal<readonly CatalogImportRow[]>([]);
  readonly csvHasErrors = computed(() => this.csvRows().some((row) => Boolean(row.error)));
  readonly csvError = signal<string | null>(null);
  readonly isImportingCsv = signal(false);
  static publicListingPriceValidator(control: AbstractControl): ValidationErrors | null {
    const isPublic = Boolean(control.get('isPublicStore')?.value);
    const price = Number(control.get('listingPrice')?.value);
    return isPublic && (!Number.isFinite(price) || price <= 0)
      ? { publicListingPrice: true }
      : null;
  }

  readonly productForm = new FormGroup(
    {
      title: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(2)],
      }),
      ean: new FormControl('', {
        nonNullable: true,
        validators: [
          (control) => {
            const value = control.value.trim();
            return value && !normalizeGtin(value) ? { invalidGtin: true } : null;
          },
        ],
      }),
      trackingMode: new FormControl<TrackingMode>('quantity', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      isPublicStore: new FormControl(false, { nonNullable: true }),
      listingPrice: new FormControl<number | null>(null),
    },
    { validators: CatalogComponent.publicListingPriceValidator },
  );

  readonly filteredProducts = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase('de');
    if (!query) return this.catalogService.products();
    return this.catalogService
      .products()
      .filter((product) =>
        [product.title, product.ean, product.brand, product.model]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLocaleLowerCase('de').includes(query)),
      );
  });

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

  async createProduct(): Promise<void> {
    if (this.productForm.invalid || this.isSaving()) return;
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId) {
      this.saveError.set('Kein aktiver Workspace ausgewählt.');
      return;
    }

    this.isSaving.set(true);
    this.saveError.set(null);
    try {
      const value = this.productForm.getRawValue();
      const result = await this.catalogService.createProduct({
        workspaceId,
        title: value.title,
        ean: normalizeGtin(value.ean) ?? null,
        trackingMode: value.trackingMode,
        isPublicStore: value.isPublicStore,
        listingPrice: value.isPublicStore ? value.listingPrice : null,
      });

      if (result.error) {
        this.saveError.set(result.error.message);
        return;
      }
      this.productForm.reset({
        title: '',
        ean: '',
        trackingMode: 'quantity',
        isPublicStore: false,
        listingPrice: null,
      });
      this.isCreateOpen.set(false);
    } catch (error: unknown) {
      this.saveError.set(
        error instanceof Error ? error.message : 'Der Artikel konnte nicht angelegt werden.',
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  closeCreateDialog(): void {
    this.isCreateOpen.set(false);
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
