import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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

@Component({
  selector: 'app-catalog',
  imports: [ReactiveFormsModule, LucideDynamicIcon],
  templateUrl: './catalog.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogComponent {
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
  readonly productForm = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    ean: new FormControl('', { nonNullable: true }),
    trackingMode: new FormControl<TrackingMode>('quantity', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    isPublicStore: new FormControl(false, { nonNullable: true }),
  });

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
    const value = this.productForm.getRawValue();
    const result = await this.catalogService.createProduct({
      workspaceId,
      title: value.title,
      ean: value.ean.trim() || null,
      trackingMode: value.trackingMode,
      isPublicStore: value.isPublicStore,
    });
    this.isSaving.set(false);

    if (result.error) {
      this.saveError.set(result.error.message);
      return;
    }
    this.productForm.reset({ title: '', ean: '', trackingMode: 'quantity', isPublicStore: false });
    this.isCreateOpen.set(false);
  }
}
