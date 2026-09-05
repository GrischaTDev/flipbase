import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Purchase } from '../../../../core/models/flipbase.models';
import {
  PurchaseCostingService,
  PurchaseCostRepairPreview,
} from '../../../../core/services/purchase-costing.service';

@Component({
  selector: 'app-purchase-cost-repair',
  imports: [CurrencyPipe, ReactiveFormsModule],
  templateUrl: './purchase-cost-repair.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseCostRepairComponent {
  readonly purchase = input.required<Purchase>();
  readonly saved = output<void>();
  private readonly costing = inject(PurchaseCostingService);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly preview = signal<PurchaseCostRepairPreview | null>(null);
  readonly reviewedKey = signal('');
  readonly confirmed = new FormControl(false, { nonNullable: true });
  readonly currentPreview = computed(() =>
    this.key() === this.reviewedKey() ? this.preview() : null,
  );
  readonly total = computed(() => {
    const preview = this.currentPreview();
    return preview?.purchasePrice === null || !preview
      ? null
      : preview.purchasePrice + preview.costs.reduce((sum, cost) => sum + cost.amount, 0);
  });
  readonly costLabels: Readonly<Partial<Record<string, string>>> = {
    shipping: 'Versand',
    travel: 'Fahrtkosten',
    packaging: 'Verpackung',
    transport: 'Transport',
    customs: 'Zoll',
    import: 'Importabgaben',
    fee: 'Gebühren',
    other: 'Sonstige Kosten',
  };

  private key(): string {
    return `${this.purchase().workspace_id}/${this.purchase().id}`;
  }

  async load(): Promise<void> {
    if (this.busy()) return;
    const purchase = this.purchase();
    const key = this.key();
    this.busy.set(true);
    this.preview.set(null);
    this.confirmed.setValue(false);
    this.message.set('');
    try {
      const result = await this.costing.previewCostRepair(purchase.workspace_id, purchase.id);
      if (this.key() !== key) return;
      if (result.error) {
        this.message.set(result.error.message);
        return;
      }
      this.reviewedKey.set(key);
      this.preview.set(result.data);
    } finally {
      this.busy.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.busy() || !this.confirmed.value) return;
    const preview = this.currentPreview();
    if (!preview || preview.classification !== 'auto_repair') return;
    const purchase = this.purchase();
    const key = this.key();
    this.busy.set(true);
    this.message.set('');
    try {
      const result = await this.costing.repairPurchaseCosts(
        purchase.workspace_id,
        purchase.id,
        preview.fingerprint,
      );
      if (this.key() !== key) return;
      this.preview.set(null);
      this.confirmed.setValue(false);
      if (result.error) {
        this.message.set(result.error.message);
        return;
      }
      this.message.set('Die Einkaufskosten wurden übernommen und die Änderung protokolliert.');
      this.saved.emit();
    } finally {
      this.busy.set(false);
    }
  }
}
