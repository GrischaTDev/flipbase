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
import {
  LucideDynamicIcon,
  LucidePlusCircle as PlusCircle,
  LucideTrash2 as Trash2,
} from '@lucide/angular';
import { PurchaseType } from '../../../../core/models/flipbase.models';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';

export type PurchaseCostType =
  'shipping' | 'travel' | 'packaging' | 'transport' | 'customs' | 'import' | 'fee' | 'other';

export interface PurchaseCostDraft {
  readonly type: PurchaseCostType;
  readonly amount: number;
  readonly description: string;
  readonly allocationMethod: 'by_value' | 'by_quantity' | 'direct';
  readonly targetPurchaseLineId: string | null;
}

type CostForm = FormGroup<{
  type: FormControl<PurchaseCostType>;
  amount: FormControl<number>;
  description: FormControl<string>;
  allocationMethod: FormControl<PurchaseCostDraft['allocationMethod']>;
  targetPurchaseLineId: FormControl<string | null>;
}>;

@Component({
  selector: 'app-purchase-cost-editor',
  imports: [ReactiveFormsModule, LucideDynamicIcon, CustomSelectComponent, NumberInputComponent],
  templateUrl: './purchase-cost-editor.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseCostEditorComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly purchaseType = input<PurchaseType>('single');
  readonly initialCosts = input<readonly PurchaseCostDraft[]>([]);
  readonly purchaseLineOptions = input<SelectOption<string>[]>([]);

  readonly costsChanged = output<readonly PurchaseCostDraft[]>();
  readonly validityChanged = output<boolean>();

  readonly costRows = new FormArray<CostForm>([]);
  readonly form = new FormGroup({ costRows: this.costRows });
  readonly isMysteryPurchase = computed(() => this.purchaseType() === 'mystery_pack');
  readonly expandedAllocations = signal<ReadonlySet<number>>(new Set());

  readonly costTypeOptions: SelectOption<PurchaseCostType>[] = [
    { value: 'shipping', label: 'Versand' },
    { value: 'travel', label: 'Fahrtkosten / Sprit' },
    { value: 'packaging', label: 'Verpackungsmaterial' },
    { value: 'transport', label: 'Spedition / Transport' },
    { value: 'customs', label: 'Zoll' },
    { value: 'import', label: 'Zoll / Importabgaben' },
    { value: 'fee', label: 'Gebühren' },
    { value: 'other', label: 'Sonstiges' },
  ];

  readonly allocationOptions: SelectOption<PurchaseCostDraft['allocationMethod']>[] = [
    { value: 'by_value', label: 'Nach Warenwert' },
    { value: 'by_quantity', label: 'Nach Menge' },
    { value: 'direct', label: 'Direkt einer Position zuordnen' },
  ];

  readonly plusCircleIcon = PlusCircle;
  readonly trashIcon = Trash2;

  constructor() {
    this.costRows.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.emitState();
    });

    effect(() => {
      const initialCosts = this.initialCosts();
      untracked(() => this.setInitialCosts(initialCosts));
    });

    effect(() => {
      if (this.clearMissingDirectTargets()) this.emitState();
    });

    effect(() => {
      if (!this.isMysteryPurchase()) return;
      for (const row of this.costRows.controls) {
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
    const row = this.createCostRow({
      type: 'shipping',
      amount: 0,
      description: '',
      allocationMethod: this.isMysteryPurchase() ? 'by_quantity' : 'by_value',
      targetPurchaseLineId: null,
    });
    this.costRows.push(row);
    this.emitState();
  }

  removeCostRow(index: number): void {
    this.costRows.removeAt(index);
    this.expandedAllocations.update((expanded) => {
      const next = new Set<number>();
      for (const entry of expanded) {
        if (entry < index) next.add(entry);
        if (entry > index) next.add(entry - 1);
      }
      return next;
    });
    this.emitState();
  }

  toggleAllocationDetails(index: number): void {
    this.expandedAllocations.update((expanded) => {
      const next = new Set(expanded);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  isAllocationExpanded(index: number): boolean {
    return this.expandedAllocations().has(index);
  }

  onAllocationMethodChanged(
    index: number,
    allocationMethod: PurchaseCostDraft['allocationMethod'] | null,
  ): void {
    if (allocationMethod === null || this.isMysteryPurchase()) return;
    const row = this.costRows.at(index);
    row.controls.allocationMethod.setValue(allocationMethod);
    if (allocationMethod !== 'direct') row.controls.targetPurchaseLineId.setValue(null);
    this.configureTargetRequirement(row);
    this.emitState();
  }

  private setInitialCosts(costs: readonly PurchaseCostDraft[]): void {
    this.costRows.clear({ emitEvent: false });
    for (const cost of costs) {
      this.costRows.push(this.createCostRow(this.normalizeCost(cost)), { emitEvent: false });
    }
    this.expandedAllocations.set(new Set());
    this.clearMissingDirectTargets();
    this.emitState();
  }

  private clearMissingDirectTargets(): boolean {
    const targetIds = new Set(this.purchaseLineOptions().map((option) => option.value));
    let clearedTarget = false;
    for (const row of this.costRows.controls) {
      const target = row.controls.targetPurchaseLineId;
      if (
        row.controls.allocationMethod.value === 'direct' &&
        target.value !== null &&
        !targetIds.has(target.value)
      ) {
        target.setValue(null, { emitEvent: false });
        clearedTarget = true;
      }
    }
    return clearedTarget;
  }

  private createCostRow(cost: PurchaseCostDraft): CostForm {
    const row = new FormGroup({
      type: new FormControl(cost.type, { nonNullable: true }),
      amount: new FormControl(cost.amount, { nonNullable: true, validators: [Validators.min(0)] }),
      description: new FormControl(cost.description, { nonNullable: true }),
      allocationMethod: new FormControl(cost.allocationMethod, { nonNullable: true }),
      targetPurchaseLineId: new FormControl(cost.targetPurchaseLineId),
    });
    this.configureTargetRequirement(row);
    return row;
  }

  private normalizeCost(cost: PurchaseCostDraft): PurchaseCostDraft {
    if (this.isMysteryPurchase()) {
      return { ...cost, allocationMethod: 'by_quantity', targetPurchaseLineId: null };
    }
    return cost;
  }

  private configureTargetRequirement(row: CostForm): void {
    const target = row.controls.targetPurchaseLineId;
    if (!this.isMysteryPurchase() && row.controls.allocationMethod.value === 'direct') {
      target.setValidators([Validators.required]);
    } else {
      target.clearValidators();
    }
    target.updateValueAndValidity({ emitEvent: false });
  }

  private emitState(): void {
    this.costsChanged.emit(this.getCosts());
    this.validityChanged.emit(this.costRows.valid);
  }

  private getCosts(): readonly PurchaseCostDraft[] {
    return this.costRows.getRawValue().map((cost) => ({
      type: cost.type,
      amount: cost.amount,
      description: cost.description,
      allocationMethod: this.isMysteryPurchase() ? 'by_quantity' : cost.allocationMethod,
      targetPurchaseLineId:
        this.isMysteryPurchase() || cost.allocationMethod !== 'direct'
          ? null
          : cost.targetPurchaseLineId,
    }));
  }
}
