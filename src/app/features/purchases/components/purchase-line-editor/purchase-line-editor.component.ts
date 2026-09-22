import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CatalogService } from '../../../../core/services/catalog.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import {
  CatalogProduct,
  ItemCondition,
  PurchaseType,
  TrackingMode,
} from '../../../../core/models/flipbase.models';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ItemConditionLabelPipe } from '../../../../shared/pipes/item-condition-label.pipe';
import { PurchaseProductPickerComponent } from '../purchase-product-picker/purchase-product-picker.component';
import { BarcodeScannerComponent } from '../../../../shared/components/barcode-scanner/barcode-scanner.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { CurrencyPipe } from '@angular/common';
import { LucideSearch, LucideUpload, LucideScanBarcode, LucideTrash2 } from '@lucide/angular';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { ProductDialogComponent } from '../../../catalog/components/product-dialog/product-dialog.component';
import { previewPurchaseImport, PurchaseImportPreviewRow } from './purchase-import-preview';
import { canonicalGtin, normalizeGtin } from '../../../../shared/utils/gtin';
import { PurchaseLinePriceMode } from '../../../../core/models/purchase-costing.models';

export interface PurchaseLineDraft {
  readonly isPackage?: boolean;
  /** Stabile UI-ID, bis die Persistenz eine echte purchase_line-ID vergibt. */
  readonly draftId?: string;
  readonly catalogProductId: string | null;
  readonly titleSnapshot: string;
  readonly ean?: string | null;
  readonly lineKind: TrackingMode;
  readonly orderedQuantity: number;
  readonly condition: ItemCondition;
  readonly priceMode: PurchaseLinePriceMode;
  readonly unitPurchasePrice: number | null;
  readonly lineTotal: number | null;
  readonly estimatedMarketValue: number | null;
  /** Strukturänderungen sind nach gebuchtem Wareneingang nur noch als Korrektur erlaubt. */
  readonly structuralLocked?: boolean;
}

export interface PricedPurchaseLineDraft extends PurchaseLineDraft {
  readonly priceMode: 'priced';
  readonly unitPurchasePrice: number;
  readonly lineTotal: number;
}

export function isPricedPurchaseLineDraft(
  line: PurchaseLineDraft,
): line is PricedPurchaseLineDraft {
  return line.priceMode === 'priced' && line.unitPurchasePrice !== null && line.lineTotal !== null;
}

interface PurchaseLineControls {
  isPackage: FormControl<boolean>;
  draftId: FormControl<string>;
  catalogProductId: FormControl<string | null>;
  titleSnapshot: FormControl<string>;
  ean: FormControl<string | null>;
  lineKind: FormControl<TrackingMode>;
  orderedQuantity: FormControl<number>;
  condition: FormControl<ItemCondition>;
  priceMode: FormControl<PurchaseLinePriceMode>;
  unitPurchasePrice: FormControl<number | null>;
  lineTotal: FormControl<number | null>;
  estimatedMarketValue: FormControl<number | null>;
  structuralLocked: FormControl<boolean>;
}

type PriceField = 'unitPurchasePrice' | 'lineTotal';

