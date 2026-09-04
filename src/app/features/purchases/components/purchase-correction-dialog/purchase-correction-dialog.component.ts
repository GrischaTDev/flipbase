import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Purchase } from '../../../../core/models/flipbase.models';
import {
  CorrectPurchaseCostInput,
  CorrectPurchaseLineInput,
  PurchaseCostingService,
} from '../../../../core/services/purchase-costing.service';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';

type LineForm = FormGroup<{
  id: FormControl<string>;
  catalogProductId: FormControl<string | null>;
  title: FormControl<string>;
  lineKind: FormControl<'quantity' | 'individual'>;
  quantity: FormControl<number>;
  priceMode: FormControl<'priced' | 'unpriced_mystery'>;
  unitPrice: FormControl<number | null>;
  lineTotal: FormControl<number | null>;
  condition: FormControl<CorrectPurchaseLineInput['condition_snapshot']>;
  marketValue: FormControl<number | null>;
}>;

type CostForm = FormGroup<{
  id: FormControl<string>;
  type: FormControl<string>;
  amount: FormControl<number>;
  description: FormControl<string>;
  allocationMethod: FormControl<CorrectPurchaseCostInput['allocation_method']>;
  targetLineId: FormControl<string | null>;
}>;

@Component({
  selector: 'app-purchase-correction-dialog',
  imports: [ReactiveFormsModule, NumberInputComponent, ModalDialogDirective],
  templateUrl: './purchase-correction-dialog.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseCorrectionDialogComponent {
  private readonly purchaseCostingService = inject(PurchaseCostingService);

  readonly purchase = input.required<Purchase>();
  readonly closed = output<void>();
  readonly corrected = output<void>();
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly lineRows = new FormArray<LineForm>([]);
  readonly costRows = new FormArray<CostForm>([]);
  readonly form = new FormGroup({
    reason: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)],
    }),
    purchasePrice: new FormControl<number | null>(null, [Validators.min(0)]),
    lines: this.lineRows,
    costs: this.costRows,
  });

  private initializedPurchaseId: string | null = null;

  constructor() {
    effect(() => {
      const purchase = this.purchase();
      if (purchase.id === this.initializedPurchaseId) return;
      this.initializedPurchaseId = purchase.id;
      this.populate(purchase);
    });
  }

  recalculateLine(index: number): void {
    const row = this.lineRows.at(index);
    const unitPrice = row.controls.unitPrice.value;
    if (row.controls.priceMode.value !== 'priced' || unitPrice === null) return;
    row.controls.lineTotal.setValue(Number((unitPrice * row.controls.quantity.value).toFixed(2)));
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }
    const purchase = this.purchase();
    const raw = this.form.getRawValue();
    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    let result: Awaited<ReturnType<PurchaseCostingService['correctPurchase']>>;
    try {
      result = await this.purchaseCostingService.correctPurchase({
        workspaceId: purchase.workspace_id,
        purchaseId: purchase.id,
        reason: raw.reason.trim(),
        purchasePrice: purchase.type === 'mystery_pack' ? raw.purchasePrice : null,
        lines: raw.lines.map((line) => ({
          id: line.id,
          catalog_product_id: line.catalogProductId,
          title_snapshot: line.title.trim(),
          line_kind: line.lineKind,
          ordered_quantity: line.quantity,
          price_mode: line.priceMode,
          unit_purchase_price: line.unitPrice,
          line_total: line.lineTotal,
          condition_snapshot: line.condition,
          estimated_market_value: line.marketValue,
        })),
        costs: raw.costs.map((cost) => ({
          id: cost.id,
          type: cost.type.trim(),
          amount: cost.amount,
          description: cost.description.trim() || null,
          allocation_method: cost.allocationMethod,
          target_purchase_line_id: cost.targetLineId,
        })),
      });
    } catch (cause: unknown) {
      result = {
        data: null,
        error: cause instanceof Error ? cause : new Error('Die Korrektur ist fehlgeschlagen.'),
        reportedBySyncStatus: false,
      };
    }
    this.isSubmitting.set(false);

    if (result.error) {
      this.errorMessage.set(result.error.message);
      return;
    }
    this.corrected.emit();
    this.closed.emit();
  }

  private populate(purchase: Purchase): void {
    this.form.controls.purchasePrice.setValue(purchase.purchase_price);
    if (purchase.type === 'mystery_pack') this.form.controls.purchasePrice.enable();
    else this.form.controls.purchasePrice.disable();

    this.lineRows.clear();
    for (const line of purchase.purchase_lines ?? []) {
      const priceMode =
        line.price_mode ?? (purchase.type === 'mystery_pack' ? 'unpriced_mystery' : 'priced');
      this.lineRows.push(
        new FormGroup({
          id: new FormControl(line.id, { nonNullable: true }),
          catalogProductId: new FormControl(line.catalog_product_id ?? null),
          title: new FormControl(line.title_snapshot, {
            nonNullable: true,
            validators: [Validators.required],
          }),
          lineKind: new FormControl(line.line_kind, { nonNullable: true }),
          quantity: new FormControl(line.ordered_quantity, {
            nonNullable: true,
            validators: [Validators.required, Validators.min(1)],
          }),
          priceMode: new FormControl(priceMode, { nonNullable: true }),
          unitPrice: new FormControl(line.unit_purchase_price),
          lineTotal: new FormControl(line.line_total),
          condition: new FormControl(
            (line.condition_snapshot as CorrectPurchaseLineInput['condition_snapshot']) ?? null,
          ),
          marketValue: new FormControl(line.estimated_market_value ?? null, [Validators.min(0)]),
        }),
      );
    }

    this.costRows.clear();
    for (const cost of purchase.costs ?? []) {
      if (!cost.id) continue;
      this.costRows.push(
        new FormGroup({
          id: new FormControl(cost.id, { nonNullable: true }),
          type: new FormControl(cost.type, {
            nonNullable: true,
            validators: [Validators.required],
          }),
          amount: new FormControl(Number(cost.amount), {
            nonNullable: true,
            validators: [Validators.min(0)],
          }),
          description: new FormControl(cost.description ?? '', { nonNullable: true }),
          allocationMethod: new FormControl(cost.allocation_method ?? 'value_weighted', {
            nonNullable: true,
          }),
          targetLineId: new FormControl(cost.target_purchase_line_id ?? null),
        }),
      );
    }
  }
}
