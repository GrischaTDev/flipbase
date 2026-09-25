import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { CatalogProduct, ItemCondition } from '../../../../core/models/flipbase.models';
import {
  CatalogService,
  CreateCatalogProductInput,
} from '../../../../core/services/catalog.service';
import { MediaService } from '../../../../core/services/media.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { WorkspaceContextLockService } from '../../../../core/services/workspace-context-lock.service';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { AttributePickerComponent } from '../../../../shared/components/attribute-picker/attribute-picker.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BrandPickerComponent } from '../../../../shared/components/brand-picker/brand-picker.component';
import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { canonicalGtin, normalizeGtin } from '../../../../shared/utils/gtin';
import {
  BarcodeLookupService,
  BarcodeProductInfo,
} from '../../../../core/services/barcode-lookup.service';
import {
  BarcodeAiCandidate,
  BarcodeAiLabelSuggestion,
  BarcodeAiVisualSuggestion,
  BarcodeAiLookupService,
  BarcodeAiResult,
} from '../../../../core/services/barcode-ai-lookup.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { BarcodeScannerComponent } from '../../../../shared/components/barcode-scanner/barcode-scanner.component';
import { LucideScanBarcode } from '@lucide/angular';
import { PRODUCT_CONDITIONS } from '../../../../core/config/product-conditions';
import {
  BrandManagementDialogComponent,
  DeletedBrandAssignment,
} from '../brand-management-dialog/brand-management-dialog.component';
import {
  PRODUCT_COLOR_OPTIONS,
  PRODUCT_MATERIAL_OPTIONS,
} from '../../models/product-attribute-options';

type ProductDialogInitialProduct = Partial<Omit<CreateCatalogProductInput, 'workspaceId'>> & {
  brandId?: string | null;
  categoryId?: string | null;
};