@Component({
  selector: 'app-purchase-line-editor',
  imports: [
    CurrencyPipe,
    ModalShellComponent,
    ProductThumbnailComponent,
    ProductDialogComponent,
    ReactiveFormsModule,
    CustomSelectComponent,
    ItemConditionLabelPipe,
    PurchaseProductPickerComponent,
    BarcodeScannerComponent,
    ButtonComponent,
    NumberInputComponent,
    TextFieldComponent,
  ],
  templateUrl: './purchase-line-editor.component.html',
  host: { class: 'block min-w-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseLineEditorComponent {
  readonly catalogService = inject(CatalogService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly searchIcon = LucideSearch;
  readonly importIcon = LucideUpload;
  readonly scannerIcon = LucideScanBarcode;
  readonly removeIcon = LucideTrash2;
  readonly detailId = signal<string | null>(null);
  readonly importPreview = signal<readonly PurchaseImportPreviewRow[]>([]);
  private importWorkspaceId: string | null = null;
  readonly importBlocked = computed(() =>
    this.importPreview().some((row) => row.errors.length > 0 || !row.productId),
  );
  readonly productOptions = computed<SelectOption<string>[]>(() =>
    this.availableProducts().map((product) => ({
      value: product.id,
      label: product.title + (product.condition ? ' · ' + product.condition : ''),
    })),
  );
  private readonly workspaceService = inject(WorkspaceService);

  readonly purchaseType = input.required<PurchaseType>();
  readonly pricingMode = input<'individual' | 'total'>('individual');
  readonly initialLines = input<readonly PurchaseLineDraft[]>([]);
  readonly pickerOpen = signal(false);
  readonly cameraOpen = signal(false);
  readonly scannerOpen = signal(false);
  readonly scannerMessage = signal<string | null>(null);
  readonly scanControl = new FormControl('', { nonNullable: true });
  readonly pickerSearch = signal('');
  private lastScan = { value: '', at: 0 };
  readonly availableProducts = computed(() =>
    this.catalogService
      .products()
      .filter((product) => product.workspace_id === this.activeWorkspaceId()),
  );
  readonly lineCount = signal(0);
  readonly lineRows = new FormArray<FormGroup<PurchaseLineControls>>([]);
  readonly linesChanged = output<readonly PurchaseLineDraft[]>();
  readonly isCreatingProduct = signal(false);
  private readonly productDialog = viewChild(ProductDialogComponent);
  readonly isSavingProduct = computed(() => this.productDialog()?.saving() ?? false);
  readonly catalogContextError = signal<string | null>(null);
  readonly importError = signal<string | null>(null);
  readonly catalogLoadError = computed(
    () => this.catalogContextError() ?? this.catalogService.loadError()?.message ?? null,
  );
  readonly activeWorkspaceId = computed(() => this.workspaceService.currentWorkspace()?.id ?? null);
  readonly catalogSelectionDisabled = computed(
    () =>
      this.catalogService.isLoading() ||
      !!this.catalogLoadError() ||
      this.catalogService.loadedWorkspaceId() !== this.activeWorkspaceId(),
  );
  readonly isMysteryPurchase = computed(() => this.pricingMode() === 'total');
  readonly conditionOptions: SelectOption<ItemCondition>[] = [
    { value: 'new', label: 'Neu' },
    { value: 'like_new', label: 'Wie neu' },
    { value: 'very_good', label: 'Sehr gut' },
    { value: 'used', label: 'Gebraucht' },
    { value: 'heavily_used', label: 'Stark gebraucht' },
    { value: 'defective', label: 'Defekt / Ersatzteil' },
  ];

  private loadedInitialIds = '';
  private lastRequestedWorkspaceId: string | null = null;

  constructor() {
    effect(() => {
      const lines = this.initialLines();
      const key = lines.map((line) => line.draftId).join('|');
      if (!lines.length || key === this.loadedInitialIds || this.lineRows.length) return;
      this.loadedInitialIds = key;
      untracked(() => this.resetToLines(lines));
    });
    effect(() => {
      const workspaceId = this.activeWorkspaceId();
      if (!workspaceId) {
        this.lastRequestedWorkspaceId = null;
        this.catalogContextError.set('Kein aktiver Workspace ausgewählt.');
        return;
      }
      untracked(() => {
        void this.loadCatalogProducts();
      });
    });
    effect(() => {
      this.configurePriceMode(this.pricingMode() === 'total' ? 'mystery_pack' : 'single');
    });
  }

  openPicker(): void {
    this.pickerSearch.set('');
    this.pickerOpen.set(true);
  }

  addProducts(products: readonly CatalogProduct[]): void {
    for (const product of products) {
      if (product.workspace_id !== this.activeWorkspaceId()) continue;
      if (this.lineRows.length >= 1000) {
        this.importError.set('Höchstens 1.000 Einkaufspositionen sind erlaubt.');
        break;
      }
      const row = this.createLine('quantity');
      row.patchValue(
        {
          catalogProductId: product.id,
          titleSnapshot: product.title,
          ean: product.ean ?? null,
          condition: product.condition ?? 'used',
        },
        { emitEvent: false },
      );
      this.lineRows.push(row);
    }
    this.pickerOpen.set(false);
    this.emitDrafts();
  }

  scanBarcode(value = this.scanControl.value): void {
    this.cameraOpen.set(false);
    const barcode = value.trim();
    if (!barcode) return;
    if (this.catalogSelectionDisabled()) {
      this.scannerMessage.set('Bitte warte, bis die Artikel geladen wurden.');
      return;
    }
    const now = Date.now();
    if (barcode === this.lastScan.value && now - this.lastScan.at < 1000) return;
    this.lastScan = { value: barcode, at: now };
    const normalized = canonicalGtin(barcode) ?? barcode;
    const matches = this.availableProducts().filter(
      (product) => (canonicalGtin(product.ean) ?? product.ean) === normalized,
    );
    if (matches.length === 1) {
      this.addProducts(matches);
      this.scannerMessage.set(matches[0].title + ' als neue Position hinzugefügt.');
    } else {
      this.scannerMessage.set(
        matches.length
          ? 'Mehrere Treffer: Bitte wähle den passenden Artikel.'
          : 'Kein Treffer. Bitte wähle ein Produkt oder erstelle ein neues.',
      );
      this.pickerSearch.set(barcode);
      this.pickerOpen.set(true);
    }
    this.scanControl.setValue('');
  }

  async loadCatalogProducts(force = false): Promise<void> {
    const workspaceId = this.activeWorkspaceId();
    if (!workspaceId) {
      this.catalogContextError.set('Kein aktiver Workspace ausgewählt.');
      return;
    }
    if (
      !force &&
      this.lastRequestedWorkspaceId === workspaceId &&
      (this.catalogService.isLoading() || this.catalogService.loadedWorkspaceId() === workspaceId)
    ) {
      return;
    }
    this.lastRequestedWorkspaceId = workspaceId;
    this.catalogContextError.set(null);
    await this.catalogService.loadProducts(workspaceId);
  }

  selectCatalogProduct(index: number, catalogProductId: string): void {
    const row = this.lineRows.at(index);
    if (row.controls.lineKind.value === 'individual') return;
    const product = this.availableProducts().find((entry) => entry.id === catalogProductId);
    row.controls.catalogProductId.setValue(product?.id ?? null);
    if (product) row.controls.titleSnapshot.setValue(product.title);
    this.emitDrafts();
  }

  updateTitleSnapshot(index: number, titleSnapshot: string): void {
    this.lineRows.at(index).controls.titleSnapshot.setValue(titleSnapshot);
    this.emitDrafts();
  }

  async importCsv(event: Event): Promise<void> {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.files?.[0]) return;
    this.importError.set(null);
    this.importPreview.set([]);
    const workspaceId = this.activeWorkspaceId();
    try {
      if (!workspaceId || this.catalogSelectionDisabled())
        throw new Error('Bitte zuerst den Artikelstamm laden.');
      if (target.files[0].size > 2 * 1024 * 1024)
        throw new Error('CSV darf höchstens 2 MB groß sein.');
      const text = await target.files[0].text();
      if (workspaceId !== this.activeWorkspaceId())
        throw new Error('Workspace wurde gewechselt. Bitte die Datei erneut auswählen.');
      this.importWorkspaceId = workspaceId;
      this.importPreview.set(previewPurchaseImport(text, this.availableProducts(), workspaceId));
    } catch (error: unknown) {
      this.importError.set(
        error instanceof Error ? error.message : 'CSV konnte nicht gelesen werden.',
      );
    } finally {
      target.value = '';
    }
  }

  assignImportProduct(rowNumber: number, productId: string | null): void {
    const product = this.availableProducts().find((product) => product.id === productId);
    this.importPreview.update((rows) =>
      rows.map((row) =>
        row.rowNumber !== rowNumber
          ? row
          : {
              ...row,
              productId: product?.id ?? null,
              errors: row.errors.filter((error) => error !== row.assignmentError),
              assignmentError: null,
            },
      ),
    );
  }

  confirmImport(): void {
    const preview = this.importPreview();
    if (this.importWorkspaceId !== this.activeWorkspaceId() || this.catalogSelectionDisabled()) {
      this.importError.set('Workspace wurde gewechselt. Bitte die Datei erneut auswählen.');
      return;
    }
    if (!preview.length || this.importBlocked()) return;
    if (preview.length + this.lineRows.length > 1000) {
      this.importError.set('Höchstens 1.000 Einkaufspositionen sind erlaubt.');
      return;
    }
    for (const entry of preview) {
      const product = this.availableProducts().find((product) => product.id === entry.productId);
      if (!product || entry.quantity === null) return;
    }
    for (const entry of preview) {
      const product = this.availableProducts().find((product) => product.id === entry.productId);
      if (!product || entry.quantity === null) continue;
      const row = this.createLine('quantity');
      row.patchValue(
        {
          catalogProductId: product.id,
          titleSnapshot: product.title,
          ean: product.ean ?? null,
          orderedQuantity: entry.quantity,
          condition: entry.condition ?? product.condition ?? 'used',
          unitPurchasePrice: entry.unitPrice,
          lineTotal: entry.total,
          priceMode: entry.unitPrice === null ? this.emptyPriceMode() : 'priced',
        },
        { emitEvent: false },
      );
      this.lineRows.push(row, { emitEvent: false });
    }
    this.importPreview.set([]);
    this.emitDrafts();
  }

  productCreated(product: CatalogProduct): void {
    if (product.workspace_id !== this.activeWorkspaceId()) return;
    this.isCreatingProduct.set(false);
    this.addProducts([product]);
  }

  openDetails(draftId: string): void {
    this.detailId.set(draftId);
  }

  detailRow(): FormGroup<PurchaseLineControls> | undefined {
    return this.lineRows.controls.find((row) => row.controls.draftId.value === this.detailId());
  }

  detailProduct(): CatalogProduct | undefined {
    return this.availableProducts().find(
      (product) => product.id === this.detailRow()?.controls.catalogProductId.value,
    );
  }

  focusFirstError(): void {
    const row = this.lineRows.controls.find((row) => row.invalid);
    if (!row) return;
    row.markAllAsTouched();
    const field = row.controls.orderedQuantity.invalid
      ? 'quantity'
      : row.controls.unitPurchasePrice.invalid || row.hasError('totalTooLarge')
        ? 'unit-price'
        : null;
    if (field) {
      this.host.nativeElement
        .querySelector<HTMLElement>('#purchase-line-' + field + '-' + row.controls.draftId.value)
        ?.focus();
      return;
    }
    this.openDetails(row.controls.draftId.value);
  }

  recalculate(index: number, changedField: PriceField): void {
    const row = this.lineRows.at(index);
    if (this.isMysteryPurchase()) {
      row.controls.unitPurchasePrice.setValue(null, { emitEvent: false });
      row.controls.lineTotal.setValue(null, { emitEvent: false });
      row.controls.priceMode.setValue('unpriced_mystery', { emitEvent: false });
      this.emitDrafts();
      return;
    }
    row.controls.priceMode.setValue('priced', { emitEvent: false });
    const quantity = row.controls.orderedQuantity.value;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
      row.controls.lineTotal.setValue(null, { emitEvent: false });
      this.emitDrafts();
      return;
    }

    if (changedField === 'unitPurchasePrice') {
      const unitPrice = row.controls.unitPurchasePrice.value;
      if (unitPrice === null) {
        row.controls.lineTotal.setValue(null, { emitEvent: false });
        row.controls.priceMode.setValue(this.emptyPriceMode(), { emitEvent: false });
        this.emitDrafts();
        return;
      }
      if (
        !this.validUnitPrice(unitPrice) ||
        Math.round(unitPrice * quantity * 100) > 999999999999
      ) {
        row.controls.lineTotal.setValue(null, { emitEvent: false });
        row.controls.lineTotal.setErrors({ totalTooLarge: true }, { emitEvent: false });
        this.emitDrafts();
        return;
      }
      row.controls.lineTotal.setValue(Math.round(unitPrice * quantity * 100) / 100, {
        emitEvent: false,
      });
      this.emitDrafts();
      return;
    }

    const lineTotal = row.controls.lineTotal.value;
    if (lineTotal === null) {
      row.controls.unitPurchasePrice.setValue(null, { emitEvent: false });
      row.controls.priceMode.setValue(this.emptyPriceMode(), { emitEvent: false });
      this.emitDrafts();
      return;
    }
    if (!this.validMoney(lineTotal)) {
      this.emitDrafts();
      return;
    }
    row.controls.unitPurchasePrice.setValue(this.normalizeUnitPrice(lineTotal / quantity), {
      emitEvent: false,
    });
    this.emitDrafts();
  }

  updateQuantity(index: number): void {
    if (this.lineRows.at(index).controls.structuralLocked.value) return;
    this.recalculate(index, 'unitPurchasePrice');
  }

  removeLine(index: number): void {
    if (this.lineRows.at(index).controls.structuralLocked.value) return;
    this.lineRows.removeAt(index);
    this.emitDrafts();
    const neighbor = this.lineRows.at(Math.min(index, this.lineRows.length - 1));
    const id = neighbor ? 'purchase-line-quantity-' + neighbor.controls.draftId.value : null;
    requestAnimationFrame(() => {
      (id
        ? this.host.nativeElement.querySelector<HTMLElement>('#' + id)
        : this.host.nativeElement.querySelector<HTMLElement>('[data-add-products] button')
      )?.focus();
    });
  }

  clear(): void {
    this.lineRows.clear();
    this.emitDrafts();
  }

  getDrafts(): readonly PurchaseLineDraft[] {
    return this.lineRows.controls.map((row) => {
      const draft = row.getRawValue();
      return {
        ...draft,
        unitPurchasePrice:
          draft.unitPurchasePrice === null
            ? null
            : this.normalizeUnitPrice(draft.unitPurchasePrice),
        priceMode:
          draft.unitPurchasePrice === null || draft.lineTotal === null
            ? this.emptyPriceMode()
            : 'priced',
      };
    });
  }

  hasUnsavedChanges(): boolean {
    return (
      this.isCreatingProduct() ||
      this.pickerOpen() ||
      this.scanControl.value.trim().length > 0 ||
      this.importPreview().length > 0
    );
  }

  resetToLines(lines: readonly PurchaseLineDraft[]): void {
    this.loadedInitialIds = lines.map((line) => line.draftId).join('|');
    this.lineRows.clear({ emitEvent: false });
    for (const line of lines) {
      const row = this.createLine(line.lineKind);
      row.patchValue({ ...line, ean: line.ean ?? null }, { emitEvent: false });
      if (line.structuralLocked) row.controls.orderedQuantity.disable({ emitEvent: false });
      this.lineRows.push(row, { emitEvent: false });
    }
    this.lineRows.markAsPristine();
    this.lineRows.markAsUntouched();
    this.lineCount.set(this.lineRows.length);
    this.pickerOpen.set(false);
    this.cameraOpen.set(false);
    this.scannerOpen.set(false);
    this.pickerSearch.set('');
    this.scanControl.reset('');
    this.scannerMessage.set(null);
    this.lastScan = { value: '', at: 0 };
    this.isCreatingProduct.set(false);
    this.detailId.set(null);
    this.importPreview.set([]);
    this.importError.set(null);
  }

  private createLine(lineKind: TrackingMode): FormGroup<PurchaseLineControls> {
    const isMysteryPurchase = this.isMysteryPurchase();
    const row = new FormGroup<PurchaseLineControls>({
      isPackage: new FormControl(false, { nonNullable: true }),
      draftId: new FormControl(`draft-${crypto.randomUUID()}`, { nonNullable: true }),
      catalogProductId: new FormControl<string | null>(null, {
        validators: lineKind === 'quantity' ? [Validators.required] : [],
      }),
      titleSnapshot: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          (control) => (control.value.trim() ? null : { required: true }),
        ],
      }),
      ean: new FormControl<string | null>(null, {
        validators: [
          (control) => {
            const value = control.value?.trim() ?? '';
            return value && !normalizeGtin(value) ? { invalidGtin: true } : null;
          },
        ],
      }),
      lineKind: new FormControl<TrackingMode>(lineKind, { nonNullable: true }),
      orderedQuantity: new FormControl(1, {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.min(1),
          Validators.max(100000),
          (control) => (Number.isInteger(control.value) ? null : { integer: true }),
        ],
      }),
      condition: new FormControl<ItemCondition>('used', { nonNullable: true }),
      priceMode: new FormControl<PurchaseLinePriceMode>(
        isMysteryPurchase ? 'unpriced_mystery' : 'open',
        {
          nonNullable: true,
        },
      ),
      unitPurchasePrice: new FormControl<number | null>(null, {
        validators: [(control) => (this.validUnitPrice(control.value) ? null : { money: true })],
      }),
      lineTotal: new FormControl<number | null>(null, {
        validators: [(control) => (this.validMoney(control.value) ? null : { money: true })],
      }),
      estimatedMarketValue: new FormControl<number | null>(null, {
        validators: isMysteryPurchase ? [Validators.min(0)] : [],
      }),
      structuralLocked: new FormControl(false, { nonNullable: true }),
    });
    row.addValidators((control) => {
      const price: unknown = control.get('unitPurchasePrice')?.value;
      const quantity: unknown = control.get('orderedQuantity')?.value;
      return typeof price === 'number' &&
        typeof quantity === 'number' &&
        Math.round(price * quantity * 100) > 999999999999
        ? { totalTooLarge: true }
        : null;
    });
    row.valueChanges.subscribe(() => this.emitDrafts());
    return row;
  }

  private configurePriceMode(purchaseType: PurchaseType): void {
    const isMysteryPurchase = purchaseType === 'mystery_pack';
    for (const row of this.lineRows.controls) {
      row.controls.priceMode.setValue(
        row.controls.unitPurchasePrice.value === null
          ? isMysteryPurchase
            ? 'unpriced_mystery'
            : 'open'
          : 'priced',
        {
          emitEvent: false,
        },
      );
      row.controls.unitPurchasePrice.setValidators([
        (control) => (this.validUnitPrice(control.value) ? null : { money: true }),
      ]);
      row.controls.lineTotal.setValidators([
        (control) => (this.validMoney(control.value) ? null : { money: true }),
      ]);
      row.controls.estimatedMarketValue.setValidators(isMysteryPurchase ? [Validators.min(0)] : []);
      if (!isMysteryPurchase) {
        row.controls.estimatedMarketValue.setValue(null, { emitEvent: false });
      }
      row.controls.unitPurchasePrice.updateValueAndValidity({ emitEvent: false });
      row.controls.lineTotal.updateValueAndValidity({ emitEvent: false });
      row.controls.estimatedMarketValue.updateValueAndValidity({ emitEvent: false });
    }
    if (this.lineRows.length > 0) this.emitDrafts();
  }

  private validMoney(value: number | null): boolean {
    return (
      value === null ||
      (Number.isFinite(value) &&
        value >= 0 &&
        value <= 9999999999.99 &&
        Math.abs(value * 100 - Math.round(value * 100)) < 0.0001)
    );
  }

  private emptyPriceMode(): Extract<PurchaseLinePriceMode, 'open' | 'unpriced_mystery'> {
    return this.isMysteryPurchase() ? 'unpriced_mystery' : 'open';
  }

  private validUnitPrice(value: number | null): boolean {
    return (
      value === null ||
      (Number.isFinite(value) &&
        value >= 0 &&
        value <= 9999999999.99 &&
        this.normalizeUnitPrice(value) === value)
    );
  }

  private normalizeUnitPrice(value: number): number {
    return Number(value.toFixed(16));
  }

  private emitDrafts(): void {
    this.lineCount.set(this.lineRows.length);
    this.linesChanged.emit(this.getDrafts());
  }
}
