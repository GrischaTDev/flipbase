import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { PurchaseType } from '../../../../core/models/flipbase.models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { SelectOption } from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import {
  PurchaseCostDraft,
  PurchaseCostOverviewValue,
} from '../purchase-cost-editor/purchase-cost-adjustments';
import { PurchaseCostEditorComponent } from '../purchase-cost-editor/purchase-cost-editor.component';

@Component({
  selector: 'app-purchase-cost-overview-dialog',
  imports: [ButtonComponent, ModalShellComponent, PurchaseCostEditorComponent],
  templateUrl: './purchase-cost-overview-dialog.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseCostOverviewDialogComponent {
  readonly purchaseType = input<PurchaseType>('single');
  readonly initialDiscountAmount = input(0);
  readonly initialCosts = input<readonly PurchaseCostDraft[]>([]);
  readonly purchaseLineOptions = input<readonly SelectOption<string>[]>([]);

  readonly saved = output<PurchaseCostOverviewValue>();
  readonly closed = output<void>();

  private readonly draftDiscountAmount = signal(0);
  private readonly draftCosts = signal<readonly PurchaseCostDraft[]>([]);
  private readonly editorValid = signal(false);
  private readonly rawDirty = signal(false);

  readonly isDirty = computed(
    () =>
      this.draftDiscountAmount() !== this.initialDiscountAmount() ||
      !costsEqual(this.draftCosts(), this.initialCosts()),
  );
  readonly saveDisabled = computed(() => !this.editorValid() || !this.isDirty());

  constructor() {
    effect(() => {
      this.draftDiscountAmount.set(this.initialDiscountAmount());
      this.draftCosts.set(this.initialCosts());
      this.editorValid.set(false);
      this.rawDirty.set(false);
    });
  }

  onCostsChanged(costs: readonly PurchaseCostDraft[]): void {
    this.draftCosts.set(costs);
  }

  onDiscountChanged(discountAmount: number): void {
    this.draftDiscountAmount.set(discountAmount);
  }

  onValidityChanged(valid: boolean): void {
    this.editorValid.set(valid);
  }

  onRawChanged(): void {
    this.rawDirty.set(true);
  }

  cancel(): void {
    this.closed.emit();
  }

  save(): void {
    if (this.saveDisabled()) return;
    this.saved.emit({
      discountAmount: this.draftDiscountAmount(),
      costs: this.draftCosts(),
    });
  }

  hasUnsavedChanges(): boolean {
    return this.isDirty() || this.rawDirty();
  }
}

function costsEqual(
  left: readonly PurchaseCostDraft[],
  right: readonly PurchaseCostDraft[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((cost, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      cost.type === other.type &&
      cost.amount === other.amount &&
      cost.description === other.description &&
      (cost.taxTreatment ?? null) === (other.taxTreatment ?? null) &&
      cost.allocationMethod === other.allocationMethod &&
      cost.targetPurchaseLineId === other.targetPurchaseLineId
    );
  });
}
