import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ProductImageDraft } from '../../../../core/models/product-media.models';
import {
  productStorePath,
  productSeoTitle,
  productSeoDescription,
  normalizeProductHandle,
} from '../../../../core/utils/product-seo';
import { ProductMediaEditorComponent } from '../../components/product-media-editor/product-media-editor.component';
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
import { BrandPickerComponent } from '../../../../shared/components/brand-picker/brand-picker.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
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
    BrandPickerComponent,
    CardComponent,
    CategoryPickerComponent,
    PageHeaderComponent,
    TextFieldComponent,
    CustomCheckboxComponent,
    NumberInputComponent,
    ProductMediaEditorComponent,
  ],
  templateUrl: './product-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', '(window:beforeunload)': 'beforeUnload($event)' },
})
export class ProductDetailComponent implements UnsavedEntryPage {
  private readonly document = inject(DOCUMENT);
  private readonly changeDetector = inject(ChangeDetectorRef, { optional: true });
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
  private readonly routeId = computed(() => this.params().get('id'));
  private readonly createdId = signal<string | null>(null);
  readonly id = computed(() => this.routeId() ?? this.createdId());
  readonly creating = computed(() => !this.id());
  private readonly draftWorkspaceId = signal<string | null>(null);
  readonly stockView = computed(() => !!this.id() && this.query().get('view') === 'stock');
  readonly product = signal<CatalogProduct | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly stockError = signal<string | null>(null);
  readonly mediaError = signal<string | null>(null);
  readonly savedMessage = signal<string | null>(null);
  readonly images = signal<CatalogProductMedia[]>([]);
  readonly imageDrafts = signal<readonly ProductImageDraft[]>([]);
  readonly pendingImages = computed(() =>
    this.imageDrafts().flatMap((image) => (image.file ? [image.file] : [])),
  );
  readonly visibleImageDrafts = computed(() =>
    this.imageDrafts().map((image) =>
      image.media
        ? {
            ...image,
            previewUrl: this.media.getMediaUrl(image.media.storage_path) || image.previewUrl,
          }
        : image,
    ),
  );
  readonly seoExpanded = signal(false);
  private savedImageKeys = '';
  private expectedMediaIds: string[] = [];
  readonly entries = signal<CatalogProductEntry[]>([]);
  private requestId = 0;
  private allowSavedNavigation = false;
  readonly workspaceChanged = computed(
    () =>
      !!this.draftWorkspaceId() &&
      this.draftWorkspaceId() !== this.workspace.currentWorkspace()?.id,
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
      brandId: new FormControl<string | null>(null),
      model: new FormControl('', { nonNullable: true }),
      ean: new FormControl('', {
        nonNullable: true,
        validators: [
          (control) =>
            control.value.trim() && !normalizeGtin(control.value) ? { gtin: true } : null,
        ],
      }),
      categoryId: new FormControl<string | null>(null),
      description: new FormControl('', { nonNullable: true }),
      isPublicStore: new FormControl(false, { nonNullable: true }),
      listingPrice: new FormControl<number | null>(null),
      seoTitle: new FormControl('', { nonNullable: true, validators: Validators.maxLength(200) }),
      seoDescription: new FormControl('', {
        nonNullable: true,
        validators: Validators.maxLength(320),
      }),
      urlHandle: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(120), Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)],
      }),
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
  private savedValue = JSON.stringify(this.form.getRawValue());

  constructor() {
    effect(() => {
      const routeId = this.routeId();
      const workspaceId = this.workspace.currentWorkspace()?.id;
      untracked(() => {
        if (this.saving() || (this.hasUnsavedChanges() && this.workspaceChanged())) return;
        if (!workspaceId) {
          this.requestId++;
          this.loading.set(false);
          return;
        }
        if (!routeId && !this.createdId()) {
          this.draftWorkspaceId.set(workspaceId);
          this.loading.set(false);
          return;
        }
        void this.reload();
      });
    });
  }

  hasUnsavedChanges(): boolean {
    return (
      !!this.draftWorkspaceId() &&
      (JSON.stringify(this.form.getRawValue()) !== this.savedValue || this.galleryChanged())
    );
  }

  private galleryChanged(): boolean {
    return (
      this.imageDrafts().some((image) => !!image.file) ||
      this.imageDrafts()
        .map((image) => image.media?.id ?? image.key)
        .join(',') !== this.savedImageKeys
    );
  }

  changeImages(images: readonly ProductImageDraft[]): void {
    if (this.saving() || this.workspaceChanged() || this.mediaError()) return;
    this.imageDrafts.set(images);
    this.savedMessage.set(null);
  }

  imageFailed(image: ProductImageDraft): void {
    if (image.media && !this.workspaceChanged())
      this.media.reportMediaFailure(image.media.storage_path);
  }

  seoPreviewTitle(): string {
    return (
      productSeoTitle(this.form.controls.title.value, this.form.controls.seoTitle.value) ||
      'Artikelname'
    );
  }

  seoPreviewDescription(): string {
    return productSeoDescription(
      this.form.controls.description.value,
      this.form.controls.seoDescription.value,
    );
  }

  seoPreviewUrl(): string {
    const handle =
      this.form.controls.urlHandle.value ||
      (this.creating() ? normalizeProductHandle(this.form.controls.title.value) : '');
    return (
      (this.document.location?.origin ?? '') +
      productStorePath(this.id() ?? 'neuer-artikel', handle)
    );
  }

  storeLink(): string {
    return productStorePath(this.id() ?? '', this.product()?.url_handle);
  }

  isSaving(): boolean {
    return this.saving() && !this.allowSavedNavigation;
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
      this.draftWorkspaceId.set(workspaceId);
      this.images.set([]);
      this.imageDrafts.set([]);
      this.expectedMediaIds = [];
      this.savedImageKeys = '';
      this.entries.set([]);
      this.saveError.set(null);
      this.savedMessage.set(null);
    }
    this.loading.set(true);
    this.form.disable({ emitEvent: false });
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
      this.draftWorkspaceId.set(workspaceId);
      if (!preserveDraft) this.fillForm(product);
      await Promise.all([
        this.loadImages(request, id, workspaceId),
        this.loadStock(request, id, workspaceId),
      ]);
    } catch (error: unknown) {
      if (this.isCurrent(request, id, workspaceId))
        this.loadError.set(this.message(error, 'Artikel konnte nicht geladen werden.'));
    } finally {
      if (this.isCurrent(request, id, workspaceId)) {
        this.loading.set(false);
        this.form.enable({ emitEvent: false });
      }
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
      if (this.isCurrent(request, id, workspaceId) && !this.galleryChanged()) {
        this.acceptImages(
          images.filter(
            (image) => image.workspace_id === workspaceId && image.catalog_product_id === id,
          ),
        );
      }
    } catch (error: unknown) {
      if (this.isCurrent(request, id, workspaceId))
        this.mediaError.set(this.message(error, 'Bilder konnten nicht geladen werden.'));
    }
  }

  private acceptImages(images: CatalogProductMedia[]): void {
    this.images.set(images);
    this.expectedMediaIds = images.map((image) => image.id);
    this.savedImageKeys = this.expectedMediaIds.join(',');
    this.imageDrafts.set(
      images.map((image) => ({
        key: image.id,
        media: image,
        file: null,
        previewUrl: this.media.getMediaUrl(image.storage_path),
      })),
    );
  }

  discard(): void {
    if (this.saving()) return;
    const product = this.product();
    if (product) this.fillForm(product);
    else {
      this.form.reset();
      this.savedValue = JSON.stringify(this.form.getRawValue());
    }
    this.acceptImages(this.images());
    this.saveError.set(null);
    this.savedMessage.set(null);
    if (this.workspaceChanged()) {
      this.draftWorkspaceId.set(this.workspace.currentWorkspace()?.id ?? null);
      if (this.id()) void this.reload();
    } else if (this.id()) void this.loadImages();
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (
      this.form.controls.seoTitle.invalid ||
      this.form.controls.seoDescription.invalid ||
      this.form.controls.urlHandle.invalid
    )
      this.seoExpanded.set(true);
    const workspaceId = this.draftWorkspaceId();
    if (
      !workspaceId ||
      this.form.invalid ||
      this.saving() ||
      this.workspaceChanged() ||
      this.loading()
    )
      return;
    const request = this.requestId;
    let id = this.id();
    let created = false;
    this.saving.set(true);
    this.form.disable({ emitEvent: false });
    this.saveError.set(null);
    this.savedMessage.set(null);
    // Vor asynchroner Anlage auch die native Bedienung sperren, nicht erst im nächsten Renderzyklus.
    this.changeDetector?.detectChanges();
    try {
      if (!id || JSON.stringify(this.form.getRawValue()) !== this.savedValue) {
        const value = this.form.getRawValue();
        const input = { ...value, workspaceId, ean: normalizeGtin(value.ean) };
        const result = id
          ? await this.catalog.updateProduct(id, input)
          : await this.catalog.createProduct(input);
        if (result.error || !result.data)
          throw result.error ?? new Error('Artikel konnte nicht gespeichert werden.');
        if (result.data.workspace_id !== workspaceId)
          throw new Error('Der Artikel gehört zu einem anderen Workspace.');
        // Anlage auch bei zwischenzeitlichem Workspacewechsel quittieren: ein Retry
        // darf keinen zweiten Artikel erzeugen. Die ursprüngliche Seite muss noch offen sein.
        if (
          !id &&
          request === this.requestId &&
          !this.routeId() &&
          this.draftWorkspaceId() === workspaceId
        ) {
          id = result.data.id;
          this.createdId.set(id);
          this.product.set(result.data);
          created = true;
        }
        if (!id || !this.isCurrent(request, id, workspaceId)) return;
        this.product.set(result.data);
        this.fillForm(result.data);
      }
      if (!id) return;
      for (const draft of [...this.imageDrafts()]) {
        if (!draft.file) continue;
        if (!this.isCurrent(request, id, workspaceId)) return;
        const result = await this.media.uploadProductMedia(id, draft.file);
        if (result.error || !result.data)
          throw new Error(
            'Artikeldaten gespeichert. Bild konnte nicht gespeichert werden: ' +
              (result.error?.message ?? draft.file.name),
          );
        const uploaded = result.data;
        if (uploaded.catalog_product_id !== id || uploaded.workspace_id !== workspaceId)
          throw new Error('Das gespeicherte Bild konnte diesem Artikel nicht zugeordnet werden.');
        if (
          request === this.requestId &&
          this.product()?.id === id &&
          this.draftWorkspaceId() === workspaceId
        ) {
          this.expectedMediaIds = [...new Set([...this.expectedMediaIds, uploaded.id])];
          this.imageDrafts.update((images) =>
            images.map((image) =>
              image.key === draft.key && image.file === draft.file
                ? { ...image, file: null, media: uploaded }
                : image,
            ),
          );
          this.images.update((images) => [...images, uploaded]);
        }
        if (!this.isCurrent(request, id, workspaceId)) return;
      }
      if (this.galleryChanged()) {
        const orderedIds = this.imageDrafts().map((image) => image.media!.id);
        const result = await this.media.updateProductMediaLayout(
          id,
          orderedIds,
          this.expectedMediaIds,
          workspaceId,
        );
        if (result.error || !result.data)
          throw result.error ?? new Error('Die Bildreihenfolge konnte nicht gespeichert werden.');
        if (
          request === this.requestId &&
          this.product()?.id === id &&
          this.draftWorkspaceId() === workspaceId
        ) {
          this.acceptImages(result.data);
          const primaryPath = result.data.find((image) => image.is_primary)?.storage_path ?? null;
          this.catalog.updateProductPrimaryMedia(id, workspaceId, primaryPath);
          this.product.update((product) =>
            product ? { ...product, primary_media_path: primaryPath } : product,
          );
        }
        if (!this.isCurrent(request, id, workspaceId)) return;
      }
      if (this.isCurrent(request, id, workspaceId)) this.savedMessage.set('Artikel gespeichert.');
      if (
        (created || this.createdId()) &&
        this.isCurrent(request, id, workspaceId) &&
        !this.hasUnsavedChanges()
      ) {
        this.allowSavedNavigation = true;
        await this.router.navigate(['/catalog', id], { replaceUrl: true });
      }
    } catch (error: unknown) {
      if (request === this.requestId && this.draftWorkspaceId() === workspaceId)
        this.saveError.set(this.message(error, 'Artikel konnte nicht gespeichert werden.'));
    } finally {
      this.allowSavedNavigation = false;
      this.saving.set(false);
      this.form.enable({ emitEvent: false });
    }
  }

  private fillForm(product: CatalogProduct): void {
    this.form.reset(
      {
        title: product.title,
        brandId: product.brand_id ?? null,
        model: product.model ?? '',
        ean: product.ean ?? '',
        categoryId: product.category_id ?? null,
        description: product.description ?? '',
        isPublicStore: product.is_public_store,
        listingPrice: product.listing_price ?? null,
        seoTitle: product.seo_title ?? '',
        seoDescription: product.seo_description ?? '',
        urlHandle: product.url_handle ?? '',
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
