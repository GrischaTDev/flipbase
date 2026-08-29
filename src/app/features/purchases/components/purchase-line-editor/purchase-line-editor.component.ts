import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CatalogService } from '../../../../core/services/catalog.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { TrackingMode } from '../../../../core/models/flipbase.models';

export interface PurchaseLineDraft {
  readonly catalogProductId: string | null;
  readonly titleSnapshot: string;
  readonly lineKind: TrackingMode;
  readonly orderedQuantity: number;
  readonly unitPurchasePrice: number;
  readonly lineTotal: number;
}

interface PurchaseLineControls {
  catalogProductId: FormControl<string | null>;
  titleSnapshot: FormControl<string>;
  lineKind: FormControl<TrackingMode>;
  orderedQuantity: FormControl<number>;
  unitPurchasePrice: FormControl<number>;
  lineTotal: FormControl<number>;
}

type PriceField = 'unitPurchasePrice' | 'lineTotal';

@Component({
  selector: 'app-purchase-line-editor',
  imports: [ReactiveFormsModule],
  templateUrl: './purchase-line-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseLineEditorComponent {
  readonly catalogService = inject(CatalogService);
  private readonly workspaceService = inject(WorkspaceService);

  readonly lineRows = new FormArray<FormGroup<PurchaseLineControls>>([]);
  readonly linesChanged = output<readonly PurchaseLineDraft[]>();
  readonly isCreatingProduct = signal(false);
  readonly isSavingProduct = signal(false);
  readonly productError = signal<string | null>(null);
  readonly catalogContextError = signal<string | null>(null);
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

  recalculate(index: number, changedField: PriceField): void {
    const row = this.lineRows.at(index);
    const quantity = row.controls.orderedQuantity.value;
    if (!Number.isFinite(quantity) || quantity <= 0) return;

    if (changedField === 'unitPurchasePrice') {
      const unitPrice = row.controls.unitPurchasePrice.value;
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return;
      row.controls.lineTotal.setValue(this.toMoney(quantity * unitPrice), { emitEvent: false });
      this.emitDrafts();
      return;
    }

    const lineTotal = row.controls.lineTotal.value;
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
    if (this.productForm.invalid) return;
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId) {
      this.productError.set('Kein aktiver Workspace ausgewählt.');
      return;
    }

    this.isSavingProduct.set(true);
    this.productError.set(null);
    const result = await this.catalogService.createProduct({
      workspaceId,
      title: this.productForm.controls.title.value,
      trackingMode: 'quantity',
    });
    this.isSavingProduct.set(false);

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

  private createLine(lineKind: TrackingMode): FormGroup<PurchaseLineControls> {
    return new FormGroup<PurchaseLineControls>({
      catalogProductId: new FormControl<string | null>(null, {
        validators: lineKind === 'quantity' ? [Validators.required] : [],
      }),
      titleSnapshot: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(2)],
      }),
      lineKind: new FormControl<TrackingMode>(lineKind, { nonNullable: true }),
      orderedQuantity: new FormControl(lineKind === 'individual' ? 1 : 1, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(1)],
      }),
      unitPurchasePrice: new FormControl(0, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(0)],
      }),
      lineTotal: new FormControl(0, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(0)],
      }),
    });
  }

  private toMoney(value: number): number {
    return Number(value.toFixed(2));
  }

  private emitDrafts(): void {
    this.linesChanged.emit(this.getDrafts());
  }
}
