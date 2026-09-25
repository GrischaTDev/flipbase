import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
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
import {
  CatalogProduct,
  CatalogProductMedia,
  ItemCondition,
} from '../../../../core/models/flipbase.models';
import { PRODUCT_CONDITIONS } from '../../../../core/config/product-conditions';
import { CatalogProductEntry, CatalogService } from '../../../../core/services/catalog.service';
import { MediaService } from '../../../../core/services/media.service';
import { StockService } from '../../../../core/services/stock.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { WorkspaceContextLockService } from '../../../../core/services/workspace-context-lock.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BrandPickerComponent } from '../../../../shared/components/brand-picker/brand-picker.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import { ProductCategoryService } from '../../../../core/services/product-category.service';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { normalizeGtin } from '../../../../shared/utils/gtin';
import { canonicalGtin } from '../../../../shared/utils/gtin';
import {
  BarcodeLookupService,
  BarcodeProductInfo,
} from '../../../../core/services/barcode-lookup.service';
import {
  BarcodeAiCandidate,
  BarcodeAiLabelSuggestion,
  BarcodeAiLookupService,
  BarcodeAiResult,
} from '../../../../core/services/barcode-ai-lookup.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { BarcodeScannerComponent } from '../../../../shared/components/barcode-scanner/barcode-scanner.component';
import { LucideScanBarcode } from '@lucide/angular';
import { UnsavedEntryPage } from '../../../../shared/guards/unsaved-entry.guard';
import { summarizeProductStock } from './product-detail-stock';
import { PurchaseProductReturnService } from '../../../purchases/services/purchase-product-return.service';

