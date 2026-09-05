import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CatalogService } from '../../../../core/services/catalog.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ItemCondition, PurchaseType, TrackingMode } from '../../../../core/models/flipbase.models';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ItemConditionLabelPipe } from '../../../../shared/pipes/item-condition-label.pipe';
import { parseCsv } from '../../../../shared/utils/csv';
import { normalizeGtin } from '../../../../shared/utils/gtin';

export interface PurchaseLineDraft {
  /** Stabile UI-ID, bis die Persistenz eine echte purchase_line-ID vergibt. */
  readonly draftId?: string;
  readonly catalogProductId: string | null;
  readonly titleSnapshot: string;
  readonly ean?: string | null;
  readonly lineKind: TrackingMode;
  readonly orderedQuantity: number;
  readonly condition: ItemCondition;
  readonly priceMode: 'priced' | 'unpriced_mystery';
  readonly unitPurchasePrice: number | null;
  readonly lineTotal: number | null;
  readonly estimatedMarketValue: number | null;
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
  draftId: FormControl<string>;
  catalogProductId: FormControl<string | null>;
  titleSnapshot: FormControl<string>;
  ean: FormControl<string | null>;
  lineKind: FormControl<TrackingMode>;
  orderedQuantity: FormControl<number>;
  condition: FormControl<ItemCondition>;
  priceMode: FormControl<'priced' | 'unpriced_mystery'>;
  unitPurchasePrice: FormControl<number | null>;
  lineTotal: FormControl<number | null>;
  estimatedMarketValue: FormControl<number | null>;
}

type PriceField = 'unitPurchasePrice' | 'lineTotal';