@Component({
  selector: 'app-product-dialog',
  imports: [
    ReactiveFormsModule,
    ModalShellComponent,
    TextFieldComponent,
    AttributePickerComponent,
    ButtonComponent,
    CustomSelectComponent,
    CustomCheckboxComponent,
    NumberInputComponent,
    BrandPickerComponent,
    CategoryPickerComponent,
    BrandManagementDialogComponent,
    BarcodeScannerComponent,
  ],
  templateUrl: './product-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDialogComponent {
  static publicListingPriceValidator(control: AbstractControl): ValidationErrors | null {
    const price = control.get('listingPrice')?.value;
    return control.get('isPublicStore')?.value && (!Number.isFinite(price) || price <= 0)
      ? { publicListingPrice: true }
      : null;
  }
  private readonly catalog = inject(CatalogService);
  private readonly barcodeLookup = inject(BarcodeLookupService);
  private readonly barcodeAiLookup = inject(BarcodeAiLookupService);
  readonly aiSessionUsage = this.barcodeAiLookup.sessionUsage;
  readonly platformOperator = inject(PlatformOperatorService);
  private readonly media = inject(MediaService);
  private readonly workspace = inject(WorkspaceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workspaceContext = inject(WorkspaceContextLockService);
  private readonly releaseWorkspaceLock = this.workspaceContext.acquire();
  readonly initialProduct = input<ProductDialogInitialProduct | null>(null);
  readonly closed = output<void>();
  readonly created = output<CatalogProduct>();
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly savedProduct = signal<CatalogProduct | null>(null);
  readonly images = signal<readonly File[]>([]);
  readonly categorySuggestion = signal<string | null>(null);
  readonly brandSuggestion = signal<string | null>(null);
  readonly brandManagerOpen = signal(false);
  readonly colorOptions = PRODUCT_COLOR_OPTIONS;
  readonly materialOptions = PRODUCT_MATERIAL_OPTIONS;
  readonly scannerOpen = signal(false);
  readonly barcodeLoading = signal(false);
  readonly barcodeMessage = signal<string | null>(null);
  readonly barcodeSuggestion = signal<BarcodeProductInfo | null>(null);
  readonly existingProduct = signal<CatalogProduct | null>(null);
  readonly aiSearchEan = signal<string | null>(null);
  readonly labelPhoto = signal<File | null>(null);
  readonly aiLoading = signal(false);
  readonly aiResult = signal<BarcodeAiResult | null>(null);
  readonly aiError = signal<string | null>(null);
  readonly barcodeIcon = LucideScanBarcode;
  private barcodeRequestId = 0;
  readonly conditionOptions: readonly SelectOption<string>[] = [
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
      ean: new FormControl('', {
        nonNullable: true,
        validators: [
          (control) =>
            control.value.trim() && !normalizeGtin(control.value) ? { gtin: true } : null,
        ],
      }),
      sku: new FormControl('', { nonNullable: true }),
      brandId: new FormControl<string | null>(null),
      model: new FormControl('', { nonNullable: true }),
      size: new FormControl('', { nonNullable: true }),
      color: new FormControl('', { nonNullable: true }),
      material: new FormControl('', { nonNullable: true }),
      description: new FormControl('', { nonNullable: true }),
      categoryId: new FormControl<string | null>(null),
      condition: new FormControl<ItemCondition | ''>('', { nonNullable: true }),
      conditionNotes: new FormControl('', { nonNullable: true }),
      isPublicStore: new FormControl(false, { nonNullable: true }),
      listingPrice: new FormControl<number | null>(null),
    },
    { validators: ProductDialogComponent.publicListingPriceValidator },
  );
  readonly workspaceChanged = computed(() => {
    const saved = this.savedProduct();
    return !!saved && saved.workspace_id !== this.workspace.currentWorkspace()?.id;
  });

  constructor() {
    this.destroyRef.onDestroy(this.releaseWorkspaceLock);
    void this.platformOperator.isOperator();
    effect(() => {
      const value = this.initialProduct();
      if (!value || this.form.dirty) return;
      this.form.patchValue({
        title: value.title ?? '',
        ean: value.ean ?? '',
        sku: value.sku ?? '',
        brandId: value.brandId ?? null,
        model: value.model ?? '',
        size: value.size ?? '',
        color: value.color ?? '',
        material: value.material ?? '',
        description: value.description ?? '',
        categoryId: value.categoryId ?? null,
        condition: value.condition ?? '',
        conditionNotes: value.conditionNotes ?? '',
        isPublicStore: value.isPublicStore ?? false,
        listingPrice: value.listingPrice ?? null,
      });
      this.brandSuggestion.set(value.brandId ? null : value.brand?.trim() || null);
      this.categorySuggestion.set(value.categoryId ? null : value.category?.trim() || null);
      if (value.ean && !value.title) untracked(() => void this.onBarcodeScanned(value.ean ?? ''));
    });
  }

  async onBarcodeScanned(code: string): Promise<void> {
    this.scannerOpen.set(false);
    const ean = normalizeGtin(code);
    const requestId = ++this.barcodeRequestId;
    this.barcodeSuggestion.set(null);
    this.existingProduct.set(null);
    this.aiSearchEan.set(null);
    this.labelPhoto.set(null);
    this.aiLoading.set(false);
    this.aiResult.set(null);
    this.aiError.set(null);
    if (!ean) {
      this.barcodeMessage.set('Bitte eine gültige EAN/GTIN mit 8, 12, 13 oder 14 Ziffern scannen.');
      return;
    }
    this.form.controls.ean.setValue(ean);
    this.barcodeLoading.set(true);
    this.barcodeMessage.set('Suche im Artikelstamm…');
    let externalLookupStarted = false;
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
        this.existingProduct.set(existing);
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
      externalLookupStarted = true;
      const product = await this.barcodeLookup.lookupExternalByEan(ean);
      if (
        requestId !== this.barcodeRequestId ||
        workspaceId !== this.workspace.currentWorkspace()?.id
      )
        return;
      this.barcodeSuggestion.set(product);
      if (!product) this.aiSearchEan.set(ean);
      this.barcodeMessage.set(
        product
          ? 'Produktdaten gefunden. Bitte prüfe sie vor der Übernahme.'
          : 'Keine Produktdaten online gefunden. Du kannst den Artikel selbst ausfüllen.',
      );
    } catch {
      if (requestId !== this.barcodeRequestId) return;
      if (externalLookupStarted) this.aiSearchEan.set(ean);
      this.barcodeMessage.set(
        'Die Online-Suche ist gerade nicht erreichbar. Du kannst den Artikel selbst ausfüllen.',
      );
    } finally {
      if (requestId === this.barcodeRequestId) this.barcodeLoading.set(false);
    }
  }

  selectLabelPhoto(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const photo = target.files?.[0] ?? null;
    this.labelPhoto.set(photo);
    this.aiResult.set(null);
    this.aiError.set(null);
    if (photo) {
      this.barcodeMessage.set(
        'Etikettfoto ausgewählt. Starte die KI-Suche erneut, damit das Foto berücksichtigt wird.',
      );
    }
  }

  openAiSearch(): void {
    const enteredEan = this.form.controls.ean.value.trim();
    const ean = enteredEan ? normalizeGtin(enteredEan) : '';
    if (ean === null) {
      this.form.controls.ean.markAsTouched();
      this.barcodeMessage.set('Bitte die ungültige EAN korrigieren oder entfernen.');
      return;
    }
    ++this.barcodeRequestId;
    this.barcodeLoading.set(false);
    this.form.controls.ean.setValue(ean);
    this.aiSearchEan.set(ean);
    this.aiResult.set(null);
    this.aiError.set(null);
    this.barcodeMessage.set(null);
  }

  async searchWithAi(): Promise<void> {
    const ean = this.aiSearchEan();
    if (
      ean === null ||
      this.form.controls.ean.value !== ean ||
      (!ean && !this.labelPhoto()) ||
      this.aiLoading()
    )
      return;
    const requestId = this.barcodeRequestId;
    const workspaceId = this.workspace.currentWorkspace()?.id;
    const labelPhoto = this.labelPhoto();
    this.aiLoading.set(true);
    this.aiResult.set(null);
    this.aiError.set(null);
    try {
      if (!(await this.platformOperator.isOperator())) return;
      const result = await this.barcodeAiLookup.search(ean, labelPhoto);
      if (
        requestId !== this.barcodeRequestId ||
        workspaceId !== this.workspace.currentWorkspace()?.id
      )
        return;
      this.aiResult.set(result);
      this.barcodeMessage.set(
        result.candidates.length
          ? 'Mögliche Produkte gefunden. Prüfe Modell, Variante und Quelle vor der Übernahme.'
          : result.labelSuggestion
            ? result.visualSuggestion
              ? 'Kein belegter Webtreffer. Prüfe die gelesenen Etikettangaben und die Erkennung aus dem Foto.'
              : 'Kein belegter Webtreffer. Das Etikett wurde gelesen; prüfe die Angaben vor der Übernahme.'
            : result.visualSuggestion
              ? 'Kein belegter Webtreffer. Die KI hat einen möglichen Artikel auf dem Foto erkannt. Prüfe die Angaben sorgfältig.'
              : labelPhoto
                ? 'Die KI-Suche hat mit diesem Foto keinen belegten Produktvorschlag gefunden. Prüfe, ob Modell und Artikelnummer auf dem Bild lesbar sind.'
                : 'Auch die KI-Suche hat keinen belegten Produktvorschlag gefunden. Versuche ein Etikettfoto.',
      );
    } catch (error: unknown) {
      if (requestId !== this.barcodeRequestId) return;
      this.aiError.set(
        error instanceof Error ? error.message : 'Die KI-Suche ist gerade nicht verfügbar.',
      );
    } finally {
      if (requestId === this.barcodeRequestId) this.aiLoading.set(false);
    }
  }

  useAiSuggestion(candidate: BarcodeAiCandidate): void {
    const ean = this.aiSearchEan();
    if (
      ean === null ||
      this.form.controls.ean.value !== ean ||
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
    this.aiResult.set(null);
    this.barcodeMessage.set('Vorschlag übernommen. Bitte prüfe und ergänze die Angaben.');
  }

  useAiLabelSuggestion(suggestion: BarcodeAiLabelSuggestion): void {
    const ean = this.aiSearchEan();
    if (
      ean === null ||
      this.form.controls.ean.value !== ean ||
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
    this.aiResult.set(null);
    this.barcodeMessage.set('Etikettangaben übernommen. Bitte prüfe und ergänze sie.');
  }

  useAiVisualSuggestion(suggestion: BarcodeAiVisualSuggestion): void {
    const ean = this.aiSearchEan();
    if (
      ean === null ||
      this.form.controls.ean.value !== ean ||
      this.aiResult()?.visualSuggestion !== suggestion
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
    this.aiResult.set(null);
    this.barcodeMessage.set('Fotovorschlag übernommen. Bitte prüfe und ergänze die Angaben.');
  }

  formatCents(amountUsd: number): string {
    return (amountUsd * 100).toLocaleString('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
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

  selectImages(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.images.set(Array.from(target.files ?? []));
  }

  close(): void {
    if (!this.saving()) this.closed.emit();
  }

  onBrandDeleted(change: DeletedBrandAssignment): void {
    if (this.form.controls.brandId.value === change.brandId)
      this.form.controls.brandId.setValue(change.replacementBrandId);
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving() || this.workspaceChanged()) return;
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!workspaceId) {
      this.error.set('Kein aktiver Workspace ausgewählt.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      let product = this.savedProduct();
      if (!product) {
        const value = this.form.getRawValue();
        const result = await this.catalog.createProduct({
          ...value,
          workspaceId,
          ean: normalizeGtin(value.ean),
          condition: value.condition || null,
          listingPrice: value.isPublicStore ? value.listingPrice : null,
        });
        if (result.error || !result.data)
          throw result.error ?? new Error('Produkt konnte nicht gespeichert werden.');
        product = result.data;
        this.savedProduct.set(product);
        this.form.disable();
      }
      if (workspaceId !== this.workspace.currentWorkspace()?.id)
        throw new Error(
          'Workspace wurde gewechselt. Das Produkt ist im ursprünglichen Workspace gespeichert.',
        );
      const failedImages: File[] = [];
      for (const file of this.images()) {
        const result = await this.media.uploadProductMedia(product.id, file);
        if (result.error) failedImages.push(file);
      }
      this.images.set(failedImages);
      if (failedImages.length > 0) {
        throw new Error(
          `Produkt gespeichert. ${failedImages.length === 1 ? 'Bild konnte' : `${failedImages.length} Bilder konnten`} nicht gespeichert werden.`,
        );
      }
      if (workspaceId !== this.workspace.currentWorkspace()?.id) return;
      await this.catalog.loadProducts(workspaceId);
      if (workspaceId !== this.workspace.currentWorkspace()?.id) return;
      this.created.emit(product);
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'Produkt konnte nicht gespeichert werden.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  continueWithoutImage(): void {
    const product = this.savedProduct();
    if (product && !this.workspaceChanged() && !this.saving()) this.created.emit(product);
  }
}