@Component({
  selector: 'app-product-detail',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    ButtonComponent,
    BrandPickerComponent,
    CardComponent,
    CategoryPickerComponent,
    ModalShellComponent,
    PageHeaderComponent,
    TextFieldComponent,
    CustomCheckboxComponent,
    NumberInputComponent,
    CustomSelectComponent,
    ProductMediaEditorComponent,
    BarcodeScannerComponent,
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly workspaceContext = inject(WorkspaceContextLockService);
  private readonly releaseWorkspaceLock = this.workspaceContext.acquire();
  readonly catalog = inject(CatalogService);
  readonly stock = inject(StockService);
  readonly media = inject(MediaService);
  private readonly barcodeLookup = inject(BarcodeLookupService);
  private readonly barcodeAiLookup = inject(BarcodeAiLookupService);
  private readonly productCategories = inject(ProductCategoryService);
  private readonly productReturn = inject(PurchaseProductReturnService);
  readonly aiSessionUsage = this.barcodeAiLookup.sessionUsage;
  readonly platformOperator = inject(PlatformOperatorService);
  readonly barcodeIcon = LucideScanBarcode;
  readonly barcodeScannerOpen = signal(false);
  readonly barcodeLoading = signal(false);
  readonly barcodeMessage = signal<string | null>(null);
  readonly barcodeSuggestion = signal<BarcodeProductInfo | null>(null);
  readonly existingBarcodeProduct = signal<CatalogProduct | null>(null);
  readonly aiSearchOpen = signal(false);
  readonly aiSearchEan = signal<string | null>(null);
  readonly labelPhoto = signal<File | null>(null);
  readonly labelPhotos = signal<readonly { file: File; previewUrl: string }[]>([]);
  readonly aiLoading = signal(false);
  readonly aiResult = signal<BarcodeAiResult | null>(null);
  readonly aiError = signal<string | null>(null);
  readonly aiMessage = signal<string | null>(null);
  private aiRequestId = 0;
  readonly categorySuggestion = signal<string | null>(null);
  readonly brandSuggestion = signal<string | null>(null);
  private barcodeRequestId = 0;
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
  readonly purchaseReturn = computed(() =>
    this.productReturn.forCatalog(
      this.query().get('purchaseReturn'),
      this.workspace.currentWorkspace()?.id ?? null,
    ),
  );
  readonly inventoryReturn = computed(() => this.query().get('returnTo') === 'inventory');
  readonly backLink = computed(
    () =>
      this.purchaseReturn()?.returnUrl ??
      (this.inventoryReturn() || this.stockView() ? '/inventory' : '/catalog'),
  );
  readonly backLabel = computed(() =>
    this.purchaseReturn()
      ? 'Zurück zum Einkauf'
      : this.inventoryReturn()
        ? 'Zurück zum Inventar'
        : 'Zur Artikelliste',
  );
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
  readonly conditionOptions: readonly SelectOption<ItemCondition | ''>[] = [
    { value: '', label: 'Nicht angegeben' },
    ...PRODUCT_CONDITIONS,
  ];
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
      sku: new FormControl('', { nonNullable: true }),
      size: new FormControl('', { nonNullable: true }),
      color: new FormControl('', { nonNullable: true }),
      material: new FormControl('', { nonNullable: true }),
      ean: new FormControl('', {
        nonNullable: true,
        validators: [
          (control) =>
            control.value.trim() && !normalizeGtin(control.value) ? { gtin: true } : null,
        ],
      }),
      categoryId: new FormControl<string | null>(null),
      condition: new FormControl<ItemCondition | ''>('', { nonNullable: true }),
      conditionNotes: new FormControl('', { nonNullable: true }),
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
    this.destroyRef.onDestroy(this.releaseWorkspaceLock);
    this.destroyRef.onDestroy(() => this.clearLabelPhotos());
    const routeState = this.document.defaultView?.history.state as
      | {
          initialProduct?: BarcodeProductInfo;
          barcode?: string;
          aiResult?: {
            title?: string;
            brand?: string;
            model?: string;
            category?: string;
            suggestedEan?: string;
            condition?: ItemCondition | null;
            conditionNotes?: string;
          };
        }
      | undefined;
    const initialProduct =
      routeState?.initialProduct ??
      (routeState?.aiResult
        ? {
            title: routeState.aiResult.title ?? '',
            ean: routeState.aiResult.suggestedEan ?? '',
            brand: routeState.aiResult.brand,
            category: routeState.aiResult.category,
          }
        : routeState?.barcode
          ? { title: '', ean: routeState.barcode }
          : undefined);
    if (initialProduct && this.creating()) {
      this.form.patchValue({
        title: initialProduct.title,
        ean: initialProduct.ean,
        model: routeState?.aiResult?.model ?? '',
        condition: routeState?.aiResult?.condition ?? '',
        conditionNotes: routeState?.aiResult?.conditionNotes ?? '',
      });
      this.brandSuggestion.set(initialProduct.brand ?? null);
      this.categorySuggestion.set(initialProduct.category ?? null);
    }
    void this.platformOperator.isOperator();
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

  async searchBarcode(code: string): Promise<void> {
    this.barcodeScannerOpen.set(false);
    if (!this.creating()) return;
    const ean = normalizeGtin(code);
    const requestId = ++this.barcodeRequestId;
    this.aiRequestId++;
    this.aiLoading.set(false);
    this.aiResult.set(null);
    this.aiError.set(null);
    this.aiMessage.set(null);
    this.aiSearchEan.set(null);
    this.clearLabelPhotos();
    this.barcodeSuggestion.set(null);
    this.existingBarcodeProduct.set(null);
    if (!ean) {
      this.barcodeMessage.set(
        'Bitte eine gültige EAN/GTIN mit 8, 12, 13 oder 14 Ziffern eingeben.',
      );
      return;
    }
    this.form.controls.ean.setValue(ean);
    this.barcodeLoading.set(true);
    this.barcodeMessage.set('Suche im Artikelstamm…');
    try {
      const workspaceId = this.workspace.currentWorkspace()?.id;
      if (!workspaceId) throw new Error('Kein aktiver Workspace ausgewählt.');
      await this.catalog.loadProducts(workspaceId);
      if (
        requestId !== this.barcodeRequestId ||
        workspaceId !== this.workspace.currentWorkspace()?.id
      )
        return;
      if (this.catalog.loadError()) {
        this.barcodeMessage.set(
          'Artikelstamm konnte nicht geladen werden. Bitte versuche es erneut.',
        );
        return;
      }
      const existing = this.catalog
        .products()
        .find(
          (product) =>
            product.workspace_id === workspaceId &&
            canonicalGtin(product.ean) === canonicalGtin(ean),
        );
      if (existing) {
        this.existingBarcodeProduct.set(existing);
        this.barcodeMessage.set('Artikel ist bereits im Artikelstamm vorhanden.');
        return;
      }
      this.barcodeMessage.set('Suche im Inventar…');
      const inventoryProduct = await this.barcodeLookup.lookupInventoryByEan(ean);
      if (
        requestId !== this.barcodeRequestId ||
        workspaceId !== this.workspace.currentWorkspace()?.id
      )
        return;
      if (inventoryProduct) {
        this.barcodeSuggestion.set(inventoryProduct);
        this.barcodeMessage.set(
          'Artikel im Inventar gefunden. Bitte prüfe die Daten vor der Übernahme.',
        );
        return;
      }
      this.barcodeMessage.set('Artikel nicht im Inventar vorhanden. Suche online…');
      const product = await this.barcodeLookup.lookupExternalByEan(ean);
      if (
        requestId !== this.barcodeRequestId ||
        workspaceId !== this.workspace.currentWorkspace()?.id
      )
        return;
      this.barcodeSuggestion.set(product);
      this.barcodeMessage.set(
        product
          ? 'Produktdaten gefunden. Bitte prüfe sie vor der Übernahme.'
          : 'Auch online wurden keine Produktdaten gefunden. Du kannst den Artikel selbst ausfüllen.',
      );
    } catch {
      if (requestId === this.barcodeRequestId)
        this.barcodeMessage.set(
          'Die Online-Suche ist gerade nicht erreichbar. Du kannst den Artikel selbst ausfüllen.',
        );
    } finally {
      if (requestId === this.barcodeRequestId) this.barcodeLoading.set(false);
    }
  }

  useBarcodeSuggestion(): void {
    const product = this.barcodeSuggestion();
    if (!product || this.form.controls.ean.value !== product.ean) return;
    this.form.patchValue({ title: product.title, ean: product.ean });
    this.brandSuggestion.set(product.brand ?? null);
    this.categorySuggestion.set(product.category ?? null);
    this.barcodeSuggestion.set(null);
    this.barcodeMessage.set('Produktdaten übernommen. Ergänze oder korrigiere die Angaben.');
  }

  toggleAiSearch(): void {
    if (!this.creating()) return;
    if (this.aiSearchOpen()) {
      this.aiSearchOpen.set(false);
      this.aiRequestId++;
      this.aiLoading.set(false);
      this.clearLabelPhotos();
      return;
    }
    ++this.barcodeRequestId;
    this.barcodeLoading.set(false);
    this.barcodeScannerOpen.set(false);
    this.aiSearchOpen.set(true);
    this.aiResult.set(null);
    this.aiError.set(null);
    this.aiMessage.set(null);
  }

  selectLabelPhoto(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const photos = [...(target.files ?? [])];
    target.value = '';
    if (photos.length + this.labelPhotos().length > 5) {
      this.aiError.set('Bitte höchstens fünf Fotos hinzufügen.');
      return;
    }
    if (
      photos.some(
        (photo) =>
          !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 5_000_000,
      )
    ) {
      this.aiError.set('Bitte JPG-, PNG- oder WebP-Fotos unter je 5 MB auswählen.');
      return;
    }
    const next = [
      ...this.labelPhotos(),
      ...photos.map((file) => ({
        file,
        previewUrl: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '',
      })),
    ];
    if (next.reduce((total, photo) => total + photo.file.size, 0) > 15_000_000) {
      for (const photo of next.slice(this.labelPhotos().length))
        if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
      this.aiError.set('Alle Fotos zusammen dürfen höchstens 15 MB groß sein.');
      return;
    }
    this.labelPhotos.set(next);
    this.labelPhoto.set(next[0]?.file ?? null);
    this.aiResult.set(null);
    this.aiError.set(null);
    this.aiMessage.set(
      next.length ? `${next.length} Foto${next.length === 1 ? '' : 's'} ausgewählt.` : null,
    );
  }

  removeLabelPhoto(index: number): void {
    const current = this.labelPhotos();
    const removed = current[index];
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    const next = current.filter((_, photoIndex) => photoIndex !== index);
    this.labelPhotos.set(next);
    this.labelPhoto.set(next[0]?.file ?? null);
    this.aiResult.set(null);
  }

  private clearLabelPhotos(): void {
    for (const photo of this.labelPhotos())
      if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
    this.labelPhotos.set([]);
    this.labelPhoto.set(null);
  }

  async searchWithAi(): Promise<void> {
    if (!this.creating() || !this.aiSearchOpen() || this.aiLoading()) return;
    const enteredEan = this.form.controls.ean.value.trim();
    const ean = enteredEan ? normalizeGtin(enteredEan) : '';
    const photos = this.labelPhotos().map((entry) => entry.file);
    if (ean === null) {
      this.form.controls.ean.markAsTouched();
      this.aiError.set('Bitte die ungültige EAN korrigieren oder entfernen.');
      return;
    }
    if (!ean && photos.length === 0) return;
    const requestId = ++this.aiRequestId;
    const workspaceId = this.workspace.currentWorkspace()?.id;
    this.form.controls.ean.setValue(ean);
    this.aiSearchEan.set(ean);
    this.aiLoading.set(true);
    this.aiResult.set(null);
    this.aiError.set(null);
    this.aiMessage.set(null);
    try {
      if (!(await this.platformOperator.isOperator())) return;
      const result = await this.barcodeAiLookup.search(ean, photos);
      if (
        requestId !== this.aiRequestId ||
        workspaceId !== this.workspace.currentWorkspace()?.id ||
        this.form.controls.ean.value !== ean
      )
        return;
      this.aiResult.set(result);
      this.aiMessage.set(
        (result.processedPhotoCount ?? photos.length) < photos.length
          ? 'Der Server hat nur das erste Foto verarbeitet. Die Suche mit allen Fotos ist erst nach dem Update der Serverfunktion verfügbar. Prüfe diesen Vorschlag besonders sorgfältig.'
          : result.candidates.length
            ? 'Mögliche Produkte gefunden. Prüfe Modell, Variante und Quelle vor der Übernahme.'
            : result.labelSuggestion
              ? 'Kein belegter Webtreffer. Das Etikett wurde gelesen; prüfe die Angaben vor der Übernahme.'
              : photos.length
                ? 'Mit diesem Foto wurde kein belegter Produktvorschlag gefunden. Prüfe, ob Modell und Artikelnummer lesbar sind.'
                : 'Kein belegter Produktvorschlag gefunden. Versuche ein Etikettfoto.',
      );
    } catch (error: unknown) {
      if (requestId !== this.aiRequestId || workspaceId !== this.workspace.currentWorkspace()?.id)
        return;
      this.aiError.set(
        error instanceof Error ? error.message : 'Die KI-Suche ist gerade nicht verfügbar.',
      );
    } finally {
      if (requestId === this.aiRequestId) this.aiLoading.set(false);
    }
  }

  useAiSuggestion(candidate: BarcodeAiCandidate): void {
    if (
      this.form.controls.ean.value !== this.aiSearchEan() ||
      !this.aiResult()?.candidates.includes(candidate)
    )
      return;
    this.form.patchValue({
      title: candidate.title,
      model: candidate.model,
      size: candidate.size,
      color: candidate.color,
    });
    this.brandSuggestion.set(candidate.brand || null);
    this.categorySuggestion.set(candidate.category || null);
    void this.matchCategory(candidate.category);
    this.aiResult.set(null);
    this.aiMessage.set('Vorschlag übernommen. Bitte prüfe und ergänze die Angaben.');
    this.toggleAiSearch();
  }

  useAiLabelSuggestion(suggestion: BarcodeAiLabelSuggestion): void {
    if (
      this.form.controls.ean.value !== this.aiSearchEan() ||
      this.aiResult()?.labelSuggestion !== suggestion
    )
      return;
    this.form.patchValue({
      title: suggestion.title,
      model: suggestion.model,
      size: suggestion.size,
      color: suggestion.color,
    });
    this.brandSuggestion.set(suggestion.brand || null);
    this.categorySuggestion.set(suggestion.category || null);
    void this.matchCategory(suggestion.category);
    this.aiResult.set(null);
    this.aiMessage.set('Etikettangaben übernommen. Bitte prüfe und ergänze sie.');
    this.toggleAiSearch();
  }

  private async matchCategory(suggestedName: string): Promise<void> {
    const name = suggestedName.trim();
    if (!name) return;
    try {
      const matches = await this.productCategories.search(name);
      const exact = matches.categories.filter(
        (category) =>
          category.fullName.localeCompare(name, 'de', { sensitivity: 'base' }) === 0 ||
          category.name.localeCompare(name, 'de', { sensitivity: 'base' }) === 0,
      );
      if (exact.length === 1 && !this.form.controls.categoryId.value)
        this.form.controls.categoryId.setValue(exact[0].id);
    } catch {
      // Der Vorschlag bleibt im vorhandenen Kategorie-Picker sichtbar.
    }
  }

  formatCents(amountUsd: number): string {
    return (amountUsd * 100).toLocaleString('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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
    this.barcodeRequestId += 1;
    this.barcodeLoading.set(false);
    this.barcodeMessage.set(null);
    this.barcodeSuggestion.set(null);
    this.existingBarcodeProduct.set(null);
    this.aiRequestId++;
    this.aiSearchOpen.set(false);
    this.aiSearchEan.set(null);
    this.clearLabelPhotos();
    this.aiLoading.set(false);
    this.aiResult.set(null);
    this.aiError.set(null);
    this.aiMessage.set(null);
    this.brandSuggestion.set(null);
    this.categorySuggestion.set(null);
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
        const input = {
          ...value,
          workspaceId,
          ean: normalizeGtin(value.ean),
          condition: value.condition || null,
        };
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
        const purchaseReturn = this.purchaseReturn();
        if (purchaseReturn) {
          this.productReturn.setCreatedProduct(purchaseReturn.token, id);
          await this.router.navigateByUrl(purchaseReturn.returnUrl, { replaceUrl: true });
        } else if (this.inventoryReturn()) {
          await this.router.navigate(['/inventory'], { replaceUrl: true });
        } else {
          await this.router.navigate(['/catalog', id], { replaceUrl: true });
        }
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
        sku: product.sku ?? '',
        size: product.size ?? '',
        color: product.color ?? '',
        material: product.material ?? '',
        ean: product.ean ?? '',
        categoryId: product.category_id ?? null,
        condition: product.condition ?? '',
        conditionNotes: product.condition_notes ?? '',
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