@Component({
  selector: 'app-purchase-line-editor',
  imports: [ReactiveFormsModule, CustomSelectComponent, ItemConditionLabelPipe],
  templateUrl: './purchase-line-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseLineEditorComponent {
  readonly catalogService = inject(CatalogService);
  private readonly workspaceService = inject(WorkspaceService);

  readonly purchaseType = input.required<PurchaseType>();
  readonly lineRows = new FormArray<FormGroup<PurchaseLineControls>>([]);
  readonly linesChanged = output<readonly PurchaseLineDraft[]>();
  readonly isCreatingProduct = signal(false);
  readonly isSavingProduct = signal(false);
  readonly productError = signal<string | null>(null);
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
  readonly productForm = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
  });

  readonly quantityProducts = computed(() =>
    this.catalogService
      .products()
      .filter(
        (product) =>
          product.tracking_mode === 'quantity' && product.workspace_id === this.activeWorkspaceId(),
      ),
  );
  readonly quantityProductOptions = computed<SelectOption<string>[]>(() => [
    { value: '', label: 'Artikel wählen' },
    ...this.quantityProducts().map((product) => ({ value: product.id, label: product.title })),
  ]);
  readonly isMysteryPurchase = computed(() => this.purchaseType() === 'mystery_pack');
  readonly conditionOptions: SelectOption<ItemCondition>[] = [
    { value: 'new', label: 'Neu' },
    { value: 'like_new', label: 'Wie neu' },
    { value: 'very_good', label: 'Sehr gut' },
    { value: 'used', label: 'Gebraucht' },
    { value: 'heavily_used', label: 'Stark gebraucht' },
    { value: 'defective', label: 'Defekt / Ersatzteil' },
  ];

  private lastRequestedWorkspaceId: string | null = null;

  constructor() {
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
      this.configurePriceMode(this.purchaseType());
    });
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

  addQuantityLine(): void {
    this.lineRows.push(this.createLine('quantity'));
    this.emitDrafts();
  }

  addIndividualLine(): void {
    this.lineRows.push(this.createLine('individual'));
    this.emitDrafts();
  }

  selectCatalogProduct(index: number, catalogProductId: string): void {
    const row = this.lineRows.at(index);
    const product = this.quantityProducts().find((entry) => entry.id === catalogProductId);
    row.controls.catalogProductId.setValue(product?.id ?? null);
    if (product) row.controls.titleSnapshot.setValue(product.title);
    this.emitDrafts();
  }

  updateTitleSnapshot(index: number, titleSnapshot: string): void {
    this.lineRows.at(index).controls.titleSnapshot.setValue(titleSnapshot);
    this.emitDrafts();
  }

  updateTitleSnapshotFromEvent(index: number, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.updateTitleSnapshot(index, target.value);
  }

  async importCsv(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    this.importError.set(null);
    try {
      const parsed = parseCsv(await input.files[0].text());
      if (!parsed.headers.includes('title')) throw new Error('CSV benötigt die Spalte „title“.');
      const pendingLines: FormGroup<PurchaseLineControls>[] = [];
      for (const row of parsed.rows) {
        const title = row['title']?.trim() ?? '';
        const rawEan = row['ean']?.trim() ?? '';
        const ean = rawEan ? normalizeGtin(rawEan) : null;
        if (!title) throw new Error('Jede Einkaufsposition benötigt einen Titel.');
        if (rawEan && !ean) throw new Error(`Ungültige EAN/GTIN für „${title}“.`);
        const quantity = Number((row['quantity'] ?? '1').replace(',', '.'));
        if (!Number.isInteger(quantity) || quantity < 1) {
          throw new Error(`Menge für „${title}“ fehlt oder ist ungültig.`);
        }
        const condition = row['condition']?.trim() || 'used';
        if (
          !['new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'].includes(condition)
        ) {
          throw new Error(`Zustand für „${title}“ ist ungültig.`);
        }
        const amount =
          this.purchaseType() === 'mystery_pack'
            ? null
            : Number((row['unit_purchase_price'] ?? '').replace(',', '.'));
        if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
          throw new Error(`Stückpreis für „${title}“ fehlt oder ist ungültig.`);
        }
        const matchingProduct = this.quantityProducts().find(
          (product) =>
            (ean && product.ean === ean) ||
            (!ean &&
              product.title.trim().toLocaleLowerCase('de') === title.toLocaleLowerCase('de')),
        );
        if (matchingProduct && this.purchaseType() !== 'mystery_pack') {
          const line = this.createLine('quantity');
          line.controls.catalogProductId.setValue(matchingProduct.id, { emitEvent: false });
          line.controls.titleSnapshot.setValue(matchingProduct.title, { emitEvent: false });
          line.controls.ean.setValue(ean ?? matchingProduct.ean ?? null, { emitEvent: false });
          line.controls.orderedQuantity.setValue(quantity, { emitEvent: false });
          line.controls.condition.setValue(condition as ItemCondition, { emitEvent: false });
          line.controls.unitPurchasePrice.setValue(amount, { emitEvent: false });
          line.controls.lineTotal.setValue(this.toMoney(quantity * (amount ?? 0)), {
            emitEvent: false,
          });
          pendingLines.push(line);
        } else {
          for (let copy = 0; copy < quantity; copy += 1) {
            const line = this.createLine('individual');
            line.controls.titleSnapshot.setValue(title, { emitEvent: false });
            line.controls.ean.setValue(ean, { emitEvent: false });
            line.controls.condition.setValue(condition as ItemCondition, { emitEvent: false });
            if (amount !== null) {
              line.controls.unitPurchasePrice.setValue(amount, { emitEvent: false });
              line.controls.lineTotal.setValue(amount, { emitEvent: false });
            }
            pendingLines.push(line);
          }
        }
      }
      pendingLines.forEach((line) => this.lineRows.push(line));
      this.emitDrafts();
    } catch (error: unknown) {
      this.importError.set(
        error instanceof Error ? error.message : 'CSV konnte nicht importiert werden.',
      );
    } finally {
      input.value = '';
    }
  }

  updateEstimatedMarketValue(index: number, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const value = target.valueAsNumber;
    this.lineRows
      .at(index)
      .controls.estimatedMarketValue.setValue(Number.isFinite(value) ? value : null);
    this.emitDrafts();
  }

  recalculate(index: number, changedField: PriceField): void {
    const row = this.lineRows.at(index);
    if (row.controls.priceMode.value === 'unpriced_mystery') {
      row.controls.unitPurchasePrice.setValue(null, { emitEvent: false });
      row.controls.lineTotal.setValue(null, { emitEvent: false });
      this.emitDrafts();
      return;
    }
    const quantity = row.controls.orderedQuantity.value;
    if (!Number.isFinite(quantity) || quantity <= 0) return;

    if (changedField === 'unitPurchasePrice') {
      const unitPrice = row.controls.unitPurchasePrice.value;
      if (unitPrice === null) {
        row.controls.lineTotal.setValue(null, { emitEvent: false });
        this.emitDrafts();
        return;
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return;
      row.controls.lineTotal.setValue(this.toMoney(quantity * unitPrice), { emitEvent: false });
      this.emitDrafts();
      return;
    }

    const lineTotal = row.controls.lineTotal.value;
    if (lineTotal === null) {
      row.controls.unitPurchasePrice.setValue(null, { emitEvent: false });
      this.emitDrafts();
      return;
    }
    if (!Number.isFinite(lineTotal) || lineTotal < 0) return;
    row.controls.unitPurchasePrice.setValue(this.toMoney(lineTotal / quantity), {
      emitEvent: false,
    });
    this.emitDrafts();
  }

  updateQuantity(index: number): void {
    this.recalculate(index, 'unitPurchasePrice');
  }

  removeLine(index: number): void {
    this.lineRows.removeAt(index);
    this.emitDrafts();
  }

  clear(): void {
    this.lineRows.clear();
    this.emitDrafts();
  }

  getDrafts(): readonly PurchaseLineDraft[] {
    return this.lineRows.controls.map((row) => row.getRawValue());
  }

  async createCatalogProduct(): Promise<void> {
    if (this.productForm.invalid || this.isSavingProduct()) return;
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId) {
      this.productError.set('Kein aktiver Workspace ausgewählt.');
      return;
    }

    this.isSavingProduct.set(true);
    this.productError.set(null);
    let result: Awaited<ReturnType<CatalogService['createProduct']>>;
    try {
      result = await this.catalogService.createProduct({
        workspaceId,
        title: this.productForm.controls.title.value,
        trackingMode: 'quantity',
      });
    } catch (cause: unknown) {
      result = {
        data: null,
        error:
          cause instanceof Error ? cause : new Error('Der Artikel konnte nicht angelegt werden.'),
        reportedBySyncStatus: false,
      };
    } finally {
      this.isSavingProduct.set(false);
    }

    if (result.error || !result.data) {
      this.productError.set(
        result.error?.message ?? 'Der Artikelstamm konnte nicht angelegt werden.',
      );
      return;
    }

    this.addQuantityLine();
    this.selectCatalogProduct(this.lineRows.length - 1, result.data.id);
    this.productForm.reset({ title: '' });
    this.isCreatingProduct.set(false);
  }

  hasUnsavedChanges(): boolean {
    return this.productForm.dirty || this.productForm.controls.title.value.trim().length > 0;
  }

  private createLine(lineKind: TrackingMode): FormGroup<PurchaseLineControls> {
    const isMysteryPurchase = this.isMysteryPurchase();
    const row = new FormGroup<PurchaseLineControls>({
      draftId: new FormControl(`draft-${crypto.randomUUID()}`, { nonNullable: true }),
      catalogProductId: new FormControl<string | null>(null, {
        validators: lineKind === 'quantity' ? [Validators.required] : [],
      }),
      titleSnapshot: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(2)],
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
      orderedQuantity: new FormControl(lineKind === 'individual' ? 1 : 1, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(1)],
      }),
      condition: new FormControl<ItemCondition>('used', { nonNullable: true }),
      priceMode: new FormControl(isMysteryPurchase ? 'unpriced_mystery' : 'priced', {
        nonNullable: true,
      }),
      unitPurchasePrice: new FormControl<number | null>(null, {
        validators: isMysteryPurchase ? [] : [Validators.required, Validators.min(0)],
      }),
      lineTotal: new FormControl<number | null>(null, {
        validators: isMysteryPurchase ? [] : [Validators.required, Validators.min(0)],
      }),
      estimatedMarketValue: new FormControl<number | null>(null, {
        validators: isMysteryPurchase ? [Validators.min(0)] : [],
      }),
    });
    row.valueChanges.subscribe(() => this.emitDrafts());
    return row;
  }

  private configurePriceMode(purchaseType: PurchaseType): void {
    const isMysteryPurchase = purchaseType === 'mystery_pack';
    for (const row of this.lineRows.controls) {
      row.controls.priceMode.setValue(isMysteryPurchase ? 'unpriced_mystery' : 'priced', {
        emitEvent: false,
      });
      row.controls.unitPurchasePrice.setValue(null, { emitEvent: false });
      row.controls.lineTotal.setValue(null, { emitEvent: false });
      row.controls.unitPurchasePrice.setValidators(
        isMysteryPurchase ? [] : [Validators.required, Validators.min(0)],
      );
      row.controls.lineTotal.setValidators(
        isMysteryPurchase ? [] : [Validators.required, Validators.min(0)],
      );
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

  private toMoney(value: number): number {
    return Number(value.toFixed(2));
  }

  private emitDrafts(): void {
    this.linesChanged.emit(this.getDrafts());
  }
}
