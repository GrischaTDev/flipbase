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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideCirclePlus as CirclePlus, LucideTrash2 as Trash2 } from '@lucide/angular';
import { PurchaseType } from '../../../../core/models/flipbase.models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import {
  PURCHASE_COST_ADJUSTMENT_OPTIONS,
  PurchaseCostTaxTreatment,
  PurchaseCostAdjustment,
  PurchaseCostAdjustmentRow,
  PurchaseCostDraft,
  createPurchaseCostAdjustmentRows,
  serializePurchaseCostAdjustmentRows,
} from './purchase-cost-adjustments';

export type { PurchaseCostDraft, PurchaseCostType } from './purchase-cost-adjustments';

type CostForm = FormGroup<{
  adjustment: FormControl<PurchaseCostAdjustment | null>;
  amount: FormControl<number | null>;
  allocationMethod: FormControl<PurchaseCostDraft['allocationMethod']>;
  targetPurchaseLineId: FormControl<string | null>;
  sourceCost: FormControl<PurchaseCostDraft | null>;
  taxTreatment: FormControl<PurchaseCostTaxTreatment | null>;
}>;

@Component({
  selector: 'app-purchase-cost-editor',
  imports: [ReactiveFormsModule, ButtonComponent, CustomSelectComponent, NumberInputComponent],
  templateUrl: './purchase-cost-editor.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseCostEditorComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly purchaseType = input<PurchaseType>('single');
  readonly initialCosts = input<readonly PurchaseCostDraft[]>([]);
  readonly initialDiscountAmount = input(0);
  readonly purchaseLineOptions = input<readonly SelectOption<string>[]>([]);

  readonly costsChanged = output<readonly PurchaseCostDraft[]>();
  readonly discountChanged = output<number>();
  readonly validityChanged = output<boolean>();
  readonly rawChanged = output<void>();

  readonly costRows = new FormArray<CostForm>([]);
  readonly form = new FormGroup({ costRows: this.costRows });
  readonly isMysteryPurchase = computed(() => this.purchaseType() === 'mystery_pack');
  readonly releasedAssignmentRows = signal<readonly CostForm[]>([]);

  readonly adjustmentOptions = PURCHASE_COST_ADJUSTMENT_OPTIONS;
  readonly removeIcon = Trash2;
  readonly addIcon = CirclePlus;

  constructor() {
    this.costRows.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.rawChanged.emit();
      this.emitState();
    });

    effect(() => {
      const costs = this.initialCosts();
      const discountAmount = this.initialDiscountAmount();
      untracked(() => this.setInitialValue(costs, discountAmount));
    });

    effect(() => {
      if (this.releaseMissingDirectAssignments()) this.emitState();
    });

    effect(() => {
      if (!this.isMysteryPurchase()) return;
      for (const row of this.costRows.controls) {
        if (row.controls.allocationMethod.value === 'direct') continue;
        row.patchValue(
          { allocationMethod: 'by_quantity', targetPurchaseLineId: null },
          { emitEvent: false },
        );
        this.configureTargetRequirement(row);
      }
      this.emitState();
    });
  }

  addCostRow(): void {
    if (this.costRows.invalid) return;
    this.costRows.push(this.createCostRow(this.emptyRow()));
    this.emitState();
  }

  removeCostRow(index: number): void {
    const removedRow = this.costRows.at(index);
    this.costRows.removeAt(index);
    this.releasedAssignmentRows.update((rows) => rows.filter((row) => row !== removedRow));
    this.emitState();
  }

  private setInitialValue(costs: readonly PurchaseCostDraft[], discountAmount: number): void {
    const rows = createPurchaseCostAdjustmentRows(costs, discountAmount);
    this.releasedAssignmentRows.set([]);
    this.costRows.clear({ emitEvent: false });
    for (const row of rows.length > 0 ? rows : [this.emptyRow()]) {
      this.costRows.push(this.createCostRow(this.normalizeRow(row)), { emitEvent: false });
    }
    this.releaseMissingDirectAssignments();
    this.emitState();
  }

  private emptyRow(): PurchaseCostAdjustmentRow {
    return {
      adjustment: null,
      amount: null,
      allocationMethod: this.isMysteryPurchase() ? 'by_quantity' : 'by_value',
      targetPurchaseLineId: null,
      sourceCost: null,
      taxTreatment: null,
    };
  }

  private createCostRow(cost: PurchaseCostAdjustmentRow): CostForm {
    const row = new FormGroup({
      adjustment: new FormControl(cost.adjustment, { validators: [Validators.required] }),
      amount: new FormControl(cost.amount, {
        validators: [Validators.required, Validators.min(0.01)],
      }),
      allocationMethod: new FormControl(cost.allocationMethod, { nonNullable: true }),
      targetPurchaseLineId: new FormControl(cost.targetPurchaseLineId),
      sourceCost: new FormControl(cost.sourceCost),
      taxTreatment: new FormControl<PurchaseCostTaxTreatment | null>(cost.taxTreatment ?? null),
    });
    row.controls.adjustment.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((adjustment) => {
        if (adjustment === 'discount') {
          row.patchValue(
            { allocationMethod: 'by_value', targetPurchaseLineId: null },
            { emitEvent: false },
          );
        }
        this.configureTargetRequirement(row);
      });
    this.configureTargetRequirement(row);
    return row;
  }

  private normalizeRow(row: PurchaseCostAdjustmentRow): PurchaseCostAdjustmentRow {
    if (!this.isMysteryPurchase() || row.allocationMethod === 'direct') return row;
    return { ...row, allocationMethod: 'by_quantity', targetPurchaseLineId: null };
  }

  private configureTargetRequirement(row: CostForm): void {
    const target = row.controls.targetPurchaseLineId;
    if (
      row.controls.adjustment.value !== 'discount' &&
      row.controls.allocationMethod.value === 'direct'
    ) {
      target.setValidators([Validators.required]);
    } else {
      target.clearValidators();
    }
    target.updateValueAndValidity({ emitEvent: false });
  }

  private releaseMissingDirectAssignments(): boolean {
    const targetIds = new Set(this.purchaseLineOptions().map((option) => option.value));
    const releasedRows: CostForm[] = [];
    for (const row of this.costRows.controls) {
      const target = row.controls.targetPurchaseLineId;
      if (
        row.controls.adjustment.value !== 'discount' &&
        row.controls.allocationMethod.value === 'direct' &&
        target.value !== null &&
        !targetIds.has(target.value)
      ) {
        row.patchValue(
          {
            allocationMethod: this.isMysteryPurchase() ? 'by_quantity' : 'by_value',
            targetPurchaseLineId: null,
          },
          { emitEvent: false },
        );
        this.configureTargetRequirement(row);
        releasedRows.push(row);
      }
    }
    if (releasedRows.length > 0) {
      this.releasedAssignmentRows.update((rows) => [...rows, ...releasedRows]);
    }
    return releasedRows.length > 0;
  }

  private emitState(): void {
    const value = serializePurchaseCostAdjustmentRows(this.getRows());
    this.costsChanged.emit(value.costs);
    this.discountChanged.emit(value.discountAmount);
    this.validityChanged.emit(this.costRows.valid);
  }

  private getRows(): readonly PurchaseCostAdjustmentRow[] {
    return this.costRows.getRawValue().map((row) => ({
      adjustment: row.adjustment,
      amount: row.amount,
      allocationMethod:
        this.isMysteryPurchase() && row.allocationMethod !== 'direct'
          ? 'by_quantity'
          : row.allocationMethod,
      targetPurchaseLineId: row.allocationMethod !== 'direct' ? null : row.targetPurchaseLineId,
      sourceCost: row.sourceCost,
      taxTreatment: row.taxTreatment,
    }));
  }
}
