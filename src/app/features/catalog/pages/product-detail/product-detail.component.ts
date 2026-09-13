import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CatalogProduct, CatalogProductMedia } from '../../../../core/models/flipbase.models';
import { CatalogProductEntry, CatalogService } from '../../../../core/services/catalog.service';
import { MediaService } from '../../../../core/services/media.service';
import { StockService } from '../../../../core/services/stock.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ARTICLE_VIEWS } from '../../../../core/config/article-navigation';
import { SectionNavigationComponent } from '../../../../shared/components/section-navigation/section-navigation.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { normalizeGtin } from '../../../../shared/utils/gtin';
import { UnsavedEntryPage } from '../../../../shared/guards/unsaved-entry.guard';
import { summarizeProductStock } from './product-detail-stock';

@Component({
  selector: 'app-product-detail',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    SectionNavigationComponent,
    ButtonComponent,
    CardComponent,
    PageHeaderComponent,
    TextFieldComponent,
    CustomCheckboxComponent,
    NumberInputComponent,
    ProductThumbnailComponent,
  ],
  templateUrl: './product-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', '(window:beforeunload)': 'beforeUnload($event)' },
})
export class ProductDetailComponent implements UnsavedEntryPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workspace = inject(WorkspaceService);
  readonly catalog = inject(CatalogService);
  readonly stock = inject(StockService);
  readonly media = inject(MediaService);
  readonly articleViews = ARTICLE_VIEWS;
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly id = computed(() => this.params().get('id'));
  readonly stockView = computed(() => this.query().get('view') === 'stock');
  readonly product = signal<CatalogProduct | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly stockError = signal<string | null>(null);
  readonly mediaError = signal<string | null>(null);
  readonly savedMessage = signal<string | null>(null);
  readonly images = signal<CatalogProductMedia[]>([]);
  readonly pendingImages = signal<readonly File[]>([]);
  readonly entries = signal<CatalogProductEntry[]>([]);
  private requestId = 0;
  readonly workspaceChanged = computed(
    () =>
      !!this.product() && this.product()?.workspace_id !== this.workspace.currentWorkspace()?.id,
  );
  readonly position = computed(() =>
    this.stock.loadedWorkspaceId() === this.product()?.workspace_id && !this.workspaceChanged()
      ? this.stock
          .positions()
          .find((position) => position.catalog_product_id === this.product()?.id)
      : undefined,
  );
  readonly lots = computed(() =>
    this.stock.loadedWorkspaceId() === this.product()?.workspace_id && !this.workspaceChanged()
      ? this.stock
          .lots()
          .filter(
            (lot) =>
              lot.catalog_product_id === this.product()?.id &&
              lot.workspace_id === this.product()?.workspace_id,
          )
      : [],
  );
  readonly stockSummary = computed(() =>
    summarizeProductStock(
      this.position(),
      this.lots(),
      this.entries().flatMap((entry) => entry.inventory_items),
      this.stock.movements(),
    ),
  );
  readonly form = new FormGroup(
    {
      title: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          (control) => (control.value.trim() ? null : { required: true }),
        ],
      }),
      brand: new FormControl('', { nonNullable: true }),
      model: new FormControl('', { nonNullable: true }),
      ean: new FormControl('', {
        nonNullable: true,
        validators: [
          (control) =>
            control.value.trim() && !normalizeGtin(control.value) ? { gtin: true } : null,
        ],
      }),
      category: new FormControl('', { nonNullable: true }),
      description: new FormControl('', { nonNullable: true }),
      isPublicStore: new FormControl(false, { nonNullable: true }),
      listingPrice: new FormControl<number | null>(null),
    },
    {
      validators: (control) => {
        const price = control.get('listingPrice')?.value;
        return control.get('isPublicStore')?.value && (!Number.isFinite(price) || price <= 0)
          ? { publicListingPrice: true }
          : null;
      },
    },
  );
  private savedValue = '';

  constructor() {
    effect(() => {
      const id = this.id();
      const workspaceId = this.workspace.currentWorkspace()?.id;
      untracked(() => {
        // Ein Workspacewechsel darf einen offenen Entwurf weder speichern noch überschreiben.
        if (this.product()?.id === id && this.hasUnsavedChanges() && this.workspaceChanged())
          return;
        if (!workspaceId || !id) {
          this.requestId++;
          this.product.set(null);
          this.loading.set(false);
          return;
        }
        void this.reload();
      });
    });
  }

  hasUnsavedChanges(): boolean {
    return (
      !!this.product() &&
      (JSON.stringify(this.form.getRawValue()) !== this.savedValue ||
        this.pendingImages().length > 0)
    );
  }

  isSaving(): boolean {
    return this.saving();
  }

  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges() || this.isSaving()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  setView(stock: boolean): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: stock ? 'stock' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  async reload(): Promise<void> {
    const id = this.id();
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!id || !workspaceId || this.saving()) return;
    if (this.workspaceChanged() && this.hasUnsavedChanges()) return;
    const request = ++this.requestId;
    const sameProduct = this.product()?.id === id && this.product()?.workspace_id === workspaceId;
    if (!sameProduct) {
      this.product.set(null);
      this.images.set([]);
      this.pendingImages.set([]);
      this.entries.set([]);
      this.saveError.set(null);
      this.savedMessage.set(null);
    }
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const result = await this.catalog.loadProduct(id, workspaceId);
      if (!this.isCurrent(request, id, workspaceId)) return;
      if (result.error) throw result.error;
      const product = result.data;
      if (!product) {
        if (sameProduct && this.hasUnsavedChanges()) {
          throw new Error(
            'Der Artikel ist nicht mehr zugänglich. Deine ungespeicherten Eingaben bleiben erhalten.',
          );
        }
        this.product.set(null);
        return;
      }
      const preserveDraft = sameProduct && this.hasUnsavedChanges();
      this.product.set(product);
      if (!preserveDraft) this.fillForm(product);
      await Promise.all([
        this.loadImages(request, id, workspaceId),
        this.loadStock(request, id, workspaceId),
      ]);
    } catch (error: unknown) {
      if (this.isCurrent(request, id, workspaceId))
        this.loadError.set(this.message(error, 'Artikel konnte nicht geladen werden.'));
    } finally {
      if (this.isCurrent(request, id, workspaceId)) this.loading.set(false);
    }
  }

  private async loadStock(request: number, id: string, workspaceId: string): Promise<void> {
    this.stockError.set(null);
    const [, result] = await Promise.all([
      this.stock.loadPositions(workspaceId),
      this.catalog.loadProductEntries(id, workspaceId),
    ]);
    if (!this.isCurrent(request, id, workspaceId)) return;
    this.stockError.set(result.error?.message ?? this.stock.loadError()?.message ?? null);
    this.entries.set(result.data ?? []);
  }

  async loadImages(
    request = this.requestId,
    id = this.id(),
    workspaceId = this.workspace.currentWorkspace()?.id,
  ): Promise<void> {
    if (!id || !workspaceId) return;
    this.mediaError.set(null);
    try {
      const images = await this.media.loadProductMedia(id);
      if (this.isCurrent(request, id, workspaceId))
        this.images.set(
          images.filter(
            (image) => image.workspace_id === workspaceId && image.catalog_product_id === id,
          ),
        );
    } catch (error: unknown) {
      if (this.isCurrent(request, id, workspaceId))
        this.mediaError.set(this.message(error, 'Bilder konnten nicht geladen werden.'));
    }
  }

  selectImages(event: Event): void {
    if (this.saving() || this.workspaceChanged()) return;
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    this.pendingImages.update((files) => [...files, ...Array.from(input.files ?? [])]);
    input.value = '';
    this.savedMessage.set(null);
  }

  removePendingImage(index: number): void {
    if (!this.saving())
      this.pendingImages.update((files) => files.filter((_, position) => position !== index));
  }

  discard(): void {
    if (this.saving()) return;
    const product = this.product();
    if (product) this.fillForm(product);
    this.pendingImages.set([]);
    this.saveError.set(null);
    this.savedMessage.set(null);
    if (this.workspaceChanged()) void this.reload();
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    const product = this.product();
    if (!product || this.form.invalid || this.saving() || this.workspaceChanged() || this.loading())
      return;
    const request = this.requestId;
    const { id, workspace_id: workspaceId } = product;
    this.saving.set(true);
    this.form.disable({ emitEvent: false });
    this.saveError.set(null);
    this.savedMessage.set(null);
    try {
      if (JSON.stringify(this.form.getRawValue()) !== this.savedValue) {
        const value = this.form.getRawValue();
        const result = await this.catalog.updateProduct(id, {
          ...value,
          workspaceId,
          ean: normalizeGtin(value.ean),
        });
        if (result.error || !result.data)
          throw result.error ?? new Error('Artikel konnte nicht gespeichert werden.');
        if (!this.isCurrent(request, id, workspaceId)) return;
        this.product.set(result.data);
        this.fillForm(result.data);
      }
      for (const file of [...this.pendingImages()]) {
        if (!this.isCurrent(request, id, workspaceId)) return;
        const result = await this.media.uploadProductMedia(id, file);
        if (result.error || !result.data)
          throw new Error(
            'Artikeldaten gespeichert. Bild konnte nicht gespeichert werden: ' +
              (result.error?.message ?? file.name),
          );
        const uploaded = result.data;
        if (uploaded.catalog_product_id !== id || uploaded.workspace_id !== workspaceId)
          throw new Error('Das gespeicherte Bild konnte diesem Artikel nicht zugeordnet werden.');
        // Den Erfolg im ursprünglichen Entwurf quittieren, auch wenn sein Workspace
        // gerade nicht aktiv ist. Nur die tatsächlich hochgeladene Datei entfernen.
        if (
          request === this.requestId &&
          this.product()?.id === id &&
          this.product()?.workspace_id === workspaceId
        ) {
          this.pendingImages.update((files) => {
            const index = files.indexOf(file);
            return index < 0 ? files : [...files.slice(0, index), ...files.slice(index + 1)];
          });
        }
        if (!this.isCurrent(request, id, workspaceId)) return;
        this.images.update((images) => [...images, uploaded]);
      }
      if (this.isCurrent(request, id, workspaceId)) this.savedMessage.set('Artikel gespeichert.');
    } catch (error: unknown) {
      if (this.isCurrent(request, id, workspaceId))
        this.saveError.set(this.message(error, 'Artikel konnte nicht gespeichert werden.'));
    } finally {
      this.saving.set(false);
      this.form.enable({ emitEvent: false });
    }
  }

  private fillForm(product: CatalogProduct): void {
    this.form.reset(
      {
        title: product.title,
        brand: product.brand ?? '',
        model: product.model ?? '',
        ean: product.ean ?? '',
        category: product.category ?? '',
        description: product.description ?? '',
        isPublicStore: product.is_public_store,
        listingPrice: product.listing_price ?? null,
      },
      { emitEvent: false },
    );
    this.savedValue = JSON.stringify(this.form.getRawValue());
  }

  private isCurrent(request: number, id: string, workspaceId: string): boolean {
    return (
      request === this.requestId &&
      this.id() === id &&
      this.workspace.currentWorkspace()?.id === workspaceId
    );
  }

  private message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
